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
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import studio.aoji.config.BrowserTokenFilter;
import studio.aoji.live.LiveStateService;
import studio.aoji.registry.RegistryService;

/**
 * SSE 연결 수명·인증 (realtime-spec.md 전체). 실제로 기동한 서버에 {@link HttpClient}로 연결해
 * 접속 직후 {@code snapshot}, {@code event} → {@code live} 순서, heartbeat 간격, {@code seq} 단조
 * 증가, 인증 실패 응답을 검증한다. {@code MockMvc}는 무제한 타임아웃 SSE 스트림을 실시간으로 읽기
 * 어려워 {@link SpringBootTest.WebEnvironment#RANDOM_PORT}로 실제 소켓을 연다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SseStreamTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final String DISALLOWED_ORIGIN = "http://127.0.0.1:9999";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @LocalServerPort
    int port;

    @Autowired
    BrowserTokenFilter browserTokenFilter;

    @Autowired
    SseHub sseHub;

    @Autowired
    RegistryService registryService;

    @Autowired
    LiveStateService liveStateService;

    private HttpResponse<InputStream> openConnection;
    private HttpClient openClient;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve("architect.md"),
                "---\nname: architect\ndescription: 설계\n---\n본문\n",
                StandardCharsets.UTF_8);

        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
        // 무제한 timeout SSE 연결이 남아 있으면 graceful shutdown이 매번 30초를 기다린다(운영 동작과
        // 무관, 테스트 종료 속도만을 위한 설정). SseHub의 @PreDestroy가 실제 종료 시 emitter를
        // complete()하지만(architecture.md §9), 웹 서버의 graceful shutdown 단계가 그보다 먼저 실행돼
        // 여기서는 적용되지 않는다.
        registry.add("server.shutdown", () -> "immediate");
    }

    @AfterEach
    void closeConnection() throws IOException {
        if (openConnection != null) {
            openConnection.body().close();
            openConnection = null;
        }
        if (openClient != null) {
            // 소켓을 즉시 끊어야 서버가 emitter를 바로 제거하고(architecture.md §9),
            // 컨텍스트 종료 시 Tomcat graceful shutdown이 열린 연결을 기다리지 않는다.
            openClient.shutdownNow();
            openClient = null;
        }
    }

    private String collectToken() throws IOException {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private void postHookEvent(String sessionId) throws Exception {
        String body =
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Bash","agent_type":"architect","tool_input":{"command":"ls"}}"""
                        .formatted(sessionId);
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/hooks/events"))
                .header("Content-Type", "application/json")
                .header("X-JayStudio-Collect-Token", collectToken())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<Void> response =
                HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isEqualTo(204);
    }

    private HttpResponse<InputStream> connectStream(String origin, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + port + "/api/stream?token=" + (token == null ? "" : token)))
                .GET();
        if (origin != null) {
            builder.header("Origin", origin);
        }
        openClient = HttpClient.newHttpClient();
        return openClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    private HttpResponse<String> connectStreamExpectingRejection(String origin, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + port + "/api/stream?token=" + (token == null ? "" : token)))
                .GET();
        if (origin != null) {
            builder.header("Origin", origin);
        }
        return HttpClient.newHttpClient().send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void connectingWithoutTokenIsRejected() throws Exception {
        // [realtime-spec] 토큰 없음 → 403
        HttpResponse<String> response = connectStreamExpectingRejection(ALLOWED_ORIGIN, null);
        assertThat(response.statusCode()).isEqualTo(403);
    }

    @Test
    void connectingFromDisallowedOriginIsRejected() throws Exception {
        // [realtime-spec] 다른 Origin → 403
        HttpResponse<String> response =
                connectStreamExpectingRejection(DISALLOWED_ORIGIN, browserTokenFilter.token());
        assertThat(response.statusCode()).isEqualTo(403);
    }

    @Test
    void firstMessageIsSnapshotThenEventThenLiveOrderWithIncreasingSeq() throws Exception {
        // [realtime-spec] 접속 직후 snapshot 1건, event→live 순서, seq 단조 증가
        openConnection = connectStream(ALLOWED_ORIGIN, browserTokenFilter.token());
        assertThat(openConnection.statusCode()).isEqualTo(200);

        BlockingQueue<SseFrame> frames = readFramesAsync(openConnection.body());

        SseFrame first = frames.poll(5, TimeUnit.SECONDS);
        assertThat(first).isNotNull();
        assertThat(first.type()).isEqualTo("snapshot");
        long snapshotSeq = first.id();

        postHookEvent("s-order-1");

        SseFrame eventFrame = frames.poll(5, TimeUnit.SECONDS);
        SseFrame liveFrame = frames.poll(5, TimeUnit.SECONDS);
        assertThat(eventFrame).isNotNull();
        assertThat(liveFrame).isNotNull();
        assertThat(eventFrame.type()).isEqualTo("event");
        assertThat(liveFrame.type()).isEqualTo("live");
        assertThat(eventFrame.id()).isGreaterThan(snapshotSeq);
        assertThat(liveFrame.id()).isGreaterThan(eventFrame.id());
        assertThat(eventFrame.data()).contains("\"sessionId\":\"s-order-1\"");
    }

    @Test
    void registryBroadcastSendsRegistryThenLive() throws Exception {
        // [realtime-spec] registry 변경 시 registry → live 순서(T-004 FolderPoller가 호출할 공개 메서드)
        openConnection = connectStream(ALLOWED_ORIGIN, browserTokenFilter.token());
        assertThat(openConnection.statusCode()).isEqualTo(200);
        BlockingQueue<SseFrame> frames = readFramesAsync(openConnection.body());

        SseFrame first = frames.poll(5, TimeUnit.SECONDS);
        assertThat(first).isNotNull();
        assertThat(first.type()).isEqualTo("snapshot");

        sseHub.broadcast(registryService.current(), liveStateService.live());

        SseFrame registryFrame = frames.poll(5, TimeUnit.SECONDS);
        SseFrame liveFrame = frames.poll(5, TimeUnit.SECONDS);
        assertThat(registryFrame).isNotNull();
        assertThat(liveFrame).isNotNull();
        assertThat(registryFrame.type()).isEqualTo("registry");
        assertThat(liveFrame.type()).isEqualTo("live");
        assertThat(liveFrame.id()).isGreaterThan(registryFrame.id());
    }

    @Test
    void heartbeatArrivesEveryFifteenSecondsWithinOneSecondTolerance() throws Exception {
        // [realtime-spec] heartbeat 15s±1
        openConnection = connectStream(ALLOWED_ORIGIN, browserTokenFilter.token());
        assertThat(openConnection.statusCode()).isEqualTo(200);
        BlockingQueue<SseFrame> frames = readFramesAsync(openConnection.body());

        SseFrame first = frames.poll(5, TimeUnit.SECONDS);
        assertThat(first).isNotNull();
        assertThat(first.type()).isEqualTo("snapshot");

        long t0 = System.nanoTime();
        SseFrame firstHeartbeat = pollUntilType(frames, "heartbeat", 17_000);
        long t1 = System.nanoTime();
        SseFrame secondHeartbeat = pollUntilType(frames, "heartbeat", 17_000);
        long t2 = System.nanoTime();

        assertThat(firstHeartbeat.data()).contains("serverTime");
        assertThat(secondHeartbeat.data()).contains("serverTime");

        double intervalSeconds = (t2 - t1) / 1_000_000_000.0;
        assertThat(intervalSeconds).isBetween(14.0, 16.0);
        // 참고용: 첫 heartbeat까지 걸린 시간(스케줄 위상에 따라 0~15초 사이일 수 있음)도 남긴다.
        double firstDelaySeconds = (t1 - t0) / 1_000_000_000.0;
        org.slf4j.LoggerFactory.getLogger(SseStreamTest.class)
                .info(
                        "heartbeat: first delay {}s, interval between 1st and 2nd {}s",
                        firstDelaySeconds,
                        intervalSeconds);
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
                "sse-test-reader");
        reader.setDaemon(true);
        reader.start();
        return frames;
    }
}
