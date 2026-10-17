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
            for (String violation : violationsIn(Files.readString(file))) {
                violations.add(file + ": " + violation);
            }
        }

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("[NFR-17] 주석 안의 금지 낱말은 위반이 아니다")
    void forbiddenWordsInCommentsAreNotViolations() {
        String source = "/** HttpClient, new URL( 설명 */\n"
                + "class A {\n"
                + "    // RestTemplate, java.net.http\n"
                + "    String url = \"http://example\"; /* HttpClient */ // RestClient\n"
                + "}\n";

        assertThat(violationsIn(source)).isEmpty();
    }

    @Test
    @DisplayName("[NFR-17] 코드의 new URL( 은 위반 1건이다")
    void newUrlInCodeIsOneViolation() {
        String source = "class A {\n"
                + "    // HttpClient 는 주석\n"
                + "    Object u = new URL(\"http://x\");\n"
                + "}\n";

        assertThat(violationsIn(source)).hasSize(1);
    }

    @Test
    @DisplayName("[NFR-17] 리터럴 안의 // 와 /* 는 주석이 아니어서 뒤 코드의 금지 호출이 위반으로 남는다")
    void literalsKeepFollowingCodeVisible() {
        String stringLiteral = "class A { String s = \"http://x\"; Object u = new URL(s); }\n";
        String charLiteral = "class A { char c = '/'; Object u = new URL(\"x\"); }\n";
        String textBlock = "class A { String t = \"\"\"\n    http://x /* y\n    \"\"\"; Object u = new URL(t); }\n";

        assertThat(violationsIn(stringLiteral)).hasSize(1);
        assertThat(violationsIn(charLiteral)).hasSize(1);
        assertThat(violationsIn(textBlock)).hasSize(1);
    }

    private static List<String> violationsIn(String source) {
        String code = stripComments(source);
        List<String> found = new ArrayList<>();
        for (Pattern pattern : FORBIDDEN) {
            if (pattern.matcher(code).find()) {
                found.add(pattern.pattern());
            }
        }
        return found;
    }

    /** 주석만 지운다. 문자열·문자 리터럴·텍스트 블록 안의 {@code //}·{@code /*}는 주석이 아니다(conventions §8 v1.2.1). */
    static String stripComments(String s) {
        StringBuilder out = new StringBuilder();
        int i = 0;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (s.startsWith("\"\"\"", i)) {
                int end = s.indexOf("\"\"\"", i + 3);
                end = end < 0 ? n : end + 3;
                out.append(s, i, end);
                i = end;
            } else if (c == '"' || c == '\'') {
                int j = i + 1;
                while (j < n && s.charAt(j) != c && s.charAt(j) != '\n') {
                    j += s.charAt(j) == '\\' ? 2 : 1;
                }
                j = Math.min(j + 1, n);
                out.append(s, i, j);
                i = j;
            } else if (s.startsWith("//", i)) {
                while (i < n && s.charAt(i) != '\n') {
                    i++;
                }
            } else if (s.startsWith("/*", i)) {
                int end = s.indexOf("*/", i + 2);
                i = end < 0 ? n : end + 2;
                out.append(' ');
            } else {
                out.append(c);
                i++;
            }
        }
        return out.toString();
    }
}
