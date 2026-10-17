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
import java.util.List;
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
import studio.aoji.registry.RegistryService;

/**
 * SSE 연결 수명·인증 (realtime-spec.md 전체). 실제로 기동한 서버에 {@link HttpClient}로 연결해
 * 접속 직후 {@code snapshot}, {@code event} → {@code live} 순서, heartbeat 간격, {@code seq} 단조
 * 증가, 인증 실패 응답을 검증한다. {@code MockMvc}는 무제한 타임아웃 SSE 스트림을 실시간으로 읽기
 * 어려워 {@link SpringBootTest.WebEnvironment#RANDOM_PORT}로 실제 소켓을 연다.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "aojistudio.transcript-auto-start=false") // 대화 기록 읽기의 cost 방송이 skills 묶음 측정에 끼지 않게 한다
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

    private HttpResponse<InputStream> openConnection;
    private HttpClient openClient;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve("architect.md"),
                "---\nname: architect\ndescription: 설계\n---\n본문\n",
                StandardCharsets.UTF_8);

        Path skillDir = mountRoot.resolve(".claude").resolve("skills").resolve("release-notes");
        Files.createDirectories(skillDir);
        Files.writeString(
                skillDir.resolve("SKILL.md"),
                "---\nname: release-notes\ndescription: 릴리즈 노트\n---\n본문\n",
                StandardCharsets.UTF_8);

        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
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
                .header("X-AojiStudio-Collect-Token", collectToken())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<Void> response =
                HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isEqualTo(204);
    }

    private void postRaw(String body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/hooks/events"))
                .header("Content-Type", "application/json")
                .header("X-AojiStudio-Collect-Token", collectToken())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<Void> response =
                HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
        assertThat(response.statusCode()).isEqualTo(204);
    }

    private static final String SKILL_HOOK =
            "{\"session_id\":\"s-usage\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Skill\","
                    + "\"agent_type\":\"architect\",\"tool_input\":{\"skill\":\"release-notes\"}}";

    private BlockingQueue<SseFrame> openStream() throws Exception {
        openConnection = connectStream(ALLOWED_ORIGIN, browserTokenFilter.token());
        assertThat(openConnection.statusCode()).isEqualTo(200);
        BlockingQueue<SseFrame> frames = readFramesAsync(openConnection.body());
        assertThat(frames.poll(5, TimeUnit.SECONDS)).isNotNull();
        return frames;
    }

    @Test
    void skillHookEmitsUsageChangedSkillsWithin2SecondsAndNeverLeaksPrompt() throws Exception {
        // [FR-019-AC5][FR-019-AC8] Skill hook·슬래시 프롬프트 뒤 2초 안 usage-changed skills, 프롬프트 표지는 SSE에 0회
        BlockingQueue<SseFrame> frames = openStream();
        List<SseFrame> seen = new ArrayList<>();

        long start = System.nanoTime();
        postRaw(SKILL_HOOK);
        SseFrame usage = pollUntilType(frames, "usage-changed", 2_000, seen);
        long elapsedMillis = (System.nanoTime() - start) / 1_000_000L;

        assertThat(usage.data()).isEqualTo("{\"areas\":[\"skills\"],\"transcripts\":null}");
        assertThat(elapsedMillis).isLessThan(2_000);

        postRaw("{\"session_id\":\"s-usage\",\"hook_event_name\":\"UserPromptSubmit\","
                + "\"prompt\":\"/release-notes AOJI-MARKER-PROMPT-c4d8 본문\"}");
        SseFrame slashUsage = pollUntilType(frames, "usage-changed", 2_500, seen);
        assertThat(slashUsage.data()).contains("\"skills\"");
        SseFrame promptEvent = null;
        for (int i = 0; i < 20 && promptEvent == null; i++) {
            promptEvent = seen.stream()
                    .filter(f -> f.type().equals("event") && f.data().contains("UserPromptSubmit"))
                    .findFirst()
                    .orElse(null);
            if (promptEvent == null) {
                SseFrame more = frames.poll(500, TimeUnit.MILLISECONDS);
                if (more != null) {
                    seen.add(more);
                }
            }
        }
        assertThat(promptEvent).isNotNull();
        assertThat(promptEvent.data()).contains("\"summary\":\"/release-notes\"");
        assertThat(seen).allSatisfy(f -> assertThat(f.data()).doesNotContain("AOJI-MARKER-PROMPT-c4d8"));
    }

    @Test
    void mcpHookEmitsUsageChangedMcpWithin2Seconds() throws Exception {
        // [FR-024-AC3] MCP 호출 hook 뒤 2초 안 usage-changed mcp
        BlockingQueue<SseFrame> frames = openStream();

        postRaw("{\"session_id\":\"s-usage\",\"hook_event_name\":\"PreToolUse\","
                + "\"tool_name\":\"mcp__github__create_issue\",\"agent_type\":\"architect\",\"tool_input\":{}}");
        SseFrame usage = pollUntilType(frames, "usage-changed", 2_000, new ArrayList<>());

        assertThat(usage.data()).isEqualTo("{\"areas\":[\"mcp\"],\"transcripts\":null}");
    }

    @Test
    void usageChangedIsCoalescedToOncePerSecondPerArea() throws Exception {
        // [FR-019-AC5] 영역마다 1초에 최대 1회로 묶고, 마지막 변화 뒤 1초 안에 1회는 반드시 보낸다
        BlockingQueue<SseFrame> frames = openStream();
        postRaw(SKILL_HOOK);
        pollUntilType(frames, "usage-changed", 2_000, new ArrayList<>());
        long firstAt = System.nanoTime();

        for (int i = 0; i < 5; i++) {
            postRaw(SKILL_HOOK);
        }
        SseFrame second = pollUntilType(frames, "usage-changed", 2_000, new ArrayList<>());
        long gapMillis = (System.nanoTime() - firstAt) / 1_000_000L;
        SseFrame third = null;
        try {
            third = pollUntilType(frames, "usage-changed", 1_300, new ArrayList<>());
        } catch (AssertionError expected) {
            // 5건이 한 번으로 합쳐졌으므로 더 이상 오지 않는 것이 정상이다.
        }

        assertThat(second.data()).contains("\"skills\"");
        assertThat(gapMillis).isBetween(800L, 1_700L);
        assertThat(third).isNull();
    }

    private static SseFrame pollUntilType(
            BlockingQueue<SseFrame> frames, String type, long timeoutMillis, List<SseFrame> seen)
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
            seen.add(frame);
            if (type.equals(frame.type())) {
                return frame;
            }
        }
        throw new AssertionError("timed out waiting for frame type=" + type);
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

        sseHub.broadcast(registryService.current());

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
