package studio.jay.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 정의 파일 형식 검증 (architecture.md §6.1, FR-002-AC1~AC4).
 */
class AgentDefinitionParserTest {

    @TempDir
    Path dir;

    private final AgentDefinitionParser parser = new AgentDefinitionParser();

    private Path write(String fileName, byte[] bytes) throws IOException {
        Path file = dir.resolve(fileName);
        Files.write(file, bytes);
        return file;
    }

    private Path write(String fileName, String content) throws IOException {
        return write(fileName, content.getBytes(StandardCharsets.UTF_8));
    }

    private ParsedAgentFile parseFile(Path file, String relativeFilePath) {
        String fileName = relativeFilePath.substring(relativeFilePath.lastIndexOf('/') + 1);
        return parser.parse(file, relativeFilePath, fileName);
    }

    @Test
    @DisplayName("[FR-002-AC1] name 누락")
    void missingNameIsFormatError() throws IOException {
        // [FR-002-AC1] name 누락
        Path file = write("missing-name.md", "---\ndescription: 설명\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/missing-name.md");

        assertThat(result.isValid()).isFalse();
        assertThat(result.formatErrorMessage()).isEqualTo("name 누락");
    }

    @Test
    @DisplayName("[FR-002-AC1] name 형식 위반(대문자·공백)")
    void nameFormatViolationIsFormatError() throws IOException {
        // [FR-002-AC1] name 형식 위반(대문자·공백)
        Path uppercase = write("Invalid-Name.md", "---\nname: Invalid-Name\n---\n본문\n");
        ParsedAgentFile uppercaseResult = parseFile(uppercase, ".claude/agents/Invalid-Name.md");
        assertThat(uppercaseResult.isValid()).isFalse();
        assertThat(uppercaseResult.formatErrorMessage()).isEqualTo("name 형식 위반");

        Path withSpace = write("with-space.md", "---\nname: has space\n---\n본문\n");
        ParsedAgentFile spaceResult = parseFile(withSpace, ".claude/agents/with-space.md");
        assertThat(spaceResult.isValid()).isFalse();
        assertThat(spaceResult.formatErrorMessage()).isEqualTo("name 형식 위반");
    }

    @Test
    @DisplayName("[FR-002-AC1] frontmatter 형식 오류(닫는 --- 없음)")
    void missingClosingDelimiterIsFormatError() throws IOException {
        // [FR-002-AC1] frontmatter 형식 오류(닫는 --- 없음)
        Path file = write("broken-frontmatter.md", "---\nname: broken-frontmatter\ndescription: 닫는 --- 가 없음\n\n본문.\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/broken-frontmatter.md");

        assertThat(result.isValid()).isFalse();
        assertThat(result.formatErrorMessage()).isEqualTo("frontmatter 형식 오류");
    }

    @Test
    @DisplayName("[FR-002-AC1] frontmatter 형식 오류(--- 없음)")
    void missingOpeningDelimiterIsFormatError() throws IOException {
        // [FR-002-AC1] frontmatter 형식 오류(--- 없음, 첫 줄이 --- 가 아님)
        Path file = write("no-opening.md", "name: no-opening\ndescription: 첫 줄이 --- 가 아님\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/no-opening.md");

        assertThat(result.isValid()).isFalse();
        assertThat(result.formatErrorMessage()).isEqualTo("frontmatter 형식 오류");
    }

    @Test
    @DisplayName("[FR-002-AC1] frontmatter 형식 오류(YAML 실패)")
    void frontmatterYamlParseFailureIsFormatError() throws IOException {
        // [FR-002-AC1] frontmatter 형식 오류(YAML 실패)
        Path file = write("yaml-broken.md", "---\nname: [unterminated\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/yaml-broken.md");

        assertThat(result.isValid()).isFalse();
        assertThat(result.formatErrorMessage()).isEqualTo("frontmatter 형식 오류");
    }

    @Test
    @DisplayName("[FR-002-AC1] name 중복 → 두 파일 모두")
    void duplicateNameMarksBothFilesAsFormatErrors() throws IOException {
        // [FR-002-AC1] name 중복 → 두 파일 모두
        Path first = write("dup-one.md", "---\nname: duplicate-agent\ndescription: 첫 번째\n---\n본문\n");
        Path second = write("dup-two.md", "---\nname: duplicate-agent\ndescription: 두 번째\n---\n본문\n");

        ParsedAgentFile firstParsed = parseFile(first, ".claude/agents/dup-one.md");
        ParsedAgentFile secondParsed = parseFile(second, ".claude/agents/dup-two.md");
        assertThat(firstParsed.isValid()).isTrue();
        assertThat(secondParsed.isValid()).isTrue();

        List<ParsedAgentFile> resolved =
                AgentDefinitionParser.resolveDuplicates(List.of(firstParsed, secondParsed));

        assertThat(resolved).allMatch(p -> !p.isValid());
        assertThat(resolved.get(0).formatErrorMessage()).isEqualTo("name 중복 (.claude/agents/dup-two.md)");
        assertThat(resolved.get(1).formatErrorMessage()).isEqualTo("name 중복 (.claude/agents/dup-one.md)");
    }

    @Test
    @DisplayName("[FR-002-AC1] UTF-8 오류(잘못된 바이트)")
    void invalidUtf8BytesAreFormatError() throws IOException {
        // [FR-002-AC1] UTF-8 오류(잘못된 바이트)
        byte[] head = "---\nname: bad-utf8\ndescription: ".getBytes(StandardCharsets.UTF_8);
        byte[] invalidBytes = {(byte) 0xFF, (byte) 0xFE};
        byte[] tail = " invalid bytes\n---\n본문\n".getBytes(StandardCharsets.UTF_8);
        byte[] invalid = new byte[head.length + invalidBytes.length + tail.length];
        System.arraycopy(head, 0, invalid, 0, head.length);
        System.arraycopy(invalidBytes, 0, invalid, head.length, invalidBytes.length);
        System.arraycopy(tail, 0, invalid, head.length + invalidBytes.length, tail.length);
        Path file = write("bad-utf8.md", invalid);

        ParsedAgentFile result = parseFile(file, ".claude/agents/bad-utf8.md");

        assertThat(result.isValid()).isFalse();
        assertThat(result.formatErrorMessage()).isEqualTo("UTF-8 인코딩 오류");
    }

    @Test
    @DisplayName("[FR-002-AC4] description 없음 → 정상, description 빈 문자열")
    void missingDescriptionDefaultsToEmptyString() throws IOException {
        // [FR-002-AC4] description 없음 → 정상, description ""
        Path file = write("no-description.md", "---\nname: no-description\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/no-description.md");

        assertThat(result.isValid()).isTrue();
        assertThat(result.definition().description()).isEmpty();
    }

    @Test
    void toolsAndModelAreNormalized() throws IOException {
        Path file = write(
                "normalized.md",
                "---\nname: normalized\ndescription: 설명\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/normalized.md");

        assertThat(result.isValid()).isTrue();
        assertThat(result.definition().tools()).containsExactly("Read", "Grep", "Glob");
        assertThat(result.definition().model()).isEqualTo("sonnet");
        assertThat(result.definition().hasLiteralInheritModel()).isFalse();
    }

    @Test
    void toolsAsYamlListIsNormalized() throws IOException {
        Path file = write(
                "list-tools.md",
                "---\nname: list-tools\ndescription: 설명\ntools:\n  - Read\n  - Edit\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/list-tools.md");

        assertThat(result.isValid()).isTrue();
        assertThat(result.definition().tools()).containsExactly("Read", "Edit");
    }

    @Test
    void absentToolsMeansFullInheritance() throws IOException {
        Path file = write("no-tools.md", "---\nname: no-tools\ndescription: 설명\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/no-tools.md");

        assertThat(result.isValid()).isTrue();
        assertThat(result.definition().tools()).isNull();
    }

    @Test
    void literalInheritModelIsDetected() throws IOException {
        Path file = write(
                "inherit-model.md", "---\nname: inherit-model\ndescription: 설명\nmodel: inherit\n---\n본문\n");

        ParsedAgentFile result = parseFile(file, ".claude/agents/inherit-model.md");

        assertThat(result.isValid()).isTrue();
        assertThat(result.definition().model()).isEqualTo("inherit");
        assertThat(result.definition().hasLiteralInheritModel()).isTrue();
    }
}
