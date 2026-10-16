package studio.aoji.usage;

import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.springframework.stereotype.Service;
import studio.aoji.config.AppProperties;
import studio.aoji.files.PathGuard;
import studio.aoji.registry.AgentsScanResult;
import studio.aoji.registry.ParsedAgentFile;
import studio.aoji.registry.ProjectFolderScanner;
import studio.aoji.registry.RegistryService;
import studio.aoji.skills.SkillEntry;
import studio.aoji.skills.SkillScanner;

/**
 * 08 스킬 목록 + 기간 안 사용 집계 (FR-018-AC1~AC3·AC6, FR-019-AC2·AC3·AC6·AC7, FR-019-E1, ADR-80).
 * 읽기 전용이다. 스킬 목록은 {@link SkillScanner}(= {@code Registry.skillCount}와 같은 결과), 정의상 연결은
 * 정상 에이전트 정의 파일의 {@code skills:}, 횟수는 {@code usage_hook_agg}에서 읽는다.
 */
@Service
public class SkillsReportService {

    private final SkillScanner skillScanner;
    private final ProjectFolderScanner projectFolderScanner;
    private final UsageRepository usageRepository;
    private final RegistryService registryService;
    private final AppProperties appProperties;
    private final PathGuard pathGuard;
    private final Clock clock;

    public SkillsReportService(
            SkillScanner skillScanner,
            ProjectFolderScanner projectFolderScanner,
            UsageRepository usageRepository,
            RegistryService registryService,
            AppProperties appProperties,
            PathGuard pathGuard,
            Clock clock) {
        this.skillScanner = skillScanner;
        this.projectFolderScanner = projectFolderScanner;
        this.usageRepository = usageRepository;
        this.registryService = registryService;
        this.appProperties = appProperties;
        this.pathGuard = pathGuard;
        this.clock = clock;
    }

    public SkillsReport report(PeriodQuery query) {
        Path mountRoot = Path.of(appProperties.getMountPath());
        List<SkillEntry> skills = skillScanner.scan(mountRoot);
        boolean hookConfigured = registryService.current().hookConfigured();

        // 스킬 이름 → 이 스킬을 skills:에 둔 정상 에이전트(name 오름차순)
        Map<String, Set<String>> definedBySkill = new HashMap<>();
        AgentsScanResult agents = projectFolderScanner.scanAgents(mountRoot, pathGuard);
        for (ParsedAgentFile parsed : agents.validAgents()) {
            for (String skill : parsed.definition().skills()) {
                definedBySkill
                        .computeIfAbsent(skill, k -> new TreeSet<>())
                        .add(parsed.definition().name());
            }
        }

        List<UsageRepository.HookAggRow> rows = usageRepository.findHookAgg(query.fromBucket(), query.toBucket());
        Map<String, Map<String, Long>> callBySkill = new HashMap<>();
        Map<String, Map<String, Long>> slashBySkill = new HashMap<>();
        Map<String, Long> startsByAgent = new HashMap<>();
        LocalDate earliest = null;
        for (UsageRepository.HookAggRow row : rows) {
            LocalDate date = query.localDate(row.bucket());
            if (earliest == null || date.isBefore(earliest)) {
                earliest = date;
            }
            switch (row.kind()) {
                case UsageKind.SKILL_CALL ->
                        callBySkill.computeIfAbsent(row.subject(), k -> new HashMap<>()).merge(row.agent(), row.count(), Long::sum);
                case UsageKind.SKILL_SLASH ->
                        slashBySkill.computeIfAbsent(row.subject(), k -> new HashMap<>()).merge(row.agent(), row.count(), Long::sum);
                case UsageKind.SESSION_START -> startsByAgent.merge(row.agent(), row.count(), Long::sum);
                default -> {}
            }
        }

        record Draft(SkillEntry entry, List<String> defined, long call, long slash, long preload, Map<String, Long> byAgent) {}
        List<Draft> drafts = new ArrayList<>();
        long totalUses = 0;
        for (SkillEntry skill : skills) {
            List<String> defined = new ArrayList<>(definedBySkill.getOrDefault(skill.name(), Set.of()));
            Map<String, Long> byAgent = new TreeMap<>();
            long call = 0;
            long slash = 0;
            if (hookConfigured) {
                for (Map.Entry<String, Long> e : callBySkill.getOrDefault(skill.name(), Map.of()).entrySet()) {
                    call += e.getValue();
                    byAgent.merge(e.getKey(), e.getValue(), Long::sum);
                }
                for (Map.Entry<String, Long> e : slashBySkill.getOrDefault(skill.name(), Map.of()).entrySet()) {
                    slash += e.getValue();
                    byAgent.merge(e.getKey(), e.getValue(), Long::sum);
                }
            }
            long preload = 0;
            for (String agent : defined) {
                long starts = startsByAgent.getOrDefault(agent, 0L);
                if (starts > 0) {
                    preload += starts;
                    byAgent.merge(agent, starts, Long::sum);
                }
            }
            totalUses += call + slash + preload;
            drafts.add(new Draft(skill, defined, call, slash, preload, byAgent));
        }

        List<SkillsReport.SkillRow> result = new ArrayList<>();
        for (Draft draft : drafts) {
            long total = draft.call() + draft.slash() + draft.preload();
            List<SkillsReport.AgentCount> actual = new ArrayList<>();
            for (Map.Entry<String, Long> e : draft.byAgent().entrySet()) {
                if (e.getValue() > 0) {
                    actual.add(new SkillsReport.AgentCount(e.getKey().isEmpty() ? null : e.getKey(), e.getValue()));
                }
            }
            actual.sort(Comparator.comparing((SkillsReport.AgentCount c) -> c.agent() == null)
                    .thenComparing(Comparator.comparingLong(SkillsReport.AgentCount::count).reversed())
                    .thenComparing(c -> c.agent() == null ? "" : c.agent()));
            List<String> unused = draft.defined().stream()
                    .filter(agent -> draft.byAgent().getOrDefault(agent, 0L) == 0)
                    .toList();
            Set<String> used = new LinkedHashSet<>(draft.defined());
            for (SkillsReport.AgentCount c : actual) {
                if (c.agent() != null) {
                    used.add(c.agent());
                }
            }
            Double percent = totalUses == 0 ? null : total * 100.0 / totalUses;
            SkillEntry entry = draft.entry();
            result.add(new SkillsReport.SkillRow(
                    entry.name(),
                    entry.description(),
                    entry.filePath(),
                    entry.userOnly(),
                    entry.imported(),
                    entry.formatError(),
                    draft.defined(),
                    new SkillsReport.Usage(draft.call(), draft.slash(), draft.preload(), total),
                    percent,
                    actual,
                    unused,
                    used.size()));
        }

        LocalDate today = clock.instant().atZone(query.zone()).toLocalDate();
        SkillsReport.Range range = query.firstDate() != null
                ? new SkillsReport.Range(query.firstDate(), query.lastDate())
                : new SkillsReport.Range(earliest, today);
        return new SkillsReport(query.period(), range, hookConfigured, totalUses, result);
    }
}
