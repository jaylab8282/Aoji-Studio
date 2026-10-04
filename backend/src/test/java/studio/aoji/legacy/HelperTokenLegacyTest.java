package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static studio.aoji.legacy.LegacyTestSupport.helperToken;
import static studio.aoji.legacy.LegacyTestSupport.MAPPER;
import static studio.aoji.legacy.LegacyTestSupport.start;
import static studio.aoji.legacy.LegacyTestSupport.write;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * 옛 도우미 토큰 폴백(ADR-57). 폴백은 두 폴더가 모두 있는 상태(B)에서만 의미가 있다 - .jaystudio만 있으면
 * 기동 때 .aojistudio로 옮겨지기 때문이다.
 */
@ExtendWith(OutputCaptureExtension.class)
class HelperTokenLegacyTest {

    private static final String OLD_TOKEN = "01d".repeat(21) + "x";
    private static final String NEW_TOKEN = "4e3".repeat(21) + "y";
    private static final String SECRET = "5ec12e7".repeat(9) + "z";

    @TempDir
    Path mount;

    @TempDir
    Path data;

    @TempDir
    Path outside;

    @AfterEach
    void restorePermissions() throws IOException {
        LegacyTestSupport.restoreTree(mount);
    }

    private String tokenOf(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).isEqualTo(200);
        var node = MAPPER.readTree(response.body()).get("token");
        return node == null || node.isNull() ? null : node.asString();
    }

    private void bothDirs() throws IOException {
        write(mount.resolve(".aojistudio/collect-token"), "n".repeat(64));
        write(mount.resolve(".jaystudio/collect-token"), "o".repeat(64));
    }

    private static long count(CapturedOutput output) {
        return output.getAll().lines().filter(l -> l.contains("[legacy] helper-token")).count();
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07][NFR-08][ADR-57] .jaystudio/helper-token만 → 그 값 + 경고 1줄(토큰 값 미기록)")
    void legacyOnly(CapturedOutput output) throws Exception {
        bothDirs();
        write(mount.resolve(".jaystudio/helper-token"), OLD_TOKEN);

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(tokenOf(helperToken(ctx))).isEqualTo(OLD_TOKEN);
            assertThat(tokenOf(helperToken(ctx))).isEqualTo(OLD_TOKEN);
        }

        assertThat(count(output)).isEqualTo(1);
        assertThat(output.getAll()).contains("[legacy] helper-token · .aojistudio/helper-token 없음").doesNotContain(OLD_TOKEN);
    }

    @Test
    @DisplayName("[FR-013-AC8][ADR-57] 둘 다 → .aojistudio 값, 경고 0")
    void both(CapturedOutput output) throws Exception {
        bothDirs();
        write(mount.resolve(".jaystudio/helper-token"), OLD_TOKEN);
        write(mount.resolve(".aojistudio/helper-token"), NEW_TOKEN);

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(tokenOf(helperToken(ctx))).isEqualTo(NEW_TOKEN);
        }
        assertThat(count(output)).isZero();
    }

    @Test
    @DisplayName("[FR-013-AC8][ADR-57] 둘 다 없음 → null")
    void none() throws Exception {
        bothDirs();

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(tokenOf(helperToken(ctx))).isNull();
        }
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07][ADR-57] .jaystudio가 심볼릭 링크(실제 디렉터리 아님) → null + 사유 경고")
    void legacyDirIsSymlink(CapturedOutput output) throws Exception {
        write(mount.resolve(".aojistudio/collect-token"), "n".repeat(64));
        write(outside.resolve("realdir/helper-token"), SECRET);
        Files.createSymbolicLink(mount.resolve(".jaystudio"), outside.resolve("realdir"));

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            HttpResponse<String> response = helperToken(ctx);
            assertThat(tokenOf(response)).isNull();
            assertThat(response.body()).doesNotContain(SECRET);
        }

        assertThat(count(output)).isEqualTo(1);
        assertThat(output.getAll()).contains("상위 폴더가 실제 디렉터리가 아님").doesNotContain(SECRET)
                .doesNotContain(outside.toString());
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07][NFR-08][ADR-57] .jaystudio/helper-token이 마운트 밖 파일을 가리키는 링크 → null + 사유 경고, 링크 대상 값 0건")
    void legacyTokenIsSymlinkToOutside(CapturedOutput output) throws Exception {
        bothDirs();
        write(outside.resolve("secret"), SECRET);
        Files.createSymbolicLink(mount.resolve(".jaystudio/helper-token"), outside.resolve("secret"));

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            HttpResponse<String> response = helperToken(ctx);
            assertThat(tokenOf(response)).isNull();
            assertThat(response.body()).doesNotContain(SECRET);
        }

        assertThat(count(output)).isEqualTo(1);
        assertThat(output.getAll()).contains("일반 파일이 아님: 심볼릭 링크").doesNotContain(SECRET)
                .doesNotContain(outside.toString());
    }

    @Test
    @DisplayName("[FR-013-AC8][NFR-07][ADR-57] .aojistudio/helper-token이 링크 → ①은 없음, ② 규칙대로 .jaystudio 값")
    void newTokenSymlinkFallsThrough() throws Exception {
        bothDirs();
        write(outside.resolve("secret"), SECRET);
        Files.createSymbolicLink(mount.resolve(".aojistudio/helper-token"), outside.resolve("secret"));
        write(mount.resolve(".jaystudio/helper-token"), OLD_TOKEN);

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            HttpResponse<String> response = helperToken(ctx);
            assertThat(tokenOf(response)).isEqualTo(OLD_TOKEN);
            assertThat(response.body()).doesNotContain(SECRET);
        }
    }

    @Test
    @DisplayName("[FR-013-AC8][FR-001-E2][ADR-57] A-RO 모드 → .jaystudio/helper-token(①)을 일반 파일 규칙으로 읽는다, 폴백 경고 없음")
    void readOnlyModeReadsLegacyDirAsPrimary(CapturedOutput output) throws Exception {
        write(mount.resolve(".jaystudio/collect-token"), "o".repeat(64));
        write(mount.resolve(".jaystudio/helper-token"), OLD_TOKEN);
        LegacyTestSupport.makeTreeReadOnly(mount);

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(tokenOf(helperToken(ctx))).isEqualTo(OLD_TOKEN);
        }
        assertThat(count(output)).isZero();
    }
}
