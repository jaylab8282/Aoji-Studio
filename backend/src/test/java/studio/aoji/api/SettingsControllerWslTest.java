package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** WSL 실행 환경의 설정·상태 응답 (ADR-77, FR-014-AC4, FR-013-AC5). */
@SpringBootTest
@AutoConfigureMockMvc
class SettingsControllerWslTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final String HOST_PATH = "/home/jaybee/AojiStudio";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> HOST_PATH);
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.host-os", () -> "wsl");
        registry.add("aojistudio.wsl-distro", () -> "Ubuntu-24.04");
    }

    private JsonNode fetch(String url) throws Exception {
        String body = mockMvc.perform(get(url).header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body);
    }

    @Test
    @DisplayName("[FR-014-AC4] WSL 호스트 경로가 그대로 hostPath로 나가고 마운트 경로는 없다")
    void wslHostPathIsReturnedAsIs() throws Exception {
        JsonNode body = fetch("/api/settings");
        assertThat(body.get("hostPath").asString()).isEqualTo(HOST_PATH);
        assertThat(body.toString()).doesNotContain(mountRoot.toString());
    }

    @Test
    @DisplayName("[FR-013-AC5] 두 명령이 실행 환경 값이고 terminalApp은 Windows Terminal")
    void settingsCommandsFollowHostOs() throws Exception {
        JsonNode body = fetch("/api/settings");
        assertThat(body.get("defaultSessionCommand").asString())
                .isEqualTo("wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- claude");
        assertThat(body.get("leadSessionCommandTemplate").asString())
                .isEqualTo("wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- claude --agent <팀장 name>");
        assertThat(body.get("terminalApp").asString()).isEqualTo("Windows Terminal");
        assertThat(body.get("hostOs").asString()).isEqualTo("wsl");
        assertThat(body.get("wslDistro").asString()).isEqualTo("Ubuntu-24.04");
    }

    @Test
    @DisplayName("[FR-013-AC1] GET /api/state config에 hostOs·wslDistro·실행 환경별 기본 명령")
    void stateConfigCarriesHostOs() throws Exception {
        JsonNode config = fetch("/api/state").get("config");
        assertThat(config.get("hostOs").asString()).isEqualTo("wsl");
        assertThat(config.get("wslDistro").asString()).isEqualTo("Ubuntu-24.04");
        assertThat(config.get("defaultSessionCommand").asString())
                .isEqualTo("wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- claude");
    }
}
