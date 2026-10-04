package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.files.PathGuard;

/**
 * `.claude/agents/`, `.claude/skills/`, 마운트 쓰기 가능 판정 (FR-001-AC1·AC2·E1·E2·E3, FR-002-AC2).
 */
class ProjectFolderScannerTest {

    @TempDir
    Path mountRoot;

    private final ProjectFolderScanner scanner = new ProjectFolderScanner(new AgentDefinitionParser());

    private PathGuard pathGuard() {
        return new PathGuard(mountRoot);
    }

    @AfterEach
    void restoreWritePermission() throws IOException {
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
    }

    private void writeAgent(String fileName, String content) throws IOException {
        Path agentsDir = Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Files.writeString(agentsDir.resolve(fileName), content, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("[FR-001-AC1] 정상 .md 3 + 형식 오류 1 + 하위 폴더 .md 1 → agentCount 3")
    void agentCountCountsOnlyValidTopLevelMarkdownFiles() throws IOException {
        writeAgent("architect.md", "---\nname: architect\ndescription: 설계\n---\n본문\n");
        writeAgent("developer.md", "---\nname: developer\ndescription: 구현\n---\n본문\n");
        writeAgent("reviewer.md", "---\nname: reviewer\ndescription: 리뷰\n---\n본문\n");
        writeAgent("broken.md", "---\ndescription: name 없음\n---\n본문\n");

        Path nested = Files.createDirectories(
                mountRoot.resolve(".claude").resolve("agents").resolve("nested"));
        Files.writeString(nested.resolve("ignored.md"), "---\nname: ignored\n---\n본문\n", StandardCharsets.UTF_8);

        AgentsScanResult result = scanner.scanAgents(mountRoot, pathGuard());

        assertThat(result.agentsDirMissing()).isFalse();
        assertThat(result.agentCount()).isEqualTo(3);
        assertThat(result.validAgents()).hasSize(3);
        assertThat(result.formatErrors()).hasSize(1);
        assertThat(result.formatErrors().get(0).message()).isEqualTo("name 누락");
    }

    @Test
    @DisplayName("[FR-001-AC2] skills/ 아래 SKILL.md 있는 폴더 2 + 없는 폴더 1 + 파일 1 → skillCount 2")
    void skillCountCountsOnlyFoldersWithSkillMd() throws IOException {
        Path skillsDir = Files.createDirectories(mountRoot.resolve(".claude").resolve("skills"));
        Path withSkillA = Files.createDirectories(skillsDir.resolve("skill-a"));
        Files.writeString(withSkillA.resolve("SKILL.md"), "---\nname: skill-a\n---\n", StandardCharsets.UTF_8);
        Path withSkillB = Files.createDirectories(skillsDir.resolve("skill-b"));
        Files.writeString(withSkillB.resolve("SKILL.md"), "---\nname: skill-b\n---\n", StandardCharsets.UTF_8);
        Files.createDirectories(skillsDir.resolve("no-skill-file"));
        Files.writeString(skillsDir.resolve("plain-file.txt"), "not a folder", StandardCharsets.UTF_8);

        int skillCount = scanner.scanSkills(mountRoot);

        assertThat(skillCount).isEqualTo(2);
    }

    @Test
    @DisplayName("[FR-001-E1] agents 폴더 없음 → agentsDirMissing true, agentCount null, agents 빈 목록")
    void missingAgentsDirIsNotAnError() {
        AgentsScanResult result = scanner.scanAgents(mountRoot, pathGuard());

        assertThat(result.agentsDirMissing()).isTrue();
        assertThat(result.agentCount()).isNull();
        assertThat(result.validAgents()).isEmpty();
    }

    @Test
    @DisplayName("[FR-001-E2] 읽기 전용 fixture → writable false")
    void readOnlyMountIsNotWritable() throws IOException {
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));

        boolean writable = scanner.checkWritable(mountRoot);

        assertThat(writable).isFalse();
    }

    @Test
    @DisplayName("쓰기 가능한 마운트 → writable true")
    void writableMountIsDetected() {
        boolean writable = scanner.checkWritable(mountRoot);

        assertThat(writable).isTrue();
    }

    @Test
    @DisplayName("[FR-001-E3] skills 폴더 없음 → skillCount 0, formatErrors 없음")
    void missingSkillsDirIsNotAnError() {
        int skillCount = scanner.scanSkills(mountRoot);

        assertThat(skillCount).isZero();
    }

    @Test
    @DisplayName("[FR-002-AC2] 형식 오류 파일은 agents·agentCount에서 제외되고 formatErrors에 파일명+사유")
    void formatErrorFilesAreExcludedFromAgentsAndCounted() throws IOException {
        writeAgent("valid-agent.md", "---\nname: valid-agent\ndescription: 정상\n---\n본문\n");
        writeAgent("missing-name.md", "---\ndescription: name 없음\n---\n본문\n");

        AgentsScanResult result = scanner.scanAgents(mountRoot, pathGuard());

        assertThat(result.agentCount()).isEqualTo(1);
        assertThat(result.validAgents()).extracting(p -> p.definition().name()).containsExactly("valid-agent");
        assertThat(result.formatErrors())
                .anySatisfy(error -> {
                    // api-spec FormatError.file(kind=agent)은 파일명만("missing-name.md"), 상대 경로가 아니다.
                    assertThat(error.file()).isEqualTo("missing-name.md");
                    assertThat(error.message()).isEqualTo("name 누락");
                });
    }

    @Test
    @DisplayName("[FR-002-AC2] name 중복 사유에 상대 파일명, file은 파일명만")
    void duplicateNameFormatErrorFileIsBareNameAndMessageKeepsRelativePath() throws IOException {
        writeAgent("dup-one.md", "---\nname: duplicate-agent\ndescription: 첫 번째\n---\n본문\n");
        writeAgent("dup-two.md", "---\nname: duplicate-agent\ndescription: 두 번째\n---\n본문\n");

        AgentsScanResult result = scanner.scanAgents(mountRoot, pathGuard());

        assertThat(result.agentCount()).isZero();
        assertThat(result.formatErrors()).hasSize(2);
        assertThat(result.formatErrors())
                .anySatisfy(error -> {
                    assertThat(error.file()).isEqualTo("dup-one.md");
                    assertThat(error.message()).isEqualTo("name 중복 (.claude/agents/dup-two.md)");
                });
        assertThat(result.formatErrors())
                .anySatisfy(error -> {
                    assertThat(error.file()).isEqualTo("dup-two.md");
                    assertThat(error.message()).isEqualTo("name 중복 (.claude/agents/dup-one.md)");
                });
    }
}
