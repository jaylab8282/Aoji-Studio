package studio.aoji.legacy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v1.0.x 호환 · v1.1.0 제거. 서버 환경 변수 해석 순수 함수(ADR-56).
 *
 * <p>규칙: 빈 문자열 = 설정 안 됨. 새 이름({@code AOJISTUDIO_*})이 있으면 새 값(옛 이름도 있으면 경고),
 * 새 이름이 없고 옛 이름({@code JAYSTUDIO_*})만 있으면 옛 값 + 경고, 둘 다 없으면 결과에 넣지 않는다
 * (기본값·필수 검사는 {@code AppProperties}가 한다).
 */
public final class LegacyEnv {

    static final String NEW_PREFIX = "AOJISTUDIO_";

    /** 해석 대상: 환경 변수 이름 접미 → 프로퍼티 키. */
    public static final Map<String, String> TARGETS = Map.of(
            "HOST_PATH", "aojistudio.host-path",
            "PUBLIC_PORT", "aojistudio.public-port",
            "MOUNT_PATH", "aojistudio.mount-path",
            "DATA_PATH", "aojistudio.data-path",
            "HELPER_URL", "aojistudio.helper-url",
            "ALLOWED_ORIGINS", "aojistudio.allowed-origins",
            "POLL_INTERVAL_MS", "aojistudio.poll-interval-ms");

    public enum Kind {
        /** 옛 이름만 있어 옛 값을 쓴다. */
        IN_USE,
        /** 새 이름이 우선하고 옛 이름은 값이 달라 무시한다. */
        IGNORED_DIFFERENT,
        /** 새 이름이 우선하고 옛 이름은 같은 값이라 중복이다. */
        DUPLICATE
    }

    /** 경고는 변수 이름만 담는다(값 없음, NFR-08). */
    public record Warning(Kind kind, String legacyName, String newName) {
    }

    public record Result(Map<String, String> properties, List<Warning> warnings) {
    }

    private LegacyEnv() {
    }

    /** @param env 프로세스 환경 이름 → 값(이름은 접두 포함 전체) */
    public static Result resolve(Map<String, String> env) {
        Map<String, String> properties = new LinkedHashMap<>();
        List<Warning> warnings = new ArrayList<>();
        for (String suffix : names()) {
            String newName = NEW_PREFIX + suffix;
            String legacyName = LegacyNames.LEGACY_ENV_PREFIX + suffix;
            String newValue = blankToNull(env.get(newName));
            String legacyValue = blankToNull(env.get(legacyName));
            String key = TARGETS.get(suffix);
            if (newValue != null) {
                properties.put(key, newValue);
                if (legacyValue != null) {
                    warnings.add(new Warning(
                            legacyValue.equals(newValue) ? Kind.DUPLICATE : Kind.IGNORED_DIFFERENT, legacyName, newName));
                }
            } else if (legacyValue != null) {
                properties.put(key, legacyValue);
                warnings.add(new Warning(Kind.IN_USE, legacyName, newName));
            }
        }
        return new Result(properties, warnings);
    }

    /** 해석 대상 이름 접미(고정 순서). */
    public static List<String> names() {
        return List.of("HOST_PATH", "PUBLIC_PORT", "MOUNT_PATH", "DATA_PATH", "HELPER_URL", "ALLOWED_ORIGINS",
                "POLL_INTERVAL_MS");
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v;
    }
}
