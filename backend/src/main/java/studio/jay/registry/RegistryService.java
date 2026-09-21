package studio.jay.registry;

import jakarta.annotation.PostConstruct;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import studio.jay.config.AppProperties;
import studio.jay.files.PathGuard;

/**
 * 스캔한 결과를 불변 {@link RegistrySnapshot}으로 만들어 {@code AtomicReference}로 교체한다
 * (architecture.md §3.2). 읽기 API는 락 없이 {@link #current()}만 읽는다.
 * 폴링(T-004)·변경 API 후 재스캔(T-008~T-011)은 {@link #rescanNow()}를 호출한다.
 *
 * <p>{@link #rescanNow()}는 {@link #rescanLock}으로 스캔("빌드")과 {@code revision} 채번,
 * {@code current.set(...)}을 하나의 임계 구역으로 묶는다. 폴러(T-004 {@code FolderPoller})와
 * {@code POST /api/registry/rescan}({@code RegistryController})처럼 서로 다른 스레드가 동시에
 * 재스캔을 호출해도, 나중에 락을 잡은 호출이 항상 더 새 파일 상태를 스캔하고 더 큰 {@code revision}을
 * 받은 뒤 {@code current}에 반영되므로 "먼저 시작해 나중에 끝난 호출이 최신 스냅샷을 오래된 것으로
 * 덮어쓰는" 경합이 구조적으로 발생하지 않는다({@code AtomicReference} 하나만으로는 두 writer의 시작·
 * 종료 순서 역전을 막지 못하므로 부족하다). {@link #rescanNow(Consumer)}는 방송처럼 스냅샷 반영과
 * 순서가 어긋나면 안 되는 후속 작업을 같은 락 안에서 실행한다 — 그래야 SSE {@code registry} 방송
 * 순서도 {@code revision} 순서를 따른다(realtime-spec.md).
 */
@Component
public class RegistryService {

    private final AppProperties appProperties;
    private final ProjectFolderScanner projectFolderScanner;
    private final WorkflowConfigStore workflowConfigStore;
    private final HookConfigDetector hookConfigDetector;
    private final PathGuard pathGuard;
    private final AtomicInteger revisionCounter = new AtomicInteger(0);
    private final AtomicReference<RegistrySnapshot> current = new AtomicReference<>();
    private final ReentrantLock rescanLock = new ReentrantLock();

    public RegistryService(
            AppProperties appProperties,
            ProjectFolderScanner projectFolderScanner,
            WorkflowConfigStore workflowConfigStore,
            HookConfigDetector hookConfigDetector) {
        this.appProperties = appProperties;
        this.projectFolderScanner = projectFolderScanner;
        this.workflowConfigStore = workflowConfigStore;
        this.hookConfigDetector = hookConfigDetector;
        // 마운트 루트는 기동 후 바뀌지 않으므로(FR-001-AC5) PathGuard를 한 번만 만들어 재사용한다.
        this.pathGuard = new PathGuard(Path.of(appProperties.getMountPath()));
    }

    @PostConstruct
    void init() {
        rescanNow();
    }

    /** 현재 스냅샷을 락 없이 읽는다. */
    public RegistrySnapshot current() {
        return current.get();
    }

    /** 지금 다시 스캔하고 결과를 교체한 뒤 돌려준다(FR-001-AC4). */
    public RegistrySnapshot rescanNow() {
        return rescanNow(snapshot -> {});
    }

    /**
     * 지금 다시 스캔하고 결과를 교체한 뒤, 같은 락 안에서 {@code afterCommit}을 실행하고 돌려준다.
     * 호출자(예: {@code FolderPoller}·{@code RegistryController})가 SSE 방송처럼 이 스냅샷을 반영한
     * "직후"에 순서대로 실행되어야 하는 후속 작업을 넘길 때 쓴다 — 방송까지 같은 임계 구역에 두어야
     * 동시 재스캔 시 방송 순서도 {@code revision} 순서를 따른다.
     */
    public RegistrySnapshot rescanNow(Consumer<RegistrySnapshot> afterCommit) {
        rescanLock.lock();
        try {
            RegistrySnapshot snapshot = buildSnapshot();
            current.set(snapshot);
            afterCommit.accept(snapshot);
            return snapshot;
        } finally {
            rescanLock.unlock();
        }
    }

    private RegistrySnapshot buildSnapshot() {
        Path mountRoot = Path.of(appProperties.getMountPath());

        AgentsScanResult agentsScan = projectFolderScanner.scanAgents(mountRoot, pathGuard);
        int skillCount = projectFolderScanner.scanSkills(mountRoot);
        boolean writable = projectFolderScanner.checkWritable(mountRoot);

        Set<String> validAgentNames = agentsScan.validAgents().stream()
                .map(parsed -> parsed.definition().name())
                .collect(Collectors.toCollection(LinkedHashSet::new));

        Path teamsDir = mountRoot.resolve(".jaystudio").resolve("teams");
        WorkflowScanResult workflowScan = workflowConfigStore.readAll(teamsDir, validAgentNames, pathGuard);
        List<Workflow> sortedWorkflows =
                workflowScan.workflows().stream().sorted(Comparator.comparing(Workflow::name)).toList();

        Map<String, List<String>> agentWorkflows = new LinkedHashMap<>();
        Map<String, Map<String, Role>> agentRoles = new LinkedHashMap<>();
        for (Workflow workflow : sortedWorkflows) {
            if (workflow.lead() != null) {
                agentWorkflows.computeIfAbsent(workflow.lead(), k -> new ArrayList<>()).add(workflow.name());
                agentRoles.computeIfAbsent(workflow.lead(), k -> new HashMap<>()).put(workflow.name(), Role.LEAD);
            }
            for (String member : workflow.members()) {
                agentWorkflows.computeIfAbsent(member, k -> new ArrayList<>()).add(workflow.name());
                agentRoles.computeIfAbsent(member, k -> new HashMap<>()).put(workflow.name(), Role.MEMBER);
            }
        }

        List<AgentDef> agentDefs = agentsScan.validAgents().stream()
                .map(parsed -> toAgentDef(parsed, agentWorkflows, agentRoles))
                .sorted(Comparator.comparing(AgentDef::name))
                .toList();

        List<FormatError> formatErrors = new ArrayList<>();
        formatErrors.addAll(agentsScan.formatErrors());
        formatErrors.addAll(workflowScan.formatErrors());

        String collectUrl = "http://127.0.0.1:" + appProperties.getPublicPort() + "/hooks/events";
        Path settingsJson = mountRoot.resolve(".claude").resolve("settings.json");
        boolean hookConfigured = hookConfigDetector.isConfigured(settingsJson, collectUrl);

        return new RegistrySnapshot(
                revisionCounter.incrementAndGet(),
                OffsetDateTime.now(),
                agentsScan.agentsDirMissing(),
                writable,
                agentsScan.agentCount(),
                skillCount,
                agentDefs,
                sortedWorkflows,
                formatErrors,
                hookConfigured);
    }

    private static AgentDef toAgentDef(
            ParsedAgentFile parsed,
            Map<String, List<String>> agentWorkflows,
            Map<String, Map<String, Role>> agentRoles) {
        AgentDefinition definition = parsed.definition();
        List<String> workflowsForAgent = agentWorkflows.getOrDefault(definition.name(), List.of()).stream()
                .sorted()
                .toList();
        String assignedWorkflow = workflowsForAgent.isEmpty() ? null : workflowsForAgent.get(0);
        Role role = assignedWorkflow == null ? null : agentRoles.get(definition.name()).get(assignedWorkflow);
        List<String> duplicateWorkflows = workflowsForAgent.size() > 1 ? workflowsForAgent : List.of();

        return new AgentDef(
                definition.name(),
                definition.description(),
                parsed.relativeFilePath(),
                assignedWorkflow,
                role,
                duplicateWorkflows);
    }
}
