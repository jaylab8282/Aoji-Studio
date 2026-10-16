package studio.aoji.support;

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

/** 정적 검사 (NFR-17, conventions §3): main 소스에 외부로 나가는 HTTP 클라이언트를 쓰지 않는다. */
class NoOutboundHttpTest {

    private static final Path MAIN = Path.of("src", "main", "java");
    private static final List<Pattern> FORBIDDEN = List.of(
            Pattern.compile("\\bjava\\.net\\.http\\b"),
            Pattern.compile("\\bHttpClient\\b"),
            Pattern.compile("\\bHttpURLConnection\\b"),
            Pattern.compile("\\bHttpsURLConnection\\b"),
            Pattern.compile("\\.openConnection\\s*\\("),
            Pattern.compile("\\bRestClient\\b"),
            Pattern.compile("\\bRestTemplate\\b"),
            Pattern.compile("\\bWebClient\\b"),
            Pattern.compile("\\bnew\\s+URL\\s*\\("),
            Pattern.compile("\\.toURL\\s*\\("),
            Pattern.compile("\\bnew\\s+Socket\\s*\\("));

    @Test
    @DisplayName("[NFR-17] main 소스에 금지된 외부 HTTP 클라이언트 클래스 0회")
    void noForbiddenOutboundHttpClasses() throws IOException {
        List<Path> files = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(MAIN)) {
            walk.filter(path -> path.toString().endsWith(".java")).forEach(files::add);
        }
        assertThat(files).as("검사 대상이 있어야 한다").hasSizeGreaterThan(50);

        List<String> violations = new ArrayList<>();
        for (Path file : files) {
            String text = Files.readString(file);
            for (Pattern pattern : FORBIDDEN) {
                if (pattern.matcher(text).find()) {
                    violations.add(file + ": " + pattern.pattern());
                }
            }
        }

        assertThat(violations).isEmpty();
    }
}
