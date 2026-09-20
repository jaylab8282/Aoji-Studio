package studio.jay.registry;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * api-spec {@code Registry}. 스캔마다 새로 만들어 {@link RegistryService}의
 * {@code AtomicReference}로 교체하는 불변 스냅샷이다(architecture.md §3.2).
 *
 * @param revision 스캔마다 증가
 * @param agentCount 정상 정의 파일 수. {@code agentsDirMissing}이면 null
 */
public record RegistrySnapshot(
        int revision,
        OffsetDateTime scannedAt,
        boolean agentsDirMissing,
        boolean writable,
        Integer agentCount,
        int skillCount,
        List<AgentDef> agents,
        List<Workflow> workflows,
        List<FormatError> formatErrors,
        boolean hookConfigured) {

    public RegistrySnapshot {
        agents = List.copyOf(agents);
        workflows = List.copyOf(workflows);
        formatErrors = List.copyOf(formatErrors);
    }
}
