package studio.aoji.usage;

import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneOffset;
import studio.aoji.config.AppProperties;
import studio.aoji.events.EventRepository;
import studio.aoji.globalcfg.GlobalClaudeMounts;
import studio.aoji.pricing.CostCalculator;
import studio.aoji.pricing.PriceTable;
import studio.aoji.support.MutableClock;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** Spring 컨텍스트 없이 대화 기록 읽기·비용 리포트를 묶는 테스트 도구. DB 파일이 같으면 "재시작"을 흉내 낸다. */
final class TranscriptHarness {

    static final String HOME_HOST = "/home/fixture";

    final ObjectMapper objectMapper = JsonMapper.builder().build();
    final UsageTestDb db;
    final EventRepository events;
    final TranscriptRepository repository;
    final UsageChangedNotifier notifier = mock(UsageChangedNotifier.class);
    final MutableClock clock = new MutableClock(Instant.parse("2026-10-16T00:00:00Z"), ZoneOffset.UTC);
    final Path home;
    final TranscriptIngestService service;
    final CostReportService cost;

    TranscriptHarness(Path home, Path dbFile) {
        this(home, dbFile, false, 5000);
    }

    TranscriptHarness(Path home, Path dbFile, boolean autoStart, long pollMillis) {
        this.home = home;
        db = new UsageTestDb(dbFile);
        events = new EventRepository(db.jdbcClient);
        repository = new TranscriptRepository(db.jdbcClient);
        AppProperties properties = new AppProperties();
        properties.setClaudeHomeHost(HOME_HOST);
        properties.setClaudeHomeMount(home.toString());
        GlobalClaudeMounts mounts = new GlobalClaudeMounts(properties, objectMapper);
        TranscriptAgentResolver resolver =
                new TranscriptAgentResolver(repository, events, db.transactionManager, objectMapper);
        service = new TranscriptIngestService(
                mounts,
                new TranscriptLineParser(objectMapper),
                repository,
                resolver,
                events,
                db.transactionManager,
                notifier,
                clock,
                pollMillis,
                autoStart);
        cost = new CostReportService(repository, service, new PriceTable(objectMapper), new CostCalculator(), clock);
    }

    CostReport report(String period, String tz) {
        return cost.report(PeriodQuery.parse(period, tz, clock));
    }

    CostReport reportAll() {
        return report("all", "UTC");
    }

    Path projectsDir() {
        return home.resolve(".claude").resolve("projects");
    }

    /** 토큰 줄 하나(JSON). */
    static String assistant(
            String session, String msgId, String reqId, String model, String ts, long in, long out, long cc, long cr) {
        String request = reqId == null ? "" : ",\"requestId\":\"" + reqId + "\"";
        return "{\"type\":\"assistant\",\"sessionId\":\"" + session + "\",\"timestamp\":\"" + ts
                + "\",\"cwd\":\"/w/app\",\"entrypoint\":\"cli\",\"isSidechain\":false" + request
                + ",\"message\":{\"id\":\"" + msgId + "\",\"model\":\"" + model
                + "\",\"content\":[{\"type\":\"text\",\"text\":\"본문\"}],\"usage\":{\"input_tokens\":" + in
                + ",\"output_tokens\":" + out + ",\"cache_creation_input_tokens\":" + cc
                + ",\"cache_read_input_tokens\":" + cr + "}}}";
    }

    /** 메인 기록 파일에 줄들을 쓴다(덮어씀). 각 줄 끝에 개행. */
    Path writeMain(String session, String... lines) throws IOException {
        Path file = projectsDir().resolve("-p").resolve(session + ".jsonl");
        Files.createDirectories(file.getParent());
        Files.writeString(file, String.join("\n", lines) + "\n", StandardCharsets.UTF_8);
        return file;
    }

    static void append(Path file, String text) throws IOException {
        Files.writeString(file, text, StandardCharsets.UTF_8, StandardOpenOption.APPEND);
    }
}
