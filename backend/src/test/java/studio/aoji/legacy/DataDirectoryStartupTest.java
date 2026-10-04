package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static studio.aoji.legacy.LegacyTestSupport.fingerprint;
import static studio.aoji.legacy.LegacyTestSupport.getJson;
import static studio.aoji.legacy.LegacyTestSupport.start;
import static studio.aoji.legacy.LegacyTestSupport.team;
import static studio.aoji.legacy.LegacyTestSupport.write;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import studio.aoji.collect.CollectTokenStore;
import studio.aoji.registry.RegistryService;
import tools.jackson.databind.JsonNode;

/** 전체 컨텍스트 기동에서 데이터 폴더 이동·판정이 다른 빈보다 먼저 끝나는지 본다(ADR-55). */
@ExtendWith(OutputCaptureExtension.class)
class DataDirectoryStartupTest {

    private static final String TOKEN = "c0ffee".repeat(10) + "abcd";

    @TempDir
    Path mount;

    @TempDir
    Path data;

    private void legacyOnly() throws IOException {
        write(mount.resolve(".jaystudio/teams/legacy-team.json"), team("legacy-team"));
        write(mount.resolve(".jaystudio/trash/legacy-old.20260101-000000.md"), "old definition");
        write(mount.resolve(".jaystudio/collect-token"), TOKEN);
    }

    @Test
    @DisplayName("[NFR-09][FR-001-AC1][FR-012-AC4][ADR-55] legacy-only → 이동 후 기동: legacy-team·토큰 보존(순서 보장)·teamsPath/trashPath·휴지통 유지")
    void legacyOnlyMigratesBeforeBeans(CapturedOutput output) throws Exception {
        legacyOnly();

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(CollectTokenStore.class).token()).isEqualTo(TOKEN);
            assertThat(ctx.getBean(RegistryService.class).current().workflows())
                    .extracting(w -> w.name()).containsExactly("legacy-team");
            JsonNode settings = getJson(ctx, "/api/settings");
            assertThat(settings.get("teamsPath").asString()).isEqualTo(".aojistudio/teams/*.json");
            assertThat(settings.get("trashPath").asString()).isEqualTo(".aojistudio/trash/");
            assertThat(settings.get("writable").asBoolean()).isTrue();
        }

        assertThat(Files.exists(mount.resolve(".jaystudio"), LinkOption.NOFOLLOW_LINKS)).isFalse();
        assertThat(mount.resolve(".aojistudio/trash/legacy-old.20260101-000000.md")).exists();
        assertThat(Files.readString(mount.resolve(".aojistudio/collect-token"))).isEqualTo(TOKEN);
        assertThat(output.getAll()).contains("[legacy] data-dir · .jaystudio/ → .aojistudio/ 옮김(teams 1, trash 1, collect-token)");
        assertThat(output.getAll()).doesNotContain(TOKEN).doesNotContain(mount.toString());
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] 둘 다 있음(B) → .aojistudio 쪽만 보이고 .jaystudio는 그대로")
    void bothOnlyAojistudioIsVisible() throws Exception {
        legacyOnly();
        write(mount.resolve(".aojistudio/teams/new-team.json"), team("new-team"));
        write(mount.resolve(".aojistudio/collect-token"), "n".repeat(64));
        Map<String, String> legacyBefore = fingerprint(mount.resolve(".jaystudio"));

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().workflows())
                    .extracting(w -> w.name()).containsExactly("new-team");
            assertThat(ctx.getBean(CollectTokenStore.class).token()).isEqualTo("n".repeat(64));
        }

        assertThat(fingerprint(mount.resolve(".jaystudio"))).isEqualTo(legacyBefore);
    }

    @Test
    @DisplayName("[NFR-07][ADR-55] .aojistudio가 심볼릭 링크(상태 F) → 컨텍스트 기동 실패, 메시지에 링크 대상 경로 없음")
    void aojistudioSymlinkFailsStartup() throws Exception {
        Path target = Files.createDirectories(mount.resolve("linkTargetDir"));
        Files.createSymbolicLink(mount.resolve(".aojistudio"), target);
        Map<String, String> before = fingerprint(mount);

        assertThatThrownBy(() -> start(mount, data).close())
                .hasStackTraceContaining("심볼릭 링크")
                .satisfies(e -> assertThat(rootMessage(e)).doesNotContain("linkTargetDir"));
        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(List.of(mount.toFile().list())).doesNotContain("collect-token");
    }

    static String rootMessage(Throwable t) {
        Throwable cursor = t;
        while (cursor.getCause() != null) {
            cursor = cursor.getCause();
        }
        return String.valueOf(cursor.getMessage());
    }
}
