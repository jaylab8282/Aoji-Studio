package studio.jay.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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

    @Test
    void configuredPublicOriginIsAllowed() throws Exception {
        mockMvc.perform(get("/api/auth/browser-token").header("Origin", "http://127.0.0.1:4180"))
                .andExpect(status().isOk());
    }
}
