package studio.aoji.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 민감 정보 마스킹 (FR-015-AC1). 키워드 10종 × {@code =}·{@code :} 조합 + 접두 4종을 각각 검증한다
 * (conventions.md §8 "MaskerTest는 ... 키워드 10종과 접두 4종을 각각 검증한다").
 */
class MaskerTest {

    private final Masker masker = new Masker();

    private static final List<String> KEYWORDS = List.of(
            "token", "key", "secret", "password", "passwd", "pwd", "api_key", "api-key", "authorization",
            "bearer", "cookie");

    static Stream<Arguments> keywordEqualsCombinations() {
        return KEYWORDS.stream().map(keyword -> Arguments.of(keyword, "="));
    }

    static Stream<Arguments> keywordColonCombinations() {
        return KEYWORDS.stream().map(keyword -> Arguments.of(keyword, ":"));
    }

    @ParameterizedTest(name = "[FR-015-AC1] {0}{1}값 → 마스킹")
    @MethodSource("keywordEqualsCombinations")
    void keywordWithEqualsIsMasked(String keyword, String separator) {
        String masked = masker.mask("export " + keyword + separator + "abc123XYZ");
        assertThat(masked).doesNotContain("abc123XYZ").contains("••••••••");
    }

    @ParameterizedTest(name = "[FR-015-AC1] {0}{1}값 → 마스킹")
    @MethodSource("keywordColonCombinations")
    void keywordWithColonIsMasked(String keyword, String separator) {
        String masked = masker.mask(keyword + separator + "abc123XYZ");
        assertThat(masked).doesNotContain("abc123XYZ").contains("••••••••");
    }

    @Test
    void keywordCaseIsIgnored() {
        // [FR-015-AC1] 대소문자 무시
        assertThat(masker.mask("TOKEN=abc123")).doesNotContain("abc123");
        assertThat(masker.mask("Authorization:abc123")).doesNotContain("abc123");
    }

    @Test
    void skPrefixIsMasked() {
        // [FR-015-AC1] sk- 접두
        String masked = masker.mask("key is sk-abcdefGHIJKL123456");
        assertThat(masked).doesNotContain("sk-abcdefGHIJKL123456");
    }

    @Test
    void ghpPrefixIsMasked() {
        // [FR-015-AC1] ghp_ 접두
        String masked = masker.mask("token ghp_abcdefGHIJKL123456");
        assertThat(masked).doesNotContain("ghp_abcdefGHIJKL123456");
    }

    @Test
    void xoxPrefixIsMasked() {
        // [FR-015-AC1] xox[abp]- 접두
        assertThat(masker.mask("slack xoxb-111-222-abcdef")).doesNotContain("xoxb-111-222-abcdef");
        assertThat(masker.mask("slack xoxp-111-222-abcdef")).doesNotContain("xoxp-111-222-abcdef");
        assertThat(masker.mask("slack xoxa-111-222-abcdef")).doesNotContain("xoxa-111-222-abcdef");
    }

    @Test
    void akiaPrefixIsMasked() {
        // [FR-015-AC1] AKIA 접두
        String masked = masker.mask("aws AKIAABCDEFGH123456");
        assertThat(masked).doesNotContain("AKIAABCDEFGH123456");
    }

    @Test
    void plainTextWithoutSensitiveValuesIsUnchanged() {
        String input = "export SOMETHING=value";
        assertThat(masker.mask(input)).isEqualTo(input);
    }

    @Test
    void nullAndEmptyAreReturnedAsIs() {
        assertThat(masker.mask(null)).isNull();
        assertThat(masker.mask("")).isEmpty();
    }
}
