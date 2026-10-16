package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 대화 기록 읽기 시간 (NFR-16). 기본 {@code test}에서 빼고 Integration에서 1회만 {@code perfTest}로 돌린다
 * (conventions.md §8). 약 20MB 파일 1개를 처음부터 읽는 시간 한 번만 재서 로그에 남긴다.
 */
@Tag("perf")
class TranscriptIngestPerfTest {

    private static final long TARGET_BYTES = 20L * 1024 * 1024;

    @TempDir
    Path temp;

    @Test
    @DisplayName("[NFR-16] 대화 기록 20MB 첫 읽기(본문 포함 줄) 완료 시간 측정, 20MB 처리 < 10s")
    void twentyMegabytesFirstRead() throws IOException {
        Path home = temp.resolve("home");
        Files.createDirectories(home.resolve(".claude").resolve("projects").resolve("-p"));
        TranscriptHarness h = new TranscriptHarness(home, temp.resolve("events.db"));
        Path file = h.projectsDir().resolve("-p").resolve("perf-session.jsonl");
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

        long start = System.nanoTime();
        h.service.ingestOnce();
        long millis = (System.nanoTime() - start) / 1_000_000;

        System.out.println("[NFR-16] 대화 기록 " + size / (1024 * 1024) + "MB " + index + "줄 읽기 " + millis + "ms");
        assertThat(h.reportAll().totals().total()).isEqualTo(18L * index);
        assertThat(millis).isLessThan(10_000);
    }
}
