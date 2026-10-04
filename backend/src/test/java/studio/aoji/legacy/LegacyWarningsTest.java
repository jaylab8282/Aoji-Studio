package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

class LegacyWarningsTest {

    private static final String TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private final List<String> lines = new ArrayList<>();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-04T00:00:00Z"));
    private final LegacyWarnings warnings = new LegacyWarnings(clock, lines::add);

    @Test
    @DisplayName("[NFR-08][ADR-53] 형식 '[legacy] <종류> · … · v1.1.0에서 제거됩니다'")
    void format() {
        warnings.envInUse("JAYSTUDIO_HOST_PATH", "AOJISTUDIO_HOST_PATH");
        warnings.mainClass();
        warnings.dataDirMoved(3, 2, true, true);

        assertThat(lines).hasSize(3);
        assertThat(lines.get(0)).isEqualTo("[legacy] env · JAYSTUDIO_HOST_PATH 사용 중 · "
                + "AOJISTUDIO_HOST_PATH로 바꾸세요 · v1.1.0에서 제거됩니다");
        assertThat(lines.get(1)).startsWith("[legacy] main-class · ").endsWith(" · v1.1.0에서 제거됩니다");
        assertThat(lines.get(2)).startsWith("[legacy] data-dir · ").contains("teams 3, trash 2, collect-token, helper-token")
                .endsWith(" · v1.1.0에서 제거됩니다");
    }

    @Test
    @DisplayName("[ADR-53] 기동성 경고는 호출마다 1줄")
    void startupWarningsAreNotThrottled() {
        warnings.mainClass();
        warnings.mainClass();

        assertThat(lines).hasSize(2);
    }

    @Test
    @DisplayName("[ADR-53] 요청성 경고: 1시간 안 3회 → 1줄, 1시간+1초 뒤 → 2번째 줄 + '(지난 출력 이후 2회)'")
    void requestWarningsAreThrottledPerHour() {
        warnings.collectHeaderUsed();
        clock.advance(Duration.ofMinutes(10));
        warnings.collectHeaderUsed();
        clock.advance(Duration.ofMinutes(40));
        warnings.collectHeaderUsed();

        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).doesNotContain("지난 출력 이후");

        clock.advance(Duration.ofMinutes(10).plusSeconds(1));
        warnings.collectHeaderUsed();

        assertThat(lines).hasSize(2);
        assertThat(lines.get(1)).endsWith("(지난 출력 이후 2회)");

        // 세부가 다르면 따로 센다
        warnings.collectHeaderIgnored();
        assertThat(lines).hasSize(3);
        assertThat(lines.get(2)).contains("무시").doesNotContain("지난 출력 이후");
    }

    @Test
    @DisplayName("[NFR-08][ADR-53] 토큰 자리는 ••••••••이고 입력 값 부분 문자열이 출력에 없다")
    void tokenIsMasked() {
        warnings.collectHeaderUsed();
        warnings.collectHeaderIgnored();

        assertThat(lines).hasSize(2).allSatisfy(line -> {
            assertThat(line).contains("••••••••");
            assertThat(line).doesNotContain(TOKEN.substring(0, 8));
        });
    }

    @Test
    @DisplayName("[NFR-08][ADR-53] 전 종류 일괄 — 토큰 값·마운트 절대 경로·환경 변수 값 0건")
    void allKindsLeakNothing(@TempDir Path mount) {
        String mountPath = mount.toAbsolutePath().toString();
        String[] forbidden = {TOKEN, mountPath, "/Users/someone/Desktop/AojiStudio", "4180", "http://127.0.0.1:4180"};

        // 환경 변수 값·토큰·마운트 경로는 어떤 메서드에도 넘기지 않는 것이 계약이고,
        // 문자열을 받는 인자는 이름·고정 단어뿐이다. 그래도 호출 전후 상태에 값이 새지 않는지 본다.
        Map<String, Runnable> byMethod = new LinkedHashMap<>();
        byMethod.put("envInUse", () -> warnings.envInUse("JAYSTUDIO_HOST_PATH", "AOJISTUDIO_HOST_PATH"));
        byMethod.put("envIgnored", () -> warnings.envIgnored("JAYSTUDIO_PUBLIC_PORT", "AOJISTUDIO_PUBLIC_PORT"));
        byMethod.put("collectHeaderUsed", warnings::collectHeaderUsed);
        byMethod.put("collectHeaderIgnored", warnings::collectHeaderIgnored);
        byMethod.put("dataDirMoved", () -> warnings.dataDirMoved(3, 2, true, true));
        byMethod.put("dataDirBothExist", warnings::dataDirBothExist);
        byMethod.put("dataDirReadOnly", warnings::dataDirReadOnly);
        byMethod.put("helperTokenFallback", warnings::helperTokenFallback);
        byMethod.put("helperTokenNotRegular", () -> warnings.helperTokenNotRegular("심볼릭 링크"));
        byMethod.put("mainClass", warnings::mainClass);

        // 공개 메서드 전수와 같아야 한다(메서드를 추가하면 이 테스트도 바뀌어야 한다)
        TreeSet<String> publicMethods = new TreeSet<>();
        for (Method m : LegacyWarnings.class.getDeclaredMethods()) {
            if (Modifier.isPublic(m.getModifiers()) && !Modifier.isStatic(m.getModifiers())) {
                publicMethods.add(m.getName());
            }
        }
        assertThat(new TreeSet<>(byMethod.keySet())).isEqualTo(publicMethods);

        byMethod.values().forEach(Runnable::run);

        assertThat(lines).hasSize(byMethod.size());
        String all = String.join("\n", lines);
        assertThat(all).contains("[legacy] env", "[legacy] collect-header", "[legacy] data-dir",
                "[legacy] helper-token", "[legacy] main-class");
        for (String f : forbidden) {
            assertThat(all).as("금지 문자열 %s", f).doesNotContain(f);
        }
        assertThat(Arrays.stream(forbidden).filter(all::contains).count()).isZero();
    }

    @Test
    @DisplayName("[ADR-53] 로거 출력은 WARN 레벨 한 줄")
    void loggerOutputIsWarn() {
        Logger logger = (Logger) LoggerFactory.getLogger(LegacyWarnings.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            new LegacyWarnings(clock).mainClass();
        } finally {
            logger.detachAppender(appender);
        }

        assertThat(appender.list).hasSize(1);
        assertThat(appender.list.get(0).getLevel()).isEqualTo(Level.WARN);
        assertThat(appender.list.get(0).getFormattedMessage()).startsWith("[legacy] main-class · ");
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
