package studio.aoji.mcp;

import org.springframework.stereotype.Component;
import studio.aoji.live.Masker;

/**
 * MCP 설정 값 가림 (FR-023-AC2, ADR-85 결정 3). {@code env}·{@code headers} 값과 URL 쿼리 값은 전부
 * {@value #MASK}이고, {@code command}·{@code args}·URL 경로는 FR-015 패턴({@link Masker})을 적용한다.
 */
@Component
public class McpMasker {

    public static final String MASK = "••••••••";

    private final Masker masker;

    public McpMasker(Masker masker) {
        this.masker = masker;
    }

    /** {@code command}·{@code args}처럼 FR-015 패턴만 적용하는 텍스트. */
    public String maskText(String text) {
        return masker.mask(text);
    }

    /** URL: 사용자 정보(user:pass@)와 쿼리 값은 모두 가리고, 경로는 FR-015 패턴을 적용한다. 프래그먼트는 버린다. */
    public String maskUrl(String url) {
        String withoutFragment = url;
        int hash = withoutFragment.indexOf('#');
        if (hash >= 0) {
            withoutFragment = withoutFragment.substring(0, hash);
        }
        String base = withoutFragment;
        String query = null;
        int question = withoutFragment.indexOf('?');
        if (question >= 0) {
            base = withoutFragment.substring(0, question);
            query = withoutFragment.substring(question + 1);
        }
        base = maskUserInfo(base);
        StringBuilder result = new StringBuilder(masker.mask(base));
        if (query != null) {
            result.append('?');
            String[] pairs = query.split("&", -1);
            for (int i = 0; i < pairs.length; i++) {
                if (i > 0) {
                    result.append('&');
                }
                int eq = pairs[i].indexOf('=');
                if (eq < 0) {
                    result.append(pairs[i].isEmpty() ? "" : MASK);
                } else {
                    result.append(pairs[i], 0, eq + 1).append(MASK);
                }
            }
        }
        return result.toString();
    }

    private static String maskUserInfo(String base) {
        int scheme = base.indexOf("://");
        if (scheme < 0) {
            return base;
        }
        int authorityStart = scheme + 3;
        int slash = base.indexOf('/', authorityStart);
        int authorityEnd = slash < 0 ? base.length() : slash;
        int at = base.lastIndexOf('@', authorityEnd - 1);
        if (at < authorityStart) {
            return base;
        }
        return base.substring(0, authorityStart) + MASK + base.substring(at);
    }
}
