package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
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
 * 워크플로우 추가·삭제 (api-spec {@code POST /api/workflows}, {@code DELETE
 * /api/workflows/{workflow}}, FR-001-AC6, FR-008, FR-017, tasks.md T-008 Done when).
 *
 * <p>테스트는 클래스 하나가 Spring 컨텍스트·마운트 임시 폴더를 공유한다(다른 컨트롤러 통합 테스트와
 * 같은 패턴). {@link Order}로 "읽기 API만으로는 teams/ 디렉터리를 만들지 않는다"를 어떤 쓰기 API
 * 호출보다 먼저 실행되도록 고정한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class WorkflowControllerTest {

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

    private Path trashDir() {
        return mountRoot.resolve(".jaystudio").resolve("trash");
    }

    private String issuedBrowserToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/browser-token").header("Origin", ALLOWED_ORIGIN))
                .andReturn();
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("token")
                .asString();
    }

    private MvcResult createWorkflow(String name, String description) throws Exception {
        String token = issuedBrowserToken();
        Map<String, String> body = new HashMap<>();
        body.put("name", name);
        if (description != null) {
            body.put("description", description);
        }
        return mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    private void writeRawTeamFile(String name, String leadOrNull, String membersJsonArray) throws IOException {
        Files.createDirectories(teamsDir());
        String lead = leadOrNull == null ? "null" : "\"" + leadOrNull + "\"";
        String json =
                """
                {"schemaVersion":1,"name":"%s","description":"","lead":%s,"members":%s}"""
                        .formatted(name, lead, membersJsonArray);
        Files.writeString(teamsDir().resolve(name + ".json"), json, StandardCharsets.UTF_8);
    }

    @Test
    @Order(1)
    void readOnlyApisDoNotCreateTeamsOrTrashDirectories() throws Exception {
        // [FR-001-AC6] 읽기 API만 호출하면 teams/·trash/ 생성 안 됨
        mockMvc.perform(get("/api/state").header("Origin", ALLOWED_ORIGIN)).andExpect(status().isOk());

        assertThat(Files.exists(teamsDir())).isFalse();
        assertThat(Files.exists(trashDir())).isFalse();
    }

    @Test
    @Order(2)
    void firstPostCreatesTeamsDirectory() throws Exception {
        // [FR-001-AC6] .jaystudio/teams 없음 → POST 시 생성
        assertThat(Files.exists(teamsDir())).isFalse();

        MvcResult result = createWorkflow("첫워크플로우", "첫 설명");

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        assertThat(Files.isDirectory(teamsDir())).isTrue();
        assertThat(Files.exists(teamsDir().resolve("첫워크플로우.json"))).isTrue();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("name").asString()).isEqualTo("첫워크플로우");
        assertThat(body.get("description").asString()).isEqualTo("첫 설명");
        assertThat(body.get("lead").isNull()).isTrue();
        assertThat(body.get("members")).isEmpty();
        assertThat(body.get("rawMemberCount").asInt()).isZero();
    }

    @Test
    @Order(10)
    void duplicateNameIsRejectedWithFieldReason() throws Exception {
        // [FR-008-AC1][FR-008-E1] '개발부서' 있을 때 '개발부서' → 400 fields.name
        createWorkflow("개발부서", "설명");

        mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "개발부서"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.name").value("이미 있는 이름입니다"));
    }

    @Test
    @Order(11)
    void duplicateNameIsCaseInsensitive() throws Exception {
        // [FR-008-AC1] 'Dev'와 'dev' 중복
        createWorkflow("Dev", "설명");

        mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "dev"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.name").value("이미 있는 이름입니다"));
    }

    @Test
    @Order(12)
    void thirtyFirstWorkflowStillSucceeds() throws Exception {
        // [FR-008-AC1] 워크플로우 개수 제한 없음 · 31개째 추가 성공
        MvcResult last = null;
        for (int i = 1; i <= 31; i++) {
            last = createWorkflow("제한없음" + i, "");
        }
        assertThat(last).isNotNull();
        assertThat(last.getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    @Order(13)
    void invalidCharacterInNameIsRejected() throws Exception {
        // [FR-008-AC2][FR-008-E2] '개발/부서' → 400 fields.name 사유
        mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "개발/부서"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"))
                .andExpect(jsonPath("$.fields.name").value("1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만"));
    }

    @Test
    @Order(14)
    void writeFailureInTeamsDirLeavesNoFile() throws Exception {
        // [FR-008-E3] teams 폴더 쓰기 불가 → 500 IO_FAILED, 파일 없음
        createWorkflow("쓰기실패준비", ""); // teams 디렉터리를 먼저 만들어 둔다.
        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("r-xr-xr-x"));

        mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "쓰기실패대상"))))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("IO_FAILED"));

        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThat(Files.exists(teamsDir().resolve("쓰기실패대상.json"))).isFalse();
    }

    @Test
    @Order(20)
    void deleteWithOnlyBrokenReferenceIsRejectedAsNotEmpty() throws Exception {
        // [FR-017-AC1] rawMemberCount 1(깨진 참조만) → 409 WORKFLOW_NOT_EMPTY
        writeRawTeamFile("깨진참조팀", "없는에이전트", "[]");
        registryService.rescanNow();

        mockMvc.perform(delete("/api/workflows/{workflow}", "깨진참조팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WORKFLOW_NOT_EMPTY"));

        assertThat(Files.exists(teamsDir().resolve("깨진참조팀.json"))).isTrue();
    }

    @Test
    @Order(21)
    void deleteWithZeroMembersSucceeds() throws Exception {
        // [FR-017-AC1] 0 → 204, [FR-017-AC4] 삭제 후 파일 없음, trash에 없음, registry.workflows에서 빠짐
        createWorkflow("삭제대상빈팀", "");

        mockMvc.perform(delete("/api/workflows/{workflow}", "삭제대상빈팀")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken()))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        assertThat(Files.exists(teamsDir().resolve("삭제대상빈팀.json"))).isFalse();
        assertThat(Files.exists(trashDir().resolve("삭제대상빈팀.json"))).isFalse();

        MvcResult state = mockMvc.perform(get("/api/state").header("Origin", ALLOWED_ORIGIN)).andReturn();
        JsonNode body = objectMapper.readTree(state.getResponse().getContentAsString());
        boolean stillPresent = false;
        for (JsonNode workflow : body.get("registry").get("workflows")) {
            if ("삭제대상빈팀".equals(workflow.get("name").asString())) {
                stillPresent = true;
            }
        }
        assertThat(stillPresent).isFalse();
    }

    @Test
    @Order(22)
    void memberAddedBetweenConfirmationAndDeleteIsRejected() throws Exception {
        // [FR-017-E1] 확인 사이에 팀원이 추가됨 → 409, message '팀원이 있어 삭제할 수 없습니다'
        createWorkflow("삭제확인중", "");
        // 사용자가 확인 창을 보는 사이 다른 탭이 팀장을 추가한 상황을 파일을 직접 바꿔 흉내낸다.
        writeRawTeamFile("삭제확인중", "새로생긴팀장", "[]");

        mockMvc.perform(delete("/api/workflows/{workflow}", "삭제확인중")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WORKFLOW_NOT_EMPTY"))
                .andExpect(jsonPath("$.message").value("팀원이 있어 삭제할 수 없습니다"));

        assertThat(Files.exists(teamsDir().resolve("삭제확인중.json"))).isTrue();
    }

    @Test
    @Order(23)
    void deletePermissionDeniedLeavesFileInPlace() throws Exception {
        // [FR-017-E2] 삭제 권한 없음 → 500 IO_FAILED, 구성 파일 유지
        createWorkflow("삭제권한없음", "");
        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("r-xr-xr-x"));

        mockMvc.perform(delete("/api/workflows/{workflow}", "삭제권한없음")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("IO_FAILED"));

        Files.setPosixFilePermissions(teamsDir(), PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThat(Files.exists(teamsDir().resolve("삭제권한없음.json"))).isTrue();
    }

    @Test
    @Order(24)
    void deleteMissingWorkflowIsNotFound() throws Exception {
        mockMvc.perform(delete("/api/workflows/{workflow}", "없는워크플로우")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WORKFLOW_NOT_FOUND"));
    }

    @Test
    @Order(30)
    void readOnlyMountRejectsCreateWithReadOnlyCode() throws Exception {
        // [FR-001-E2] writable false → POST 403 READ_ONLY
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));
        registryService.rescanNow();

        mockMvc.perform(post("/api/workflows")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("X-JayStudio-Browser-Token", issuedBrowserToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "읽기전용시도"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("READ_ONLY"));

        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
        registryService.rescanNow();
    }
}
