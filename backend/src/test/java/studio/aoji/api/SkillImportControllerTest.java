package studio.aoji.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.registry.RegistryService;
import studio.aoji.skills.SkillWriter;
import studio.aoji.support.FixtureFiles;
import studio.aoji.support.SkillApiClient;
import studio.aoji.support.ZipBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** {@code POST /api/skills/import/preview}·{@code POST /api/skills/import} (T-R4-10, FR-021). */
@SpringBootTest
@AutoConfigureMockMvc
class SkillImportControllerTest {

    @TempDir
    static Path mountRoot;

    @TempDir
    static Path dataDir;

    @TempDir
    Path work;

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    RegistryService registryService;

    @MockitoSpyBean
    AtomicFileWriter atomicFileWriter;

    @MockitoSpyBean
    SkillWriter skillWriter;

    SkillApiClient api;

    private static final String SKILL_MD = "---\nname: %s\ndescription: 가져온 설명\n---\n본문\n";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) throws IOException {
        FixtureFiles.copyInto("project-skills", mountRoot);
        registry.add("aojistudio.host-path", () -> "/Users/jaybee/Desktop/AojiStudio");
        registry.add("aojistudio.public-port", () -> "4180");
        registry.add("aojistudio.mount-path", () -> mountRoot.toString());
        registry.add("aojistudio.data-path", () -> dataDir.toString());
    }

    @BeforeEach
    void setUp() throws IOException {
        api = new SkillApiClient(mockMvc, objectMapper);
        // 정적 임시 폴더를 테스트끼리 공유하므로 이전 테스트가 남긴 업로드는 비운다.
        if (Files.exists(importRoot())) {
            try (Stream<Path> s = Files.list(importRoot())) {
                for (Path p : s.toList()) {
                    try (Stream<Path> walk = Files.walk(p)) {
                        walk.sorted(java.util.Comparator.reverseOrder()).forEach(q -> q.toFile().delete());
                    }
                }
            }
        }
    }

    private Path skillsDir() {
        return mountRoot.resolve(".claude").resolve("skills");
    }

    private Path importRoot() {
        return dataDir.resolve("skill-import");
    }

    private byte[] zipWith(String name, String skillName) throws Exception {
        Path zip = work.resolve(name + ".zip");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file(name + "/SKILL.md", SKILL_MD.formatted(skillName))
                    .file(name + "/scripts/run.sh", "#!/bin/sh\necho hi\n", 0755)
                    .file(name + "/ref.md", "참고");
        }
        return Files.readAllBytes(zip);
    }

    private List<String> importRootEntries() throws IOException {
        if (!Files.exists(importRoot())) {
            return List.of();
        }
        try (Stream<Path> s = Files.list(importRoot())) {
            return s.map(p -> p.getFileName().toString()).toList();
        }
    }

    private List<String> tmpFoldersInSkills() throws IOException {
        try (Stream<Path> s = Files.list(skillsDir())) {
            return s.map(p -> p.getFileName().toString()).filter(n -> n.startsWith(".")).toList();
        }
    }

    private Map<String, Object> importBody(String uploadId, String source, String version, String license) {
        Map<String, Object> map = new HashMap<>();
        map.put("uploadId", uploadId);
        map.put("source", source);
        map.put("version", version);
        map.put("license", license);
        return map;
    }

    private String previewOk(byte[] zip) throws Exception {
        MvcResult result = api.preview(zip);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return api.json(result).get("uploadId").asString();
    }

    // ------------------------------------------------------------------ 토큰·Origin

    @Test
    @DisplayName("[FR-021-AC4] 브라우저 토큰 없음·틀림 → 403 UNAUTHORIZED_TOKEN, 다른 Origin → 403 FORBIDDEN_ORIGIN (미리보기·가져오기 모두), 아무것도 안 씀")
    void tokenAndOriginAreRequired() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "s.zip", "application/zip", zipWith("guard", "guard"));
        for (String token : new String[] {null, "wrong"}) {
            var preview = multipart("/api/skills/import/preview").file(file).header("Origin", SkillApiClient.ORIGIN);
            var imp = post("/api/skills/import")
                    .header("Origin", SkillApiClient.ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"uploadId\":\"x\",\"source\":\"s\",\"license\":\"MIT\"}");
            if (token != null) {
                preview.header("X-AojiStudio-Browser-Token", token);
                imp.header("X-AojiStudio-Browser-Token", token);
            }
            for (var request : List.of(preview, imp)) {
                MvcResult result = mockMvc.perform(request).andReturn();
                assertThat(result.getResponse().getStatus()).isEqualTo(403);
                assertThat(api.json(result).get("code").asString()).isEqualTo("UNAUTHORIZED_TOKEN");
            }
        }
        MvcResult badOrigin = mockMvc.perform(multipart("/api/skills/import/preview")
                        .file(file)
                        .header("Origin", "http://evil.example")
                        .header("X-AojiStudio-Browser-Token", "any"))
                .andReturn();
        assertThat(badOrigin.getResponse().getStatus()).isEqualTo(403);
        assertThat(api.json(badOrigin).get("code").asString()).isEqualTo("FORBIDDEN_ORIGIN");
        MvcResult badOriginImport = mockMvc.perform(post("/api/skills/import")
                        .header("Origin", "http://evil.example")
                        .header("X-AojiStudio-Browser-Token", "any")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andReturn();
        assertThat(badOriginImport.getResponse().getStatus()).isEqualTo(403);
        assertThat(api.json(badOriginImport).get("code").asString()).isEqualTo("FORBIDDEN_ORIGIN");
        assertThat(importRootEntries()).isEmpty();
    }

    // ------------------------------------------------------------------ 미리보기 → 가져오기

    @Test
    @DisplayName("[FR-021-AC4][FR-021-AC5] 미리보기 200(스키마 필드·스크립트 경고 값) → 가져오기 201 SkillDetail(imported=true), SOURCE.md 네 줄, 정의 목록에 나타남")
    void previewThenImport() throws Exception {
        MvcResult previewResult = api.preview(zipWith("flow", "flow-skill"));
        assertThat(previewResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode preview = api.json(previewResult);
        assertThat(preview.get("name").asString()).isEqualTo("flow-skill");
        assertThat(preview.get("description").asString()).isEqualTo("가져온 설명");
        assertThat(preview.get("fileCount").asInt()).isEqualTo(3);
        assertThat(preview.get("scriptCount").asInt()).isEqualTo(1);
        assertThat(preview.get("hasSourceMd").asBoolean()).isFalse();
        assertThat(preview.get("unpackedBytes").asLong()).isPositive();
        assertThat(preview.get("expiresAt").asString()).isNotBlank();
        JsonNode runSh = preview.get("files").get(2);
        assertThat(runSh.get("path").asString()).isEqualTo("scripts/run.sh");
        assertThat(runSh.get("script").asBoolean()).isTrue();
        assertThat(runSh.get("executable").asBoolean()).isTrue();
        // 마운트에는 아직 아무것도 없다.
        assertThat(Files.exists(skillsDir().resolve("flow-skill"))).isFalse();
        assertThat(tmpFoldersInSkills()).isEmpty();

        MvcResult imported = api.importSkill(importBody(preview.get("uploadId").asString(), "https://github.com/acme/flow", "abc1234", "MIT"));

        assertThat(imported.getResponse().getStatus()).isEqualTo(201);
        JsonNode detail = api.json(imported);
        assertThat(detail.get("name").asString()).isEqualTo("flow-skill");
        assertThat(detail.get("imported").asBoolean()).isTrue();
        assertThat(detail.get("filePath").asString()).isEqualTo(".claude/skills/flow-skill/SKILL.md");
        assertThat(Files.readString(skillsDir().resolve("flow-skill").resolve("SOURCE.md")).lines().toList())
                .hasSize(4)
                .first()
                .isEqualTo("출처: https://github.com/acme/flow");
        assertThat(registryService.skillNames()).contains("flow-skill");
        assertThat(tmpFoldersInSkills()).isEmpty();
        assertThat(importRootEntries()).isEmpty();
        // 가져온 스킬은 수정할 수 없다(FR-020-AC6와 이어짐).
        MvcResult edit = api.update("flow-skill", Map.of("description", "d", "userOnly", false, "body", "b", "expectedRevision", "x", "force", true));
        assertThat(api.json(edit).get("code").asString()).isEqualTo("IMPORTED_SKILL");
    }

    @Test
    @DisplayName("[FR-021-AC2] 10MB 초과 multipart → 400 IMPORT_REJECTED details.reason=TOO_LARGE, entry null, 아무것도 안 남김")
    void oversizeMultipartIsRejected() throws Exception {
        byte[] big = new byte[10 * 1024 * 1024 + 1];
        MvcResult result = api.preview(big);

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IMPORT_REJECTED");
        assertThat(body.get("message").asString()).isEqualTo("zip이 10MB를 넘습니다");
        assertThat(body.get("details").get("reason").asString()).isEqualTo("TOO_LARGE");
        assertThat(body.get("details").has("entry")).isTrue();
        assertThat(body.get("details").get("entry").isNull()).isTrue();
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E2] 위험 경로 → 400 IMPORT_REJECTED details.reason·details.entry·ADR-91 문구, 마운트·/data 0")
    void dangerousEntryResponse() throws Exception {
        Path zip = work.resolve("danger.zip");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", String.format(SKILL_MD, "danger")).file("scripts/../../etc", "x");
        }

        MvcResult result = api.preview(Files.readAllBytes(zip));

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IMPORT_REJECTED");
        assertThat(body.get("details").get("reason").asString()).isEqualTo("PATH_TRAVERSAL");
        assertThat(body.get("details").get("entry").asString()).isEqualTo("scripts/../../etc");
        assertThat(body.get("message").asString()).isEqualTo("가져올 수 없는 항목이 있습니다 · scripts/../../etc · 경로 이탈");
        assertThat(importRootEntries()).isEmpty();
        assertThat(Files.exists(skillsDir().resolve("danger"))).isFalse();
        assertThat(tmpFoldersInSkills()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E1] zip 아님 → 400 NOT_ZIP, 파트 없음 → 400 NOT_ZIP, SKILL.md 없음 → 400 NO_SKILL_MD")
    void notZipAndNoSkillMd() throws Exception {
        MvcResult text = api.preview("zip이 아닙니다".getBytes());
        assertThat(text.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(text).get("details").get("reason").asString()).isEqualTo("NOT_ZIP");
        assertThat(api.json(text).get("message").asString()).isEqualTo("zip 파일이 아니거나 손상되었습니다");

        Path zip = work.resolve("noskill.zip");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("readme.md", "r");
        }
        MvcResult none = api.preview(Files.readAllBytes(zip));
        assertThat(none.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(none).get("details").get("reason").asString()).isEqualTo("NO_SKILL_MD");
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E3] 이름 중복: 미리보기 때 409 NAME_EXISTS, 가져오기 때(그사이 생김) 409 NAME_EXISTS, 이름 규칙 위반은 400 NAME_INVALID, 기존 폴더 불변")
    void nameConflicts() throws Exception {
        MvcResult atPreview = api.preview(zipWith("dup", "design-review"));
        assertThat(atPreview.getResponse().getStatus()).isEqualTo(409);
        JsonNode body = api.json(atPreview);
        assertThat(body.get("code").asString()).isEqualTo("IMPORT_REJECTED");
        assertThat(body.get("details").get("reason").asString()).isEqualTo("NAME_EXISTS");
        assertThat(body.get("message").asString()).isEqualTo("스킬 이름 design-review · 이미 있는 이름입니다");

        MvcResult invalid = api.preview(zipWith("bad", "Bad_Name"));
        assertThat(invalid.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(invalid).get("details").get("reason").asString()).isEqualTo("NAME_INVALID");
        assertThat(api.json(invalid).get("message").asString()).isEqualTo("스킬 이름 Bad_Name · 소문자·숫자·하이픈만, 1~64자");

        String uploadId = previewOk(zipWith("late", "late-skill"));
        Files.createDirectories(skillsDir().resolve("late-skill"));
        Files.writeString(skillsDir().resolve("late-skill").resolve("SKILL.md"), "---\nname: late-skill\n---\n기존");
        MvcResult atImport = api.importSkill(importBody(uploadId, "src", null, "MIT"));
        assertThat(atImport.getResponse().getStatus()).isEqualTo(409);
        assertThat(api.json(atImport).get("details").get("reason").asString()).isEqualTo("NAME_EXISTS");
        assertThat(Files.readString(skillsDir().resolve("late-skill").resolve("SKILL.md"))).endsWith("기존");
        assertThat(tmpFoldersInSkills()).isEmpty();
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E4] 출처·라이선스 빈 값 → 400 VALIDATION fields.source·fields.license '필수' (필드별), 업로드는 그대로 유효")
    void emptySourceAndLicense() throws Exception {
        String uploadId = previewOk(zipWith("e4", "e4-skill"));

        MvcResult both = api.importSkill(importBody(uploadId, "  ", null, ""));
        assertThat(both.getResponse().getStatus()).isEqualTo(400);
        JsonNode bothBody = api.json(both);
        assertThat(bothBody.get("code").asString()).isEqualTo("VALIDATION");
        assertThat(bothBody.get("fields").get("source").asString()).isEqualTo("필수");
        assertThat(bothBody.get("fields").get("license").asString()).isEqualTo("필수");

        MvcResult onlyLicense = api.importSkill(importBody(uploadId, "https://x", null, null));
        assertThat(onlyLicense.getResponse().getStatus()).isEqualTo(400);
        assertThat(api.json(onlyLicense).get("fields").has("source")).isFalse();
        assertThat(api.json(onlyLicense).get("fields").get("license").asString()).isEqualTo("필수");
        assertThat(Files.exists(skillsDir().resolve("e4-skill"))).isFalse();

        // 반려된 뒤에도 같은 업로드로 이어서 가져올 수 있다.
        assertThat(api.importSkill(importBody(uploadId, "https://x", null, "MIT")).getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    @DisplayName("[FR-021-E5] 모르는 uploadId·30분 지난 uploadId → 404 UPLOAD_NOT_FOUND(ADR-91 문구), 지난 업로드 폴더는 지워짐")
    void unknownAndExpiredUpload() throws Exception {
        MvcResult unknown = api.importSkill(importBody("3f2b8c1e-0000-4000-8000-000000000000", "src", null, "MIT"));
        assertThat(unknown.getResponse().getStatus()).isEqualTo(404);
        assertThat(api.json(unknown).get("code").asString()).isEqualTo("UPLOAD_NOT_FOUND");
        assertThat(api.json(unknown).get("message").asString()).isEqualTo("올린 zip을 찾을 수 없습니다 · 파일을 다시 고르세요");

        MvcResult pathLike = api.importSkill(importBody("../../etc", "src", null, "MIT"));
        assertThat(pathLike.getResponse().getStatus()).isEqualTo(404);

        String uploadId = previewOk(zipWith("old", "old-skill"));
        Files.setLastModifiedTime(importRoot().resolve(uploadId), FileTime.from(Instant.now().minus(31, ChronoUnit.MINUTES)));
        MvcResult expired = api.importSkill(importBody(uploadId, "src", null, "MIT"));
        assertThat(expired.getResponse().getStatus()).isEqualTo(404);
        assertThat(api.json(expired).get("code").asString()).isEqualTo("UPLOAD_NOT_FOUND");
        assertThat(Files.exists(importRoot().resolve(uploadId))).isFalse();
        assertThat(Files.exists(skillsDir().resolve("old-skill"))).isFalse();
    }

    @Test
    @DisplayName("[FR-021-E5] 쓰기 실패 → 500 IO_FAILED(ADR-91 문구, 예외 원문 없음), 마운트 임시 폴더·스킬 폴더·업로드 폴더 0")
    void writeFailureLeavesNothing() throws Exception {
        String uploadId = previewOk(zipWith("fail", "fail-skill"));
        doThrow(new IOException("주입된 실패")).when(atomicFileWriter).write(any(), any());

        MvcResult result = api.importSkill(importBody(uploadId, "src", null, "MIT"));

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        JsonNode body = api.json(result);
        assertThat(body.get("code").asString()).isEqualTo("IO_FAILED");
        assertThat(body.get("message").asString())
                .isEqualTo("스킬을 가져오지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 아무것도 남기지 않았습니다.");
        assertThat(body.toString()).doesNotContain("주입된 실패");
        assertThat(Files.exists(skillsDir().resolve("fail-skill"))).isFalse();
        assertThat(tmpFoldersInSkills()).isEmpty();
        assertThat(importRootEntries()).isEmpty();
        assertThat(registryService.skillNames()).doesNotContain("fail-skill");
    }

    @Test
    @DisplayName("[FR-021-AC6] 이름 바꾸기 중 실패 주입 → 500, 마운트에 새 폴더·임시 폴더 0")
    void moveFailureLeavesNothing() throws Exception {
        String uploadId = previewOk(zipWith("mv", "mv-skill"));
        doThrow(new IOException("주입된 실패")).when(skillWriter).moveIntoPlace(any(), any());

        MvcResult result = api.importSkill(importBody(uploadId, "src", null, "MIT"));

        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        assertThat(api.json(result).get("code").asString()).isEqualTo("IO_FAILED");
        assertThat(Files.exists(skillsDir().resolve("mv-skill"))).isFalse();
        assertThat(tmpFoldersInSkills()).isEmpty();
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-AC4] 읽기 전용 마운트 → 미리보기·가져오기 모두 403 READ_ONLY, 아무것도 안 씀")
    void readOnlyMount() throws Exception {
        String uploadId = previewOk(zipWith("ro", "ro-skill"));
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));
        registryService.rescanNow();
        try {
            MvcResult preview = api.preview(zipWith("ro2", "ro2-skill"));
            assertThat(preview.getResponse().getStatus()).isEqualTo(403);
            assertThat(api.json(preview).get("code").asString()).isEqualTo("READ_ONLY");
            MvcResult imp = api.importSkill(importBody(uploadId, "src", null, "MIT"));
            assertThat(imp.getResponse().getStatus()).isEqualTo(403);
            assertThat(api.json(imp).get("code").asString()).isEqualTo("READ_ONLY");
        } finally {
            Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
            registryService.rescanNow();
        }
        assertThat(Files.exists(skillsDir().resolve("ro-skill"))).isFalse();
        // 읽기 전용이 풀린 뒤에는 같은 업로드로 가져올 수 있다.
        assertThat(api.importSkill(importBody(uploadId, "src", null, "MIT")).getResponse().getStatus()).isEqualTo(201);
    }
}
