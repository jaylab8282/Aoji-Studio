package studio.aoji.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Origin 규칙 (architecture.md §5, DoD "다른 Origin 차단"). 운영(기본) 프로필 기준.
 * 기본 허용 Origin은 {@code http://127.0.0.1:<PUBLIC_PORT>} 하나다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OriginFilterTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("jaystudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @Test
    void otherOriginIsRejected() throws Exception {
        // [DoD 다른 Origin 차단] http://127.0.0.1:9999 Origin → 403
        mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://127.0.0.1:9999"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
    }

    @Test
    void sameOriginWithoutOriginHeaderPasses() throws Exception {
        // [DoD 다른 Origin 차단] Sec-Fetch-Site same-origin + Origin 없음 → 통과
        mockMvc.perform(get("/api/auth/browser-token").header("Sec-Fetch-Site", "same-origin"))
                .andExpect(status().isOk());
    }

    @Test
    void noOriginAndNoSecFetchSiteIsRejected() throws Exception {
        // curl 등 브라우저 밖 클라이언트: Origin·Sec-Fetch-Site 둘 다 없음 → 403
        mockMvc.perform(get("/api/auth/browser-token"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
    }

    @Test
    void viteDevOriginIsRejectedInProductionProfile() throws Exception {
        // [DoD 다른 Origin 차단] 운영 프로필 5173 거부
        mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://127.0.0.1:5173"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
    }

    /**
     * ADR-41 (d) · architecture.md §5 "403 FORBIDDEN_ORIGIN 응답 문구" · conventions.md §4 MUST.
     * 사용자가 실제로 겪은 경로(http://localhost:4180으로 접속한 뒤 변경 요청)를 그대로 재현한다.
     */
    @Test
    void forbiddenOriginMessageIsCompletedWithPublicOrigin() throws Exception {
        // [ADR-41] 허용되지 않은 Origin → 403 message가 publicOrigin이 치환된 완성 문장
        String body = mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://localhost:4180"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"))
                .andExpect(jsonPath("$.message")
                        .value("허용되지 않은 출처입니다 · http://127.0.0.1:4180 주소로 다시 접속하세요"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        // ADR-33 (a): 치환되지 않은 자리표시가 화면에 남으면 결함이다.
        assertThat(body).doesNotContain("<").doesNotContain(">").doesNotContain("publicOrigin").doesNotContain("%s");
    }

    /**
     * ADR-41 (a): 허용 목록을 넓히지 않는 것이 이번 확정의 핵심이다.
     * 같은 포트의 다른 루프백 호스트명은 진입 주소 정규화(T-FIX-06)로 해결한다.
     */
    @Test
    void allowedOriginsNeverIncludeLocalhostOrIpv6Loopback() throws Exception {
        // [ADR-41] 허용 목록 기본값·application.yaml에 'localhost'·'::1' 문자열이 없다
        assertThat(readClasspathResource("application.yaml"))
                .doesNotContain("localhost")
                .doesNotContain("::1");
        assertThat(readClasspathResource("application-dev.yaml"))
                .doesNotContain("localhost")
                .doesNotContain("::1");

        // 허용 목록 기본값(http://127.0.0.1:<public-port> 하나)을 동작으로 확인한다.
        mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://localhost:4180"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
        mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://[::1]:4180"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
    }

    private static String readClasspathResource(String name) throws IOException {
        try (InputStream in = new ClassPathResource(name).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void configuredPublicOriginIsAllowed() throws Exception {
        mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://127.0.0.1:4180"))
                .andExpect(status().isOk());
    }
}
