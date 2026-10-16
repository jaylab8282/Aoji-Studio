package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.registry.RegistryService;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.SkillApiClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code POST /api/skills} (T-R4-09, FR-020-AC1·AC2·E1·E2·E3). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillCreateTest {

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

    @MockitoSpyBean
    AtomicFileWriter atomicFileWriter;

    SkillApiClient api;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-skills", mountRoot);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
    }

    @BeforeEach
    void setUp() {
        api = new SkillApiClient(mockMvc, objectMapper);
    }

    private static Map<String, Object> request(String name, String description, boolean userOnly, String body) {
        Map<String, Object> map = new HashMap<>();
        map.put("name", name);
        map.put("description", description);
        map.put("userOnly", userOnly);
        map.put("body", body);
        return map;
    }

    private Path skillsDir() {
        return mountRoot.resolve(".claude").resolve("skills");
    }

    @Test
    @DisplayName("[FR-020-AC1] 규칙 위반 이름 → 400 fields.name, 폴더 없음")
    void invalidNameIsRejected() throws Exception {
        for (String bad : new String[] {"Bad_Name", "", "a".repeat(65), "한글", "../x"}) {
            MvcResult result = api.create(request(bad, "설명", false, ""));
            assertThat(result.getResponse().getStatus()).as(bad).isEqualTo(400);
            JsonNode body = api.json(result);
            assertThat(body.get("code").asString()).isEqualTo("VALIDATION");
            assertThat(body.get("fields").get("name").asString()).isEqualTo("소문자·숫자·하이픈만, 1~64자");
        }
        assertThat(Files.exists(skillsDir().resolve("Bad_Name"))).isFalse();
        assertThat(Files.exists(mountRoot.resolve(".claude").resolve("x"))).isFalse();
    }

    @Test
    @DisplayName("[FR-020-AC1] 기존 이름(정상 스킬·형식 오류 폴더 포함) → 400 fields.name '이미 있는 이름입니다', 파일 불변")
    void existingNameIsRejectedIncludingFormatErrorFolders() throws Exception {
        byte[] before = Files.readAllBytes(skillsDir().resolve("bad-yaml").resolve("SKILL.md"));
        for (String existing : new String[] {"design-review", "bad-yaml", "bad-utf8", "name-mismatch", "imported-lint"}) {
            MvcResult result = api.create(request(existing, "새 설명", false, "본문"));
            assertThat(result.getResponse().getStatus()).as(existing).isEqualTo(400);
            assertThat(api.json(result).get("fields").get("name").asString()).isEqualTo("이미 있는 이름입니다");
        }
        assertThat(Files.readAllBytes(skillsDir().resolve("bad-yaml").resolve("SKILL.md"))).isEqualTo(before);
        assertThat(Files.readString(skillsDir().resolve("design-review").resolve("SKILL.md")))
                .doesNotContain("새 설명");
    }

    @Test
    @DisplayName("[FR-020-AC2] 201, frontmatter 순서 name→description→disable-model-invocation: true, 본문, 응답 SkillDetail")
    void createWritesFrontmatterInOrderAndBody() throws Exception {
        MvcResult result = api.create(request("fresh-skill", "새 스킬 설명", true, "# 제목\r\n본문 줄\n"));

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        String content = Files.readString(skillsDir().resolve("fresh-skill").resolve("SKILL.md"), StandardCharsets.UTF_8);
        assertThat(content)
                .isEqualTo("---\nname: fresh-skill\ndescription: 새 스킬 설명\ndisable-model-invocation: true\n---\n# 제목\r\n본문 줄\n");
        JsonNode body = api.json(result);
        assertThat(body.get("name").asString()).isEqualTo("fresh-skill");
        assertThat(body.get("userOnly").asBoolean()).isTrue();
        assertThat(body.get("body").asString()).isEqualTo("# 제목\r\n본문 줄\n");
        assertThat(body.get("filePath").asString()).isEqualTo(".claude/skills/fresh-skill/SKILL.md");
        assertThat(body.get("imported").asBoolean()).isFalse();
        assertThat(registryService.skillNames()).contains("fresh-skill");
        // 임시 폴더가 남지 않는다.
        assertThat(tmpFolders()).isEmpty();
    }

    @Test
    @DisplayName("[FR-020-AC2] userOnly=false → disable-model-invocation 줄 없음, 특수 문자 설명은 따옴표로 쓰고 다시 읽으면 같은 값")
    void createWithoutUserOnlyOmitsLineAndQuotesSpecialDescription() throws Exception {
        String description = "항목: 값 # 주석처럼 보임";
        MvcResult result = api.create(request("plain-skill", description, false, ""));

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        String content = Files.readString(skillsDir().resolve("plain-skill").resolve("SKILL.md"), StandardCharsets.UTF_8);
        assertThat(content).doesNotContain("disable-model-invocation");
        JsonNode detail = api.json(api.detail("plain-skill"));
        assertThat(detail.get("description").asString()).isEqualTo(description);
        assertThat(detail.get("userOnly").asBoolean()).isFalse();
    }

    @Test
    @DisplayName("[FR-020-E1] 설명 빈 값 → 400 fields.description '필수', 줄바꿈 → '줄바꿈을 포함할 수 없습니다', 폴더 없음")
    void descriptionBlankOrWithLineBreakIsRejected() throws Exception {
        MvcResult blank = api.create(request("no-desc", "   ", false, ""));
        assertThat(blank.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(blank).get("fields").get("description").asString()).isEqualTo("필수");

        MvcResult nl = api.create(request("with-nl", "첫 줄\n둘째 줄", false, ""));
        assertThat(nl.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(nl).get("fields").get("description").asString()).isEqualTo("줄바꿈을 포함할 수 없습니다");

        assertThat(Files.exists(skillsDir().resolve("no-desc"))).isFalse();
        assertThat(Files.exists(skillsDir().resolve("with-nl"))).isFalse();
    }

    @Test
    @DisplayName("[FR-020-E2] 읽기 전용 마운트 → 403 READ_ONLY, 폴더 없음")
    void readOnlyMountIsRejected() throws Exception {
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));
        registryService.rescanNow();
        try {
            MvcResult result = api.create(request("ro-skill", "설명", false, ""));
            assertThat(result.getResponse().getStatus()).isEqualTo(403);
            assertThat(api.json(result).get("code").asString()).isEqualTo("READ_ONLY");
        } finally {
            Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
            registryService.rescanNow();
        }
        assertThat(Files.exists(skillsDir().resolve("ro-skill"))).isFalse();
    }

    @Test
    @DisplayName("[FR-020-E3] 쓰기 실패 주입 → 500 IO_FAILED(ADR-91 문구), 임시 폴더 없음·스킬 폴더 없음")
    void writeFailureLeavesNothingBehind() throws Exception {
        doThrow(new IOException("주입된 실패")).when(atomicFileWriter).write(any(), any());

        MvcResult result = api.create(request("doomed-skill", "설명", false, "본문"));

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");
        assertThat(body.get("message").asString())
                .isEqualTo("스킬 폴더를 만들지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.");
        assertThat(body.toString()).doesNotContain("주입된 실패");
        assertThat(Files.exists(skillsDir().resolve("doomed-skill"))).isFalse();
        assertThat(tmpFolders()).isEmpty();
        assertThat(registryService.skillNames()).doesNotContain("doomed-skill");
    }

    private List<String> tmpFolders() throws IOException {
        try (Stream<Path> stream = Files.list(skillsDir())) {
            return stream.map(p -> p.getFileName().toString())
                    .filter(n -> n.startsWith(".") && n.endsWith(".tmp"))
                    .toList();
        }
    }
}
