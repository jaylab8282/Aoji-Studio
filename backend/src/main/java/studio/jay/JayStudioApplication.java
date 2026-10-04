package studio.jay;

import studio.aoji.AojiStudioApplication;
import studio.aoji.legacy.LegacyWarnings;

/**
 * v1.0.x 호환 · v1.1.0 제거. 옛 패키지의 메인 클래스를 지정해 기동하던 실행 방식(ADR-58)을 받는다.
 * Spring 애노테이션은 없다 - 컴포넌트 스캔 대상이 아니며, 경고 1줄 뒤 새 메인에 위임만 한다.
 */
@Deprecated(since = "1.0.1", forRemoval = true)
public final class JayStudioApplication {

    private JayStudioApplication() {
    }

    public static void main(String[] args) {
        LegacyWarnings.logging().mainClass();
        AojiStudioApplication.main(args);
    }
}
