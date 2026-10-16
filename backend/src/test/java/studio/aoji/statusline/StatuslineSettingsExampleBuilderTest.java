package studio.aoji.statusline;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 07 상태줄 설정 예시 (FR-014-AC6, ADR-83 결정 2, architecture.md §7.4). */
class StatuslineSettingsExampleBuilderTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final StatuslineSettingsExampleBuilder builder = new StatuslineSettingsExampleBuilder(mapper);

    @Test
    @DisplayName("[FR-014-AC6] 조각을 {}로 감싸 파싱 → statusLine.type == command, command 형식(경로 따옴표·--url·--·<쓰던 상태줄 명령>), 토큰 0회")
    void exampleParsesAndMatchesFormat() {
        String example = builder.build("/home/jaybee/AojiStudio", "http://127.0.0.1:4180");

        JsonNode statusLine = mapper.readTree("{" + example + "}").get("statusLine");
        assertThat(statusLine.get("type").asString()).isEqualTo("command");
        assertThat(statusLine.get("command").asString())
                .isEqualTo("node \"/home/jaybee/AojiStudio/.aojistudio/statusline.mjs\""
                        + " --url http://127.0.0.1:4180/hooks/statusline -- <쓰던 상태줄 명령>");
        assertThat(example).startsWith("\"statusLine\": {\n  \"type\": \"command\",\n  \"command\": ");
        assertThat(example).doesNotStartWith("{").doesNotContain("collect-token").doesNotContain("Token");
        assertThat(statusLine.size()).isEqualTo(2);
    }

    @Test
    @DisplayName("[FR-014-AC6] 경로에 따옴표·역슬래시가 있어도 JSON으로 파싱되고 값이 그대로 돌아온다")
    void specialCharactersAreEscaped() {
        String example = builder.build("/home/a b/\"quote\"", "http://127.0.0.1:4180");

        String command = mapper.readTree("{" + example + "}").get("statusLine").get("command").asString();

        assertThat(command).startsWith("node \"/home/a b/\"quote\"/.aojistudio/statusline.mjs\" --url ");
    }
}
