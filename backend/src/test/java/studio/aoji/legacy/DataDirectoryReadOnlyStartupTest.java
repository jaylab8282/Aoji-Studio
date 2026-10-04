package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static studio.aoji.legacy.LegacyTestSupport.fingerprint;
import static studio.aoji.legacy.LegacyTestSupport.getJson;
import static studio.aoji.legacy.LegacyTestSupport.postWorkflow;
import static studio.aoji.legacy.LegacyTestSupport.start;
import static studio.aoji.legacy.LegacyTestSupport.team;
import static studio.aoji.legacy.LegacyTestSupport.write;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
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

/**
 * 읽기 전용 마운트 + {@code .jaystudio/}만 → 이동 없이 옛 폴더를 읽기 전용 데이터 폴더로 기동(상태 A-RO, FR-001-E2).
 * 마운트 루트의 POSIX 쓰기 권한을 제거해 만든다(실제 쓰기 프로브가 실패한다). root로 실행되면 권한이 무시되므로
 */
@ExtendWith(OutputCaptureExtension.class)
class DataDirectoryReadOnlyStartupTest {

    private static final String TOKEN = "feed".repeat(16);

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

    private void legacyOnly() throws IOException {
        write(mount.resolve(".jaystudio/teams/legacy-team.json"), team("legacy-team"));
        write(mount.resolve(".jaystudio/trash/legacy-old.20260101-000000.md"), "old definition");
        write(mount.resolve(".jaystudio/collect-token"), TOKEN);
    }

    private void makeReadOnly() throws IOException {
        LegacyTestSupport.makeTreeReadOnly(mount);
        assertThat(mountReallyReadOnly())
                .as("이 환경에서 POSIX 권한 제거로 마운트를 읽기 전용으로 만들 수 없다(root 실행 등)").isTrue();
    }

    private boolean mountReallyReadOnly() {
        try {
            Files.delete(Files.createTempFile(mount, ".probe-", ".tmp"));
            return false;
        } catch (IOException e) {
            return true;
        }
    }

    @Test
    @DisplayName("[FR-001-E2][FR-001-AC1][ADR-55] 읽기 전용 마운트 → 기동 성공, writable=false, legacy-team, 토큰=.jaystudio 값, 옛 경로 표시, POST 403 READ_ONLY, .aojistudio 생성 0, sha256 불변")
    void readOnlyStartup(CapturedOutput output) throws Exception {
        legacyOnly();
        Map<String, String> before = fingerprint(mount);
        makeReadOnly();

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().writable()).isFalse();
            assertThat(ctx.getBean(RegistryService.class).current().workflows())
                    .extracting(w -> w.name()).containsExactly("legacy-team");
            assertThat(ctx.getBean(CollectTokenStore.class).token()).isEqualTo(TOKEN);
            JsonNode settings = getJson(ctx, "/api/settings");
            assertThat(settings.get("writable").asBoolean()).isFalse();
            assertThat(settings.get("teamsPath").asString()).isEqualTo(".jaystudio/teams/*.json");
            assertThat(settings.get("trashPath").asString()).isEqualTo(".jaystudio/trash/");

            HttpResponse<String> post = postWorkflow(ctx, "new-team");
            assertThat(post.statusCode()).isEqualTo(403);
            assertThat(post.body()).contains("READ_ONLY");
        }

        assertThat(Files.exists(mount.resolve(".aojistudio"), LinkOption.NOFOLLOW_LINKS)).isFalse();
        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(output.getAll()).contains("[legacy] data-dir · ").contains("쓰기 권한이 없어").doesNotContain(TOKEN);
    }

    @Test
    @DisplayName("[FR-001-E2][ADR-16][ADR-55] 읽기 전용 + .jaystudio/collect-token 없음 → 기동 실패")
    void readOnlyWithoutTokenFailsStartup() throws Exception {
        write(mount.resolve(".jaystudio/teams/legacy-team.json"), team("legacy-team"));
        makeReadOnly();

        assertThatThrownBy(() -> start(mount, data).close()).hasStackTraceContaining("collect-token");
        assertThat(Files.exists(mount.resolve(".aojistudio"), LinkOption.NOFOLLOW_LINKS)).isFalse();
    }

    @Test
    @DisplayName("[FR-001-E2][NFR-07][ADR-55] .jaystudio/teams의 구성 파일이 마운트 밖 링크 → 그 파일만 형식 오류(따라가지 않음)")
    void escapingTeamLinkIsFormatErrorOnly() throws Exception {
        legacyOnly();
        write(outside.resolve("escape.json"), team("escape"));
        Files.createSymbolicLink(mount.resolve(".jaystudio/teams/escape.json"), outside.resolve("escape.json"));
        makeReadOnly();

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            var snapshot = ctx.getBean(RegistryService.class).current();
            assertThat(snapshot.workflows()).extracting(w -> w.name()).containsExactly("legacy-team");
            assertThat(snapshot.formatErrors()).hasSize(1);
            assertThat(snapshot.formatErrors().get(0).file()).contains("escape");
        }
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] 권한 복구 후 같은 폴더로 재기동 → 상태 A로 이동")
    void restartAfterRestoringPermissionMigrates() throws Exception {
        legacyOnly();
        makeReadOnly();
        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().writable()).isFalse();
        }
        LegacyTestSupport.restoreTree(mount);

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().writable()).isTrue();
            assertThat(getJson(ctx, "/api/settings").get("teamsPath").asString()).isEqualTo(".aojistudio/teams/*.json");
        }
        assertThat(Files.exists(mount.resolve(".jaystudio"), LinkOption.NOFOLLOW_LINKS)).isFalse();
        assertThat(mount.resolve(".aojistudio/teams/legacy-team.json")).exists();
    }
}
