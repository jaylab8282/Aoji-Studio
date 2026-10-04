package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.registry.RegistryService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 기존 에이전트 가져오기 (api-spec {@code POST /api/workflows/{workflow}/members}, FR-009,
 * tasks.md T-009 Done when).
 *
 * <p>{@link studio.aoji.api.WorkflowControllerTest}와 같은 패턴: 클래스 하나가 Spring 컨텍스트·마운트
 * 임시 폴더를 공유하고, 각 테스트는 서로 다른 이름의 워크플로우·에이전트를 써서 간섭을 피한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ImportMembersTest {

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
    void restorePermissions() throws IOException {
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
        Path teamsDir = teamsDir();
        if (Files.exists(teamsDir)) {
            Files.setPosixFilePermissions(teamsDir, PosixFilePermissions.fromString("rwxr-xr-x"));
        }
        registryService.rescanNow();
    }

    private Path teamsDir() {
        return mountRoot.resolve(".jaystudio").resolve("teams");
    }

    private Path agentsDir() {
        return mountRoot.resolve(".claude").resolve("agents");
    }

    private Path configFile(String workflowName) {
        return teamsDir().resolve(workflowName + ".json");
    }

    private Path definitionFile(String agentName) {
        return agentsDir().resolve(agentName + ".md");
    }

    private String issuedBrowserToken() throws Exception {
        MvcResult result = mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                                        "/api/auth/browser-token")
                                .header("Origin", ALLOWED_ORIGIN))
                .andReturn();
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("token")
                .asString();
    }

    private void writeAgentDefinition(String name, String description) throws IOException {
        String content = "---\nname: " + name + "\ndescription: " + description + "\n---\n본문\n";
        Files.writeString(definitionFile(name), content, StandardCharsets.UTF_8);
    }

    /** name이 형식 오류(name 누락)를 갖도록 만든다 — FORMAT_ERROR rejected 사유 재현용. */
    private void writeFormatErrorAgentFile(String fileStem) throws IOException {
        Files.writeString(definitionFile(fileStem), "---\ndescription: name 없음\n---\n본문\n", StandardCharsets.UTF_8);
    }

    private MvcResult createWorkflow(String name) throws Exception {
        Map<String, String> body = new HashMap<>();
        body.put("name", name);
        return mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    private String memberInputsJson(List<Map<String, String>> members) throws Exception {
        return objectMapper.writeValueAsString(Map.of("members", members));
    }

    private static Map<String, String> memberInput(String name, String role) {
        Map<String, String> m = new HashMap<>();
        m.put("name", name);
        m.put("role", role);
        return m;
    }

    private MvcResult importMembers(String workflow, String bodyJson) throws Exception {
        return mockMvc.perform(post("/api/workflows/{workflow}/members", workflow)
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bodyJson))
                .andReturn();
    }

    @Test
    void importedMemberDefinitionFileBytesUnchangedAndConfigFileOnlyReflectsIt() throws Exception {
        // [FR-009-AC3] 가져온 뒤 정의 파일 바이트 동일, 구성 파일에만 반영
        writeAgentDefinition("agent-def-preserved", "설명입니다");
        byte[] originalDefinitionBytes = Files.readAllBytes(definitionFile("agent-def-preserved"));

        createWorkflow("정의보존팀");

        MvcResult result = importMembers(
                "정의보존팀", memberInputsJson(List.of(memberInput("agent-def-preserved", "member"))));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("added")).hasSize(1);
        assertThat(body.get("added").get(0).asString()).isEqualTo("agent-def-preserved");
        assertThat(body.get("rejected")).isEmpty();
        assertThat(body.get("workflow").get("members").get(0).asString()).isEqualTo("agent-def-preserved");

        byte[] afterDefinitionBytes = Files.readAllBytes(definitionFile("agent-def-preserved"));
        assertThat(afterDefinitionBytes).isEqualTo(originalDefinitionBytes);

        String configContent = Files.readString(configFile("정의보존팀"), StandardCharsets.UTF_8);
        assertThat(configContent).contains("agent-def-preserved");
    }

    @Test
    void leadRoleRejectedWhenWorkflowAlreadyHasLeadAndFileUnchanged() throws Exception {
        // [FR-009-AC4] 팀장 있는 워크플로우에 role lead → 409 LEAD_EXISTS, 파일 변경 없음
        writeAgentDefinition("lead-candidate-1", "");
        writeAgentDefinition("lead-candidate-2", "");
        createWorkflow("이미팀장있음팀");

        MvcResult firstImport = importMembers(
                "이미팀장있음팀", memberInputsJson(List.of(memberInput("lead-candidate-1", "lead"))));
        assertThat(firstImport.getResponse().getStatus()).isEqualTo(200);

        byte[] configBeforeConflict = Files.readAllBytes(configFile("이미팀장있음팀"));

        mockMvc.perform(post("/api/workflows/{workflow}/members", "이미팀장있음팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberInputsJson(List.of(memberInput("lead-candidate-2", "lead")))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LEAD_EXISTS"));

        byte[] configAfterConflict = Files.readAllBytes(configFile("이미팀장있음팀"));
        assertThat(configAfterConflict).isEqualTo(configBeforeConflict);
    }

    @Test
    void twoLeadsInSameRequestIsRejectedAsValidation() throws Exception {
        // [FR-009-E1] 팀장 2명 선택 → 400 fields.members
        writeAgentDefinition("lead-a", "");
        writeAgentDefinition("lead-b", "");
        createWorkflow("리드팀");

        mockMvc.perform(post("/api/workflows/{workflow}/members", "리드팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberInputsJson(List.of(
                                memberInput("lead-a", "lead"), memberInput("lead-b", "lead")))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.members").value("팀장은 1명만 선택할 수 있습니다"));

        assertThat(Files.exists(configFile("리드팀"))).isTrue();
        String content = Files.readString(configFile("리드팀"), StandardCharsets.UTF_8);
        assertThat(content).doesNotContain("lead-a").doesNotContain("lead-b");
    }

    @Test
    void memberAlreadyAssignedElsewhereIsRejectedButRestSucceed() throws Exception {
        // [FR-009-E2] 요청 중 한 명이 다른 워크플로우에 있음 → 200 added 1, rejected 1 ALREADY_ASSIGNED
        writeAgentDefinition("import-e2-target", "");
        writeAgentDefinition("import-e2-conflict", "");

        createWorkflow("가져오기e2다른팀");
        MvcResult setup = importMembers(
                "가져오기e2다른팀", memberInputsJson(List.of(memberInput("import-e2-conflict", "member"))));
        assertThat(setup.getResponse().getStatus()).isEqualTo(200);

        createWorkflow("import-e2-target팀");
        MvcResult result = importMembers(
                "import-e2-target팀",
                memberInputsJson(List.of(
                        memberInput("import-e2-target", "member"), memberInput("import-e2-conflict", "member"))));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("added")).hasSize(1);
        assertThat(body.get("added").get(0).asString()).isEqualTo("import-e2-target");
        assertThat(body.get("rejected")).hasSize(1);
        assertThat(body.get("rejected").get(0).get("name").asString()).isEqualTo("import-e2-conflict");
        assertThat(body.get("rejected").get(0).get("reason").asString()).isEqualTo("ALREADY_ASSIGNED");
    }

    @Test
    void writeFailureLeavesConfigFileOriginalUnchanged() throws Exception {
        // [FR-009-E3] 쓰기 실패 → 500, 구성 파일 원본 유지
        writeAgentDefinition("write-fail-target", "");
        createWorkflow("쓰기실패팀");
        byte[] originalConfigBytes = Files.readAllBytes(configFile("쓰기실패팀"));

        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("r-xr-xr-x"));

        mockMvc.perform(post("/api/workflows/{workflow}/members", "쓰기실패팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberInputsJson(List.of(memberInput("write-fail-target", "member")))))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("IO_FAILED"));

        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("rwxr-xr-x"));
        byte[] afterFailureBytes = Files.readAllBytes(configFile("쓰기실패팀"));
        assertThat(afterFailureBytes).isEqualTo(originalConfigBytes);
    }

    @Test
    void missingWorkflowReturns404() throws Exception {
        // 근거: api-spec POST /api/workflows/{workflow}/members 404 WORKFLOW_NOT_FOUND. ID 미지정, 태스크
        // 지시사항 "존재하지 않는 워크플로우 → api-spec의 404 응답"의 확인용.
        writeAgentDefinition("any-agent", "");

        mockMvc.perform(post("/api/workflows/{workflow}/members", "없는워크플로우")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberInputsJson(List.of(memberInput("any-agent", "member")))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WORKFLOW_NOT_FOUND"));
    }

    @Test
    void emptyMembersListIsRejectedAsValidation() throws Exception {
        // 근거: api-spec 400 VALIDATION 설명 "빈 목록". ID 미지정.
        createWorkflow("빈목록팀");

        mockMvc.perform(post("/api/workflows/{workflow}/members", "빈목록팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberInputsJson(List.of())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    void readOnlyMountRejectsImportWithReadOnlyCode() throws Exception {
        // 근거: architecture.md §5·D-003 — 모든 변경 API 공통 READ_ONLY 처리(assertWritable 먼저 호출).
        writeAgentDefinition("readonly-target", "");
        createWorkflow("읽기전용팀");

        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));
        registryService.rescanNow();

        mockMvc.perform(post("/api/workflows/{workflow}/members", "읽기전용팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(memberInputsJson(List.of(memberInput("readonly-target", "member")))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("READ_ONLY"));

        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
        registryService.rescanNow();
    }

    @Test
    void unknownAgentNameIsRejectedAsNotFound() throws Exception {
        // 근거: api-spec rejected.reason enum(NOT_FOUND). ID 미지정 — 팝업을 연 뒤 정의 파일이 삭제된 경우 재현.
        createWorkflow("존재안함팀");

        MvcResult result =
                importMembers("존재안함팀", memberInputsJson(List.of(memberInput("없는에이전트이름", "member"))));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("added")).isEmpty();
        assertThat(body.get("rejected")).hasSize(1);
        assertThat(body.get("rejected").get(0).get("reason").asString()).isEqualTo("NOT_FOUND");
    }

    @Test
    void formatErrorAgentNameIsRejectedAsFormatError() throws Exception {
        // 근거: api-spec rejected.reason enum(FORMAT_ERROR). ID 미지정 — 팝업을 연 뒤 정의 파일이 형식
        // 오류로 바뀐 경우 재현(같은 이름의 파일이 name 필드 없이 존재).
        writeFormatErrorAgentFile("형식오류에이전트");
        createWorkflow("형식오류팀");

        MvcResult result =
                importMembers("형식오류팀", memberInputsJson(List.of(memberInput("형식오류에이전트", "member"))));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("added")).isEmpty();
        assertThat(body.get("rejected")).hasSize(1);
        assertThat(body.get("rejected").get(0).get("reason").asString()).isEqualTo("FORMAT_ERROR");
    }
}
