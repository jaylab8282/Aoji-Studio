package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 다시 읽기 (api-spec {@code POST /api/registry/rescan}, FR-001-AC4).
 */
@SpringBootTest
@AutoConfigureMockMvc
class RegistryControllerTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";

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
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void createAgentsDir() throws Exception {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
    }

    private String issuedBrowserToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/browser-token").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("token")
                .asString();
    }

    @Test
    void rescanRespondsUnderOneSecondWithIncreasedRevisionAndImmediateReflection() throws Exception {
        // [FR-001-AC4] rescan 응답 < 1s, 응답 revision 증가, 파일 추가 직후 호출 시 즉시 반영
        String browserToken = issuedBrowserToken();

        long start1 = System.nanoTime();
        MvcResult first = mockMvc.perform(post("/api/registry/rescan")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", browserToken))
                .andExpect(status().isOk())
                .andReturn();
        double elapsed1Millis = (System.nanoTime() - start1) / 1_000_000.0;
        assertThat(elapsed1Millis).isLessThan(1000.0);

        JsonNode firstBody = objectMapper.readTree(first.getResponse().getContentAsString());
        int revision1 = firstBody.get("revision").asInt();

        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve("rescan-added.md"),
                "---\nname: rescan-added\ndescription: 방금 추가됨\n---\n본문\n",
                StandardCharsets.UTF_8);

        long start2 = System.nanoTime();
        MvcResult second = mockMvc.perform(post("/api/registry/rescan")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", browserToken))
                .andExpect(status().isOk())
                .andReturn();
        double elapsed2Millis = (System.nanoTime() - start2) / 1_000_000.0;
        assertThat(elapsed2Millis).isLessThan(1000.0);

        JsonNode secondBody = objectMapper.readTree(second.getResponse().getContentAsString());
        int revision2 = secondBody.get("revision").asInt();
        assertThat(revision2).isGreaterThan(revision1);

        boolean hasNewAgent = false;
        for (JsonNode agent : secondBody.get("agents")) {
            if ("rescan-added".equals(agent.get("name").asString())) {
                hasNewAgent = true;
            }
        }
        assertThat(hasNewAgent).as("파일 추가 직후 호출한 rescan 응답에 새 에이전트가 바로 나타나야 한다").isTrue();
    }

    @Test
    void missingBrowserTokenIsRejected() throws Exception {
        // [FR-001-AC4] 브라우저 토큰 없이 rescan 호출 → 403 UNAUTHORIZED_TOKEN(기존 인증 규칙 그대로 적용)
        mockMvc.perform(post("/api/registry/rescan").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isForbidden());
    }
}
