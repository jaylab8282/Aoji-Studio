package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.lang.management.ManagementFactory;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 대화 기록 읽기 시간 (NFR-16). 기본 {@code test}에서 빼고 Integration에서 1회만 {@code perfTest}로 돌린다
 * (conventions.md §8). 약 20MB 파일 1개를 처음부터 읽는 동안 처리 속도(≥ 0.9MB/s), 다른 스레드의
 * {@code GET /api/state} 최대 응답 시간(< 1s), 읽기 스레드 CPU(≤ 1코어)를 잰다 (ADR-81 결정 7, T-R4-22).
 */
@Tag("perf")
@SpringBootTest
@AutoConfigureMockMvc
class TranscriptIngestPerfTest {

    private static final long TARGET_BYTES = 20L * 1024 * 1024;

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @TempDir
    static Path claudeHome;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    TranscriptIngestService service;

    @Autowired
    CostReportService cost;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("aojistudio.claude-home-host", () -> "/home/fixture");
        registry.add("aojistudio.claude-home-mount", () -> claudeHome.toString());
        registry.add("aojistudio.transcript-auto-start", () -> "false");
    }

    @Test
    @DisplayName("[NFR-16] 대화 기록 20MB 읽기: 처리 속도 ≥ 0.9MB/s, 읽는 동안 GET /api/state < 1s, 읽기 스레드 CPU ≤ 1코어")
    void twentyMegabytesFirstRead() throws Exception {
        Path file = claudeHome.resolve(".claude").resolve("projects").resolve("-p").resolve("perf-session.jsonl");
        Files.createDirectories(file.getParent());
        String body = "x".repeat(900);
        long written = 0;
        int index = 0;
        try (BufferedWriter writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
            while (written < TARGET_BYTES) {
                String line = "{\"type\":\"assistant\",\"sessionId\":\"perf-session\",\"timestamp\":\"2026-10-10T"
                        + String.format("%02d:%02d:%02d", index / 3600 % 24, index / 60 % 60, index % 60)
                        + ".000Z\",\"cwd\":\"/w\",\"entrypoint\":\"cli\",\"requestId\":\"req_" + index
                        + "\",\"message\":{\"id\":\"msg_" + index
                        + "\",\"model\":\"claude-opus-4-8\",\"content\":[{\"type\":\"text\",\"text\":\"" + body
                        + "\"}],\"usage\":{\"input_tokens\":10,\"output_tokens\":5,"
                        + "\"cache_creation_input_tokens\":1,\"cache_read_input_tokens\":2}}}\n";
                writer.write(line);
                written += line.getBytes(StandardCharsets.UTF_8).length;
                index++;
            }
        }
        long size = Files.size(file);
        int lines = index;

        // 워밍업: 컨텍스트 첫 요청 비용이 응답 시간에 섞이지 않게 한다.
        mockMvc.perform(get("/api/state").header("Origin", "http://127.0.0.1:4180")).andExpect(status().isOk());

        com.sun.management.OperatingSystemMXBean os =
                (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        AtomicLong readerCpuNanos = new AtomicLong();
        AtomicLong readerWallNanos = new AtomicLong();
        AtomicReference<Throwable> readerError = new AtomicReference<>();
        java.util.concurrent.atomic.AtomicBoolean reading = new java.util.concurrent.atomic.AtomicBoolean();
        java.util.concurrent.atomic.AtomicBoolean done = new java.util.concurrent.atomic.AtomicBoolean();

        Thread reader = new Thread(() -> {
            try {
                var threads = ManagementFactory.getThreadMXBean();
                long cpu0 = threads.getCurrentThreadCpuTime();
                long wall0 = System.nanoTime();
                reading.set(true);
                service.ingestOnce();
                readerWallNanos.set(System.nanoTime() - wall0);
                readerCpuNanos.set(threads.getCurrentThreadCpuTime() - cpu0);
            } catch (Throwable t) {
                readerError.set(t);
            } finally {
                done.set(true);
            }
        }, "perf-reader");

        long procCpu0 = os.getProcessCpuTime();
        long wall0 = System.nanoTime();
        reader.start();
        long maxStateMillis = 0;
        int calls = 0;
        int callsWhileReading = 0;
        while (!done.get()) {
            if (!reading.get()) {
                Thread.onSpinWait();
                continue;
            }
            long t0 = System.nanoTime();
            mockMvc.perform(get("/api/state").header("Origin", "http://127.0.0.1:4180"))
                    .andExpect(status().isOk());
            long millis = (System.nanoTime() - t0) / 1_000_000;
            boolean stillReading = !done.get();
            calls++;
            if (stillReading) {
                callsWhileReading++;
                maxStateMillis = Math.max(maxStateMillis, millis);
            }
            Thread.sleep(20);
        }
        reader.join();
        long wallNanos = System.nanoTime() - wall0;
        long procCpuNanos = os.getProcessCpuTime() - procCpu0;

        assertThat(readerError.get()).as("읽기 스레드 예외").isNull();
        double seconds = readerWallNanos.get() / 1e9;
        double mbPerSecond = size / (1024.0 * 1024.0) / seconds;
        double readerCpuRatio = readerCpuNanos.get() / (double) readerWallNanos.get();
        double processCpuRatio = procCpuNanos / (double) wallNanos;

        System.out.printf(
                "[NFR-16] %dMB %d줄 읽기 %dms, %.2fMB/s, GET /api/state 읽는 동안 %d회 최대 %dms(전체 %d회),"
                        + " 읽기 스레드 CPU %.2f코어, 프로세스 CPU %.2f코어(GC 등 포함, 로그만)%n",
                size / (1024 * 1024), lines, readerWallNanos.get() / 1_000_000, mbPerSecond, callsWhileReading,
                maxStateMillis, calls, readerCpuRatio, processCpuRatio);

        assertThat(cost.report(PeriodQuery.parse("all", "UTC", java.time.Clock.systemUTC())).totals().total())
                .isEqualTo(18L * lines);
        assertThat(mbPerSecond).as("처리 속도 MB/s").isGreaterThanOrEqualTo(0.9);
        assertThat(callsWhileReading).as("읽는 동안 겹친 GET /api/state 호출 수").isGreaterThanOrEqualTo(1);
        assertThat(maxStateMillis).as("읽는 동안 GET /api/state 최대 ms").isLessThan(1000);
        assertThat(readerCpuRatio).as("읽기 스레드 CPU / 경과 시간").isLessThanOrEqualTo(1.0);
    }
}
