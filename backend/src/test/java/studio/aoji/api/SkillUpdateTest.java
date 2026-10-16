package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
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
import studio.aoji.skills.SkillScanner;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.SkillApiClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code PUT /api/skills/{skill}} (T-R4-09, FR-020-AC3·AC4·AC6·E3·E4·E5). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillUpdateTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockitoSpyBean
    AtomicFileWriter atomicFileWriter;

    @MockitoSpyBean
    SkillScanner skillScanner;

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

    private Path skillFolder(String name) {
        return mountRoot.resolve(".claude").resolve("skills").resolve(name);
    }

    private Path skillFile(String name) {
        return skillFolder(name).resolve("SKILL.md");
    }

    private void writeSkill(String name, String content) throws IOException {
        Files.createDirectories(skillFolder(name));
        Files.write(skillFile(name), content.getBytes(StandardCharsets.UTF_8));
        // revision = mtime(ms)-size. 파일 시스템 시각 해상도에 기대지 않도록 작성 시각을 과거로 못박는다(D-166).
        Files.setLastModifiedTime(skillFile(name), FileTime.from(Instant.parse("2026-01-01T00:00:00Z")));
    }

    private String read(String name) throws IOException {
        return Files.readString(skillFile(name), StandardCharsets.UTF_8);
    }

    private Map<String, Object> request(
            String description, boolean userOnly, String body, String expectedRevision, Boolean force) {
        Map<String, Object> map = new HashMap<>();
        map.put("description", description);
        map.put("userOnly", userOnly);
        map.put("body", body);
        map.put("expectedRevision", expectedRevision);
        if (force != null) {
            map.put("force", force);
        }
        return map;
    }

    @Test
    @DisplayName("[FR-020-AC3] 폼에 없는 키(allowed-tools·model) 순서·값 보존, CRLF 본문 바이트 보존, 이름·다른 파일 불변")
    void unknownKeysBodyAndSiblingFilesArePreserved() throws Exception {
        String body = "첫 줄\r\n둘째 줄\r\n\r\n끝";
        writeSkill(
                "keep-me",
                "---\nname: keep-me\nallowed-tools: Read, Grep\ndescription: 원래 설명\nmodel: sonnet\n"
                        + "disable-model-invocation: true\n---\n" + body);
        Files.writeString(skillFolder("keep-me").resolve("notes.txt"), "참고 파일");
        byte[] siblingBefore = Files.readAllBytes(skillFolder("keep-me").resolve("notes.txt"));
        String revision = api.revisionOf("keep-me");

        MvcResult result = api.update("keep-me", request("바뀐 설명", true, body, revision, null));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(read("keep-me"))
                .isEqualTo("---\nname: keep-me\nallowed-tools: Read, Grep\ndescription: 바뀐 설명\nmodel: sonnet\n"
                        + "disable-model-invocation: true\n---\n" + body);
        assertThat(Files.readAllBytes(skillFolder("keep-me").resolve("notes.txt"))).isEqualTo(siblingBefore);
        JsonNode json = api.json(result);
        assertThat(json.get("name").asString()).isEqualTo("keep-me");
        assertThat(json.get("description").asString()).isEqualTo("바뀐 설명");
        assertThat(json.get("body").asString()).isEqualTo(body);
        assertThat(json.get("revision").asString()).isNotEqualTo(revision);
    }

    @Test
    @DisplayName("[FR-020-AC3] 본문을 바꿔도 frontmatter는 그대로, CRLF frontmatter 줄 끝 유지, 폼 값이 같으면 설명 줄 바이트 유지")
    void crlfFrontmatterAndUnchangedDescriptionKeepBytes() throws Exception {
        writeSkill("crlf-skill", "---\r\nname: crlf-skill\r\ndescription: '따옴표 설명'\r\nextra: 1\r\n---\r\n본문\r\n");
        String revision = api.revisionOf("crlf-skill");

        MvcResult same = api.update("crlf-skill", request("따옴표 설명", false, "새 본문\r\n", revision, null));
        assertThat(same.getResponse().getStatus()).isEqualTo(200);
        assertThat(read("crlf-skill"))
                .isEqualTo("---\r\nname: crlf-skill\r\ndescription: '따옴표 설명'\r\nextra: 1\r\n---\r\n새 본문\r\n");

        MvcResult changed = api.update(
                "crlf-skill", request("다른 설명", true, "새 본문\r\n", api.revisionOf("crlf-skill"), null));
        assertThat(changed.getResponse().getStatus()).isEqualTo(200);
        assertThat(read("crlf-skill"))
                .isEqualTo("---\r\nname: crlf-skill\r\ndescription: 다른 설명\r\ndisable-model-invocation: true\r\nextra: 1\r\n---\r\n새 본문\r\n");
    }

    @Test
    @DisplayName("[FR-020-AC3] 체크 끄기: 원본 true 줄 삭제, false 줄 유지, 이름 줄 불변")
    void turningOffUserOnlyDeletesTrueLineAndKeepsFalseLine() throws Exception {
        writeSkill("flag-true", "---\nname: flag-true\ndescription: d\ndisable-model-invocation: true\n---\nb\n");
        writeSkill("flag-false", "---\nname: flag-false\ndescription: d\ndisable-model-invocation: false\n---\nb\n");

        assertThat(api.update("flag-true", request("d", false, "b\n", api.revisionOf("flag-true"), null))
                        .getResponse()
                        .getStatus())
                .isEqualTo(200);
        assertThat(read("flag-true")).isEqualTo("---\nname: flag-true\ndescription: d\n---\nb\n");
        assertThat(api.json(api.detail("flag-true")).get("userOnly").asBoolean()).isFalse();

        assertThat(api.update("flag-false", request("d", false, "b\n", api.revisionOf("flag-false"), null))
                        .getResponse()
                        .getStatus())
                .isEqualTo(200);
        assertThat(read("flag-false"))
                .isEqualTo("---\nname: flag-false\ndescription: d\ndisable-model-invocation: false\n---\nb\n");

        // 켜기: false 줄을 true로 바꾼다.
        assertThat(api.update("flag-false", request("d", true, "b\n", api.revisionOf("flag-false"), null))
                        .getResponse()
                        .getStatus())
                .isEqualTo(200);
        assertThat(read("flag-false"))
                .isEqualTo("---\nname: flag-false\ndescription: d\ndisable-model-invocation: true\n---\nb\n");
    }

    @Test
    @DisplayName("[FR-020-AC3] 설명 빈 값 → 400 fields.description, 줄바꿈 → 400, 파일 불변")
    void invalidDescriptionIsRejected() throws Exception {
        writeSkill("valid-check", "---\nname: valid-check\ndescription: d\n---\nb\n");
        byte[] before = Files.readAllBytes(skillFile("valid-check"));
        String revision = api.revisionOf("valid-check");

        MvcResult blank = api.update("valid-check", request(" ", false, "b\n", revision, null));
        assertThat(blank.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(blank).get("fields").get("description").asString()).isEqualTo("필수");
        MvcResult nl = api.update("valid-check", request("a\nb", false, "b\n", revision, null));
        assertThat(nl.getResponse().getStatus()).isEqualTo(400);
        assertThat(Files.readAllBytes(skillFile("valid-check"))).isEqualTo(before);
    }

    @Test
    @DisplayName("[FR-020-AC4] revision 불일치 → 409 REVISION_CONFLICT(details.currentRevision·modifiedAt), 파일 불변")
    void staleRevisionIsRejected() throws Exception {
        writeSkill("conflict-skill", "---\nname: conflict-skill\ndescription: d\n---\nb\n");
        byte[] before = Files.readAllBytes(skillFile("conflict-skill"));
        String current = api.revisionOf("conflict-skill");

        MvcResult result = api.update("conflict-skill", request("내 설명", false, "b\n", "1-1", null));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("REVISION_CONFLICT");
        assertThat(body.get("details").get("currentRevision").asString()).isEqualTo(current);
        assertThat(body.get("details").get("modifiedAt").asString()).isNotBlank();
        assertThat(Files.readAllBytes(skillFile("conflict-skill"))).isEqualTo(before);
    }

    @Test
    @DisplayName("[FR-020-AC4] force=true는 revision이 달라도 덮어쓴다")
    void forceOverwritesDespiteStaleRevision() throws Exception {
        writeSkill("force-skill", "---\nname: force-skill\ndescription: d\n---\nb\n");

        MvcResult result = api.update("force-skill", request("강제 설명", false, "새 본문\n", "1-1", true));

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(read("force-skill")).isEqualTo("---\nname: force-skill\ndescription: 강제 설명\n---\n새 본문\n");
    }

    @Test
    @DisplayName("[FR-020-AC6] SOURCE.md가 있는 가져온 스킬 → 409 IMPORTED_SKILL, 파일 불변 (force여도)")
    void importedSkillCannotBeEdited() throws Exception {
        byte[] before = Files.readAllBytes(skillFile("imported-lint"));
        String revision = api.revisionOf("imported-lint");

        MvcResult result = api.update("imported-lint", request("바꾸기", false, "b", revision, true));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IMPORTED_SKILL");
        assertThat(body.get("message").asString()).isEqualTo("가져온 스킬은 수정할 수 없습니다");
        assertThat(Files.readAllBytes(skillFile("imported-lint"))).isEqualTo(before);
    }

    @Test
    @DisplayName("[FR-020-E4] 저장 직전 SKILL.md 삭제 → 409 FILE_GONE '저장 중 파일이 사라졌습니다'")
    void fileDeletedBeforeSaveIsFileGone() throws Exception {
        writeSkill("vanishing", "---\nname: vanishing\ndescription: d\n---\nb\n");
        String revision = api.revisionOf("vanishing");
        doAnswer(inv -> {
                    Object result = inv.callRealMethod();
                    Files.delete(skillFile("vanishing"));
                    return result;
                })
                .when(skillScanner)
                .find(any(), org.mockito.ArgumentMatchers.eq("vanishing"));

        MvcResult result = api.update("vanishing", request("바꾸기", false, "b\n", revision, null));

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("FILE_GONE");
        assertThat(body.get("message").asString()).isEqualTo("저장 중 파일이 사라졌습니다");
        assertThat(Files.exists(skillFile("vanishing"))).isFalse();
    }

    @Test
    @DisplayName("[FR-020-E5] 형식 오류 SKILL.md → 409 UNEDITABLE '에디터에서 SKILL.md를 고치세요', 파일 불변")
    void formatErrorSkillIsUneditable() throws Exception {
        for (String name : new String[] {"bad-yaml", "no-delimiter", "name-mismatch", "bad-utf8"}) {
            byte[] before = Files.readAllBytes(skillFile(name));
            MvcResult result = api.update(name, request("바꾸기", false, "b", "x", true));
            assertThat(result.getResponse().getStatus()).as(name).isEqualTo(409);
            JsonNode body = api.json(result);
            assertThat(body.get("code").asString()).isEqualTo("UNEDITABLE");
            assertThat(body.get("message").asString()).isEqualTo("에디터에서 SKILL.md를 고치세요");
            assertThat(Files.readAllBytes(skillFile(name))).as(name).isEqualTo(before);
        }
    }

    @Test
    @DisplayName("[FR-020-E3] 수정 쓰기 실패 → 500 IO_FAILED(ADR-91 문구), 원본 바이트 그대로, 임시 파일 없음")
    void writeFailureKeepsOriginalBytes() throws Exception {
        writeSkill("fail-update", "---\nname: fail-update\ndescription: d\nx: 1\n---\n본문\r\n");
        byte[] before = Files.readAllBytes(skillFile("fail-update"));
        String revision = api.revisionOf("fail-update");
        doThrow(new IOException("주입된 실패")).when(atomicFileWriter).write(any(), any());

        MvcResult result = api.update("fail-update", request("바꾸기", true, "새\n", revision, null));

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");
        assertThat(body.get("message").asString())
                .isEqualTo("SKILL.md를 바꾸지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 원래 파일은 그대로입니다.");
        assertThat(Files.readAllBytes(skillFile("fail-update"))).isEqualTo(before);
        try (var stream = Files.list(skillFolder("fail-update"))) {
            assertThat(stream.map(p -> p.getFileName().toString()).toList()).containsExactly("SKILL.md");
        }
    }

    @Test
    @DisplayName("[FR-020-AC3][D-164] PUT body 누락(null·키 없음) → 400 VALIDATION fields.body '필수', 파일 불변. 빈 문자열 body는 허용")
    void missingBodyIsRejected() throws Exception {
        writeSkill("body-required", "---\nname: body-required\ndescription: d\n---\n본문\n");
        byte[] before = Files.readAllBytes(skillFile("body-required"));
        String revision = api.revisionOf("body-required");

        Map<String, Object> withNull = request("바꾸기", false, null, revision, null);
        MvcResult nullBody = api.update("body-required", withNull);
        assertThat(nullBody.getResponse().getStatus()).isEqualTo(400);
        JsonNode json = api.json(nullBody);
        assertThat(json.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(json.get("fields").get("body").asString()).isEqualTo("필수");

        Map<String, Object> withoutKey = request("바꾸기", false, "x", revision, null);
        withoutKey.remove("body");
        MvcResult noKey = api.update("body-required", withoutKey);
        assertThat(noKey.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(noKey).get("fields").get("body").asString()).isEqualTo("필수");

        // 설명도 틀리면 필드별로 함께 알린다.
        MvcResult both = api.update("body-required", request(" ", false, null, revision, null));
        assertThat(api.json(both).get("fields").get("description").asString()).isEqualTo("필수");
        assertThat(api.json(both).get("fields").get("body").asString()).isEqualTo("필수");
        assertThat(Files.readAllBytes(skillFile("body-required"))).isEqualTo(before);

        MvcResult emptyBody = api.update("body-required", request("바꾸기", false, "", revision, null));
        assertThat(emptyBody.getResponse().getStatus()).isEqualTo(200);
        assertThat(read("body-required")).endsWith("---\n");
    }

    @Test
    @DisplayName("[FR-020-E5][FR-020-AC6][D-164] 틀린 expectedRevision(force=false)이어도 UNEDITABLE·IMPORTED_SKILL이 REVISION_CONFLICT보다 먼저")
    void formatAndImportedChecksPrecedeRevisionConflict() throws Exception {
        for (String name : new String[] {"bad-yaml", "no-delimiter", "name-mismatch", "bad-utf8"}) {
            byte[] before = Files.readAllBytes(skillFile(name));
            MvcResult result = api.update(name, request("바꾸기", false, "b", "0-0", false));
            assertThat(result.getResponse().getStatus()).as(name).isEqualTo(409);
            assertThat(api.json(result).get("code").asString()).as(name).isEqualTo("UNEDITABLE");
            assertThat(Files.readAllBytes(skillFile(name))).as(name).isEqualTo(before);
        }
        byte[] imported = Files.readAllBytes(skillFile("imported-lint"));
        MvcResult importedResult = api.update("imported-lint", request("바꾸기", false, "b", "0-0", false));
        assertThat(importedResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(api.json(importedResult).get("code").asString()).isEqualTo("IMPORTED_SKILL");
        assertThat(Files.readAllBytes(skillFile("imported-lint"))).isEqualTo(imported);

        // 대조: 정상 스킬은 같은 틀린 revision에서 REVISION_CONFLICT.
        writeSkill("normal-skill", "---\nname: normal-skill\ndescription: d\n---\n");
        MvcResult conflict = api.update("normal-skill", request("바꾸기", false, "b", "0-0", false));
        assertThat(api.json(conflict).get("code").asString()).isEqualTo("REVISION_CONFLICT");
    }

    @Test
    @DisplayName("[FR-020-AC3] 없는 스킬 → 404 SKILL_NOT_FOUND")
    void missingSkillIsNotFound() throws Exception {
        MvcResult result = api.update("does-not-exist", request("d", false, "b", "x", null));
        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(api.json(result).get("code").asString()).isEqualTo("SKILL_NOT_FOUND");
    }
}
