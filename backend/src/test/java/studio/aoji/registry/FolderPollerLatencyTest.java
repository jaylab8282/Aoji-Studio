package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import studio.aoji.config.BrowserTokenFilter;

/**
 * 파일 변경 → SSE {@code registry} 수신 지연 측정 (architecture.md ADR-04 측정 의무, FR-001-AC3,
 * NFR-02). 정의 파일·구성 파일 각각 추가·수정·삭제를 100회씩(6종류 × 100 = 600회) 측정해 종류별
 * p95 &lt; 1.5s를 검증하고 수치를 로그로 남긴다(REPORT에 tech-lead가 종류별 p95를 옮겨 적는다).
 *
 * <p>{@code aojistudio.poll-interval-ms}를 50ms로 낮춰 주입한다 — 600회를 실제 1초 간격으로 측정하면
 * 반복당 최대 1초까지 대기해 전체 실행이 수백 초가 될 수 있다(ADR-04 "실행 시간이 과도하면 반복
 * 횟수를 줄이지 않고 폴링 간격을 테스트 프로퍼티로 낮춘다"). 폴링 로직 자체(스냅샷 비교·재스캔·방송)는
 * 간격과 무관하게 동일하므로 반복 횟수·검증 신뢰는 그대로 유지된다. 실제 운영값인 1000ms 간격으로도
 * 최소 한 종류(정의 파일 추가)를 {@link FolderPollerRealPollIntervalLatencyTest}가 별도로 측정한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FolderPollerLatencyTest {

    private static final Logger log = LoggerFactory.getLogger(FolderPollerLatencyTest.class);
    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final int ITERATIONS = 100;

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @LocalServerPort
    int port;

    @Autowired
    BrowserTokenFilter browserTokenFilter;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.createDirectories(mountRoot.resolve(".aojistudio").resolve("teams"));

        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
        registry.add("server.shutdown", () -> "immediate");
        registry.add("aojistudio.poll-interval-ms", () -> "50");
    }

    @BeforeEach
    void createDirsIfMissing() throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.createDirectories(mountRoot.resolve(".aojistudio").resolve("teams"));
    }

    @Test
    void agentFileAddedP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 정의 파일 추가 100회 → SSE registry 수신 p95 < 1.5s
        measure("정의 파일 추가", i -> writeAgentFile("latency-add-" + i, "latency-add-" + i, "v" + i));
    }

    @Test
    void agentFileModifiedP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 정의 파일 수정 100회 → SSE registry 수신 p95 < 1.5s
        writeAgentFile("latency-modify-fixed", "latency-modify-fixed", "initial");
        // 폴러가 초기 생성을 먼저 스캔해 기준선에 반영하게 한 뒤 수정을 측정한다(측정 첫 반복이 생성
        // 감지와 뒤섞이지 않도록).
        Thread.sleep(200);
        measure("정의 파일 수정", i -> writeAgentFile("latency-modify-fixed", "latency-modify-fixed", paddedValue(i)));
    }

    @Test
    void agentFileDeletedP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 정의 파일 삭제 100회 → SSE registry 수신 p95 < 1.5s
        for (int i = 0; i < ITERATIONS; i++) {
            writeAgentFile("latency-delete-" + i, "latency-delete-" + i, "v" + i);
        }
        // 폴러가 방금 만든 100개 파일을 먼저 스캔해 기준선에 반영하게 한 뒤 삭제를 측정한다.
        Thread.sleep(500);
        measure("정의 파일 삭제", i -> Files.delete(
                mountRoot.resolve(".claude").resolve("agents").resolve("latency-delete-" + i + ".md")));
    }

    @Test
    void workflowFileAddedP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 구성 파일 추가 100회 → SSE registry 수신 p95 < 1.5s
        measure("구성 파일 추가", i -> writeWorkflowFile("latency-wf-add-" + i, "v" + i));
    }

    @Test
    void workflowFileModifiedP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 구성 파일 수정 100회 → SSE registry 수신 p95 < 1.5s
        writeWorkflowFile("latency-wf-modify-fixed", "initial");
        Thread.sleep(200);
        measure("구성 파일 수정", i -> writeWorkflowFile("latency-wf-modify-fixed", paddedValue(i)));
    }

    @Test
    void workflowFileDeletedP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 구성 파일 삭제 100회 → SSE registry 수신 p95 < 1.5s
        for (int i = 0; i < ITERATIONS; i++) {
            writeWorkflowFile("latency-wf-delete-" + i, "v" + i);
        }
        Thread.sleep(500);
        measure("구성 파일 삭제", i -> Files.delete(
                mountRoot.resolve(".aojistudio").resolve("teams").resolve("latency-wf-delete-" + i + ".json")));
    }

    /** 홀수/짝수 자리 패딩을 순환시켜 연속된 반복에서 항상 파일 크기가 달라지게 한다(mtime 해상도 회피). */
    private static String paddedValue(int i) {
        return "n" + i + "-" + "z".repeat((i % 7) + 1);
    }

    private void writeAgentFile(String fileStem, String agentName, String description) throws IOException {
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve(fileStem + ".md"),
                "---\nname: " + agentName + "\ndescription: " + description + "\n---\n본문\n",
                StandardCharsets.UTF_8);
    }

    private void writeWorkflowFile(String fileStem, String description) throws IOException {
        String json =
                """
                {
                  "schemaVersion": 1,
                  "name": "%s",
                  "description": "%s",
                  "lead": null,
                  "members": [],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """
                        .formatted(fileStem, description);
        Files.writeString(
                mountRoot.resolve(".aojistudio").resolve("teams").resolve(fileStem + ".json"),
                json,
                StandardCharsets.UTF_8);
    }

    @FunctionalInterface
    private interface ThrowingIntConsumer {
        void accept(int i) throws IOException;
    }

    private void measure(String label, ThrowingIntConsumer change) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        try {
            HttpResponse<InputStream> response = connectStream(client);
            assertThat(response.statusCode()).isEqualTo(200);
            BlockingQueue<SseFrame> frames = readFramesAsync(response.body());

            SseFrame snapshot = pollUntilType(frames, "snapshot", 5_000);
            assertThat(snapshot).as("접속 직후 snapshot 메시지").isNotNull();

            long[] durationsNanos = new long[ITERATIONS];
            for (int i = 0; i < ITERATIONS; i++) {
                long start = System.nanoTime();
                change.accept(i);
                SseFrame registryFrame = pollUntilType(frames, "registry", 5_000);
                durationsNanos[i] = System.nanoTime() - start;
                assertThat(registryFrame).as("%s 반복 %d회 registry 수신", label, i).isNotNull();
            }

            response.body().close();

            long[] sorted = durationsNanos.clone();
            Arrays.sort(sorted);
            long p95Nanos = sorted[(int) Math.ceil(ITERATIONS * 0.95) - 1];
            double p95Millis = p95Nanos / 1_000_000.0;
            double maxMillis = sorted[ITERATIONS - 1] / 1_000_000.0;

            log.info(
                    "FolderPoller latency [{}] p95={} ms, max={} ms over {} changes (poll-interval=50ms)",
                    label,
                    p95Millis,
                    maxMillis,
                    ITERATIONS);
            assertThat(p95Millis).as("%s p95", label).isLessThan(1500.0);
        } finally {
            client.shutdownNow();
        }
    }

    private HttpResponse<InputStream> connectStream(HttpClient client) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + port + "/api/stream?token=" + browserTokenFilter.token()))
                .header("Origin", ALLOWED_ORIGIN)
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
    }

    private static SseFrame pollUntilType(BlockingQueue<SseFrame> frames, String type, long timeoutMillis)
            throws InterruptedException {
        long deadline = System.nanoTime() + timeoutMillis * 1_000_000L;
        while (System.nanoTime() < deadline) {
            long remainingMillis = (deadline - System.nanoTime()) / 1_000_000L;
            if (remainingMillis <= 0) {
                break;
            }
            SseFrame frame = frames.poll(remainingMillis, TimeUnit.MILLISECONDS);
            if (frame == null) {
                break;
            }
            if (type.equals(frame.type())) {
                return frame;
            }
        }
        throw new AssertionError("timed out waiting for frame type=" + type);
    }

    private record SseFrame(String type, long id, String data) {}

    private static BlockingQueue<SseFrame> readFramesAsync(InputStream body) {
        BlockingQueue<SseFrame> frames = new LinkedBlockingQueue<>();
        Thread reader = new Thread(
                () -> {
                    try (BufferedReader in = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                        String type = null;
                        Long id = null;
                        String data = null;
                        String line;
                        while ((line = in.readLine()) != null) {
                            if (line.isEmpty()) {
                                if (type != null) {
                                    frames.add(new SseFrame(type, id == null ? -1 : id, data));
                                }
                                type = null;
                                id = null;
                                data = null;
                            } else if (line.startsWith("event:")) {
                                type = line.substring("event:".length()).trim();
                            } else if (line.startsWith("id:")) {
                                id = Long.parseLong(line.substring("id:".length()).trim());
                            } else if (line.startsWith("data:")) {
                                data = line.substring("data:".length()).trim();
                            }
                        }
                    } catch (IOException ignored) {
                        // 연결 종료(테스트가 스트림을 닫음) — 정상 종료로 취급한다.
                    }
                },
                "folder-poller-latency-test-reader");
        reader.setDaemon(true);
        reader.start();
        return frames;
    }
}
