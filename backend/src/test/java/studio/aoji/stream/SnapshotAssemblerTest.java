package studio.aoji.stream;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;

/**
 * api-spec {@code Snapshot} 조립 (architecture.md §3.2, FR-005-AC6).
 */
@SpringBootTest
class SnapshotAssemblerTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    SnapshotAssembler snapshotAssembler;

    @Autowired
    EventRepository eventRepository;

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
    }

    @Test
    void eightyEventsYieldFiftyMostRecentInSnapshot() {
        // [FR-005-AC6] 이벤트 80건 → recentEvents 50건 최신순
        OffsetDateTime base = OffsetDateTime.parse("2026-09-21T09:00:00+09:00");
        for (int i = 0; i < 80; i++) {
            eventRepository.insert(new EventRow(
                    0, base.plusSeconds(i), "PreToolUse", "s" + i, null, "architect", "Bash", null, "/workspace",
                    "tool", "도구 실행 · Bash", "seq-" + i));
        }

        Snapshot snapshot = snapshotAssembler.assemble();

        assertThat(snapshot.recentEvents()).hasSize(50);
        assertThat(snapshot.recentEvents().get(0).summary()).isEqualTo("seq-79");
        assertThat(snapshot.recentEvents().get(49).summary()).isEqualTo("seq-30");
    }

    @Test
    void snapshotIncludesConfigRegistryAndLive() {
        // Snapshot 필수 필드가 모두 채워지는지(api-spec Snapshot required)
        Snapshot snapshot = snapshotAssembler.assemble();

        assertThat(snapshot.serverTime()).isNotNull();
        assertThat(snapshot.config().hostPath()).isEqualTo("/Users/jaybee/Desktop/JayStudio");
        assertThat(snapshot.config().publicOrigin()).isEqualTo("http://127.0.0.1:4180");
        assertThat(snapshot.config().collectUrl()).isEqualTo("http://127.0.0.1:4180/hooks/events");
        assertThat(snapshot.config().defaultSessionCommand())
                .isEqualTo("cd \"/Users/jaybee/Desktop/JayStudio\" && claude");
        assertThat(snapshot.registry()).isNotNull();
        assertThat(snapshot.registry().agents()).extracting(a -> a.name()).contains("architect");
        assertThat(snapshot.live()).isNotNull();
    }
}
