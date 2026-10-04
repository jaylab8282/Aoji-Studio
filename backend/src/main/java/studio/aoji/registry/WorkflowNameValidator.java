package studio.aoji.registry;

import java.util.Collection;
import java.util.regex.Pattern;

/**
 * 워크플로우 이름 검증 (api-spec {@code POST /api/workflows}, FR-008-AC1·AC2, architecture.md §6.2).
 * 이름은 trim 후 1~40자, {@code ^[가-힣A-Za-z0-9 _-]+$}만 허용한다. 파일명은 이름 그대로
 * {@code <이름>.json}이다. 중복 판정은 대소문자를 무시한다(FR-008-AC1).
 */
public final class WorkflowNameValidator {

    public static final int MAX_LENGTH = 40;
    public static final String VALIDATION_MESSAGE = "1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만";

    private static final Pattern ALLOWED = Pattern.compile("^[가-힣A-Za-z0-9 _-]+$");
    private static final String FILE_SUFFIX = ".json";

    private WorkflowNameValidator() {}

    /** 앞뒤 공백을 제거한다. {@code raw}가 {@code null}이면 빈 문자열을 돌려준다. */
    public static String normalize(String raw) {
        return raw == null ? "" : raw.strip();
    }

    /** trim된 이름이 길이·허용 문자 규칙을 지키는지 검사한다(FR-008-AC2). */
    public static boolean isValidFormat(String normalizedName) {
        return !normalizedName.isEmpty()
                && normalizedName.length() <= MAX_LENGTH
                && ALLOWED.matcher(normalizedName).matches();
    }

    /** 대소문자 무시 중복 여부(FR-008-AC1). */
    public static boolean isDuplicate(String normalizedName, Collection<String> existingNames) {
        return existingNames.stream().anyMatch(existing -> existing.equalsIgnoreCase(normalizedName));
    }

    /** 파일명 = 이름 그대로 {@code <이름>.json}(FR-008-AC2). */
    public static String fileName(String normalizedName) {
        return normalizedName + FILE_SUFFIX;
    }
}
