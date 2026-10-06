package studio.aoji.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static studio.aoji.support.MountTestSupport.fingerprint;
import static studio.aoji.support.MountTestSupport.getJson;
import static studio.aoji.support.MountTestSupport.postWorkflow;
import static studio.aoji.support.MountTestSupport.start;
import static studio.aoji.support.MountTestSupport.team;
import static studio.aoji.support.MountTestSupport.write;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ConfigurableApplicationContext;
import studio.aoji.collect.CollectTokenStore;
import studio.aoji.registry.RegistryService;
import studio.aoji.support.MountTestSupport;
import tools.jackson.databind.JsonNode;

/**
 * 읽기 전용 마운트 기동 판정(FR-001-E2, ADR-16, NFR-07). 마운트 루트의 POSIX 쓰기 권한을 제거해 만든다(실제 쓰기
 * 프로브가 실패한다). root로 실행되면 권한이 무시되므로 {@link #makeReadOnly()}가 실제로 쓰기가 막혔는지
 * 확인하고, 막히지 않으면 테스트를 실패시킨다(건너뛰지 않는다).
 */
class ReadOnlyMountStartupTest {

    private static final String TOKEN = "feed".repeat(16);

    @TempDir
    Path mount;

    @TempDir
    Path data;

    @TempDir
    Path outside;

    @AfterEach
    void restorePermissions() throws IOException {
        MountTestSupport.restoreTree(mount);
    }

    private void withToken() throws IOException {
        write(mount.resolve(".aojistudio/teams/team-a.json"), team("team-a"));
        write(mount.resolve(".aojistudio/trash/old.20260101-000000.md"), "old definition");
        write(mount.resolve(".aojistudio/collect-token"), TOKEN);
    }

    private void makeReadOnly() throws IOException {
        MountTestSupport.makeTreeReadOnly(mount);
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
    @DisplayName("[FR-001-E2][FR-001-AC1][ADR-16] 읽기 전용 마운트 + .aojistudio/collect-token → 기동 성공, writable=false, 토큰 그대로, teamsPath .aojistudio/…, POST 403 READ_ONLY, sha256 불변, .aojistudio 아래 새 파일 0")
    void readOnlyStartup() throws Exception {
        withToken();
        Map<String, String> before = fingerprint(mount);
        makeReadOnly();

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            assertThat(ctx.getBean(RegistryService.class).current().writable()).isFalse();
            assertThat(ctx.getBean(RegistryService.class).current().workflows())
                    .extracting(w -> w.name()).containsExactly("team-a");
            assertThat(ctx.getBean(CollectTokenStore.class).token()).isEqualTo(TOKEN);
            JsonNode settings = getJson(ctx, "/api/settings");
            assertThat(settings.get("writable").asBoolean()).isFalse();
            assertThat(settings.get("teamsPath").asString()).isEqualTo(".aojistudio/teams/*.json");
            assertThat(settings.get("trashPath").asString()).isEqualTo(".aojistudio/trash/");

            HttpResponse<String> post = postWorkflow(ctx, "new-team");
            assertThat(post.statusCode()).isEqualTo(403);
            assertThat(post.body()).contains("READ_ONLY");
        }

        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(fingerprint(mount.resolve(".aojistudio"))).containsOnlyKeys(
                "teams", "teams/team-a.json", "trash", "trash/old.20260101-000000.md", "collect-token");
    }

    @Test
    @DisplayName("[FR-001-E2][ADR-16] 읽기 전용 + collect-token 없음 → 기동 실패, .aojistudio 아래 새 파일 0")
    void readOnlyWithoutTokenFailsStartup() throws Exception {
        write(mount.resolve(".aojistudio/teams/team-a.json"), team("team-a"));
        Map<String, String> before = fingerprint(mount);
        makeReadOnly();

        assertThatThrownBy(() -> start(mount, data).close()).hasStackTraceContaining("collect-token");
        assertThat(fingerprint(mount)).isEqualTo(before);
    }

    @Test
    @DisplayName("[FR-001-E2][NFR-07] .aojistudio/teams/x.json이 마운트 밖 링크 → 그 파일만 형식 오류(따라가지 않음)")
    void escapingTeamLinkIsFormatErrorOnly() throws Exception {
        withToken();
        write(outside.resolve("x.json"), team("escape"));
        Files.createSymbolicLink(mount.resolve(".aojistudio/teams/x.json"), outside.resolve("x.json"));
        makeReadOnly();

        try (ConfigurableApplicationContext ctx = start(mount, data)) {
            var snapshot = ctx.getBean(RegistryService.class).current();
            assertThat(snapshot.workflows()).extracting(w -> w.name()).containsExactly("team-a");
            assertThat(snapshot.formatErrors()).hasSize(1);
            assertThat(snapshot.formatErrors().get(0).file()).contains("x.json");
        }
    }
}
