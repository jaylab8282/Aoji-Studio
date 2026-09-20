package studio.jay.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * api-spec {@code Registry}/{@code AgentDef}/{@code Workflow}/{@code FormatError} 스키마와
 * 실제 직렬화 결과가 일치하는지 확인한다(필드명·enum 값을 계약 그대로).
 */
class RegistrySnapshotJsonTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void agentDefSerializesRoleAsLowercaseString() {
        AgentDef agentDef = new AgentDef(
                "architect", "설계", ".claude/agents/architect.md", "개발부서", Role.LEAD, List.of("개발부서", "기획부서"));

        JsonNode node = objectMapper.valueToTree(agentDef);

        assertThat(node.get("name").asString()).isEqualTo("architect");
        assertThat(node.get("role").asString()).isEqualTo("lead");
        assertThat(node.get("workflow").asString()).isEqualTo("개발부서");
        assertThat(node.get("duplicateWorkflows")).hasSize(2);
    }

    @Test
    void formatErrorSerializesKindAsSpecEnumValue() {
        FormatError agentError = new FormatError(FormatError.Kind.AGENT, "broken.md", "name 누락");
        FormatError brokenRefError =
                new FormatError(FormatError.Kind.BROKEN_REF, "no-such-agent", "구성 파일 참조 깨짐 (개발부서)", "개발부서");

        assertThat(objectMapper.valueToTree(agentError).get("kind").asString()).isEqualTo("agent");
        assertThat(objectMapper.valueToTree(brokenRefError).get("kind").asString()).isEqualTo("broken-ref");
        assertThat(objectMapper.valueToTree(brokenRefError).get("workflow").asString()).isEqualTo("개발부서");
        // agent kind에는 workflow 필드가 없다(NON_NULL).
        assertThat(objectMapper.valueToTree(agentError).has("workflow")).isFalse();
    }

    @Test
    void registrySnapshotSerializesRequiredFields() {
        RegistrySnapshot snapshot = new RegistrySnapshot(
                1,
                OffsetDateTime.parse("2026-09-20T10:00:00+09:00"),
                false,
                true,
                2,
                1,
                List.of(),
                List.of(),
                List.of(),
                true);

        JsonNode node = objectMapper.valueToTree(snapshot);

        assertThat(node.get("revision").asInt()).isEqualTo(1);
        assertThat(node.get("agentsDirMissing").asBoolean()).isFalse();
        assertThat(node.get("writable").asBoolean()).isTrue();
        assertThat(node.get("agentCount").asInt()).isEqualTo(2);
        assertThat(node.get("skillCount").asInt()).isEqualTo(1);
        assertThat(node.get("hookConfigured").asBoolean()).isTrue();
    }
}
