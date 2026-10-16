package studio.aoji.skills;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.support.FixtureFiles;

class SkillScannerTest {

    @TempDir
    Path mount;

    private final SkillScanner scanner = new SkillScanner(new SkillFileParser());

    private Path skillDir(String name) throws IOException {
        return Files.createDirectories(mount.resolve(".claude").resolve("skills").resolve(name));
    }

    private void skill(String name, String content) throws IOException {
        Files.writeString(skillDir(name).resolve("SKILL.md"), content, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("[FR-018-AC1] 이름 오름차순, 형식 오류 폴더 포함, 개수 = ProjectFolderScanner skillCount")
    void listIsSortedByNameIncludingFormatErrors() throws IOException {
        FixtureFiles.copyInto("project-skills", mount);

        List<SkillEntry> skills = scanner.scan(mount);

        assertThat(skills).extracting(SkillEntry::name)
                .containsExactly("bad-utf8", "bad-yaml", "design-review", "imported-lint", "manual-only",
                        "name-mismatch", "no-delimiter", "release-notes");
        assertThat(skills.stream().filter(s -> s.formatError() != null).count()).isEqualTo(4);
        studio.aoji.registry.ProjectFolderScanner folderScanner = new studio.aoji.registry.ProjectFolderScanner(
                new studio.aoji.registry.AgentDefinitionParser(), scanner);
        assertThat(folderScanner.scanSkills(mount)).isEqualTo(skills.size());
        assertThat(skills.getFirst().filePath()).isEqualTo(".claude/skills/bad-utf8/SKILL.md");
    }

    @Test
    @DisplayName("[FR-018-E1] 형식 오류 세 사유: frontmatter 형식 오류·UTF-8 인코딩 오류·name이 폴더 이름과 다름")
    void formatErrorReasons() throws IOException {
        FixtureFiles.copyInto("project-skills", mount);

        List<SkillEntry> skills = scanner.scan(mount);

        assertThat(byName(skills, "bad-utf8").formatError()).isEqualTo("UTF-8 인코딩 오류");
        assertThat(byName(skills, "bad-yaml").formatError()).isEqualTo("frontmatter 형식 오류");
        assertThat(byName(skills, "no-delimiter").formatError()).isEqualTo("frontmatter 형식 오류");
        assertThat(byName(skills, "name-mismatch").formatError()).isEqualTo("name이 폴더 이름과 다름");
        assertThat(byName(skills, "design-review").formatError()).isNull();
        assertThat(byName(skills, "bad-utf8").description()).isEmpty();
    }

    @Test
    @DisplayName("[FR-018-E1] name 키가 없으면 오류가 아니고 description이 없으면 빈 문자열")
    void missingNameAndDescriptionAreNotErrors() throws IOException {
        skill("plain", "---\nother: 1\n---\n본문\n");

        SkillEntry entry = scanner.scan(mount).getFirst();

        assertThat(entry.formatError()).isNull();
        assertThat(entry.description()).isEmpty();
        assertThat(entry.body()).isEqualTo("본문\n");
    }

    @Test
    @DisplayName("[FR-018-E2] .claude/skills 폴더 없음 → 빈 목록, 에러 아님")
    void missingSkillsDirYieldsEmptyList() {
        assertThat(scanner.scan(mount)).isEmpty();
        assertThat(scanner.find(mount, "x")).isEmpty();
    }

    @Test
    @DisplayName("[FR-018-AC1] userOnly(disable-model-invocation: true)·imported(SOURCE.md)·본문 원문 CRLF 보존")
    void userOnlyImportedAndRawBody() throws IOException {
        skill("manual", "---\r\nname: manual\r\ndescription: 직접만\r\ndisable-model-invocation: true\r\n---\r\n줄1\r\n줄2");
        skill("normal", "---\ndescription: d\ndisable-model-invocation: false\n---\n");
        Files.writeString(skillDir("manual").resolve("SOURCE.md"), "출처");

        SkillEntry manual = byName(scanner.scan(mount), "manual");
        SkillEntry normal = byName(scanner.scan(mount), "normal");

        assertThat(manual.userOnly()).isTrue();
        assertThat(manual.imported()).isTrue();
        assertThat(manual.description()).isEqualTo("직접만");
        assertThat(manual.body()).isEqualTo("줄1\r\n줄2");
        assertThat(normal.userOnly()).isFalse();
        assertThat(normal.imported()).isFalse();
        assertThat(normal.body()).isEmpty();
        assertThat(manual.revision()).isEqualTo(manual.mtimeMillis() + "-" + manual.size());
    }

    @Test
    @DisplayName("[FR-001-AC2] SKILL.md 없는 폴더·파일·점으로 시작하는 폴더·링크 폴더는 세지 않는다")
    void onlyRealSkillFoldersAreCounted() throws IOException {
        skill("real", "---\nname: real\n---\n");
        skill(".tmp-import", "---\nname: x\n---\n");
        skillDir("empty");
        Files.writeString(mount.resolve(".claude/skills/file.txt"), "x");
        Path outside = Files.createDirectories(mount.resolveSibling(mount.getFileName() + "-outside"));
        Files.writeString(outside.resolve("SKILL.md"), "---\nname: linked\n---\n");
        Files.createSymbolicLink(mount.resolve(".claude/skills/linked"), outside);

        assertThat(scanner.scan(mount)).extracting(SkillEntry::name).containsExactly("real");
    }

    private static SkillEntry byName(List<SkillEntry> skills, String name) {
        return skills.stream().filter(s -> s.name().equals(name)).findFirst().orElseThrow();
    }
}
