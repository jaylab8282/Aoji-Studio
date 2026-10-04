package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.registry.RegistryService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 워크플로우에서 제거 = 휴지통 이동 (api-spec {@code DELETE /api/agents/{name}}, FR-012, tasks.md
 * T-011 Done when).
 *
 * <p>{@link AgentCreateTest}·{@link AgentUpdateTest}와 같은 패턴: 클래스 하나가 Spring 컨텍스트·마운트
 * 임시 폴더를 공유하고, 각 테스트는 서로 다른 이름의 워크플로우·에이전트를 써서 간섭을 피한다. {@code Clock}
 * 빈은 기본으로 실제 서울 시각에 위임하도록 매 테스트 전에 다시 스텁하고({@link #delegateClockToRealSeoulTime()}),
 * FR-012-AC4 같은 초 충돌 테스트만 고정 시각으로 다시 스텁해 결정적으로 재현한다(운영 코드에는 테스트 전용
 * 분기가 없다 — {@code studio.aoji.config.ClockConfig}가 만드는 빈 자체가 그 목적의 협력자다).
 */
@SpringBootTest
@AutoConfigureMockMvc
class AgentRemoveTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    RegistryService registryService;

    @MockitoBean
    Clock clock;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void setUp() throws Exception {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        delegateClockToRealSeoulTime();
    }

    @AfterEach
    void restorePermissions() throws IOException {
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
        Path teamsDir = teamsDir();
        if (Files.exists(teamsDir)) {
            Files.setPosixFilePermissions(teamsDir, PosixFilePermissions.fromString("rwxr-xr-x"));
        }
        registryService.rescanNow();
    }

    private void delegateClockToRealSeoulTime() {
        Mockito.reset(clock);
        Clock real = Clock.system(ZoneId.of("Asia/Seoul"));
        Mockito.when(clock.instant()).thenAnswer(inv -> real.instant());
        Mockito.when(clock.getZone()).thenReturn(real.getZone());
    }

    private Path agentsDir() {
        return mountRoot.resolve(".claude").resolve("agents");
    }

    private Path teamsDir() {
        return mountRoot.resolve(".aojistudio").resolve("teams");
    }

    private Path trashDir() {
        return mountRoot.resolve(".aojistudio").resolve("trash");
    }

    private Path definitionFile(String name) {
        return agentsDir().resolve(name + ".md");
    }

    private Path configFile(String workflowName) {
        return teamsDir().resolve(workflowName + ".json");
    }

    private String issuedBrowserToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/browser-token").header("Origin", ALLOWED_ORIGIN))
                .andReturn();
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("token")
                .asString();
    }

    private String collectToken() throws IOException {
        return Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private void createWorkflow(String name) throws Exception {
        mockMvc.perform(post("/api/workflows")
                .header("Origin", ALLOWED_ORIGIN)
                .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))));
    }

    private void createAgent(String name, String workflow, String role) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("description", "설명입니다");
        body.put("workflow", workflow);
        body.put("role", role);
        body.put("toolsMode", "inherit");

        MvcResult result = mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
    }

    private void writeRawDefinitionFile(String name, String content) throws IOException {
        Files.write(definitionFile(name), content.getBytes(StandardCharsets.UTF_8));
    }

    private void postHook(String body) throws Exception {
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-JayStudio-Collect-Token", collectToken())
                        .content(body))
                .andExpect(status().isNoContent());
    }

    private MvcResult deleteAgent(String name) throws Exception {
        return mockMvc.perform(delete("/api/agents/" + name)
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken()))
                .andReturn();
    }

    @Test
    void removingMemberMovesFileToTrashAndDropsConfigReference() throws Exception {
        // [FR-012-AC2] trash/<name>.<yyyyMMdd-HHmmss>.md 생성, agents에 없음, 구성 파일에서 빠짐
        createWorkflow("제거팀");
        createAgent("remove-agent", "제거팀", "member");

        MvcResult result = deleteAgent("remove-agent");

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        String trashPath = body.get("trashPath").asString();
        assertThat(trashPath).matches("\\.aojistudio/trash/remove-agent\\.\\d{8}-\\d{6}\\.md");
        assertThat(body.get("removedFromWorkflow").asString()).isEqualTo("제거팀");

        assertThat(Files.exists(definitionFile("remove-agent"))).isFalse();
        assertThat(Files.exists(mountRoot.resolve(trashPath))).isTrue();

        String config = Files.readString(configFile("제거팀"), StandardCharsets.UTF_8);
        assertThat(config).doesNotContain("remove-agent");
    }

    @Test
    void removingSameNameTwiceKeepsBothTrashFilesWithoutOverwrite() throws Exception {
        // [FR-012-AC4] 같은 이름 두 번 제거 → 두 파일 모두 남음, 덮어쓰기 없음
        createWorkflow("중복제거팀");
        createAgent("dup-remove-agent", "중복제거팀", "member");

        Instant fixed = Instant.now();
        Mockito.when(clock.instant()).thenReturn(fixed);

        MvcResult first = deleteAgent("dup-remove-agent");
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        String firstTrashPath =
                objectMapper.readTree(first.getResponse().getContentAsString()).get("trashPath").asString();

        createAgent("dup-remove-agent", "중복제거팀", "member");
        MvcResult second = deleteAgent("dup-remove-agent");
        assertThat(second.getResponse().getStatus()).isEqualTo(200);
        String secondTrashPath =
                objectMapper.readTree(second.getResponse().getContentAsString()).get("trashPath").asString();

        String expectedSecond = firstTrashPath.substring(0, firstTrashPath.length() - ".md".length()) + "-1.md";
        assertThat(secondTrashPath).isEqualTo(expectedSecond);
        assertThat(Files.exists(mountRoot.resolve(firstTrashPath))).isTrue();
        assertThat(Files.exists(mountRoot.resolve(secondTrashPath))).isTrue();
    }

    @Test
    void removingAgentOutsideWorkflowMovesToTrashOnly() throws Exception {
        // [FR-012-AC5] 워크플로우 밖 에이전트 제거 → 휴지통 이동만, removedFromWorkflow null
        writeRawDefinitionFile(
                "outsider-remove-agent",
                "---\nname: outsider-remove-agent\ndescription: 설명입니다\n---\n본문\n");
        registryService.rescanNow();

        MvcResult result = deleteAgent("outsider-remove-agent");

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("removedFromWorkflow").isNull()).isTrue();
        assertThat(Files.exists(definitionFile("outsider-remove-agent"))).isFalse();
        String trashPath = body.get("trashPath").asString();
        assertThat(Files.exists(mountRoot.resolve(trashPath))).isTrue();
    }

    @Test
    void busyAgentRejectsRemovalAndIdleAllows() throws Exception {
        // [FR-012-AC6][FR-012-E2] running/waiting → 409 AGENT_BUSY, 파일 그대로
        createWorkflow("제거바쁨팀");
        createAgent("busy-remove-agent", "제거바쁨팀", "member");
        byte[] originalBytes = Files.readAllBytes(definitionFile("busy-remove-agent"));
        String sessionId = "s-busy-remove-agent";

        postHook(
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","agent_type":"busy-remove-agent","tool_name":"Bash","tool_input":{"command":"ls"}}"""
                        .formatted(sessionId));
        MvcResult runningResult = deleteAgent("busy-remove-agent");
        assertThat(runningResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(objectMapper
                        .readTree(runningResult.getResponse().getContentAsString())
                        .get("code")
                        .asString())
                .isEqualTo("AGENT_BUSY");
        assertThat(Files.readAllBytes(definitionFile("busy-remove-agent"))).isEqualTo(originalBytes);

        postHook(
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","agent_type":"busy-remove-agent","tool_name":"AskUserQuestion","tool_input":{}}"""
                        .formatted(sessionId));
        MvcResult waitingResult = deleteAgent("busy-remove-agent");
        assertThat(waitingResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(objectMapper
                        .readTree(waitingResult.getResponse().getContentAsString())
                        .get("code")
                        .asString())
                .isEqualTo("AGENT_BUSY");
        assertThat(Files.readAllBytes(definitionFile("busy-remove-agent"))).isEqualTo(originalBytes);

        postHook("""
                {"session_id":"%s","hook_event_name":"Stop"}""".formatted(sessionId));
        MvcResult idleResult = deleteAgent("busy-remove-agent");
        assertThat(idleResult.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void configWriteFailureRestoresDefinitionFileFromTrash() throws Exception {
        // [FR-012-E1] 구성 파일 쓰기 실패 주입 → 정의 파일 원위치, 500
        createWorkflow("제거롤백팀");
        createAgent("rollback-remove-agent", "제거롤백팀", "member");
        byte[] originalBytes = Files.readAllBytes(definitionFile("rollback-remove-agent"));
        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("r-xr-xr-x"));

        MvcResult result = deleteAgent("rollback-remove-agent");

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");

        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThat(Files.readAllBytes(definitionFile("rollback-remove-agent"))).isEqualTo(originalBytes);

        try (var trashFiles = Files.list(trashDir())) {
            assertThat(trashFiles
                            .filter(p -> p.getFileName().toString().startsWith("rollback-remove-agent."))
                            .toList())
                    .isEmpty();
        }
    }
}
