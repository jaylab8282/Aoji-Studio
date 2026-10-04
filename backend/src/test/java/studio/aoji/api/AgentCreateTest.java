package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
 * 에이전트 만들기 (api-spec {@code POST /api/agents}, FR-010, tasks.md T-010 Done when).
 *
 * <p>{@link studio.aoji.api.WorkflowControllerTest}·{@link studio.aoji.api.ImportMembersTest}와 같은
 * 패턴: 클래스 하나가 Spring 컨텍스트·마운트 임시 폴더를 공유하고, 각 테스트는 서로 다른 이름의
 * 워크플로우·에이전트를 써서 간섭을 피한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AgentCreateTest {

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
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/JayStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
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

    private Path agentsDir() {
        return mountRoot.resolve(".claude").resolve("agents");
    }

    private Path teamsDir() {
        return mountRoot.resolve(".aojistudio").resolve("teams");
    }

    private Path definitionFile(String name) {
        return agentsDir().resolve(name + ".md");
    }

    private String issuedBrowserToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/browser-token").header("Origin", ALLOWED_ORIGIN))
                .andReturn();
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("token")
                .asString();
    }

    private void createWorkflow(String name) throws Exception {
        mockMvc.perform(post("/api/workflows")
                .header("Origin", ALLOWED_ORIGIN)
                .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", name))));
    }

    private void writeFormatErrorAgentFile(String fileStem) throws IOException {
        Files.writeString(
                definitionFile(fileStem), "---\ndescription: name 없음\n---\n본문\n", StandardCharsets.UTF_8);
    }

    private Map<String, Object> baseRequest(String name, String workflow) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("description", "설명입니다");
        body.put("workflow", workflow);
        body.put("role", "member");
        body.put("toolsMode", "inherit");
        return body;
    }

    private MvcResult create(Map<String, Object> body) throws Exception {
        return mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    @Test
    void invalidNameFormatIsRejected() throws Exception {
        // [FR-010-AC1] name 규칙 위반 → 400
        createWorkflow("이름규칙팀");
        Map<String, Object> body = baseRequest("Invalid_Name", "이름규칙팀");

        mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.name").exists());
    }

    @Test
    void duplicateWithValidAgentIsRejected() throws Exception {
        // [FR-010-AC1] 정상 파일과 중복 → 400
        createWorkflow("정상중복팀");
        MvcResult first = create(baseRequest("dup-valid-agent", "정상중복팀"));
        assertThat(first.getResponse().getStatus()).isEqualTo(201);

        MvcResult second = create(baseRequest("dup-valid-agent", "정상중복팀"));
        assertThat(second.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(second.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(body.get("fields").get("name").asString()).isEqualTo("이미 있는 name입니다");
    }

    @Test
    void duplicateWithFormatErrorFileNameIsRejected() throws Exception {
        // [FR-010-AC1] 형식 오류 파일명과 중복 → 400
        createWorkflow("형식오류중복팀");
        writeFormatErrorAgentFile("dup-format-error-agent");
        registryService.rescanNow();

        MvcResult result = create(baseRequest("dup-format-error-agent", "형식오류중복팀"));

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("fields").get("name").asString()).isEqualTo("이미 있는 name입니다");
    }

    @Test
    void inheritToolsModeOmitsToolsLine() throws Exception {
        // [FR-010-AC2] toolsMode inherit → frontmatter에 tools 없음
        createWorkflow("상속팀");
        Map<String, Object> body = baseRequest("inherit-tools-agent", "상속팀");
        body.put("toolsMode", "inherit");

        MvcResult result = create(body);
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        String content = Files.readString(definitionFile("inherit-tools-agent"), StandardCharsets.UTF_8);
        assertThat(content).doesNotContain("tools:");
    }

    @Test
    void explicitToolsAreJoinedWithCommaSpace() throws Exception {
        // [FR-010-AC2] explicit ['Read','Grep'] → 'tools: Read, Grep'
        createWorkflow("직접선택팀");
        Map<String, Object> body = baseRequest("explicit-tools-agent", "직접선택팀");
        body.put("toolsMode", "explicit");
        body.put("tools", List.of("Read", "Grep"));

        MvcResult result = create(body);
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        String content = Files.readString(definitionFile("explicit-tools-agent"), StandardCharsets.UTF_8);
        assertThat(content).contains("tools: Read, Grep");
    }

    @Test
    void explicitToolsModeWithZeroToolsIsRejected() throws Exception {
        // [FR-010-AC2] 직접 선택 0개 → 400 fields.tools
        createWorkflow("빈도구팀");
        Map<String, Object> body = baseRequest("empty-tools-agent", "빈도구팀");
        body.put("toolsMode", "explicit");
        body.put("tools", List.of());

        mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.tools").value("직접 선택은 1개 이상"));
    }

    @Test
    void savedFileMatchesTemplateOrderWithToolsAndModel() throws Exception {
        // [FR-010-AC5] 저장 파일 = '---\nname\ndescription\n[tools]\n[model]\n---\n본문'
        createWorkflow("템플릿팀");
        Map<String, Object> body = baseRequest("template-agent", "템플릿팀");
        body.put("toolsMode", "explicit");
        body.put("tools", List.of("Bash"));
        body.put("model", "opus");
        body.put("body", "본문 내용입니다\n");

        MvcResult result = create(body);
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        String content = Files.readString(definitionFile("template-agent"), StandardCharsets.UTF_8);
        assertThat(content)
                .isEqualTo(
                        "---\nname: template-agent\ndescription: 설명입니다\ntools: Bash\nmodel: opus\n---\n본문 내용입니다\n");
    }

    @Test
    void nullModelOmitsModelLine() throws Exception {
        // [FR-010-AC5] model null → model 줄 없음
        createWorkflow("모델없음팀");
        Map<String, Object> body = baseRequest("no-model-agent", "모델없음팀");

        MvcResult result = create(body);
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        String content = Files.readString(definitionFile("no-model-agent"), StandardCharsets.UTF_8);
        assertThat(content).doesNotContain("model:");
    }

    @Test
    void configWriteFailureRollsBackDefinitionFile() throws Exception {
        // [FR-010-AC7][FR-010-E3] 구성 파일 쓰기 실패 주입 → 정의 파일 삭제됨, 500
        createWorkflow("쓰기실패롤백팀");
        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("r-xr-xr-x"));

        MvcResult result = create(baseRequest("rollback-agent", "쓰기실패롤백팀"));

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");

        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThat(Files.exists(definitionFile("rollback-agent"))).isFalse();
    }

    @Test
    void blankDescriptionIsRejected() throws Exception {
        // [FR-010-E1] description 빈값 → 400 fields
        createWorkflow("빈설명팀");
        Map<String, Object> body = baseRequest("blank-description-agent", "빈설명팀");
        body.put("description", "");

        mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.description").exists());
    }

    @Test
    void missingWorkflowIsRejected() throws Exception {
        // [FR-010-E1] workflow 없음 → 400 fields
        Map<String, Object> body = baseRequest("missing-workflow-agent", null);

        mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.workflow").exists());
    }

    @Test
    void readOnlyMountRejectsCreateWithReadOnlyCode() throws Exception {
        // [FR-010-E2] writable false → 403 READ_ONLY
        createWorkflow("읽기전용에이전트팀");
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));
        registryService.rescanNow();

        mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(baseRequest("readonly-agent", "읽기전용에이전트팀"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("READ_ONLY"));

        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
        registryService.rescanNow();
    }

    @Test
    void descriptionWithEmbeddedLineBreakIsRejected() throws Exception {
        // 리뷰(T-010 round 1) 비차단 제안: description에 개행이 있으면 frontmatter 줄 단위 편집이
        // 깨질 수 있어 400으로 거부한다(AgentDefinitionWriter는 알려진 키를 한 줄로 쓴다, ADR-07).
        createWorkflow("개행거부생성팀");
        Map<String, Object> body = baseRequest("linebreak-create-agent", "개행거부생성팀");
        body.put("description", "첫줄\n둘째줄");

        mockMvc.perform(post("/api/agents")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-AojiStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.description").exists());
    }
}
