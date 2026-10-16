package studio.aoji.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import studio.aoji.live.Masker;

/** MCP 설정 값 가림 (FR-023-AC2, ADR-85 결정 3). */
class McpMaskerTest {

    private static final String MASK = "••••••••";
    private final McpMasker masker = new McpMasker(new Masker());

    @Test
    @DisplayName("[FR-023-AC2] env·headers 값은 전부 ••••••••, 키 이름만 남는다")
    void envAndHeaderValuesAreMasked() {
        McpServerDef server = McpServerDef.from(
                "s",
                Map.of(
                        "type", "http",
                        "url", "https://example.test/mcp",
                        "env", Map.of("API_NAME", "plain-value-not-a-secret-pattern"),
                        "headers", Map.of("X-Custom", "visible-looking-value")),
                masker);

        assertThat(server.settings())
                .extracting(McpServerDef.Setting::group, McpServerDef.Setting::key, McpServerDef.Setting::value)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("env", "API_NAME", MASK),
                        org.assertj.core.groups.Tuple.tuple("headers", "X-Custom", MASK));
        assertThat(server.toString()).doesNotContain("plain-value-not-a-secret-pattern").doesNotContain("visible-looking-value");
    }

    @Test
    @DisplayName("[FR-023-AC2] URL 쿼리 값은 모두 ••••••••, 키·경로는 남고 사용자 정보와 프래그먼트는 가려지거나 버려진다")
    void urlQueryValuesAreMasked() {
        assertThat(masker.maskUrl("https://example.test/mcp/github?access=abc123&org=aoji-fixture&flag"))
                .isEqualTo("https://example.test/mcp/github?access=" + MASK + "&org=" + MASK + "&" + MASK);
        assertThat(masker.maskUrl("https://example.test/mcp?bare")).isEqualTo("https://example.test/mcp?" + MASK);
        assertThat(masker.maskUrl("https://user:pw@example.test/mcp#frag")).isEqualTo("https://" + MASK + "@example.test/mcp");
        assertThat(masker.maskUrl("https://example.test/mcp")).isEqualTo("https://example.test/mcp");
    }

    @Test
    @DisplayName("[FR-023-AC2] URL 경로의 FR-015 패턴(sk-·ghp_ 접두 토큰)은 가린다")
    void urlPathUsesFr015Patterns() {
        String masked = masker.maskUrl("https://example.test/hook/sk-abcdef123456/run?x=1");

        assertThat(masked).doesNotContain("sk-abcdef123456").contains(MASK).endsWith("?x=" + MASK);
    }

    @Test
    @DisplayName("[FR-023-AC2] command·args는 FR-015 패턴 적용(key=값, 접두 토큰)")
    void commandAndArgsUseFr015Patterns() {
        McpServerDef server = McpServerDef.from(
                "s",
                Map.of(
                        "command", "node",
                        "args", List.of("server.js", "--token=ghp_ABCDEFGH1234", "--password", "hunter2", "api_key=zzz")),
                masker);

        assertThat(server.transport()).isEqualTo("stdio");
        assertThat(server.command()).startsWith("node server.js").doesNotContain("ghp_ABCDEFGH1234").doesNotContain("zzz");
        assertThat(server.command()).contains("--token=" + MASK);
    }

    @Test
    @DisplayName("[FR-023-AC2] 서버 정의 객체에서 읽는 키는 type·command·args·env·url·headers뿐")
    void unknownKeysAreIgnored() {
        McpServerDef server = McpServerDef.from(
                "s", Map.of("type", "sse", "url", "https://example.test/sse", "secretish", "do-not-keep"), masker);

        assertThat(server.transport()).isEqualTo("sse");
        assertThat(server.command()).isNull();
        assertThat(server.url()).isEqualTo("https://example.test/sse");
        assertThat(server.toString()).doesNotContain("do-not-keep");
    }
}
