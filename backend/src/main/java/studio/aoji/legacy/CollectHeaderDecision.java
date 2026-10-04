package studio.aoji.legacy;

/**
 * v1.0.x 호환 · v1.1.0 제거. 수집 토큰 헤더 판정 순수 함수(ADR-54, api-spec {@code /hooks/events} 판정표).
 * 검사할 값과, 인증 성공 시 남길 경고 종류만 정한다. 로그·상태는 다루지 않는다.
 */
public record CollectHeaderDecision(String tokenToCheck, Warning warningOnSuccess) {

    /** 인증 성공 시 남길 경고 종류. */
    public enum Warning {
        NONE,
        LEGACY_USED,
        LEGACY_IGNORED
    }

    /** 새 헤더가 있으면 새 값만, 없으면 옛 헤더 값을 검사 대상으로 삼는다. 둘 다 없으면 검사 값은 null. */
    public static CollectHeaderDecision decide(String newHeader, String legacyHeader) {
        if (newHeader != null) {
            return new CollectHeaderDecision(newHeader, legacyHeader != null ? Warning.LEGACY_IGNORED : Warning.NONE);
        }
        if (legacyHeader != null) {
            return new CollectHeaderDecision(legacyHeader, Warning.LEGACY_USED);
        }
        return new CollectHeaderDecision(null, Warning.NONE);
    }
}
