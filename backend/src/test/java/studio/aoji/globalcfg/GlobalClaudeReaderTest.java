package studio.aoji.globalcfg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import studio.aoji.config.AppProperties;
import studio.aoji.live.Masker;
import studio.aoji.mcp.McpFileParser;
import studio.aoji.mcp.McpMasker;
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.MutableClock;
import studio.aoji.usage.UsageArea;
import studio.aoji.usage.UsageChangedNotifier;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.ObjectMapper;

/** 전역 Claude 설정 읽기와 한도 캐시 파싱 (ADR-79 결정 5~7, ADR-83 결정 6, FR-023-AC5, FR-027-AC4, NFR-15). */
class GlobalClaudeReaderTest {

    private static final String HOST = "/Users/someone/AojiStudio";

    @TempDir
    Path home;

    private final ObjectMapper mapper = new ObjectMapper();
    private final UsageChangedNotifier notifier = mock(UsageChangedNotifier.class);
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-16T01:00:00Z"), ZoneId.of("Asia/Seoul"));
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Logger rootLogger;

    @BeforeEach
    void captureLogs() {
        rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logs.start();
        rootLogger.addAppender(logs);
        rootLogger.setLevel(Level.DEBUG);
    }

    @AfterEach
    void releaseLogs() {
        rootLogger.detachAppender(logs);
        rootLogger.setLevel(Level.INFO);
    }

    private GlobalClaudeReader reader(String homeHost) {
        AppProperties properties = new AppProperties();
        properties.setHostPath(HOST);
        properties.setClaudeHomeHost(homeHost);
        properties.setClaudeHomeMount(home.toString());
        GlobalClaudeMounts mounts = new GlobalClaudeMounts(properties, mapper);
        McpMasker masker = new McpMasker(new Masker());
        return new GlobalClaudeReader(
                mounts,
                properties,
                new McpFileParser(mapper, masker),
                new UsageCacheParser(),
                notifier,
                mapper,
                clock);
    }

    private void bumpMtime(Path file, long seconds) throws IOException {
        Files.setLastModifiedTime(file, FileTime.from(Files.getLastModifiedTime(file).toInstant().plusSeconds(seconds)));
    }

    // ---- NFR-15 ------------------------------------------------------------------------------------------------

    @Test
    @DisplayName("[NFR-15] 계정 표지·settings env 표지·accountUuid 값은 읽은 결과 객체 직렬화·로그에 0회, 필요한 값은 읽는다")
    void markersNeverReachSerializedSnapshotOrLogs() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Path credentials = home.resolve(".claude").resolve(".credentials.json");
        Files.setPosixFilePermissions(credentials, PosixFilePermissions.fromString("---------"));

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();
        String json = mapper.writeValueAsString(snapshot);

        // 읽은 것(필요한 키)
        assertThat(snapshot.globalServers()).extracting("name").containsExactlyInAnyOrder("github", "docs-server");
        assertThat(snapshot.enabledMcpjsonServers()).containsExactly("github");
        assertThat(snapshot.disabledMcpjsonServers()).containsExactly("local-tool");
        assertThat(snapshot.disabledMcpServers()).containsExactly("docs-server");
        assertThat(snapshot.enabledPlugins())
                .containsEntry("demo-tools@aoji-fixture-market", true)
                .containsEntry("unused-plugin@aoji-fixture-market", false);
        assertThat(snapshot.usageCache()).isNotNull();
        // 안 읽는 것
        assertThat(json)
                .doesNotContain(ClaudeHomeFixture.ACCOUNT_MARKER)
                .doesNotContain("AOJI-MARKER-EMAIL")
                .doesNotContain(ClaudeHomeFixture.ENV_MARKER)
                .doesNotContain(ClaudeHomeFixture.CREDENTIAL_MARKER)
                .doesNotContain("accountUuid")
                .doesNotContain("FIXTURE_SETTINGS_KEY")
                .doesNotContain("Bearer");
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage).noneMatch(m -> m.contains("AOJI-MARKER"));
        assertThat(mapper.writeValueAsString(snapshot.usageCache())).doesNotContain("accountUuid");
    }

    @Test
    @DisplayName("[NFR-15] 파싱 실패 로그에도 파일 내용·표지가 없고 출처 이름과 사유만 있다")
    void parseFailureLogsContainNoContent() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Files.writeString(
                home.resolve(".claude.json"),
                "{\n  \"oauthAccount\": {\"emailAddress\": \"" + ClaudeHomeFixture.ACCOUNT_MARKER + "\"},\n  \"x\": }\n");

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.problems())
                .anySatisfy(p -> {
                    assertThat(p.source()).isEqualTo("global");
                    assertThat(p.file()).isEqualTo("~/.claude.json");
                    assertThat(p.kind()).isEqualTo("parse");
                    assertThat(p.line()).isEqualTo(3);
                });
        assertThat(snapshot.globalServers()).isEmpty();
        // 다른 항목은 그대로 읽는다
        assertThat(snapshot.enabledPlugins()).isNotEmpty();
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage).noneMatch(m -> m.contains("AOJI-MARKER"));
        assertThat(mapper.writeValueAsString(snapshot)).doesNotContain(ClaudeHomeFixture.ACCOUNT_MARKER);
    }

    @Test
    @DisplayName("[NFR-15] 연결된 항목이 없으면 아무것도 읽지 않고 readAt은 null")
    void nothingConnectedReadsNothing() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);

        GlobalSnapshot snapshot = reader("").snapshot();

        assertThat(snapshot.readAt()).isNull();
        assertThat(snapshot.globalServers()).isEmpty();
        assertThat(snapshot.plugins()).isEmpty();
        assertThat(snapshot.usageCache()).isNull();
    }

    @Test
    @DisplayName("[NFR-15] projects 아래 다른 프로젝트 경로의 키는 읽지 않는다")
    void otherProjectKeysAreNotRead() throws Exception {
        ClaudeHomeFixture.copyBasic(home, "/Users/other/Elsewhere");

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.enabledMcpjsonServers()).isEmpty();
        assertThat(snapshot.disabledMcpjsonServers()).isEmpty();
        assertThat(snapshot.disabledMcpServers()).isEmpty();
        assertThat(snapshot.globalServers()).extracting("name").containsExactlyInAnyOrder("github", "docs-server");
    }

    // ---- FR-023-AC5 --------------------------------------------------------------------------------------------

    @Test
    @DisplayName("[FR-023-AC5] 파일 mtime이 바뀌면 다시 읽고 readAt이 갱신되며 mcp·settings 알림이 나간다")
    void mtimeChangeTriggersReread() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        GlobalClaudeReader reader = reader(ClaudeHomeFixture.HOME_HOST);
        Instant firstReadAt = reader.snapshot().readAt();
        assertThat(firstReadAt).isEqualTo(clock.instant());

        clock.advance(Duration.ofSeconds(30));
        assertThat(reader.refresh()).as("바뀐 것이 없으면 다시 읽지 않는다").isFalse();
        assertThat(reader.snapshot().readAt()).isEqualTo(firstReadAt);
        verify(notifier, never()).markChanged(anyString());

        Path claudeJson = home.resolve(".claude.json");
        String text = Files.readString(claudeJson).replace("\"docs-server\": {", "\"docs-renamed\": {");
        Files.writeString(claudeJson, text);
        bumpMtime(claudeJson, 5);

        assertThat(reader.refresh()).isTrue();
        GlobalSnapshot after = reader.snapshot();
        assertThat(after.readAt()).isEqualTo(clock.instant()).isAfter(firstReadAt);
        assertThat(after.globalServers()).extracting("name").contains("docs-renamed").doesNotContain("docs-server");
        verify(notifier).markChanged(UsageArea.MCP);
        verify(notifier).markChanged(UsageArea.SETTINGS);
        verify(notifier, never()).markChanged(UsageArea.LIMITS);
    }

    @Test
    @DisplayName("[FR-023-AC5] 한도 캐시 값이 바뀌면 limits 알림도 나간다")
    void usageCacheChangeNotifiesLimits() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        GlobalClaudeReader reader = reader(ClaudeHomeFixture.HOME_HOST);
        reader.snapshot();
        reset(notifier);

        Path claudeJson = home.resolve(".claude.json");
        Files.writeString(claudeJson, Files.readString(claudeJson).replace("1792020000000", "1792020060000"));
        bumpMtime(claudeJson, 5);

        assertThat(reader.refresh()).isTrue();
        assertThat(reader.snapshot().usageCache().fetchedAtMs()).isEqualTo(1792020060000L);
        verify(notifier).markChanged(UsageArea.LIMITS);
    }

    @Test
    @DisplayName("[FR-023-AC5] 플러그인 MCP 정의 파일이 바뀌어도 다시 읽는다")
    void pluginDefinitionFileChangeTriggersReread() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        GlobalClaudeReader reader = reader(ClaudeHomeFixture.HOME_HOST);
        reader.snapshot();

        Path pluginMcp = home.resolve(".claude/plugins/cache/aoji-fixture-market/flat-tools/1.0.0/.mcp.json");
        Files.writeString(pluginMcp, "{\"flat-new\": {\"command\": \"node\"}}");
        bumpMtime(pluginMcp, 5);

        assertThat(reader.refresh()).isTrue();
        GlobalSnapshot.PluginInstall flat = reader.snapshot().plugins().stream()
                .filter(p -> p.pluginName().equals("flat-tools"))
                .findFirst()
                .orElseThrow();
        assertThat(flat.servers()).extracting("name").containsExactly("flat-new");
    }

    @Test
    @DisplayName("[FR-023-AC5] 연결 상태가 바뀌면(대역 표지가 사라짐 등) 다시 읽는다")
    void connectionChangeTriggersReread() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Files.writeString(home.resolve(".claude").resolve("settings.json"), "{\"aojistudioStandIn\": true}");
        GlobalClaudeReader reader = reader(ClaudeHomeFixture.HOME_HOST);
        assertThat(reader.snapshot().enabledPlugins()).isEmpty();

        Files.writeString(
                home.resolve(".claude").resolve("settings.json"),
                "{\"enabledPlugins\": {\"demo-tools@aoji-fixture-market\": true}}");

        assertThat(reader.refresh()).isTrue();
        assertThat(reader.snapshot().enabledPlugins()).containsEntry("demo-tools@aoji-fixture-market", true);
    }

    // ---- 플러그인 출처 (ADR-85 결정 1, A-27) ------------------------------------------------------------------------

    @Test
    @DisplayName("[FR-023-AC1] installed_plugins.json {version, plugins} 배열 원소마다 읽고 projectPath≠hostPath 원소는 건너뛴다")
    void pluginInstallsSkipOtherProjects() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.plugins()).extracting(GlobalSnapshot.PluginInstall::key)
                .containsExactly("demo-tools@aoji-fixture-market", "flat-tools@aoji-fixture-market");
        GlobalSnapshot.PluginInstall demo = snapshot.plugins().getFirst();
        assertThat(demo.servers()).extracting("name").containsExactly("demo-helper");
        assertThat(snapshot.problems()).isEmpty();
    }

    @Test
    @DisplayName("[FR-023-AC1] projectPath가 hostPath와 같은 원소는 읽는다")
    void pluginInstallForThisProjectIsRead() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Path installed = home.resolve(".claude/plugins/installed_plugins.json");
        Files.writeString(installed, Files.readString(installed).replace("/home/fixture/other-project", HOST));

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.plugins().getFirst().servers())
                .extracting("name")
                .containsExactlyInAnyOrder("demo-helper", "other-project-only-server");
    }

    @Test
    @DisplayName("[FR-023-AC1] 같은 installPath가 여러 원소에 있어도 한 번만 읽는다")
    void sameInstallPathIsReadOnce() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        String path = ClaudeHomeFixture.HOME_HOST + "/.claude/plugins/cache/aoji-fixture-market/flat-tools/1.0.0";
        Files.writeString(
                home.resolve(".claude/plugins/installed_plugins.json"),
                "{\"version\":2,\"plugins\":{\"flat-tools@aoji-fixture-market\":["
                        + "{\"scope\":\"user\",\"installPath\":\"" + path + "\"},"
                        + "{\"scope\":\"project\",\"projectPath\":\"" + HOST + "\",\"installPath\":\"" + path + "\"}]}}");

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.plugins()).hasSize(1);
        assertThat(snapshot.plugins().getFirst().servers()).extracting("name").containsExactlyInAnyOrder("flat-http", "flat-stdio");
    }

    @Test
    @DisplayName("[FR-023-AC1] plugins가 객체가 아니면 그 출처를 parse 오류로 둔다")
    void pluginsNotObjectIsParseError() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Files.writeString(home.resolve(".claude/plugins/installed_plugins.json"), "{\"version\":2,\"plugins\":[]}");

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.plugins()).isEmpty();
        assertThat(snapshot.problems())
                .extracting(GlobalSnapshot.Problem::source, GlobalSnapshot.Problem::kind)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("plugin", "parse"));
    }

    @Test
    @DisplayName("[FR-023-AC1] .mcp.json 감싼 모양과 평평한 모양(T-FIX-15)을 모두 서버로 읽고 command·url·type 없는 키는 서버가 아니다")
    void wrappedAndFlatShapesAreBothRead() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Path flat = home.resolve(".claude/plugins/cache/aoji-fixture-market/flat-tools/1.0.0/.mcp.json");
        Files.writeString(
                flat,
                "{\"flat-http\": {\"type\": \"http\", \"url\": \"https://example.test/a\"},"
                        + "\"flat-stdio\": {\"command\": \"node\"},"
                        + "\"note\": {\"description\": \"not a server\"}, \"version\": \"1\", \"list\": [1]}");

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        GlobalSnapshot.PluginInstall flatTools = snapshot.plugins().stream()
                .filter(p -> p.pluginName().equals("flat-tools"))
                .findFirst()
                .orElseThrow();
        assertThat(flatTools.servers()).extracting("name").containsExactlyInAnyOrder("flat-http", "flat-stdio");
        GlobalSnapshot.PluginInstall demo = snapshot.plugins().stream()
                .filter(p -> p.pluginName().equals("demo-tools"))
                .findFirst()
                .orElseThrow();
        assertThat(demo.servers()).extracting("name").containsExactly("demo-helper");
    }

    @Test
    @DisplayName("[NFR-07] 플러그인 installPath가 <홈>/.claude/plugins/ 밖이거나 ..로 벗어나면 읽지 않고 outside-link")
    void installPathOutsidePluginsIsOutsideLink() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Files.writeString(
                home.resolve(".claude/plugins/installed_plugins.json"),
                "{\"version\":2,\"plugins\":{"
                        + "\"a@m\":[{\"installPath\":\"/etc\"}],"
                        + "\"b@m\":[{\"installPath\":\"" + ClaudeHomeFixture.HOME_HOST + "/.claude/plugins/../settings-dir\"}],"
                        + "\"c@m\":[{\"installPath\":\"" + ClaudeHomeFixture.HOME_HOST + "/.claude/projects/x\"}]}}");

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.problems())
                .extracting(GlobalSnapshot.Problem::file, GlobalSnapshot.Problem::kind)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("~/.claude/plugins/a", "outside-link"),
                        org.assertj.core.groups.Tuple.tuple("~/.claude/plugins/b", "outside-link"),
                        org.assertj.core.groups.Tuple.tuple("~/.claude/plugins/c", "outside-link"));
        assertThat(snapshot.plugins()).extracting(p -> p.servers().size()).containsOnly(0);
    }

    @Test
    @DisplayName("[NFR-07] 플러그인 폴더 안의 링크(.mcp.json 링크)는 따라가지 않고 outside-link")
    void symlinkedPluginDefinitionIsOutsideLink(@TempDir Path outside) throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);
        Path secret = outside.resolve("secret.json");
        Files.writeString(secret, "{\"mcpServers\": {\"leaked\": {\"command\": \"node\"}}}");
        Path link = home.resolve(".claude/plugins/cache/aoji-fixture-market/flat-tools/1.0.0/.mcp.json");
        Files.delete(link);
        Files.createSymbolicLink(link, secret);

        GlobalSnapshot snapshot = reader(ClaudeHomeFixture.HOME_HOST).snapshot();

        assertThat(snapshot.plugins().stream().flatMap(p -> p.servers().stream()).map(s -> s.name()))
                .doesNotContain("leaked");
        assertThat(snapshot.problems()).extracting(GlobalSnapshot.Problem::kind).contains("outside-link");
    }

    // ---- FR-027-AC4: 한도 캐시 파싱 ----------------------------------------------------------------------------------

    private UsageCache parseCache(String json) throws Exception {
        try (JsonParser parser = mapper.createParser(json)) {
            parser.nextToken();
            return new UsageCacheParser().parse(parser);
        }
    }

    @Test
    @DisplayName("[FR-027-AC4] 캐시 파싱 = fetchedAtMs(ms)·utilization.{five_hour,seven_day}.{utilization,resets_at}")
    void usageCacheIsParsedFromFixture() throws Exception {
        ClaudeHomeFixture.copyBasic(home, HOST);

        UsageCache cache = reader(ClaudeHomeFixture.HOME_HOST).snapshot().usageCache();

        assertThat(cache.fetchedAtMs()).isEqualTo(1792020000000L);
        assertThat(cache.fiveHour().percent()).isEqualTo(21.0);
        assertThat(cache.fiveHour().resetsAt()).isEqualTo(Instant.parse("2099-01-01T05:00:00Z"));
        assertThat(cache.sevenDay().percent()).isEqualTo(48.0);
        assertThat(cache.sevenDay().resetsAt()).isEqualTo(Instant.parse("2099-01-04T09:00:00Z"));
    }

    @Test
    @DisplayName("[FR-027-AC4] 키 없음 → 그 창만 캐시 없음, 다른 창은 유지")
    void missingWindowKeyIsDroppedPerWindow() throws Exception {
        UsageCache noSevenDay = parseCache(
                "{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":10,\"resets_at\":\"2099-01-01T05:00:00+00:00\"}}}");
        assertThat(noSevenDay.fiveHour()).isNotNull();
        assertThat(noSevenDay.sevenDay()).isNull();

        UsageCache missingResets = parseCache(
                "{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":10},\"seven_day\":{\"utilization\":5,\"resets_at\":\"2099-01-04T09:00:00+09:00\"}}}");
        assertThat(missingResets.fiveHour()).isNull();
        assertThat(missingResets.sevenDay().resetsAt()).isEqualTo(Instant.parse("2099-01-04T00:00:00Z"));

        assertThat(parseCache("{\"utilization\":{\"five_hour\":{\"utilization\":10,\"resets_at\":\"2099-01-01T05:00:00Z\"}}}"))
                .as("fetchedAtMs 없음 → 낡음을 판정할 수 없어 캐시 없음")
                .isNull();
    }

    @Test
    @DisplayName("[FR-027-AC4] 형태 다름(문자열 %·0~100 밖·ISO 아님·초 단위 fetchedAtMs) → 그 창 캐시 없음")
    void malformedShapesAreDropped() throws Exception {
        String ok = "\"resets_at\":\"2099-01-01T05:00:00Z\"";
        assertThat(parseCache("{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":\"21%\"," + ok + "}}}")
                        .fiveHour())
                .as("문자열 %")
                .isNull();
        assertThat(parseCache("{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":101," + ok + "}}}")
                        .fiveHour())
                .as("100 초과")
                .isNull();
        assertThat(parseCache("{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":-1," + ok + "}}}")
                        .fiveHour())
                .as("음수")
                .isNull();
        assertThat(parseCache("{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":10,\"resets_at\":\"tomorrow\"}}}")
                        .fiveHour())
                .as("ISO 아님")
                .isNull();
        assertThat(parseCache("{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":10,\"resets_at\":1792020000}}}")
                        .fiveHour())
                .as("숫자 resets_at")
                .isNull();
        assertThat(parseCache("{\"fetchedAtMs\":1792020000,\"utilization\":{\"five_hour\":{\"utilization\":10," + ok + "}}}"))
                .as("초 단위 fetchedAtMs")
                .isNull();
        assertThat(parseCache("{\"fetchedAtMs\":\"1792020000000\",\"utilization\":{\"five_hour\":{\"utilization\":10," + ok + "}}}"))
                .as("문자열 fetchedAtMs")
                .isNull();
        UsageCache boundary = parseCache(
                "{\"fetchedAtMs\":1792020000000,\"utilization\":{\"five_hour\":{\"utilization\":0," + ok
                        + "},\"seven_day\":{\"utilization\":100.0," + ok + "}}}");
        assertThat(boundary.fiveHour().percent()).isZero();
        assertThat(boundary.sevenDay().percent()).isEqualTo(100.0);
    }

    @Test
    @DisplayName("[FR-027-AC4] 캐시 객체가 아니거나 utilization이 객체가 아니어도 예외 없이 창 없음")
    void nonObjectShapesDoNotThrow() throws Exception {
        assertThat(parseCache("[1,2]")).isNull();
        UsageCache wrong = parseCache("{\"fetchedAtMs\":1792020000000,\"utilization\":[1,2,3],\"accountUuid\":\"x\"}");
        assertThat(wrong.fiveHour()).isNull();
        assertThat(wrong.sevenDay()).isNull();
        assertThat(List.of(UsageCache.class.getRecordComponents()).stream().map(c -> c.getName()))
                .doesNotContain("accountUuid");
    }
}
