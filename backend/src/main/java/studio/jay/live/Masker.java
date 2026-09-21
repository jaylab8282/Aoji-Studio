package studio.jay.live;

import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * 민감 정보 마스킹 (FR-015-AC1). {@code Masker.mask()} 하나로 저장 직전에만 적용한다
 * (conventions.md §6). 마스킹 전 문자열은 필드·로그·응답 어디에도 남기지 않는다.
 */
@Component
public class Masker {

    /** 8자 불릿 마스크 문자열. */
    private static final String MASK = "••••••••";

    /**
     * final_requirements_function.md FR-015-AC1 원문 그대로: 키워드 10종({@code token key secret
     * password passwd pwd api_key api-key authorization bearer cookie}) 뒤 {@code =}·{@code :} 값 부분.
     */
    private static final Pattern KEY_VALUE = Pattern.compile(
            "(?i)(token|key|secret|password|passwd|pwd|api[_-]?key|authorization|bearer|cookie)(\\s*[=:]\\s*)(\\S+)");

    /** 접두 4종({@code sk-}, {@code ghp_}, {@code xox[abp]-}, {@code AKIA}) 토큰 형태 문자열. */
    private static final Pattern PREFIXED_TOKEN = Pattern.compile("(?i)\\b(sk-|ghp_|xox[abp]-|akia)[a-z0-9_-]+");

    /** 마스킹 결과를 돌려준다. {@code null}·빈 문자열은 그대로 돌려준다. */
    public String mask(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }
        String afterKeyValue = KEY_VALUE.matcher(input).replaceAll(match -> match.group(1) + match.group(2) + MASK);
        return PREFIXED_TOKEN.matcher(afterKeyValue).replaceAll(MASK);
    }
}
