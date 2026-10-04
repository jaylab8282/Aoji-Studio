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
 * {@link FolderPollerLatencyTest}는 반복 600회를 감당하기 위해 폴링 간격을 50ms로 낮춰 측정한다
 * (ADR-04 측정 의무 각주). 이 클래스는 그 보완으로, 운영 기본값인 실제 1000ms 폴링 간격에서 최소
 * 한 종류(정의 파일 추가)를 100회 측정해 p95 &lt; 1.5s를 확인한다. 간격이 1초이므로 반복당 최대 1초
 * 대기가 생겨 전체 실행이 수십 초 걸릴 수 있다 — 반복 횟수를 줄이지 않고 그대로 감수한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FolderPollerRealPollIntervalLatencyTest {

    private static final Logger log = LoggerFactory.getLogger(FolderPollerRealPollIntervalLatencyTest.class);
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

        registry.add("jaystudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
        registry.add("server.shutdown", () -> "immediate");
        // jaystudio.poll-interval-ms를 일부러 주지 않는다 — @Scheduled 기본값(1000, ADR-04 결정)을 그대로 쓴다.
    }

    @Test
    void agentFileAddedWithRealOneSecondPollingP95UnderOnePointFiveSeconds() throws Exception {
        // [FR-001-AC3][NFR-02] 실제 1초 폴링 간격 · 정의 파일 추가 100회 → SSE registry 수신 p95 < 1.5s
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
                Files.writeString(
                        mountRoot.resolve(".claude").resolve("agents").resolve("real-interval-add-" + i + ".md"),
                        "---\nname: real-interval-add-" + i + "\ndescription: v" + i + "\n---\n본문\n",
                        StandardCharsets.UTF_8);
                SseFrame registryFrame = pollUntilType(frames, "registry", 3_000);
                durationsNanos[i] = System.nanoTime() - start;
                assertThat(registryFrame).as("실제 1초 폴링 반복 %d회 registry 수신", i).isNotNull();
            }

            response.body().close();

            long[] sorted = durationsNanos.clone();
            Arrays.sort(sorted);
            long p95Nanos = sorted[(int) Math.ceil(ITERATIONS * 0.95) - 1];
            double p95Millis = p95Nanos / 1_000_000.0;
            double maxMillis = sorted[ITERATIONS - 1] / 1_000_000.0;

            log.info(
                    "FolderPoller latency [정의 파일 추가 · 실제 1000ms 폴링] p95={} ms, max={} ms over {} changes",
                    p95Millis,
                    maxMillis,
                    ITERATIONS);
            assertThat(p95Millis).isLessThan(1500.0);
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
                "folder-poller-real-interval-latency-test-reader");
        reader.setDaemon(true);
        reader.start();
        return frames;
    }
}
