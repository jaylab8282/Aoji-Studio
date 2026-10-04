package studio.aoji.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Map;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import studio.aoji.events.EventRepository;
import studio.aoji.events.EventRow;
import studio.aoji.registry.RegistryService;

/**
 * hook 이벤트 → {@link LiveState} 집계 → api-spec {@link Live} 조립 (FR-003-AC4·AC6, FR-004-AC1·AC4·
 * AC7, FR-007-AC3·AC5). 실제 SQLite·registry로 검증하는 통합 테스트라 순서에 의미가 있는 시나리오를
 * {@code @Order}로 이어간다(FolderPoller가 없는 T-006 시점에는 구성 파일 변경 후 직접 rescanNow()를
 * 호출한다).
 */
@SpringBootTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LiveStateServiceTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    LiveStateService liveStateService;

    @Autowired
    RegistryService registryService;

    @Autowired
    EventRepository eventRepository;

    @Autowired
    ApplicationEventPublisher eventPublisher;

    @Autowired
    SessionStateMachine sessionStateMachine;

    private static OffsetDateTime lastPublishedAt;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        writeAgent("bystander", "이벤트를 받지 않는 대조군 에이전트");
        writeAgent("architect", "설계 에이전트");
        writeAgent("qa", "QA 에이전트");
        writeAgent("outsider", "워크플로우 밖 에이전트");

        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    private static void writeAgent(String name, String description) throws IOException {
        Files.writeString(
                mountRoot.resolve(".claude").resolve("agents").resolve(name + ".md"),
                "---\nname: " + name + "\ndescription: " + description + "\n---\n본문\n",
                StandardCharsets.UTF_8);
    }

    private HookPayload payload(String hookEventName, Map<String, Object> overrides) {
        return new HookPayload(
                (String) overrides.get("session_id"),
                (String) overrides.get("cwd"),
                hookEventName,
                (String) overrides.get("agent_id"),
                (String) overrides.get("agent_type"),
                (String) overrides.get("tool_name"),
                castToolInput(overrides.get("tool_input")),
                (String) overrides.get("notification_type"),
                (String) overrides.get("reason"));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castToolInput(Object value) {
        return value == null ? Map.of() : (Map<String, Object>) value;
    }

    /** {@code HookCollectController}가 하듯 DB에 저장한 뒤 {@link HookEventReceived}를 발행한다. */
    private void publish(HookPayload payload, String kind, String title, String summary, OffsetDateTime at) {
        EventRow inserted = eventRepository.insert(new EventRow(
                0, at, payload.hookEventName(), payload.sessionId(), payload.agentId(), payload.agentType(),
                payload.toolName(), payload.notificationType(), payload.cwd(), kind, title, summary));
        eventPublisher.publishEvent(new HookEventReceived(this, payload, inserted));
        lastPublishedAt = at;
    }

    @Test
    @Order(1)
    void agentWithoutEventsIsIdle() {
        // [FR-004-AC1] 이벤트 없는 정의 에이전트 → idle
        AgentLive bystander = liveStateService.live().agents().get("bystander");

        assertThat(bystander.status()).isEqualTo(Status.IDLE);
        assertThat(bystander.currentTool()).isNull();
        assertThat(bystander.sessionStartedAt()).isNull();
        assertThat(bystander.childCount()).isZero();
        assertThat(bystander.cwd()).isNull();
        assertThat(bystander.parentLabel()).isNull();
        assertThat(bystander.lastEventAt()).isNull();
        assertThat(bystander.lastEvent()).isNull();
    }

    @Test
    @Order(2)
    void agentTypeMatchingNameReflectsWithoutAffectingOthers() {
        // [FR-003-AC4] agent_type == name → agents[name]에 반영, 다른 name 영향 없음
        publish(
                payload("SessionStart", Map.of("session_id", "s-arch", "agent_type", "architect", "cwd", "/workspace")),
                "session-start", "세션 시작", "/workspace", OffsetDateTime.parse("2026-09-21T09:00:00+09:00"));
        publish(
                payload("UserPromptSubmit", Map.of("session_id", "s-arch", "agent_type", "architect")),
                "prompt", "프롬프트 제출", "-", OffsetDateTime.parse("2026-09-21T09:00:01+09:00"));

        Live live = liveStateService.live();
        assertThat(live.agents().get("architect").status()).isEqualTo(Status.RUNNING);
        assertThat(live.agents().get("bystander").status()).isEqualTo(Status.IDLE);
    }

    @Test
    @Order(3)
    void currentToolStartedAtAndCwdReflectLatestEvents() {
        // [FR-007-AC5] currentTool = 마지막 PreToolUse, sessionStartedAt = 최근 SessionStart, cwd = 마지막 이벤트
        publish(
                payload("PreToolUse", Map.of(
                        "session_id", "s-arch", "agent_type", "architect", "tool_name", "Read",
                        "tool_input", Map.of("file_path", "/workspace/a.md"), "cwd", "/workspace/sub")),
                "tool", "도구 실행 · Read", "/workspace/a.md", OffsetDateTime.parse("2026-09-21T09:00:02+09:00"));

        AgentLive architect = liveStateService.live().agents().get("architect");
        assertThat(architect.currentTool()).isEqualTo(new ToolRef("Read", "/workspace/a.md"));
        assertThat(architect.sessionStartedAt()).isEqualTo(OffsetDateTime.parse("2026-09-21T09:00:00+09:00"));
        assertThat(architect.cwd()).isEqualTo("/workspace/sub");
    }

    @Test
    @Order(4)
    void subagentWithDefinedAgentTypeMergesIntoThatAgentAndCountsAsChild() {
        // [FR-004-AC4] agent_type이 정의 파일이면 그 에이전트로 합침
        // [FR-007-AC3] 정의 있는 서브 → agents[name].parentLabel '부모 name'
        // [FR-007-AC5] childCount
        publish(
                payload("SubagentStart", Map.of("session_id", "s-arch", "agent_id", "sub-qa", "agent_type", "qa")),
                "subagent-start", "서브에이전트 시작", "qa", OffsetDateTime.parse("2026-09-21T09:00:03+09:00"));

        Live live = liveStateService.live();
        assertThat(live.agents().get("qa").status()).isEqualTo(Status.RUNNING);
        assertThat(live.agents().get("qa").parentLabel()).isEqualTo("architect");
        assertThat(live.agents().get("architect").childCount()).isEqualTo(1);
    }

    @Test
    @Order(5)
    void undefinedSubagentIsExposedWithParentAgentInfo() {
        // [FR-007-AC3] 정의 없는 서브(Explore) → undefinedSubagents parentAgentName/parentLabel
        publish(
                payload("SubagentStart", Map.of("session_id", "s-arch", "agent_id", "sub-explore", "agent_type", "Explore")),
                "subagent-start", "서브에이전트 시작", "Explore", OffsetDateTime.parse("2026-09-21T09:00:04+09:00"));

        UndefinedSubagent undefined = liveStateService.live().undefinedSubagents().stream()
                .filter(u -> "sub-explore".equals(u.agentId()))
                .findFirst()
                .orElseThrow();

        assertThat(undefined.agentType()).isEqualTo("Explore");
        assertThat(undefined.status()).isEqualTo(Status.RUNNING);
        assertThat(undefined.parentAgentName()).isEqualTo("architect");
        assertThat(undefined.parentLabel()).isEqualTo("architect");
    }

    @Test
    @Order(6)
    void subagentStopRemovesUndefinedSubagent() {
        // [FR-007-AC3] SubagentStop → 제거
        publish(
                payload("SubagentStop", Map.of("session_id", "s-arch", "agent_id", "sub-explore", "agent_type", "Explore")),
                "subagent-stop", "서브에이전트 종료", "Explore", OffsetDateTime.parse("2026-09-21T09:00:05+09:00"));

        assertThat(liveStateService.live().undefinedSubagents())
                .noneMatch(u -> "sub-explore".equals(u.agentId()));
    }

    @Test
    @Order(7)
    void agentOutsideWorkflowShowsInLobbyThenMovesToFloorOnceAssigned() throws IOException {
        // [FR-004-AC7] 워크플로우 밖 에이전트 이벤트 → lobby kind agent
        publish(
                payload("UserPromptSubmit", Map.of("session_id", "s-outsider", "agent_type", "outsider")),
                "prompt", "프롬프트 제출", "-", OffsetDateTime.parse("2026-09-21T09:00:06+09:00"));

        Live beforeAssignment = liveStateService.live();
        assertThat(beforeAssignment.lobby())
                .anyMatch(entry -> entry.kind() == LobbyEntry.Kind.AGENT
                        && "outsider".equals(entry.label())
                        && entry.status() == Status.RUNNING);

        // [FR-004-AC7] 구성 파일에 넣은 뒤 → lobby에서 빠지고 agents[name].status 유지
        Files.createDirectories(mountRoot.resolve(".aojistudio").resolve("teams"));
        Files.writeString(
                mountRoot.resolve(".aojistudio").resolve("teams").resolve("solo.json"),
                """
                {
                  "schemaVersion": 1,
                  "name": "solo",
                  "description": "",
                  "lead": "outsider",
                  "members": [],
                  "createdAt": "2026-09-21T09:00:00+09:00",
                  "updatedAt": "2026-09-21T09:00:00+09:00"
                }
                """,
                StandardCharsets.UTF_8);
        registryService.rescanNow();

        Live afterAssignment = liveStateService.live();
        assertThat(afterAssignment.lobby()).noneMatch(entry -> "outsider".equals(entry.label()));
        assertThat(afterAssignment.agents().get("outsider").status()).isEqualTo(Status.RUNNING);
    }

    @Test
    @Order(8)
    void lastReceivedAtTracksLatestEventAndIsStableWithoutNewEvents() {
        // [FR-003-AC6] lastReceivedAt = 마지막 저장 시각, 시간 경과로 변화 없음
        Live live1 = liveStateService.live();
        assertThat(live1.lastReceivedAt()).isEqualTo(lastPublishedAt);
        assertThat(live1.everReceived()).isTrue();

        Live live2 = liveStateService.live();
        assertThat(live2.lastReceivedAt()).isEqualTo(live1.lastReceivedAt());
    }

    @Test
    @Order(9)
    void restartRestoresLastReceivedAtButNotSessions() {
        // [FR-003-AC6] 재시작 후 DB에서 복원 / [FR-004-AC2] 재시작 → 빈 상태
        LiveStateService restarted =
                new LiveStateService(eventRepository, registryService, sessionStateMachine, eventPublisher);
        restarted.init();

        assertThat(restarted.currentState().lastReceivedAt()).isEqualTo(lastPublishedAt);
        assertThat(restarted.currentState().everReceived()).isTrue();
        assertThat(restarted.currentState().sessions()).isEmpty();
    }
}
