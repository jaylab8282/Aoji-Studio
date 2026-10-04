package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * 옛 환경 변수 이름으로 기동 (ADR-56). 환경 변수 값은 {@code properties}로 환경에 넣는다 -
 * post-processor는 프로세스 환경과 같은 경로(프로퍼티 소스의 정확한 이름)로 읽는다.
 * 로그에는 변수 이름만 있고 값(마커 문자열·포트)은 한 번도 나오지 않아야 한다(NFR-08).
 */
class LegacyEnvStartupTest {

    static final String OLD_HOST = "/Users/someone/Desktop/OldMountMarker";
    static final String NEW_HOST = "/Users/someone/Desktop/NewMountMarker";
    static final String IGNORED_OLD_HOST = "/Users/someone/Desktop/IgnoredOldMarker";

    abstract static class Base {
        @TempDir
        static Path mountRoot;
        @TempDir
        static Path dataDir;
        @Autowired
        MockMvc mockMvc;
        @Autowired
        ObjectMapper objectMapper;
        @Autowired
        Environment environment;

        @DynamicPropertySource
        static void props(DynamicPropertyRegistry registry) {
            registry.add("aojistudio.mount-path", () -> mountRoot.toString());
            registry.add("aojistudio.data-path", () -> dataDir.toString());
            registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
        }

        String hostPath(String origin) throws Exception {
            String body = mockMvc.perform(get("/api/settings").header("Origin", origin))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            return objectMapper.readTree(body).get("hostPath").asString();
        }

        static long count(String text, String needle) {
            return text.lines().filter(l -> l.contains(needle)).count();
        }
    }

    @SpringBootTest(properties = {
            "JAYSTUDIO_HOST_PATH=" + OLD_HOST,
            "JAYSTUDIO_PUBLIC_PORT=4999"})
    @AutoConfigureMockMvc
    @ExtendWith(OutputCaptureExtension.class)
    static class OldOnlyTest extends Base {
        @Test
        @DisplayName("[FR-014-AC4][FR-014-E1][ADR-56] 옛 HOST_PATH·PUBLIC_PORT만 → 기동, hostPath = 옛 값, [legacy] env 2줄(이름만), 값 0건")
        void oldNamesOnly(CapturedOutput output) throws Exception {
            assertThat(hostPath("http://127.0.0.1:4999")).isEqualTo(OLD_HOST);

            assertThat(count(output.getAll(), "[legacy] env · ")).isEqualTo(2);
            assertThat(output.getAll())
                    .contains("[legacy] env · JAYSTUDIO_HOST_PATH 사용 중 · AOJISTUDIO_HOST_PATH로 바꾸세요")
                    .contains("[legacy] env · JAYSTUDIO_PUBLIC_PORT 사용 중 · AOJISTUDIO_PUBLIC_PORT로 바꾸세요")
                    .doesNotContain(OLD_HOST)
                    .doesNotContain("OldMountMarker")
                    .doesNotContain("4999");
        }
    }

    @SpringBootTest(properties = {
            "AOJISTUDIO_HOST_PATH=" + NEW_HOST,
            "AOJISTUDIO_PUBLIC_PORT=4998",
            "JAYSTUDIO_HOST_PATH=" + IGNORED_OLD_HOST,
            "JAYSTUDIO_PUBLIC_PORT=4997"})
    @AutoConfigureMockMvc
    @ExtendWith(OutputCaptureExtension.class)
    static class BothDifferentTest extends Base {
        @Test
        @DisplayName("[FR-014-AC4][ADR-56] 둘 다 다름 → 새 값 + '옛 값 무시' 경고, 값 0건")
        void newWinsAndOldIgnored(CapturedOutput output) throws Exception {
            assertThat(hostPath("http://127.0.0.1:4998")).isEqualTo(NEW_HOST);

            assertThat(count(output.getAll(), "[legacy] env · ")).isEqualTo(2);
            assertThat(output.getAll())
                    .contains("[legacy] env · JAYSTUDIO_HOST_PATH 무시(AOJISTUDIO_HOST_PATH 우선, 값이 다름)")
                    .contains("[legacy] env · JAYSTUDIO_PUBLIC_PORT 무시(AOJISTUDIO_PUBLIC_PORT 우선, 값이 다름)")
                    .doesNotContain("NewMountMarker")
                    .doesNotContain("IgnoredOldMarker")
                    .doesNotContain("4998")
                    .doesNotContain("4997");
        }
    }

    @SpringBootTest(properties = {
            "JAYSTUDIO_HOST_PATH=" + OLD_HOST,
            "JAYSTUDIO_PUBLIC_PORT=4996"})
    @AutoConfigureMockMvc
    @ActiveProfiles("dev")
    @ExtendWith(OutputCaptureExtension.class)
    static class DevProfileTest extends Base {
        @Test
        @DisplayName("[FR-014-AC4][ADR-56] dev 프로필에서도 같은 해석, dev allowed-origins(5173) 유지")
        void devProfileResolvesLegacyNames(CapturedOutput output) throws Exception {
            assertThat(hostPath("http://127.0.0.1:5173")).isEqualTo(OLD_HOST);
            assertThat(environment.getProperty("aojistudio.allowed-origins")).isEqualTo("http://127.0.0.1:5173");
            assertThat(count(output.getAll(), "[legacy] env · ")).isEqualTo(2);
            assertThat(output.getAll()).doesNotContain("OldMountMarker").doesNotContain("4996");
        }
    }
}
