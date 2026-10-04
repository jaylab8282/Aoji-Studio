package studio.aoji.registry;

import java.util.regex.Pattern;

/**
 * {@code model} frontmatter 값 검증 (ADR-13, FR-010-AC3).
 *
 * <p>공식 문서가 허용하는 값: 별칭 {@code sonnet}·{@code opus}·{@code haiku}, 전체 모델 ID
 * (예: {@code claude-opus-5}), {@code inherit}. 서버는 {@code null}(상속, frontmatter 생략)과
 * {@code ^[a-z0-9.-]{1,64}$} 정규식을 통과하는 값만 허용한다 — 별칭 세 개도 이 정규식을 만족하므로
 * 별도 목록 검사가 필요 없다.
 */
public final class ModelValidator {

    private static final Pattern PATTERN = Pattern.compile("^[a-z0-9.-]{1,64}$");

    private ModelValidator() {}

    /** {@code null}(상속)이거나 정규식을 만족하면 true. */
    public static boolean isValid(String model) {
        return model == null || PATTERN.matcher(model).matches();
    }
}
