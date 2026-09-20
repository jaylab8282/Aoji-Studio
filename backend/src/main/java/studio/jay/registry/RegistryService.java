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
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import studio.jay.config.AppProperties;
import studio.jay.files.PathGuard;

/**
 * 스캔한 결과를 불변 {@link RegistrySnapshot}으로 만들어 {@code AtomicReference}로 교체한다
 * (architecture.md §3.2). 읽기 API는 락 없이 {@link #current()}만 읽는다.
 * 폴링(T-004)·변경 API 후 재스캔(T-008~T-011)은 {@link #rescanNow()}를 호출한다.
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
        RegistrySnapshot snapshot = buildSnapshot();
        current.set(snapshot);
        return snapshot;
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
