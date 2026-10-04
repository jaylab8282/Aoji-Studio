package studio.aoji.stream;

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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
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
 * 5개 탭 동시 접속 시 방송 지연·수신 여부 (FR-004-AC6, NFR-01, NFR-02). 실제 소켓 5개를 열어
 * hook 이벤트를 반복 재생하고, 각 연결이 {@code live} 메시지를 받기까지 걸린 시간을 측정한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SseHubLatencyTest {

    private static final Logger log = LoggerFactory.getLogger(SseHubLatencyTest.class);
    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final int CONNECTIONS = 5;
    private static final int ITERATIONS = 30;

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @LocalServerPort
    int port;

    @Autowired
    BrowserTokenFilter browserTokenFilter;

    private final List<HttpClient> openClients = new ArrayList<>();
    private final List<InputStream> openBodies = new ArrayList<>();

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve("architect.md"),
                "---\nname: architect\ndescription: 설계\n---\n본문\n",
                StandardCharsets.UTF_8);

        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
        registry.add("server.shutdown", () -> "immediate");
    }

    @AfterEach
    void closeConnections() {
        for (InputStream body : openBodies) {
            try {
                body.close();
            } catch (IOException ignored) {
                // 테스트 종료 시 정리 실패는 무시한다.
            }
        }
        openBodies.clear();
        for (HttpClient client : openClients) {
            client.shutdownNow();
        }
        openClients.clear();
    }

    private String collectToken() throws IOException {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private record SseFrame(String type, long id, String data) {}

    private BlockingQueue<SseFrame> openConnectionAndReadFrames() throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        openClients.add(client);
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + port + "/api/stream?token=" + browserTokenFilter.token()))
                .header("Origin", ALLOWED_ORIGIN)
                .GET()
                .build();
        HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        assertThat(response.statusCode()).isEqualTo(200);
        openBodies.add(response.body());

        BlockingQueue<SseFrame> frames = new LinkedBlockingQueue<>();
        Thread reader = new Thread(
                () -> {
                    try (BufferedReader in =
                            new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
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
                        // 연결 종료 — 정상 종료로 취급한다.
                    }
                },
                "sse-latency-reader");
        reader.setDaemon(true);
        reader.start();
        return frames;
    }

    private void postHookEvent(String sessionId) throws Exception {
        String body =
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Bash","agent_type":"architect","tool_input":{"command":"ls"}}"""
                        .formatted(sessionId);
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/hooks/events"))
                .header("Content-Type", "application/json")
                .header("X-AojiStudio-Collect-Token", collectToken())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<Void> response =
                HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isEqualTo(204);
    }

    @Test
    void fiveConnectionsAllReceiveLiveWithP95Under500ms() throws Exception {
        // [FR-004-AC6][NFR-02] hook POST → 5개 연결 모두 live 수신 p95 < 500ms
        // [NFR-01] 5개 연결 동시 방송 모두 수신
        List<BlockingQueue<SseFrame>> allFrames = new ArrayList<>();
        for (int i = 0; i < CONNECTIONS; i++) {
            BlockingQueue<SseFrame> frames = openConnectionAndReadFrames();
            SseFrame snapshot = frames.poll(5, TimeUnit.SECONDS);
            assertThat(snapshot).isNotNull();
            assertThat(snapshot.type()).isEqualTo("snapshot");
            allFrames.add(frames);
        }

        long[] durationsNanos = new long[ITERATIONS];

        for (int iter = 0; iter < ITERATIONS; iter++) {
            long start = System.nanoTime();
            postHookEvent("s-latency-" + iter);

            for (BlockingQueue<SseFrame> frames : allFrames) {
                SseFrame eventFrame = frames.poll(2, TimeUnit.SECONDS);
                assertThat(eventFrame).as("event frame").isNotNull();
                assertThat(eventFrame.type()).isEqualTo("event");
                SseFrame liveFrame = frames.poll(2, TimeUnit.SECONDS);
                assertThat(liveFrame).as("live frame").isNotNull();
                assertThat(liveFrame.type()).isEqualTo("live");
            }
            durationsNanos[iter] = System.nanoTime() - start;
        }

        long[] sorted = durationsNanos.clone();
        Arrays.sort(sorted);
        long p95Nanos = sorted[(int) Math.ceil(ITERATIONS * 0.95) - 1];
        double p95Millis = p95Nanos / 1_000_000.0;

        log.info("SseHub live broadcast p95 over {} iterations x {} connections: {} ms", ITERATIONS, CONNECTIONS, p95Millis);
        assertThat(p95Millis).isLessThan(500.0);
    }
}
