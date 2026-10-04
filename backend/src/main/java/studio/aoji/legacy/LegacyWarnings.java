package studio.aoji.legacy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * v1.0.x 호환 · v1.1.0 제거. {@code [legacy]} 경고 로그의 유일한 출구(ADR-53).
 *
 * <p>형식: {@code [legacy] <종류> · <받아들인 것> · <조치> · v1.1.0에서 제거됩니다}.
 * 값은 쓰지 않는다 - 환경 변수는 이름만, 토큰은 {@code ••••••••}, 경로는 마운트 기준 상대 경로만 쓴다(NFR-08).
 * 기동성 경고는 호출마다 1줄, 요청성 경고(collect-header, helper-token)는 세부별로 첫 1회 + 1시간에 최대 1회이며
 * 억제한 횟수를 {@code (지난 출력 이후 N회)}로 붙인다. 상태는 메모리 타임스탬프·카운터뿐이다.
 */
@Component
public class LegacyWarnings {

    static final String MASKED_TOKEN = "••••••••";
    static final Duration REQUEST_INTERVAL = Duration.ofHours(1);
    private static final Logger LOG = LoggerFactory.getLogger(LegacyWarnings.class);
    private static final String SUFFIX = "v1.1.0에서 제거됩니다";

    private final Clock clock;
    private final Consumer<String> sink;
    private final Map<String, Throttle> throttles = new HashMap<>();

    @Autowired
    public LegacyWarnings(Clock clock) {
        this(clock, LOG::warn);
    }

    public LegacyWarnings(Clock clock, Consumer<String> sink) {
        this.clock = clock;
        this.sink = sink;
    }

    /** 앱 컨텍스트 밖(옛 메인 shim)에서 쓰는 로거 출력 인스턴스. */
    public static LegacyWarnings logging() {
        return new LegacyWarnings(Clock.systemUTC());
    }

    // ---- 기동성 ----

    /** env · 옛 환경 변수를 새 변수가 없어 쓰는 경우. 이름만 받는다. */
    public void envInUse(String legacyName, String newName) {
        startup("env", legacyName + " 사용 중", newName + "로 바꾸세요");
    }

    /** env · 새 변수가 우선해 옛 변수를 무시하는 경우. 이름만 받는다. */
    public void envIgnored(String legacyName, String newName) {
        startup("env", legacyName + " 무시(" + newName + " 우선, 값이 다름)", legacyName + "를 지우세요");
    }

    /** env · 새 변수와 옛 변수가 같은 값으로 함께 설정된 경우. 이름만 받는다. */
    public void envDuplicate(String legacyName, String newName) {
        startup("env", legacyName + " 도 설정됨(" + newName + "와 같은 값, " + newName + " 사용)", legacyName + "를 지우세요");
    }

    /** data-dir · 이동 완료. teams·trash는 파일 개수. */
    public void dataDirMoved(int teams, int trash, boolean collectToken, boolean helperToken) {
        StringBuilder moved = new StringBuilder("teams ").append(teams).append(", trash ").append(trash);
        if (collectToken) {
            moved.append(", collect-token");
        }
        if (helperToken) {
            moved.append(", helper-token");
        }
        startup("data-dir", LegacyNames.LEGACY_DATA_DIR + "/ → .aojistudio/ 옮김(" + moved + ")", "조치 없음");
    }

    /** data-dir · 옛 폴더와 새 폴더가 모두 있어 옮기지 않은 경우. */
    public void dataDirBothExist() {
        startup("data-dir",
                LegacyNames.LEGACY_DATA_DIR + "/와 .aojistudio/가 모두 있어 옮기지 않았습니다(.aojistudio/ 사용)",
                "수집 토큰이 .aojistudio/collect-token 값이라 옛 hook 설정의 토큰이 다르면 수집이 401일 수 있습니다 — "
                        + "07의 새 설정 예시로 .claude/settings.json을 바꾸세요 · "
                        + LegacyNames.LEGACY_DATA_DIR + "/는 확인한 뒤 직접 정리하세요(옛 도우미가 다시 만들었을 수 있습니다)");
    }

    /** data-dir · 쓰기 권한이 없어 옛 폴더를 읽기 전용으로 쓰는 경우. */
    public void dataDirReadOnly() {
        startup("data-dir",
                "마운트에 쓰기 권한이 없어 " + LegacyNames.LEGACY_DATA_DIR + "/를 옮기지 않았습니다("
                        + LegacyNames.LEGACY_DATA_DIR + "/를 읽기 전용으로 사용)",
                "쓰기 가능한 마운트로 다시 기동하면 .aojistudio/로 옮깁니다");
    }

    /** main-class · 옛 메인 클래스로 기동한 경우. */
    public void mainClass() {
        startup("main-class", LegacyNames.LEGACY_MAIN_CLASS + " 로 기동",
                "studio.aoji.AojiStudioApplication으로 바꾸세요");
    }

    // ---- 요청성 ----

    /** collect-header · 옛 헤더로 인증에 성공한 경우(토큰은 마스킹). */
    public void collectHeaderUsed() {
        request("collect-header", "used",
                LegacyNames.LEGACY_COLLECT_TOKEN_HEADER + ": " + MASKED_TOKEN + " 수신",
                "07의 새 설정 예시(X-AojiStudio-Collect-Token)로 .claude/settings.json을 바꾸세요");
    }

    /** collect-header · 새 헤더가 있어 옛 헤더를 무시한 경우. */
    public void collectHeaderIgnored() {
        request("collect-header", "ignored",
                LegacyNames.LEGACY_COLLECT_TOKEN_HEADER + ": " + MASKED_TOKEN + " 무시(새 헤더 우선)",
                "07의 새 설정 예시(X-AojiStudio-Collect-Token)로 .claude/settings.json을 바꾸세요");
    }

    /** helper-token · 새 토큰 파일이 없어 옛 도우미 토큰을 쓴 경우. */
    public void helperTokenFallback() {
        request("helper-token", "fallback",
                ".aojistudio/helper-token 없음, " + LegacyNames.LEGACY_DATA_DIR + "/helper-token(옛 도우미) 사용",
                "helper/install.sh로 새 도우미를 설치하세요");
    }

    /** helper-token · 옛 토큰 파일이 일반 파일이 아니라 읽지 않은 경우. fileKind는 고정 단어(예: 심볼릭 링크). */
    public void helperTokenNotRegular(String fileKind) {
        request("helper-token", "not-regular:" + fileKind,
                LegacyNames.LEGACY_DATA_DIR + "/helper-token을 읽지 않았습니다(일반 파일이 아님: " + fileKind + ")",
                "helper/install.sh로 새 도우미를 설치하세요");
    }

    private void startup(String kind, String accepted, String action) {
        sink.accept(line(kind, accepted, action, ""));
    }

    private void request(String kind, String detail, String accepted, String action) {
        Instant now = clock.instant();
        String suffix;
        synchronized (throttles) {
            Throttle t = throttles.get(kind + "/" + detail);
            if (t == null) {
                throttles.put(kind + "/" + detail, new Throttle(now));
                suffix = "";
            } else if (Duration.between(t.lastPrinted, now).compareTo(REQUEST_INTERVAL) >= 0) {
                suffix = t.suppressed > 0 ? " (지난 출력 이후 " + t.suppressed + "회)" : "";
                t.lastPrinted = now;
                t.suppressed = 0;
            } else {
                t.suppressed++;
                return;
            }
        }
        sink.accept(line(kind, accepted, action, suffix));
    }

    private static String line(String kind, String accepted, String action, String suffix) {
        return "[legacy] " + kind + " · " + accepted + " · " + action + " · " + SUFFIX + suffix;
    }

    private static final class Throttle {
        Instant lastPrinted;
        int suppressed;

        Throttle(Instant lastPrinted) {
            this.lastPrinted = lastPrinted;
        }
    }
}
