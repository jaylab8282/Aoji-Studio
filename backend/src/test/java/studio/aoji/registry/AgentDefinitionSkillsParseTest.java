package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** T-R4-08: 정의 파일에서 {@code skills}·{@code mcpServers} 원본 목록을 더 읽는다(architecture.md §6.4.1). */
class AgentDefinitionSkillsParseTest {

    @TempDir
    Path dir;

    private AgentDefinition parse(String frontmatter) throws IOException {
        Path file = dir.resolve("a.md");
        Files.writeString(file, "---\nname: a\n" + frontmatter + "---\n본문\n", StandardCharsets.UTF_8);
        return new AgentDefinitionParser().parse(file, ".claude/agents/a.md", "a.md").definition();
    }

    @Test
    @DisplayName("[FR-018-AC2] skills: 쉼표 문자열과 YAML 목록 모두 목록으로, 없으면 빈 목록")
    void skillsAcceptStringOrList() throws IOException {
        assertThat(parse("skills: one, two ,three\n").skills()).containsExactly("one", "two", "three");
        assertThat(parse("skills:\n  - one\n  - two\n").skills()).containsExactly("one", "two");
        assertThat(parse("").skills()).isEmpty();
    }

    @Test
    @DisplayName("[FR-024-AC1] mcpServers: 문자열 이름·{이름: 정의} 객체 원소 모두 이름으로")
    void mcpServersAcceptNamesAndObjects() throws IOException {
        AgentDefinition def = parse("mcpServers:\n  - github\n  - qa-browser:\n      command: npx\n");

        assertThat(def.mcpServers()).containsExactly("github", "qa-browser");
        assertThat(parse("").mcpServers()).isEmpty();
    }

    @Test
    @DisplayName("[FR-024-AC1] tools 생략 = null(전체 상속), 편집 동작 불변: 기존 필드 그대로")
    void toolsOmittedMeansInherit() throws IOException {
        assertThat(parse("").tools()).isNull();
        assertThat(parse("tools: Read, Grep\n").tools()).containsExactly("Read", "Grep");
    }
}
