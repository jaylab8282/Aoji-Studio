package studio.aoji.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.springframework.context.ConfigurableApplicationContext;
import studio.aoji.support.MountTestSupport;
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
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
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
                        .header("X-AojiStudio-Browser-Token", browserToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(helperToken));
    }

    @Test
    void missingHelperTokenFileReturnsNull() throws Exception {
        // [FR-013-AC8] 파일 없음 → token null
        String browserToken = issuedBrowserToken();

        mockMvc.perform(get("/api/helper/token")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", browserToken))
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

    private String tokenOf(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).isEqualTo(200);
        var node = MountTestSupport.MAPPER.readTree(response.body()).get("token");
        return node == null || node.isNull() ? null : node.asString();
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07] .aojistudio/helper-token 값 전달(전체 기동, 마운트 격리)")
    void helperTokenValueIsDelivered(@TempDir Path mount, @TempDir Path data) throws Exception {
        String token = "4e3".repeat(21) + "y";
        MountTestSupport.write(mount.resolve(".aojistudio/helper-token"), token);

        try (ConfigurableApplicationContext ctx = MountTestSupport.start(mount, data)) {
            assertThat(tokenOf(MountTestSupport.helperToken(ctx))).isEqualTo(token);
        }
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07] .aojistudio/helper-token 없음 → token null")
    void helperTokenAbsentIsNull(@TempDir Path mount, @TempDir Path data) throws Exception {
        MountTestSupport.write(mount.resolve(".aojistudio/teams/a.json"), MountTestSupport.team("a"));

        try (ConfigurableApplicationContext ctx = MountTestSupport.start(mount, data)) {
            assertThat(tokenOf(MountTestSupport.helperToken(ctx))).isNull();
        }
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07] .aojistudio/helper-token이 마운트 밖 링크 → null, 링크 대상 값이 응답에 없다(폴백 없음)")
    void helperTokenSymlinkIsNull(@TempDir Path mount, @TempDir Path data, @TempDir Path outside) throws Exception {
        String secret = "5ec12e7".repeat(9) + "z";
        MountTestSupport.write(outside.resolve("secret"), secret);
        Files.createDirectories(mount.resolve(".aojistudio"));
        Files.createSymbolicLink(mount.resolve(".aojistudio/helper-token"), outside.resolve("secret"));

        try (ConfigurableApplicationContext ctx = MountTestSupport.start(mount, data)) {
            HttpResponse<String> response = MountTestSupport.helperToken(ctx);
            assertThat(tokenOf(response)).isNull();
            assertThat(response.body()).doesNotContain(secret);
        }
    }
}
