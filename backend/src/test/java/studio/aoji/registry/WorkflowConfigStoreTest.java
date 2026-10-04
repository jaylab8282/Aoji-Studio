package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.NoSuchFileException;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.files.PathGuard;
import tools.jackson.databind.ObjectMapper;

/**
 * 구성 파일 읽기·스키마 검증·만들기·삭제 (architecture.md §6.2, ADR-06, ADR-08, FR-002-AC5·AC6,
 * FR-008, FR-017).
 */
class WorkflowConfigStoreTest {

    @TempDir
    Path mountRoot;

    Path teamsDir;

    private final WorkflowConfigStore store = new WorkflowConfigStore(new ObjectMapper(), new AtomicFileWriter());

    @BeforeEach
    void createTeamsDir() throws IOException {
        teamsDir = Files.createDirectories(mountRoot.resolve(".jaystudio").resolve("teams"));
    }

    private PathGuard pathGuard() {
        return new PathGuard(mountRoot);
    }

    private void writeTeam(String fileName, String json) throws IOException {
        Files.writeString(teamsDir.resolve(fileName), json, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("[FR-002-AC5] members에 없는 name → brokenRefs, members에서 제외, formatErrors broken-ref")
    void brokenMemberReferenceIsExcludedAndReported() throws IOException {
        writeTeam(
                "broken-ref.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "broken-ref",
                  "description": "설명",
                  "lead": "valid-agent",
                  "members": ["no-such-agent"],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of("valid-agent"), pathGuard());

        assertThat(result.workflows()).hasSize(1);
        Workflow workflow = result.workflows().get(0);
        assertThat(workflow.lead()).isEqualTo("valid-agent");
        assertThat(workflow.members()).isEmpty();
        assertThat(workflow.brokenRefs()).containsExactly("no-such-agent");
        assertThat(workflow.rawMemberCount()).isEqualTo(2);

        assertThat(result.formatErrors()).hasSize(1);
        FormatError error = result.formatErrors().get(0);
        assertThat(error.kind()).isEqualTo(FormatError.Kind.BROKEN_REF);
        assertThat(error.file()).isEqualTo("no-such-agent");
        assertThat(error.message()).isEqualTo("구성 파일 참조 깨짐 (broken-ref)");
        assertThat(error.workflow()).isEqualTo("broken-ref");
    }

    @Test
    @DisplayName("[FR-002-AC5] lead 깨짐 → lead null")
    void brokenLeadReferenceBecomesNull() throws IOException {
        writeTeam(
                "lead-broken.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "lead-broken",
                  "description": "설명",
                  "lead": "no-such-lead",
                  "members": ["valid-agent"],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of("valid-agent"), pathGuard());

        assertThat(result.workflows()).hasSize(1);
        Workflow workflow = result.workflows().get(0);
        assertThat(workflow.lead()).isNull();
        assertThat(workflow.members()).containsExactly("valid-agent");
        assertThat(workflow.brokenRefs()).containsExactly("no-such-lead");

        assertThat(result.formatErrors())
                .anySatisfy(error -> {
                    assertThat(error.kind()).isEqualTo(FormatError.Kind.BROKEN_REF);
                    assertThat(error.file()).isEqualTo("no-such-lead");
                    assertThat(error.message()).isEqualTo("구성 파일 참조 깨짐 (lead-broken)");
                });
    }

    @Test
    @DisplayName("[FR-002-AC6] JSON 파싱 실패 → workflows 제외, formatErrors '<파일>.json · 구성 파일 형식 오류'")
    void invalidJsonIsExcludedAndReported() throws IOException {
        writeTeam("broken.json", "{ this is not valid json");

        WorkflowScanResult result = store.readAll(teamsDir, Set.of(), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).hasSize(1);
        FormatError error = result.formatErrors().get(0);
        assertThat(error.kind()).isEqualTo(FormatError.Kind.WORKFLOW);
        assertThat(error.file()).isEqualTo("broken.json");
        assertThat(error.message()).isEqualTo("구성 파일 형식 오류");
    }

    @Test
    @DisplayName("[FR-002-AC6] name ≠ stem → 형식 오류")
    void nameNotMatchingStemIsFormatError() throws IOException {
        writeTeam(
                "actual-file-name.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "different-name",
                  "description": "설명",
                  "lead": null,
                  "members": [],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of(), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).hasSize(1);
        assertThat(result.formatErrors().get(0).file()).isEqualTo("actual-file-name.json");
        assertThat(result.formatErrors().get(0).message()).isEqualTo("구성 파일 형식 오류");
    }

    @Test
    @DisplayName("[FR-002-AC6] schemaVersion 2 → 형식 오류")
    void unsupportedSchemaVersionIsFormatError() throws IOException {
        writeTeam(
                "schema-error.json",
                """
                {
                  "schemaVersion": 2,
                  "name": "schema-error",
                  "description": "설명",
                  "lead": null,
                  "members": [],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of(), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).hasSize(1);
        assertThat(result.formatErrors().get(0).message()).isEqualTo("구성 파일 형식 오류");
    }

    @Test
    @DisplayName("[FR-002-AC6] description이 문자열이 아니면 → 형식 오류")
    void nonStringDescriptionIsFormatError() throws IOException {
        writeTeam(
                "bad-description.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "bad-description",
                  "description": 42,
                  "lead": null,
                  "members": [],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of(), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).hasSize(1);
        assertThat(result.formatErrors().get(0).file()).isEqualTo("bad-description.json");
        assertThat(result.formatErrors().get(0).message()).isEqualTo("구성 파일 형식 오류");
    }

    @Test
    @DisplayName("정상 구성 파일 → workflows에 포함, 팀장이 팀원에도 있으면 형식 오류")
    void leadDuplicatedInMembersIsFormatError() throws IOException {
        writeTeam(
                "dup-lead.json",
                """
                {
                  "schemaVersion": 1,
                  "name": "dup-lead",
                  "description": "설명",
                  "lead": "valid-agent",
                  "members": ["valid-agent"],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of("valid-agent"), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).hasSize(1);
        assertThat(result.formatErrors().get(0).message()).isEqualTo("구성 파일 형식 오류");
    }

    @Test
    @DisplayName("[NFR-07] 마운트 밖 심볼릭 링크 구성 파일 → 읽지 않고 '구성 파일 형식 오류'")
    void symlinkedTeamsFileEscapingMountIsNotReadAndReportedAsFormatError() throws IOException {
        Path outside = Files.createTempDirectory("jaystudio-outside-team");
        Path secretTeam = Files.writeString(
                outside.resolve("secret.json"),
                """
                {
                  "schemaVersion": 1,
                  "name": "linked-team",
                  "description": "마운트 밖 파일 원본",
                  "lead": "valid-agent",
                  "members": [],
                  "createdAt": "2026-09-20T10:00:00+09:00",
                  "updatedAt": "2026-09-20T10:00:00+09:00"
                }
                """);
        Files.createSymbolicLink(teamsDir.resolve("linked-team.json"), secretTeam);

        WorkflowScanResult result = store.readAll(teamsDir, Set.of("valid-agent"), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).hasSize(1);
        FormatError error = result.formatErrors().get(0);
        assertThat(error.kind()).isEqualTo(FormatError.Kind.WORKFLOW);
        assertThat(error.file()).isEqualTo("linked-team.json");
        assertThat(error.message()).isEqualTo("구성 파일 형식 오류");
        // 링크 대상 파일은 그대로다(읽지 않았음을 확인).
        assertThat(Files.readString(secretTeam)).contains("마운트 밖 파일 원본");
    }

    @Test
    void missingTeamsDirReturnsEmptyResult() {
        WorkflowScanResult result = store.readAll(teamsDir.resolve("does-not-exist"), Set.of(), pathGuard());

        assertThat(result.workflows()).isEmpty();
        assertThat(result.formatErrors()).isEmpty();
    }

    @Test
    @DisplayName("[FR-008] create → 파일 생성, schemaVersion 1, lead null, members 빈 배열")
    void createWritesEmptyWorkflowConfigFile() throws IOException {
        store.create(pathGuard(), "새워크플로우", "설명입니다");

        Path created = teamsDir.resolve("새워크플로우.json");
        assertThat(Files.exists(created)).isTrue();

        WorkflowScanResult result = store.readAll(teamsDir, Set.of(), pathGuard());
        assertThat(result.workflows()).hasSize(1);
        Workflow workflow = result.workflows().get(0);
        assertThat(workflow.name()).isEqualTo("새워크플로우");
        assertThat(workflow.description()).isEqualTo("설명입니다");
        assertThat(workflow.lead()).isNull();
        assertThat(workflow.members()).isEmpty();
        assertThat(workflow.rawMemberCount()).isZero();
    }

    @Test
    @DisplayName("[FR-001-AC6] create가 teams 디렉터리를 첫 호출 때 만든다")
    void createMakesTeamsDirectoryWhenMissing() throws IOException {
        Path freshMountRoot = Files.createTempDirectory("jaystudio-workflow-create");
        try {
            Path freshTeamsDir = freshMountRoot.resolve(".jaystudio").resolve("teams");
            assertThat(Files.exists(freshTeamsDir)).isFalse();

            store.create(new PathGuard(freshMountRoot), "첫팀", "");

            assertThat(Files.isDirectory(freshTeamsDir)).isTrue();
            assertThat(Files.exists(freshTeamsDir.resolve("첫팀.json"))).isTrue();
        } finally {
            deleteRecursively(freshMountRoot);
        }
    }

    @Test
    @DisplayName("[FR-017-AC4] delete → 파일 삭제(휴지통 이동 없음)")
    void deleteRemovesConfigFile() throws IOException {
        store.create(pathGuard(), "삭제할팀", "");
        Path target = teamsDir.resolve("삭제할팀.json");
        assertThat(Files.exists(target)).isTrue();

        store.delete(pathGuard(), "삭제할팀");

        assertThat(Files.exists(target)).isFalse();
    }

    @Test
    @DisplayName("[FR-017-E2] 존재하지 않는 파일 delete → IOException")
    void deleteMissingFileThrows() {
        assertThatThrownBy(() -> store.delete(pathGuard(), "없는팀")).isInstanceOf(NoSuchFileException.class);
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
