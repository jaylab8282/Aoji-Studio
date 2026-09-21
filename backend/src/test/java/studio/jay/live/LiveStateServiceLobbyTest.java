package studio.jay.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import studio.jay.events.EventRepository;
import studio.jay.events.EventRow;

/**
 * 로비 세션 번호 배정(FR-003-AC5, ADR-10). 서버 수명 내 1부터 오름차순으로 배정되므로 다른 테스트와
 * 카운터를 공유하지 않도록 전용 Spring 컨텍스트(별도 클래스)에서만 검증한다.
 */
@SpringBootTest
class LiveStateServiceLobbyTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    LiveStateService liveStateService;

    @Autowired
    EventRepository eventRepository;

    @Autowired
    ApplicationEventPublisher eventPublisher;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        registry.add("jaystudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    private HookPayload payload(String sessionId, String hookEventName) {
        return new HookPayload(sessionId, "/workspace", hookEventName, null, null, null, Map.of(), null, null);
    }

    private void publish(HookPayload payload, String kind, String title, OffsetDateTime at) {
        EventRow inserted = eventRepository.insert(new EventRow(
                0, at, payload.hookEventName(), payload.sessionId(), payload.agentId(), payload.agentType(),
                payload.toolName(), payload.notificationType(), payload.cwd(), kind, title, "-"));
        eventPublisher.publishEvent(new HookEventReceived(this, payload, inserted));
    }

    @Test
    void lobbyNumbersAssignedInOrderAndRemovedOnSessionEnd() {
        // [FR-003-AC5] agent_type 없는 세션 → lobby '[세션 1]', 두 번째 세션 '[세션 2]', SessionEnd → 제거
        publish(payload("s1", "SessionStart"), "session-start", "세션 시작", OffsetDateTime.parse("2026-09-21T09:00:00+09:00"));

        assertThat(liveStateService.live().lobby()).hasSize(1);
        assertThat(liveStateService.live().lobby().get(0).label()).isEqualTo("[세션 1]");
        assertThat(liveStateService.live().lobby().get(0).kind()).isEqualTo(LobbyEntry.Kind.SESSION);

        publish(payload("s2", "SessionStart"), "session-start", "세션 시작", OffsetDateTime.parse("2026-09-21T09:00:01+09:00"));

        assertThat(liveStateService.live().lobby())
                .extracting(LobbyEntry::label)
                .containsExactly("[세션 1]", "[세션 2]");

        publish(payload("s1", "SessionEnd"), "session-end", "세션 종료", OffsetDateTime.parse("2026-09-21T09:00:02+09:00"));

        assertThat(liveStateService.live().lobby())
                .extracting(LobbyEntry::label)
                .containsExactly("[세션 2]");
    }
}
