package studio.aoji.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 도우미 토큰 전달 (api-spec {@code GET /api/helper/token}, FR-013-AC8).
 */
@SpringBootTest
@AutoConfigureMockMvc
class HelperTokenControllerTest {

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

    private String issuedBrowserToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/browser-token").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asString();
    }

    @Test
    void missingOriginAndSecFetchSiteIsRejected() throws Exception {
        // [FR-013-AC8] Origin 없음·Sec-Fetch-Site 없음 → 403
        mockMvc.perform(get("/api/helper/token"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
    }

    @Test
    void allowedOriginWithBrowserTokenReturnsFileContent() throws Exception {
        // [FR-013-AC8] 허용 Origin + 브라우저 토큰 → 200 token
        Path dataDir = Files.createDirectories(mountRoot.resolve(".aojistudio"));
        String helperToken = "h".repeat(64);
        Files.writeString(dataDir.resolve("helper-token"), helperToken, StandardCharsets.UTF_8);

        String browserToken = issuedBrowserToken();

        mockMvc.perform(get("/api/helper/token")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", browserToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(helperToken));
    }

    @Test
    void missingHelperTokenFileReturnsNull() throws Exception {
        // [FR-013-AC8] 파일 없음 → token null
        String browserToken = issuedBrowserToken();

        mockMvc.perform(get("/api/helper/token")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", browserToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void missingBrowserTokenIsRejected() throws Exception {
        // [FR-013-AC8] 브라우저 토큰 없음 → 403 UNAUTHORIZED_TOKEN
        mockMvc.perform(get("/api/helper/token").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED_TOKEN"));
    }
}
