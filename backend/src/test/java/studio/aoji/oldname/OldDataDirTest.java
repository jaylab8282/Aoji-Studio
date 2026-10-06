package studio.aoji.oldname;

import static org.assertj.core.api.Assertions.assertThat;
import static studio.aoji.support.MountTestSupport.fingerprint;
import static studio.aoji.support.MountTestSupport.helperToken;
import static studio.aoji.support.MountTestSupport.start;
import static studio.aoji.support.MountTestSupport.team;
import static studio.aoji.support.MountTestSupport.write;

import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ConfigurableApplicationContext;
import studio.aoji.registry.RegistryService;
import studio.aoji.support.MountTestSupport;

/** NFR-13 ③ 옛 데이터 폴더 무시 (ADR-62). 이 폴더(oldname/)만 옛 이름 글자를 쓸 수 있다. */
class OldDataDirTest {

    private static final String OLD_COLLECT = "0ld".repeat(21) + "c";
    private static final String OLD_HELPER = "0ld".repeat(21) + "h";

    @TempDir
    Path mount;

    @TempDir
    Path data;

    @TempDir
    Path outside;

    @Test
    @DisplayName("[NFR-13-3][FR-001-AC6] 옛 폴더만 있음 → 기동 성공, 옛 폴더 sha256 불변, .aojistudio/collect-token 새로 생성(옛 값과 다름), workflows 0개, helper 토큰 null")
    void oldDataDirIsIgnored() throws Exception {
        Path old = mount.resolve(".jaystudio");
        write(old.resolve("teams/x.json"), team("x"));
        write(old.resolve("trash/y.md"), "old definition");
        write(old.resolve("collect-token"), OLD_COLLECT);
        write(old.resolve("helper-token"), OLD_HELPER);
        Map<String, String> before = fingerprint(old);

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().workflows()).isEmpty();
            HttpResponse<String> response = helperToken(ctx);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(MountTestSupport.MAPPER.readTree(response.body()).get("token").isNull()).isTrue();
            assertThat(response.body()).doesNotContain(OLD_HELPER);
        }

        assertThat(fingerprint(old)).isEqualTo(before);
        Path created = mount.resolve(".aojistudio/collect-token");
        assertThat(created).isRegularFile();
        assertThat(Files.readString(created).strip()).isNotEmpty().isNotEqualTo(OLD_COLLECT);
    }

    @Test
    @DisplayName("[NFR-13-3][FR-001-AC6] 옛 이름이 심볼릭 링크여도 기동 성공(읽지 않는다), 링크 대상 불변")
    void oldDataDirSymlinkIsIgnored() throws Exception {
        write(outside.resolve("real/collect-token"), OLD_COLLECT);
        write(outside.resolve("real/helper-token"), OLD_HELPER);
        Map<String, String> before = fingerprint(outside);
        Files.createSymbolicLink(mount.resolve(".jaystudio"), outside.resolve("real"));

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().workflows()).isEmpty();
            assertThat(helperToken(ctx).body()).doesNotContain(OLD_HELPER);
        }

        assertThat(fingerprint(outside)).isEqualTo(before);
        assertThat(Files.readString(mount.resolve(".aojistudio/collect-token")).strip())
                .isNotEmpty().isNotEqualTo(OLD_COLLECT);
    }
}
