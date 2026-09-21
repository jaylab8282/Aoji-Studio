package studio.jay.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Answers;
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
import studio.jay.files.DefinitionFileDeleter;
import studio.jay.registry.RegistryService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 에이전트 수정 (api-spec {@code PUT /api/agents/{name}}, {@code GET /api/agents/{name}}, FR-011,
 * FR-002-AC3, tasks.md T-010 Done when).
 *
 * <p>{@link AgentCreateTest}와 같은 패턴: 클래스 하나가 Spring 컨텍스트·마운트 임시 폴더를 공유하고,
 * 각 테스트는 서로 다른 이름의 워크플로우·에이전트를 써서 간섭을 피한다. {@link DefinitionFileDeleter}는
 * 기본으로 실제 삭제를 수행하고({@code CALLS_REAL_METHODS}), FR-011-AC6 테스트만 삭제 단계 실패를
 * 주입한다(운영 코드에는 테스트 전용 분기가 없다 — {@code DefinitionFileDeleter} 자체가 그 목적의 협력자).
 */
@SpringBootTest
@AutoConfigureMockMvc
class AgentUpdateTest {

    private static final String ALLOWED_ORIGIN = "http://127.0.0.1:4180";
    private static final String CRLF = "\r\n";

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

    @MockitoBean(answers = Answers.CALLS_REAL_METHODS)
    DefinitionFileDeleter definitionFileDeleter;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("jaystudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("jaystudio.public-port", () -> "4180");
        registry.add("jaystudio.mount-path", () -> mountRoot.toString());
        registry.add("jaystudio.data-path", () -> dataDir.toString());
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @BeforeEach
    void createAgentsDir() throws Exception {
        Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
    }

    @AfterEach
    void resetMocksAndRescan() {
        Mockito.reset(definitionFileDeleter);
        registryService.rescanNow();
    }

    private Path agentsDir() {
        return mountRoot.resolve(".claude").resolve("agents");
    }

    private Path teamsDir() {
        return mountRoot.resolve(".jaystudio").resolve("teams");
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
        return Files.readString(mountRoot.resolve(".jaystudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
    }

    private void createWorkflow(String name) throws Exception {
        mockMvc.perform(post("/api/workflows")
                .header("Origin", ALLOWED_ORIGIN)
                .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))));
    }

    private JsonNode createAgent(String name, String workflow, String role) throws Exception {
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
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private void writeRawDefinitionFile(String name, String content) throws IOException {
        Files.write(definitionFile(name), content.getBytes(StandardCharsets.UTF_8));
    }

    private JsonNode getAgent(String name) throws Exception {
        MvcResult result =
                mockMvc.perform(get("/api/agents/" + name).header("Origin", ALLOWED_ORIGIN)).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private Map<String, Object> baseUpdateRequest(
            String name, String description, String workflow, String role, String expectedRevision) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("description", description);
        body.put("workflow", workflow);
        body.put("role", role);
        body.put("toolsMode", "inherit");
        body.put("body", "");
        body.put("expectedRevision", expectedRevision);
        return body;
    }

    private MvcResult putAgent(String currentName, Map<String, Object> body) throws Exception {
        return mockMvc.perform(put("/api/agents/" + currentName)
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    private void postHook(String body) throws Exception {
        mockMvc.perform(post("/hooks/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-JayStudio-Collect-Token", collectToken())
                        .content(body))
                .andExpect(status().isNoContent());
    }

    private byte[] crlfDefinitionBytes(String name) {
        String content = "---" + CRLF
                + "name: " + name + CRLF
                + "description: |" + CRLF
                + "  첫째 줄" + CRLF
                + "  둘째 줄" + CRLF
                + "permissionMode: acceptEdits" + CRLF
                + "tools: Read, Grep" + CRLF
                + "skills: foo, bar" + CRLF
                + "model: opus" + CRLF
                + "hooks:" + CRLF
                + "  - PreToolUse" + CRLF
                + "color: blue" + CRLF
                + "---" + CRLF
                + "본문 줄1" + CRLF
                + "본문 줄2" + CRLF;
        return content.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void unknownFieldsOrderAndCrlfBodyPreservedAndDescriptionBlockReplaced() throws Exception {
        // [FR-011-AC1] permissionMode·skills·hooks·color 줄·순서 보존, 본문 CRLF 바이트 보존,
        // 'description: |' 블록 전체 교체
        String name = "preserve-agent";
        Files.write(definitionFile(name), crlfDefinitionBytes(name));
        registryService.rescanNow();

        JsonNode detail = getAgent(name);
        assertThat(detail.get("body").asString()).isEqualTo("본문 줄1\r\n본문 줄2\r\n");
        String expectedRevision = detail.get("revision").asString();

        Map<String, Object> request = new HashMap<>();
        request.put("name", name);
        request.put("description", "새 설명");
        request.put("model", "opus");
        request.put("workflow", null);
        request.put("role", null);
        request.put("toolsMode", "explicit");
        request.put("tools", List.of("Read", "Grep"));
        request.put("body", detail.get("body").asString());
        request.put("expectedRevision", expectedRevision);

        MvcResult result = putAgent(name, request);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);

        String content = Files.readString(definitionFile(name), StandardCharsets.UTF_8);
        assertThat(content).contains("permissionMode: acceptEdits\r\n");
        assertThat(content).contains("skills: foo, bar\r\n");
        assertThat(content).contains("hooks:\r\n  - PreToolUse\r\n");
        assertThat(content).contains("color: blue\r\n");
        assertThat(content).contains("description: 새 설명\r\n");
        assertThat(content).doesNotContain("첫째 줄").doesNotContain("둘째 줄");
        assertThat(content).endsWith("본문 줄1\r\n본문 줄2\r\n");

        int nameIdx = content.indexOf("name:");
        int descIdx = content.indexOf("description:");
        int permIdx = content.indexOf("permissionMode:");
        int toolsIdx = content.indexOf("tools:");
        int skillsIdx = content.indexOf("skills:");
        int modelIdx = content.indexOf("model:");
        int hooksIdx = content.indexOf("hooks:");
        int colorIdx = content.indexOf("color:");
        assertThat(List.of(nameIdx, descIdx, permIdx, toolsIdx, skillsIdx, modelIdx, hooksIdx, colorIdx))
                .isSorted();
    }

    @Test
    void nameChangeCreatesNewFileRemovesOldAndUpdatesConfigReference() throws Exception {
        // [FR-011-AC2] name a→b: b.md 생성, a.md 없음, 구성 파일 lead/members 참조 b
        createWorkflow("이름변경팀");
        createAgent("old-name", "이름변경팀", "lead");
        String revision = getAgent("old-name").get("revision").asString();

        MvcResult result =
                putAgent("old-name", baseUpdateRequest("new-name", "설명입니다", "이름변경팀", "lead", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("name").asString()).isEqualTo("new-name");
        assertThat(Files.exists(definitionFile("new-name"))).isTrue();
        assertThat(Files.exists(definitionFile("old-name"))).isFalse();

        String config = Files.readString(configFile("이름변경팀"), StandardCharsets.UTF_8);
        assertThat(config).contains("\"lead\":\"new-name\"");
        assertThat(config).doesNotContain("old-name");
    }

    @Test
    void workflowChangeMovesAgentFromOldConfigToNewConfig() throws Exception {
        // [FR-011-AC3] 워크플로우 A→B: A에서 빠지고 B에 추가
        createWorkflow("이전팀");
        createWorkflow("새팀");
        createAgent("mover-agent", "이전팀", "member");
        String revision = getAgent("mover-agent").get("revision").asString();

        MvcResult result =
                putAgent("mover-agent", baseUpdateRequest("mover-agent", "설명입니다", "새팀", "member", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String oldConfig = Files.readString(configFile("이전팀"), StandardCharsets.UTF_8);
        String newConfig = Files.readString(configFile("새팀"), StandardCharsets.UTF_8);
        assertThat(oldConfig).doesNotContain("mover-agent");
        assertThat(newConfig).contains("mover-agent");
    }

    @Test
    void agentOutsideAnyWorkflowAllowsNullWorkflow() throws Exception {
        // [FR-011-AC3] 워크플로우 밖 에이전트 workflow null 허용
        String name = "outsider-agent";
        writeRawDefinitionFile(name, "---\nname: " + name + "\ndescription: 설명입니다\n---\n본문\n");
        registryService.rescanNow();
        JsonNode before = getAgent(name);
        assertThat(before.get("workflow").isNull()).isTrue();
        String revision = before.get("revision").asString();

        MvcResult result = putAgent(name, baseUpdateRequest(name, "새 설명", null, null, revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("workflow").isNull()).isTrue();
    }

    @Test
    void agentInsideWorkflowRejectsNullWorkflow() throws Exception {
        // [FR-011-AC3] 소속 에이전트 workflow null → 400
        createWorkflow("필수팀");
        createAgent("required-agent", "필수팀", "member");
        String revision = getAgent("required-agent").get("revision").asString();

        MvcResult result =
                putAgent("required-agent", baseUpdateRequest("required-agent", "설명입니다", null, null, revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(body.get("fields").get("workflow")).isNotNull();
    }

    @Test
    void revisionMismatchIsRejectedAndForceOverwrites() throws Exception {
        // [FR-011-AC4] expectedRevision 불일치 → 409 REVISION_CONFLICT details.modifiedAt, force true → 저장
        createWorkflow("리비전팀");
        createAgent("revision-agent", "리비전팀", "member");

        Map<String, Object> mismatch =
                baseUpdateRequest("revision-agent", "새 설명", "리비전팀", "member", "bogus-revision-0");
        MvcResult conflict = putAgent("revision-agent", mismatch);

        assertThat(conflict.getResponse().getStatus()).isEqualTo(409);
        JsonNode conflictBody = objectMapper.readTree(conflict.getResponse().getContentAsString());
        assertThat(conflictBody.get("code").asString()).isEqualTo("REVISION_CONFLICT");
        assertThat(conflictBody.get("details").get("modifiedAt")).isNotNull();

        Map<String, Object> forced =
                baseUpdateRequest("revision-agent", "새 설명", "리비전팀", "member", "bogus-revision-0");
        forced.put("force", true);
        MvcResult saved = putAgent("revision-agent", forced);

        assertThat(saved.getResponse().getStatus()).isEqualTo(200);
        String content = Files.readString(definitionFile("revision-agent"), StandardCharsets.UTF_8);
        assertThat(content).contains("description: 새 설명");
    }

    @Test
    void busyAgentRejectsUpdateAndIdleAllows() throws Exception {
        // [FR-011-AC5][FR-011-E4] running → 409 AGENT_BUSY 파일 변경 없음, waiting → 409, idle → 200
        createWorkflow("바쁨팀");
        createAgent("busy-agent", "바쁨팀", "member");
        String revision = getAgent("busy-agent").get("revision").asString();
        byte[] originalBytes = Files.readAllBytes(definitionFile("busy-agent"));
        String sessionId = "s-busy-agent";

        postHook(
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","agent_type":"busy-agent","tool_name":"Bash","tool_input":{"command":"ls"}}"""
                        .formatted(sessionId));
        MvcResult runningResult =
                putAgent("busy-agent", baseUpdateRequest("busy-agent", "새 설명", "바쁨팀", "member", revision));
        assertThat(runningResult.getResponse().getStatus()).isEqualTo(409);
        JsonNode runningBody = objectMapper.readTree(runningResult.getResponse().getContentAsString());
        assertThat(runningBody.get("code").asString()).isEqualTo("AGENT_BUSY");
        assertThat(Files.readAllBytes(definitionFile("busy-agent"))).isEqualTo(originalBytes);

        postHook(
                """
                {"session_id":"%s","hook_event_name":"PreToolUse","agent_type":"busy-agent","tool_name":"AskUserQuestion","tool_input":{}}"""
                        .formatted(sessionId));
        MvcResult waitingResult =
                putAgent("busy-agent", baseUpdateRequest("busy-agent", "새 설명", "바쁨팀", "member", revision));
        assertThat(waitingResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(objectMapper
                        .readTree(waitingResult.getResponse().getContentAsString())
                        .get("code")
                        .asString())
                .isEqualTo("AGENT_BUSY");
        assertThat(Files.readAllBytes(definitionFile("busy-agent"))).isEqualTo(originalBytes);

        postHook("""
                {"session_id":"%s","hook_event_name":"Stop"}""".formatted(sessionId));
        MvcResult idleResult =
                putAgent("busy-agent", baseUpdateRequest("busy-agent", "새 설명", "바쁨팀", "member", revision));
        assertThat(idleResult.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void oldFileDeleteFailureRollsBackNewFileAndConfig() throws Exception {
        // [FR-011-AC6] 옛 파일 삭제 실패 주입 → 새 파일 삭제·구성 파일 원복
        createWorkflow("롤백팀");
        createAgent("rollback-old", "롤백팀", "member");
        String revision = getAgent("rollback-old").get("revision").asString();
        byte[] originalDefinitionBytes = Files.readAllBytes(definitionFile("rollback-old"));
        byte[] originalConfigBytes = Files.readAllBytes(configFile("롤백팀"));

        doThrow(new IOException("디렉터리 권한 없음")).when(definitionFileDeleter).delete(any());

        MvcResult result = putAgent(
                "rollback-old", baseUpdateRequest("rollback-new", "설명입니다", "롤백팀", "member", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");

        assertThat(Files.exists(definitionFile("rollback-new"))).isFalse();
        assertThat(Files.readAllBytes(definitionFile("rollback-old"))).isEqualTo(originalDefinitionBytes);
        assertThat(Files.readAllBytes(configFile("롤백팀"))).isEqualTo(originalConfigBytes);
    }

    @Test
    void fileGoneWhenDeletedJustBeforeSave() throws Exception {
        // [FR-011-E1] PUT 직전 파일 삭제 → 409 FILE_GONE
        createWorkflow("사라짐팀");
        createAgent("gone-agent", "사라짐팀", "member");
        String revision = getAgent("gone-agent").get("revision").asString();
        Files.delete(definitionFile("gone-agent"));

        MvcResult result =
                putAgent("gone-agent", baseUpdateRequest("gone-agent", "새 설명", "사라짐팀", "member", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("FILE_GONE");
    }

    @Test
    void newNameAlreadyExistingIsRejected() throws Exception {
        // [FR-011-E2] 새 name 이미 존재 → 400 fields.name
        createWorkflow("중복이름팀");
        createAgent("agent-a", "중복이름팀", "member");
        createAgent("agent-b", "중복이름팀", "member");
        String revision = getAgent("agent-a").get("revision").asString();

        MvcResult result =
                putAgent("agent-a", baseUpdateRequest("agent-b", "설명입니다", "중복이름팀", "member", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(body.get("fields").get("name").asString()).isEqualTo("이미 있는 name입니다");
    }

    @Test
    void formatErrorFileGetAndPutReturnUneditable() throws Exception {
        // [FR-011-E3][FR-002-AC3] 형식 오류 파일 GET/PUT → 409 UNEDITABLE
        writeRawDefinitionFile("bad-agent", "---\ndescription: name 없음\n---\n본문\n");
        registryService.rescanNow();

        MvcResult getResult = mockMvc.perform(get("/api/agents/bad-agent").header("Origin", ALLOWED_ORIGIN))
                .andReturn();
        assertThat(getResult.getResponse().getStatus()).isEqualTo(409);
        JsonNode getBody = objectMapper.readTree(getResult.getResponse().getContentAsString());
        assertThat(getBody.get("code").asString()).isEqualTo("UNEDITABLE");
        assertThat(getBody.get("fields").get("file").asString()).isEqualTo("bad-agent.md");

        MvcResult putResult = putAgent(
                "bad-agent", baseUpdateRequest("bad-agent", "새 설명", null, null, "whatever-revision"));
        assertThat(putResult.getResponse().getStatus()).isEqualTo(409);
        JsonNode putBody = objectMapper.readTree(putResult.getResponse().getContentAsString());
        assertThat(putBody.get("code").asString()).isEqualTo("UNEDITABLE");
    }

    @Test
    void sameWorkflowMemberPromotedToLeadUpdatesConfig() throws Exception {
        // 리뷰(T-010 round 1, D-019): 워크플로우가 안 바뀌어도 role 변경(member→lead)이 구성 파일에
        // 반영돼야 한다 — api-spec PUT /api/agents/{name} 409 LEAD_EXISTS·ui-spec 06 역할 라디오 전제.
        // 시나리오 (a) 같은 워크플로우 member→lead → 200, 구성 파일 lead=name·members에서 제거
        createWorkflow("역할변경팀");
        createAgent("role-promote-agent", "역할변경팀", "member");
        String revision = getAgent("role-promote-agent").get("revision").asString();

        MvcResult result = putAgent(
                "role-promote-agent",
                baseUpdateRequest("role-promote-agent", "설명입니다", "역할변경팀", "lead", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("role").asString()).isEqualTo("lead");

        String config = Files.readString(configFile("역할변경팀"), StandardCharsets.UTF_8);
        assertThat(config).contains("\"lead\":\"role-promote-agent\"");
        assertThat(config).contains("\"members\":[]");
    }

    @Test
    void sameWorkflowPromotionBlockedByExistingLeadLeavesFilesUnchanged() throws Exception {
        // 리뷰(T-010 round 1, D-019): 시나리오 (b) 다른 lead가 있을 때 member→lead → 409
        // LEAD_EXISTS, 파일 무변경
        createWorkflow("리더충돌팀");
        createAgent("existing-lead", "리더충돌팀", "lead");
        createAgent("role-conflict-agent", "리더충돌팀", "member");
        String revision = getAgent("role-conflict-agent").get("revision").asString();
        byte[] originalDefinitionBytes = Files.readAllBytes(definitionFile("role-conflict-agent"));
        byte[] originalConfigBytes = Files.readAllBytes(configFile("리더충돌팀"));

        MvcResult result = putAgent(
                "role-conflict-agent",
                baseUpdateRequest("role-conflict-agent", "설명입니다", "리더충돌팀", "lead", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("LEAD_EXISTS");
        assertThat(Files.readAllBytes(definitionFile("role-conflict-agent"))).isEqualTo(originalDefinitionBytes);
        assertThat(Files.readAllBytes(configFile("리더충돌팀"))).isEqualTo(originalConfigBytes);
    }

    @Test
    void sameWorkflowLeadDemotedToMemberUpdatesConfig() throws Exception {
        // 리뷰(T-010 round 1, D-019): 시나리오 (c) lead→member → lead null·members 포함
        createWorkflow("강등팀");
        createAgent("demote-agent", "강등팀", "lead");
        String revision = getAgent("demote-agent").get("revision").asString();

        MvcResult result = putAgent(
                "demote-agent", baseUpdateRequest("demote-agent", "설명입니다", "강등팀", "member", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("role").asString()).isEqualTo("member");

        String config = Files.readString(configFile("강등팀"), StandardCharsets.UTF_8);
        assertThat(config).contains("\"lead\":null");
        assertThat(config).contains("\"members\":[\"demote-agent\"]");
    }

    @Test
    void nameChangeAndRoleChangeAppliedTogether() throws Exception {
        // 리뷰(T-010 round 1, D-019): 시나리오 (d) 이름 변경 + role 변경 동시 → 둘 다 반영
        createWorkflow("이름역할동시팀");
        createAgent("combo-old", "이름역할동시팀", "member");
        String revision = getAgent("combo-old").get("revision").asString();

        MvcResult result = putAgent(
                "combo-old", baseUpdateRequest("combo-new", "설명입니다", "이름역할동시팀", "lead", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("name").asString()).isEqualTo("combo-new");
        assertThat(body.get("role").asString()).isEqualTo("lead");
        assertThat(Files.exists(definitionFile("combo-new"))).isTrue();
        assertThat(Files.exists(definitionFile("combo-old"))).isFalse();

        String config = Files.readString(configFile("이름역할동시팀"), StandardCharsets.UTF_8);
        assertThat(config).contains("\"lead\":\"combo-new\"");
        assertThat(config).doesNotContain("combo-old");
    }

    @Test
    void descriptionWithEmbeddedLineBreakIsRejected() throws Exception {
        // 리뷰(T-010 round 1) 비차단 제안: description에 개행이 있으면 frontmatter 줄 단위 편집이
        // 깨질 수 있어 400으로 거부한다(AgentDefinitionWriter는 알려진 키를 한 줄로 쓴다, ADR-07).
        createWorkflow("개행거부팀");
        createAgent("linebreak-agent", "개행거부팀", "member");
        String revision = getAgent("linebreak-agent").get("revision").asString();

        MvcResult result = putAgent(
                "linebreak-agent",
                baseUpdateRequest("linebreak-agent", "첫줄\n둘째줄", "개행거부팀", "member", revision));

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(body.get("fields").get("description")).isNotNull();
    }
}
