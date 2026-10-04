package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LegacyEnvTest {

    private static final Map<String, String> KEYS = Map.of(
            "HOST_PATH", "aojistudio.host-path",
            "PUBLIC_PORT", "aojistudio.public-port",
            "MOUNT_PATH", "aojistudio.mount-path",
            "DATA_PATH", "aojistudio.data-path",
            "HELPER_URL", "aojistudio.helper-url",
            "ALLOWED_ORIGINS", "aojistudio.allowed-origins",
            "POLL_INTERVAL_MS", "aojistudio.poll-interval-ms");

    @Test
    @DisplayName("[NFR-05][ADR-56] 7개 이름 전체가 해석 대상이다")
    void sevenTargets() {
        assertThat(LegacyEnv.names()).containsExactlyInAnyOrderElementsOf(KEYS.keySet());
        assertThat(LegacyEnv.TARGETS).isEqualTo(KEYS);
    }

    @Test
    @DisplayName("[NFR-05][ADR-56] 7개 이름 × (새만 / 옛만 / 둘 다 같음 / 둘 다 다름 / 새 빈값+옛 값 / 둘 다 빈값)")
    void table() {
        for (String s : LegacyEnv.names()) {
            String n = "AOJISTUDIO_" + s;
            String o = "JAYSTUDIO_" + s;
            String key = KEYS.get(s);

            LegacyEnv.Result newOnly = LegacyEnv.resolve(Map.of(n, "new"));
            assertThat(newOnly.properties()).as(s + " 새만").containsExactly(Map.entry(key, "new"));
            assertThat(newOnly.warnings()).isEmpty();

            LegacyEnv.Result oldOnly = LegacyEnv.resolve(Map.of(o, "old"));
            assertThat(oldOnly.properties()).as(s + " 옛만").containsExactly(Map.entry(key, "old"));
            assertThat(oldOnly.warnings()).containsExactly(new LegacyEnv.Warning(LegacyEnv.Kind.IN_USE, o, n));

            LegacyEnv.Result same = LegacyEnv.resolve(Map.of(n, "v", o, "v"));
            assertThat(same.properties()).as(s + " 같음").containsExactly(Map.entry(key, "v"));
            assertThat(same.warnings()).containsExactly(new LegacyEnv.Warning(LegacyEnv.Kind.DUPLICATE, o, n));

            LegacyEnv.Result diff = LegacyEnv.resolve(Map.of(n, "new", o, "old"));
            assertThat(diff.properties()).as(s + " 다름").containsExactly(Map.entry(key, "new"));
            assertThat(diff.warnings()).containsExactly(new LegacyEnv.Warning(LegacyEnv.Kind.IGNORED_DIFFERENT, o, n));

            LegacyEnv.Result blankNew = LegacyEnv.resolve(Map.of(n, "", o, "old"));
            assertThat(blankNew.properties()).as(s + " 새 빈값").containsExactly(Map.entry(key, "old"));
            assertThat(blankNew.warnings()).containsExactly(new LegacyEnv.Warning(LegacyEnv.Kind.IN_USE, o, n));

            LegacyEnv.Result bothBlank = LegacyEnv.resolve(Map.of(n, "", o, ""));
            assertThat(bothBlank.properties()).as(s + " 둘 다 빈값").isEmpty();
            assertThat(bothBlank.warnings()).isEmpty();
        }
    }

    @Test
    @DisplayName("[NFR-08][ADR-56] 경고 문자열에 값이 없다")
    void warningsCarryNoValues() {
        Map<String, String> env = new HashMap<>();
        for (String s : LegacyEnv.names()) {
            env.put("JAYSTUDIO_" + s, "/Users/someone/Desktop/AojiStudio");
        }
        env.put("AOJISTUDIO_PUBLIC_PORT", "4180");
        env.put("JAYSTUDIO_PUBLIC_PORT", "4181");
        LegacyEnv.Result result = LegacyEnv.resolve(env);
        assertThat(result.warnings()).hasSize(7);

        List<String> lines = new java.util.ArrayList<>();
        LegacyWarnings warnings = new LegacyWarnings(java.time.Clock.systemUTC(), lines::add);
        for (LegacyEnv.Warning w : result.warnings()) {
            switch (w.kind()) {
                case IN_USE -> warnings.envInUse(w.legacyName(), w.newName());
                case IGNORED_DIFFERENT -> warnings.envIgnored(w.legacyName(), w.newName());
                case DUPLICATE -> warnings.envDuplicate(w.legacyName(), w.newName());
            }
        }
        String all = String.join("\n", lines) + result.warnings();
        assertThat(all).doesNotContain("/Users/someone", "4180", "4181");
        assertThat(all).contains("JAYSTUDIO_HOST_PATH", "AOJISTUDIO_HOST_PATH");
    }
}
