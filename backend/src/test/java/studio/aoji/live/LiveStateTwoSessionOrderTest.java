package studio.aoji.live;

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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;

/**
 * 같은 에이전트의 두 세션이 거의 동시에(또는 시계가 뒤로 감긴 채) 서브에이전트를 시작해도, 나중에 반영한 세션이
 * 표시되는지 (FR-004-AC3, FR-004-AC6). E2E-04 18·19줄 간헐 실패 조사(T-R4-22)의 재현 테스트.
 */
@SpringBootTest
class LiveStateTwoSessionOrderTest {

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
        Path agents = Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.writeString(
                agents.resolve("ops-lead.md"),
                "---\nname: ops-lead\ndescription: 운영 팀장\n---\n본문\n",
                StandardCharsets.UTF_8);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
    }

    private void subagentStart(String sessionId, String agentId, OffsetDateTime at) {
        HookPayload payload = new HookPayload(
                sessionId, "/workspace", "SubagentStart", agentId, "ops-lead", null, java.util.Map.of(), null, null);
        EventRow inserted = eventRepository.insert(new EventRow(
                0, at, "SubagentStart", sessionId, agentId, "ops-lead", null, null, "/workspace", "subagent-start",
                "서브에이전트 시작", "ops-lead"));
        eventPublisher.publishEvent(new HookEventReceived(this, payload, inserted));
    }

    @Test
    void laterAppliedSessionIsShownEvenWhenWallClockStepsBack_FR004AC3_FR004AC6() {
        // 수신 시각이 같거나 뒤로 가도(WSL 시계 보정) 반영 순서가 최신 순서다. 18줄 A → 19줄 B → B가 보여야 한다.
        for (int i = 0; i < 20; i++) {
            OffsetDateTime base = OffsetDateTime.parse("2026-10-17T10:00:00+09:00").plusMinutes(i);
            String a = "sess-a-" + i;
            String b = "sess-b-" + i;
            subagentStart(a, "sub-a-" + i, base);
            assertThat(liveStateService.live().agents().get("ops-lead").parentLabel()).isNotNull();
            String labelA = liveStateService.live().agents().get("ops-lead").parentLabel();

            // B의 수신 시각이 A보다 이르다(시계가 뒤로 감김) 또는 같다.
            subagentStart(b, "sub-b-" + i, i % 2 == 0 ? base.minusSeconds(3) : base);
            String labelB = liveStateService.live().agents().get("ops-lead").parentLabel();

            assertThat(labelB).as("반복 %d: 나중에 반영한 세션 B가 보여야 한다", i).isNotEqualTo(labelA);
        }
    }

    @Test
    void concurrentStartsLeaveSomeSessionShownAndConsistent_FR004AC3_FR004AC6() throws Exception {
        // 거의 동시에 온 두 세션: 어느 쪽이 나중에 반영될지는 정해지지 않는다. 교착·예외 없이 끝나고, 표시되는 세션은
        // 두 세션 중 하나이며 상태는 작업 중으로 일관돼야 한다.
        for (int i = 0; i < 30; i++) {
            int n = i;
            OffsetDateTime at = OffsetDateTime.parse("2026-10-18T10:00:00+09:00").plusMinutes(n);
            Thread t1 = new Thread(() -> subagentStart("cs-a-" + n, "csub-a-" + n, at));
            Thread t2 = new Thread(() -> subagentStart("cs-b-" + n, "csub-b-" + n, at));
            t1.start();
            t2.start();
            t1.join();
            t2.join();
            AgentLive ops = liveStateService.live().agents().get("ops-lead");
            assertThat(ops.status()).isEqualTo(Status.RUNNING);
            assertThat(ops.parentLabel()).isNotNull();
            assertThat(ops.parentLabel()).as("반복 %d: 표시 세션은 두 세션 중 하나(세션 라벨)", n).matches("\\[세션( \\d+)?\\]");
        }
    }
}
