package studio.aoji.statusline;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 정적 검사 (FR-027-AC7): 계정 자격증명을 읽지 않고 사용량을 Anthropic 주소에서 가져오지 않는다. */
class StatuslineStaticCheckTest {

    private static final Path MAIN = Path.of("src", "main", "java");
    private static final Path HELPER = Path.of("..", "helper");
    private static final Pattern CREDENTIALS_LITERAL = Pattern.compile("[\"'`][^\"'`\\n]*\\.credentials[^\"'`\\n]*[\"'`]");
    private static final Pattern ANTHROPIC = Pattern.compile("anthropic", Pattern.CASE_INSENSITIVE);

    private static List<Path> sources() throws IOException {
        List<Path> files = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(MAIN)) {
            walk.filter(path -> path.toString().endsWith(".java")).forEach(files::add);
        }
        try (Stream<Path> walk = Files.walk(HELPER)) {
            walk.filter(path -> path.toString().endsWith(".mjs") && !path.startsWith(HELPER.resolve("test")))
                    .forEach(files::add);
        }
        return files;
    }

    @Test
    @DisplayName("[FR-027-AC7] main·helper 소스에 .credentials 경로 문자열 0회, Anthropic 주소 0회")
    void noCredentialsReadAndNoAnthropicAddress() throws IOException {
        List<Path> files = sources();
        assertThat(files).as("검사 대상이 있어야 한다").hasSizeGreaterThan(50);
        assertThat(files).anyMatch(path -> path.getFileName().toString().equals("aojistudio-statusline.mjs"));

        List<String> violations = new ArrayList<>();
        for (Path file : files) {
            String text = Files.readString(file);
            if (CREDENTIALS_LITERAL.matcher(text).find()) {
                violations.add(file + ": .credentials 경로 문자열");
            }
            if (ANTHROPIC.matcher(text).find()) {
                violations.add(file + ": Anthropic 주소");
            }
        }

        assertThat(violations).isEmpty();
    }
}
