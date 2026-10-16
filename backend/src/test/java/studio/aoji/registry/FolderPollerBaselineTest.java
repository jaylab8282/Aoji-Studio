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
import java.nio.file.attribute.FileTime;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import studio.aoji.config.BrowserTokenFilter;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 재스캔이 폴러 기준선도 갱신한다(ADR-87, FR-001-AC3). 폴링 간격은 운영 기본값 1000ms 그대로 둔다 —
 * "재스캔 직후 1초 안에 되돌린 변경"이 시나리오이기 때문이다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class FolderPollerBaselineTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final String ORIGINAL =
            "---\nname: base-agent\ndescription: original-desc\n---\n본문\n";
    private static final String CHANGED =
            "---\nname: base-agent\ndescription: changed-desc-longer\n---\n본문\n";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @LocalServerPort
    int port;

    @Autowired
    BrowserTokenFilter browserTokenFilter;

    @Autowired
    MockMvc mockMvc;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
        registry.add("server.shutdown", () -> "immediate");
    }

    @BeforeEach
    void dirs() throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.createDirectories(mountRoot.resolve(".aojistudio").resolve("teams"));
    }

    @Test
    void revertAfterManualRescanIsPickedUpByPoller() throws Exception {
        // [FR-001-AC3] 정의 파일 수정 -> POST /api/registry/rescan -> 1초 안에 원래 바이트(와 mtime)로 되돌림
        // -> 2초 안 SSE registry가 되돌린 상태
        Path agent = mountRoot.resolve(".claude").resolve("agents").resolve("base-agent.md");
        Files.writeString(agent, ORIGINAL, StandardCharsets.UTF_8);
        FileTime originalMtime = FileTime.fromMillis(1_700_000_000_000L);
        Files.setLastModifiedTime(agent, originalMtime);
        Thread.sleep(1_500); // 폴러가 원본 상태를 기준선으로 삼도록 한 주기 이상 기다린다

        HttpClient client = HttpClient.newHttpClient();
        try {
            HttpResponse<InputStream> response = connect(client);
            BlockingQueue<String[]> frames = readFrames(response.body());
            assertThat(waitFor(frames, "snapshot", d -> true, 5_000)).isNotNull();

            Files.writeString(agent, CHANGED, StandardCharsets.UTF_8);
            rescan();
            assertThat(waitFor(frames, "registry", d -> d.contains("changed-desc-longer"), 3_000)).isNotNull();

            Files.writeString(agent, ORIGINAL, StandardCharsets.UTF_8);
            Files.setLastModifiedTime(agent, originalMtime);
            String reverted = waitFor(frames, "registry", d -> d.contains("original-desc"), 2_000);
            assertThat(reverted).as("되돌린 상태의 registry 방송").doesNotContain("changed-desc-longer");
            response.body().close();
        } finally {
            client.shutdownNow();
        }
    }

    @Test
    void externalDeleteAfterApiCreateIsPickedUpByPoller() throws Exception {
        // [FR-001-AC3] 변경 API(워크플로우 추가) 직후 구성 파일을 밖에서 삭제 -> 2초 안 SSE registry에서 사라진다
        HttpClient client = HttpClient.newHttpClient();
        try {
            HttpResponse<InputStream> response = connect(client);
            BlockingQueue<String[]> frames = readFrames(response.body());
            assertThat(waitFor(frames, "snapshot", d -> true, 5_000)).isNotNull();

            mockMvc.perform(post("/api/workflows")
                            .header("Origin", ALLOWED_ORIGIN)
                            .header("X-AojiStudio-Browser-Token", browserTokenFilter.token())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"baseline-wf\",\"description\":\"d\"}"))
                    .andExpect(status().isCreated());
            Path config = mountRoot.resolve(".aojistudio").resolve("teams").resolve("baseline-wf.json");
            assertThat(config).exists();
            Files.delete(config);

            String gone = waitFor(
                    frames, "registry", d -> !d.contains("baseline-wf"), 2_000);
            assertThat(gone).isNotNull().doesNotContain("baseline-wf");
            response.body().close();
        } finally {
            client.shutdownNow();
        }
    }

    private void rescan() throws Exception {
        mockMvc.perform(post("/api/registry/rescan")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", browserTokenFilter.token()))
                .andExpect(status().isOk());
    }

    private HttpResponse<InputStream> connect(HttpClient client) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + port + "/api/stream?token=" + browserTokenFilter.token()))
                .header("Origin", ALLOWED_ORIGIN)
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
    }

    /** 조건에 맞는 type 프레임의 data를 돌려준다. 시간 안에 없으면 AssertionError. */
    private static String waitFor(BlockingQueue<String[]> frames, String type, Predicate<String> dataOk, long millis)
            throws InterruptedException {
        long deadline = System.nanoTime() + millis * 1_000_000L;
        while (true) {
            long remaining = (deadline - System.nanoTime()) / 1_000_000L;
            if (remaining <= 0) {
                throw new AssertionError("timed out waiting for " + type);
            }
            String[] frame = frames.poll(remaining, TimeUnit.MILLISECONDS);
            if (frame == null) {
                throw new AssertionError("timed out waiting for " + type);
            }
            String data = frame[1] == null ? "" : frame[1];
            if (type.equals(frame[0]) && dataOk.test(data)) {
                return data;
            }
        }
    }

    private static BlockingQueue<String[]> readFrames(InputStream body) {
        BlockingQueue<String[]> frames = new LinkedBlockingQueue<>();
        Thread reader = new Thread(
                () -> {
                    try (BufferedReader in = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                        String type = null;
                        StringBuilder data = new StringBuilder();
                        String line;
                        while ((line = in.readLine()) != null) {
                            if (line.isEmpty()) {
                                if (type != null) {
                                    frames.add(new String[] {type, data.toString()});
                                }
                                type = null;
                                data = new StringBuilder();
                            } else if (line.startsWith("event:")) {
                                type = line.substring("event:".length()).trim();
                            } else if (line.startsWith("data:")) {
                                data.append(line.substring("data:".length()).trim());
                            }
                        }
                    } catch (IOException ignored) {
                        // 테스트가 스트림을 닫음
                    }
                },
                "folder-poller-baseline-test-reader");
        reader.setDaemon(true);
        reader.start();
        return frames;
    }
}
