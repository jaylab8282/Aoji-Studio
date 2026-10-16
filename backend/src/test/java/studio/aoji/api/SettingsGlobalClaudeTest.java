package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.support.ClaudeHomeFixture;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code Settings.globalClaude} — 항목별 연결 상태(ADR-79 결정 3, FR-014 Output). */
@SpringBootTest
@AutoConfigureMockMvc
class SettingsGlobalClaudeTest {

    private static final String HOST_PATH = "/Users/jaybee/Desktop/AojiStudio";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @TempDir
    static Path claudeHome;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        ClaudeHomeFixture.copyBasic(claudeHome, HOST_PATH);
        // projects 폴더는 대역 표지 → 그 항목만 연결 안 됨
        Files.writeString(claudeHome.resolve(".claude/projects/.aojistudio-stand-in"), "");
        registry.add("aojistudio.host-path", () -> HOST_PATH);
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.claude-home-host", () -> ClaudeHomeFixture.HOME_HOST);
        registry.add("aojistudio.claude-home-mount", () -> claudeHome.toString());
    }

    @Test
    @DisplayName("[NFR-15] globalClaude 4항목·순서 고정, 항목별 연결 여부와 readAt(연결된 항목이 있으면 시각)")
    void globalClaudeItemsAreFourInOrderWithPerItemState() throws Exception {
        String body = mockMvc.perform(get("/api/settings").header("Origin", "http://127.0.0.1:4180"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        JsonNode globalClaude = objectMapper.readTree(body).get("globalClaude");

        List<String> items = new ArrayList<>();
        globalClaude.get("items").forEach(i -> items.add(i.get("key").asString() + "=" + i.get("connected").asBoolean()));
        assertThat(items).containsExactly("claudeJson=true", "settings=true", "plugins=true", "projects=false");
        assertThat(globalClaude.get("readAt").asString()).matches("\\d{4}-\\d{2}-\\d{2}T.*[+-]\\d{2}:\\d{2}");
        assertThat(body).doesNotContain(ClaudeHomeFixture.ACCOUNT_MARKER).doesNotContain(ClaudeHomeFixture.ENV_MARKER);
        assertThat(body).as("컨테이너 마운트 경로는 응답에 넣지 않는다").doesNotContain(claudeHome.toString());
    }
}
