package studio.aoji.legacy;

/**
 * v1.0.x 호환 · v1.1.0 제거. 옛 이름 상수 모음(ADR-52). 일반 코드는 옛 이름 리터럴을 쓰지 않고 이 상수만 참조한다.
 */
public final class LegacyNames {

    /** 옛 데이터 폴더 이름(마운트 루트 기준). */
    public static final String LEGACY_DATA_DIR = ".jaystudio";
    /** 옛 수집 토큰 헤더. */
    public static final String LEGACY_COLLECT_TOKEN_HEADER = "X-JayStudio-Collect-Token";
    /** 옛 환경 변수 접두. */
    public static final String LEGACY_ENV_PREFIX = "JAYSTUDIO_";
    /** 옛 메인 클래스 이름. */
    public static final String LEGACY_MAIN_CLASS = "studio.jay.JayStudioApplication";

    private LegacyNames() {
    }
}
