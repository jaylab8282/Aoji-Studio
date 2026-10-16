package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import studio.aoji.events.EventRow;
import studio.aoji.support.ClaudeHomeFixture;
import studio.aoji.support.FixtureFiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** 대화 기록 증분 읽기 (T-R4-12). 임시 {@code claude-home-basic} 사본 + {@code expected.json} 비교. */
class TranscriptIngestServiceTest {

    private static final String S1 = "a1b2c3d4-0000-4000-8000-000000000001";
    private static final String S2 = "e5f6a7b8-0000-4000-8000-000000000002";
    private static final String MARKER = "AOJI-MARKER-CONVO-7f3a";
    private static final String OPUS = "claude-opus-4-8";

    @TempDir
    Path temp;

    private Path home;
    private Path dbFile;
    private TranscriptHarness h;
    private JsonNode expected;
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private final Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);

    @BeforeEach
    void setUp() throws IOException {
        home = temp.resolve("home");
        Files.createDirectories(home);
        dbFile = temp.resolve("events.db");
        ClaudeHomeFixture.copyBasic(home, "/x");
        ObjectMapper mapper = JsonMapper.builder().build();
        expected = mapper.readTree(FixtureFiles.fixtureDir("claude-home-basic").resolve("expected.json").toFile());
        logs.start();
        rootLogger.addAppender(logs);
        h = new TranscriptHarness(home, dbFile);
    }

    @AfterEach
    void tearDown() {
        rootLogger.detachAppender(logs);
    }

    private static void assertTokens(CostReport.TokenSums actual, JsonNode expectedNode) {
        assertThat(actual.input()).isEqualTo(expectedNode.get("input").asLong());
        assertThat(actual.output()).isEqualTo(expectedNode.get("output").asLong());
        assertThat(actual.cacheCreation()).isEqualTo(expectedNode.get("cacheCreation").asLong());
        assertThat(actual.cacheRead()).isEqualTo(expectedNode.get("cacheRead").asLong());
        assertThat(actual.total()).isEqualTo(expectedNode.get("total").asLong());
    }

    private static void assertUsd(BigDecimal actual, JsonNode expectedUsd) {
        assertThat(actual).isNotNull();
        assertThat(actual).isEqualByComparingTo(new BigDecimal(expectedUsd.asString()));
    }

    // ---- FR-025-AC1 ---------------------------------------------------------------------------------------------------

    @Test
    @DisplayName("[FR-025-AC1] fixture 합계·모델별·금액 = expected.json (같은 메시지 중복 줄은 한 번, output 최대 줄의 4값)")
    void fixtureTotalsMatchExpected() {
        h.service.ingestOnce();

        CostReport report = h.reportAll();

        assertTokens(report.totals(), expected.get("totals"));
        assertUsd(report.estimate().usd(), expected.get("totals").get("usd"));
        assertThat(report.estimate().excludedModelCount()).isEqualTo(expected.get("excludedModelCount").asInt());
        assertThat(report.byModel()).hasSize(expected.get("byModel").size());
        for (JsonNode model : expected.get("byModel")) {
            CostReport.ModelRow row = report.byModel().stream()
                    .filter(r -> r.model().equals(model.get("model").asString()))
                    .findFirst()
                    .orElseThrow();
            assertTokens(row.tokens(), model);
            if (model.get("usd").isNull()) {
                assertThat(row.usd()).isNull();
            } else {
                assertUsd(row.usd(), model.get("usd"));
            }
        }
    }

    @Test
    @DisplayName("[FR-025-E2][FR-025-AC1] 건너뛴 줄 종류별 수 = expected.json skippedLines")
    void skippedLineCountsMatchExpected() {
        h.service.ingestOnce();

        TranscriptIngestService.Stats stats = h.service.stats();

        JsonNode skipped = expected.get("skippedLines");
        assertThat(stats.noKey()).isEqualTo(skipped.get("noRequestId").asLong());
        assertThat(stats.synthetic()).isEqualTo(skipped.get("synthetic").asLong());
        assertThat(stats.allZero()).isEqualTo(skipped.get("allZero").asLong());
        assertThat(stats.duplicate()).isEqualTo(skipped.get("duplicate").asLong());
    }

    /** fixture 없이 빈 projects만 있는 별도 홈. */
    private TranscriptHarness emptyHarness() throws IOException {
        Path dir = Files.createTempDirectory(temp, "empty");
        Path emptyHome = dir.resolve("home");
        Files.createDirectories(emptyHome.resolve(".claude").resolve("projects"));
        return new TranscriptHarness(emptyHome, dir.resolve("db.db"));
    }

    private CostReport.TokenSums totalsAfter(String... lines) throws IOException {
        TranscriptHarness local = emptyHarness();
        local.writeMain("sess-1", lines);
        local.service.ingestOnce();
        return local.reportAll().totals();
    }

    @Test
    @DisplayName("[FR-025-AC1] 뒤 줄이 큰 경우와 앞 줄이 큰 경우 결과가 같고 큰 줄의 4값이다")
    void biggerLineWinsRegardlessOfOrder() throws IOException {
        String small = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:00.000Z", 10, 5, 0, 0);
        String big = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:01.000Z", 20, 50, 3, 7);

        CostReport.TokenSums smallFirst = totalsAfter(small, big);
        CostReport.TokenSums bigFirst = totalsAfter(big, small);

        assertThat(smallFirst).isEqualTo(CostReport.TokenSums.of(20, 50, 3, 7));
        assertThat(bigFirst).isEqualTo(smallFirst);
    }

    @Test
    @DisplayName("[FR-025-AC1] output이 같으면 4값 합이 큰 줄을 쓴다")
    void equalOutputUsesLargerSum() throws IOException {
        String a = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:00.000Z", 10, 5, 0, 0);
        String b = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:01.000Z", 10, 5, 4, 0);

        assertThat(totalsAfter(a, b)).isEqualTo(CostReport.TokenSums.of(10, 5, 4, 0));
        assertThat(totalsAfter(b, a)).isEqualTo(CostReport.TokenSums.of(10, 5, 4, 0));
    }

    @Test
    @DisplayName("[FR-025-AC1][D-154] 작은 줄 집계 뒤 큰 줄이 증분으로 오면 이전 기여분이 빠지고 새 값이 더해진다 — 날짜가 다른 두 줄")
    void biggerLineArrivingLaterReplacesEarlierContributionAcrossDays() throws IOException {
        TranscriptHarness e = emptyHarness();
        String small = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T23:30:00.000Z", 10, 5, 1, 2);
        Path file = e.writeMain("sess-1", small);
        e.service.ingestOnce();
        assertThat(e.reportAll().totals()).isEqualTo(CostReport.TokenSums.of(10, 5, 1, 2));

        TranscriptHarness.append(
                file,
                TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-11T00:30:00.000Z", 20, 50, 3, 7) + "\n");
        e.service.ingestOnce();

        CostReport report = e.report("all", "UTC");
        assertThat(report.totals()).isEqualTo(CostReport.TokenSums.of(20, 50, 3, 7));
        CostReport.DateRow first = report.byDate().stream()
                .filter(r -> r.date().toString().equals("2026-10-10"))
                .findFirst()
                .orElseThrow();
        CostReport.DateRow second = report.byDate().stream()
                .filter(r -> r.date().toString().equals("2026-10-11"))
                .findFirst()
                .orElseThrow();
        assertThat(first.tokens().total()).isZero();
        assertThat(second.tokens()).isEqualTo(CostReport.TokenSums.of(20, 50, 3, 7));
        assertThat(report.byModel()).singleElement().satisfies(r -> assertThat(r.tokens().total()).isEqualTo(80));
        assertThat(report.bySession()).singleElement().satisfies(r -> assertThat(r.tokens().total()).isEqualTo(80));
        assertThat(report.byAgent()).singleElement().satisfies(r -> assertThat(r.tokens().total()).isEqualTo(80));
    }

    @Test
    @DisplayName("[FR-025-AC1] 같은 파일을 오프셋 0부터 다시 읽어도 집계 불변(멱등)")
    void rereadingFromOffsetZeroIsIdempotent() {
        h.service.ingestOnce();
        CostReport before = h.reportAll();
        long msgs = h.db.count("transcript_msg");

        h.db.jdbcClient.sql("UPDATE transcript_file SET offset = 0, size = 0").update();
        h.service.ingestOnce();

        CostReport after = h.reportAll();
        assertThat(after.totals()).isEqualTo(before.totals());
        assertThat(after.byDate()).isEqualTo(before.byDate());
        assertThat(after.byAgent()).isEqualTo(before.byAgent());
        assertThat(h.db.count("transcript_msg")).isEqualTo(msgs);
    }

    @Test
    @DisplayName("[FR-025-AC1] 원본 파일 삭제 뒤 같은 줄이 다른 파일로 다시 나와도 불변")
    void sameLinesInAnotherFileAfterDeletionDoNotChangeTotals() throws IOException {
        TranscriptHarness e = emptyHarness();
        String line = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:00.000Z", 20, 50, 3, 7);
        Path file = e.writeMain("sess-1", line);
        e.service.ingestOnce();
        Files.delete(file);

        e.writeMain("sess-1-copy", line);
        e.service.ingestOnce();

        assertThat(e.reportAll().totals()).isEqualTo(CostReport.TokenSums.of(20, 50, 3, 7));
    }

    // ---- FR-025-AC2 ---------------------------------------------------------------------------------------------------

    private void assertAgents(CostReport report, JsonNode expectedAgents) {
        assertThat(report.byAgent()).hasSize(expectedAgents.size());
        for (int i = 0; i < expectedAgents.size(); i++) {
            JsonNode agent = expectedAgents.get(i);
            CostReport.AgentRow row = report.byAgent().get(i);
            String name = agent.get("agent").asString();
            String label = switch (row.kind()) {
                case "main" -> "기본 세션";
                case "unknown" -> "미확인";
                default -> row.agent();
            };
            assertThat(label).isEqualTo(name);
            assertTokens(row.tokens(), agent);
            assertUsd(row.usd(), agent.get("usd"));
        }
    }

    @Test
    @DisplayName("[FR-025-AC2] 서브에이전트 메타 agentType·메타 없음 → 미확인·--agent 세션 agentSetting, SessionStart 없으면 미확인")
    void agentSplitBeforeSessionStartReplay() {
        h.service.ingestOnce();

        assertAgents(h.reportAll(), expected.get("byAgentBeforeReplay"));
    }

    @Test
    @DisplayName("[FR-025-AC2] hook SessionStart(agent_type 없음)가 뒤에 오면 해당 세션은 기본 세션")
    void agentSplitAfterSessionStartReplay() {
        h.service.ingestOnce();
        h.events.insert(new EventRow(
                0, OffsetDateTime.parse("2026-10-12T09:00:00Z"), "SessionStart", S2, null, null, null, null, "/w", "session", "t", "s"));

        int resolved = h.service.resolveUnknownNow();

        assertThat(resolved).isEqualTo(1);
        assertAgents(h.reportAll(), expected.get("byAgentAfterReplay"));
    }

    @Test
    @DisplayName("[FR-025-AC2] agentSetting 줄이 토큰 줄보다 뒤에 와도 반영되고 agentName은 무시")
    void agentSettingAfterTokensIsApplied() throws IOException {
        TranscriptHarness e = emptyHarness();
        String usage = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:00.000Z", 1, 2, 3, 4);
        String ignoredName = "{\"type\":\"agent-name\",\"agentName\":\"ignored-name\",\"sessionId\":\"sess-1\"}";
        String setting = "{\"type\":\"agent-setting\",\"agentSetting\":\"late-agent\",\"sessionId\":\"sess-1\"}";
        e.writeMain("sess-1", usage, ignoredName, setting);
        e.service.ingestOnce();

        CostReport report = e.reportAll();

        assertThat(report.byAgent()).singleElement().satisfies(row -> {
            assertThat(row.agent()).isEqualTo("late-agent");
            assertThat(row.kind()).isEqualTo("agent");
        });
    }

    @Test
    @DisplayName("[FR-025-AC2] 서브에이전트 메타가 없으면 미확인(?)")
    void subAgentWithoutMetaIsUnknown() throws IOException {
        TranscriptHarness e = emptyHarness();
        Path sub = e.projectsDir().resolve("-p").resolve("sess-1").resolve("subagents").resolve("agent-zz.jsonl");
        Files.createDirectories(sub.getParent());
        Files.writeString(
                sub,
                TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:00.000Z", 1, 2, 3, 4) + "\n");
        e.service.ingestOnce();

        assertThat(e.reportAll().byAgent()).singleElement().satisfies(row -> assertThat(row.kind()).isEqualTo("unknown"));
    }

    // ---- FR-025-AC3 / AC4 ---------------------------------------------------------------------------------------------

    @Test
    @DisplayName("[FR-025-AC3] 세션 행 = 8자 접두·폴더·시작·진입 방식, 토큰 합 내림차순")
    void sessionRowsMatchExpectedAndAreSortedByTotal() {
        h.service.ingestOnce();

        List<CostReport.SessionRow> rows = h.reportAll().bySession();

        JsonNode expectedRows = expected.get("bySession");
        assertThat(rows).hasSize(expectedRows.size());
        for (int i = 0; i < rows.size(); i++) {
            JsonNode e = expectedRows.get(i);
            assertThat(rows.get(i).sessionId()).isEqualTo(e.get("sessionId").asString());
            assertThat(rows.get(i).sessionId()).startsWith(e.get("short").asString());
            assertThat(rows.get(i).project()).isEqualTo(e.get("project").asString());
            assertThat(rows.get(i).startedAt()).isEqualTo(e.get("startedAt").asString());
            assertThat(rows.get(i).entrypoint()).isEqualTo(e.get("entrypoint").asString());
            assertThat(rows.get(i).tokens().total()).isEqualTo(e.get("total").asLong());
        }
        assertThat(rows).isSortedAccordingTo(Comparator.comparingLong((CostReport.SessionRow r) -> r.tokens().total()).reversed());
    }

    @Test
    @DisplayName("[FR-025-AC4] 날짜(UTC·Asia/Seoul)·모델·세션·에이전트 나눔의 합 = 합계, 날짜 행 = expected.json")
    void splitsSumToTotalsIncludingTimezoneBoundary() {
        h.service.ingestOnce();

        for (String tz : List.of("UTC", "Asia/Seoul")) {
            CostReport report = h.report("all", tz);
            long total = report.totals().total();
            assertThat(report.byDate().stream().mapToLong(r -> r.tokens().total()).sum()).as(tz).isEqualTo(total);
            assertThat(report.byModel().stream().mapToLong(r -> r.tokens().total()).sum()).isEqualTo(total);
            assertThat(report.bySession().stream().mapToLong(r -> r.tokens().total()).sum()).isEqualTo(total);
            assertThat(report.byAgent().stream().mapToLong(r -> r.tokens().total()).sum()).isEqualTo(total);
            JsonNode expectedDates = expected.get("byDate").get(tz);
            long nonZeroDates = report.byDate().stream().filter(r -> r.tokens().total() > 0).count();
            assertThat(nonZeroDates).as(tz).isEqualTo(expectedDates.size());
            for (JsonNode e : expectedDates) {
                CostReport.DateRow row = report.byDate().stream()
                        .filter(r -> r.date().toString().equals(e.get("date").asString()))
                        .findFirst()
                        .orElseThrow();
                assertTokens(row.tokens(), e);
                assertUsd(row.usd(), e.get("usd"));
            }
        }
    }

    // ---- FR-025-AC6 / AC7 / E1 / E2 / NFR-09 ----------------------------------------------------------------------------

    @Test
    @DisplayName("[FR-025-AC6] 첫 읽기 진행: 읽기 전 reading 0/0 → 끝나면 ready 4/4, usage-changed(cost) 요청")
    void firstReadProgress() {
        TranscriptStatus before = h.service.status();
        assertThat(before.state()).isEqualTo(TranscriptStatus.READING);
        assertThat(before.readFiles()).isZero();

        TranscriptStatus after = h.service.ingestOnce();

        assertThat(after.connected()).isTrue();
        assertThat(after.state()).isEqualTo(TranscriptStatus.READY);
        assertThat(after.totalFiles()).isEqualTo(expected.get("fileCount").asInt());
        assertThat(after.readFiles()).isEqualTo(after.totalFiles());
        verify(h.notifier, atLeastOnce()).markChanged(eq(UsageArea.COST));
    }

    @Test
    @DisplayName("[FR-025-AC6] 줄을 덧붙이면 10초 안에 반영되고 usage-changed(cost)가 다시 요청된다")
    void appendedLineIsPickedUpWithinTenSeconds() throws Exception {
        TranscriptHarness live = new TranscriptHarness(home, temp.resolve("live.db"), true, 100);
        live.service.start();
        try {
            long deadline = System.nanoTime() + 10_000_000_000L;
            while (live.service.status().readFiles() < 4 || !"ready".equals(live.service.status().state())) {
                assertThat(System.nanoTime()).as("첫 읽기").isLessThan(deadline);
                Thread.sleep(50);
            }
            long before = live.reportAll().totals().total();
            Path file = h.projectsDir().resolve("-home-fixture-work-aoji-fixture-app").resolve(S2 + ".jsonl");
            long started = System.nanoTime();
            TranscriptHarness.append(
                    file,
                    TranscriptHarness.assistant(S2, "msg_new", "req_new", OPUS, "2026-10-14T09:00:00.000Z", 100, 100, 0, 0) + "\n");

            while (live.reportAll().totals().total() == before) {
                assertThat(System.nanoTime() - started).as("반영 시간").isLessThan(10_000_000_000L);
                Thread.sleep(50);
            }

            assertThat(live.reportAll().totals().total()).isEqualTo(before + 200);
            verify(live.notifier, timeout(10_000).atLeastOnce()).markChanged(eq(UsageArea.COST));
        } finally {
            live.service.shutdown();
        }
    }

    @Test
    @DisplayName("[FR-025-AC6] 개행으로 끝나지 않은 마지막 줄은 완성될 때까지 읽지 않는다")
    void unterminatedLastLineWaitsForNewline() throws IOException {
        TranscriptHarness e = emptyHarness();
        String line = TranscriptHarness.assistant("sess-1", "m1", "r1", OPUS, "2026-10-10T01:00:00.000Z", 1, 2, 3, 4);
        Path file = e.writeMain("sess-1");
        TranscriptHarness.append(file, line);
        e.service.ingestOnce();
        assertThat(e.reportAll().totals().total()).isZero();

        TranscriptHarness.append(file, "\n");
        e.service.ingestOnce();

        assertThat(e.reportAll().totals().total()).isEqualTo(10);
    }

    private void deleteTree(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }

    @Test
    @DisplayName("[FR-025-AC7] 원본 파일을 지워도 all 기간 값 그대로")
    void totalsSurviveSourceDeletion() throws IOException {
        h.service.ingestOnce();
        CostReport before = h.reportAll();

        deleteTree(h.projectsDir());
        h.service.ingestOnce();

        CostReport after = h.reportAll();
        assertThat(after.totals()).isEqualTo(before.totals());
        assertThat(after.byModel()).isEqualTo(before.byModel());
        assertThat(after.bySession()).isEqualTo(before.bySession());
    }

    @Test
    @DisplayName("[FR-025-E1] projects 연결 안 됨 → 읽지 않고 connected:false, 쌓인 집계는 응답")
    void notConnectedStopsReadingAndKeepsAccumulatedTotals() throws IOException {
        h.service.ingestOnce();
        long filesRead = h.db.count("transcript_file");
        CostReport before = h.reportAll();
        deleteTree(h.projectsDir());
        Files.createDirectories(h.projectsDir());
        Files.writeString(h.projectsDir().resolve(".aojistudio-stand-in"), "x");
        h.writeMain("later", TranscriptHarness.assistant("later", "m9", "r9", OPUS, "2026-10-13T01:00:00.000Z", 1000, 1000, 0, 0));

        TranscriptStatus status = h.service.ingestOnce();

        assertThat(status.connected()).isFalse();
        assertThat(status.state()).isEqualTo(TranscriptStatus.NOT_CONNECTED);
        assertThat(h.db.count("transcript_file")).isEqualTo(filesRead);
        CostReport after = h.reportAll();
        assertThat(after.totals()).isEqualTo(before.totals());
        assertThat(after.transcripts().connected()).isFalse();
    }

    @Test
    @DisplayName("[FR-025-E1] 홈 경로 미설정이면 연결 안 됨")
    void homeNotConfiguredIsNotConnected() throws IOException {
        Path empty = temp.resolve("empty-home");
        Files.createDirectories(empty);
        TranscriptHarness none = new TranscriptHarness(empty, temp.resolve("none.db"));

        TranscriptStatus status = none.service.ingestOnce();

        assertThat(status.connected()).isFalse();
        assertThat(none.reportAll().totals().total()).isZero();
    }

    @Test
    @DisplayName("[FR-025-E2] 깨진 줄은 건너뛰고 skippedFiles, 로그는 상대 경로·사유만(본문 표지 0회)")
    void brokenLineSkippedWithSafeLog() {
        TranscriptStatus status = h.service.ingestOnce();

        assertThat(status.skippedFiles()).isEqualTo(expected.get("skippedFiles").asInt());
        List<String> messages = logs.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
        assertThat(messages).anyMatch(m -> m.contains("-home-fixture-work-aoji-fixture-app/" + S2 + ".jsonl") && m.contains("reason=parse-error"));
        assertThat(messages).noneMatch(m -> m.contains(MARKER) || m.contains("msg_broken") || m.contains(home.toString()));
        assertThat(h.reportAll().totals().total()).isEqualTo(expected.get("totals").get("total").asLong());
    }

    @Test
    @DisplayName("[NFR-09] 재시작 뒤 다시 세지 않고, 새로 덧붙은 줄만 더한다")
    void restartDoesNotRecount() throws IOException {
        h.service.ingestOnce();
        CostReport before = h.reportAll();
        long msgs = h.db.count("transcript_msg");

        TranscriptHarness restarted = new TranscriptHarness(home, dbFile);
        restarted.service.ingestOnce();

        assertThat(restarted.reportAll().totals()).isEqualTo(before.totals());
        assertThat(restarted.db.count("transcript_msg")).isEqualTo(msgs);
        assertThat(restarted.service.stats().duplicate()).isZero();

        Path file = h.projectsDir().resolve("-home-fixture-work-aoji-fixture-app").resolve(S2 + ".jsonl");
        TranscriptHarness.append(
                file, TranscriptHarness.assistant(S2, "msg_new", "req_new", OPUS, "2026-10-14T09:00:00.000Z", 1, 2, 3, 4) + "\n");
        TranscriptHarness again = new TranscriptHarness(home, dbFile);
        again.service.ingestOnce();

        assertThat(again.reportAll().totals().total()).isEqualTo(before.totals().total() + 10);
    }

    @Test
    @DisplayName("[NFR-14] 대화 본문 표지는 DB의 어떤 열에도 저장되지 않는다")
    void conversationMarkerIsNeverStored() {
        h.service.ingestOnce();

        for (String table : List.of("transcript_file", "transcript_msg", "usage_token_agg", "usage_session")) {
            List<String> rows = h.db.jdbcClient.sql("SELECT * FROM " + table).query((rs, n) -> {
                StringBuilder all = new StringBuilder();
                for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
                    all.append(rs.getString(i)).append('|');
                }
                return all.toString();
            }).list();
            assertThat(rows).as(table).noneMatch(r -> r.contains(MARKER));
        }
    }

    @Test
    @DisplayName("[FR-025-E2] 심볼릭 링크 파일은 읽지 않는다")
    void symlinkedTranscriptIsNotRead() throws IOException {
        Path outside = temp.resolve("outside.jsonl");
        Files.writeString(outside, TranscriptHarness.assistant("sx", "mx", "rx", OPUS, "2026-10-10T01:00:00.000Z", 5, 5, 5, 5) + "\n");
        Path link = h.projectsDir().resolve("-p").resolve("link.jsonl");
        Files.createDirectories(link.getParent());
        Files.createSymbolicLink(link, outside);

        h.service.ingestOnce();

        assertThat(h.reportAll().totals().total()).isEqualTo(expected.get("totals").get("total").asLong());
    }
}
