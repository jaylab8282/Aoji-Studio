package studio.aoji.legacy;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.apache.commons.logging.Log;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.logging.DeferredLogFactory;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.env.PropertySource;

/**
 * v1.0.x 호환 · v1.1.0 제거. 새·옛 환경 변수를 {@link LegacyEnv}로 해석해 {@code aojistudio.*} 키의
 * 최우선 프로퍼티 소스로 넣는다(ADR-56). 로깅 초기화 전이라 경고는 {@link DeferredLogFactory}로 남긴다.
 * 변수 값은 {@link LegacyWarnings}에 넘기지 않는다 - 이름만 넘긴다.
 */
public class LegacyEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String SOURCE_NAME = "aojistudioEnvResolved";

    private final Log log;

    public LegacyEnvironmentPostProcessor(DeferredLogFactory logFactory) {
        this.log = logFactory.getLog(LegacyWarnings.class);
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, String> env = new HashMap<>();
        for (String suffix : LegacyEnv.names()) {
            for (String prefix : new String[] {LegacyEnv.NEW_PREFIX, LegacyNames.LEGACY_ENV_PREFIX}) {
                String name = prefix + suffix;
                String value = read(environment, name);
                if (value != null) {
                    env.put(name, value);
                }
            }
        }
        LegacyEnv.Result result = LegacyEnv.resolve(env);
        LegacyWarnings warnings = new LegacyWarnings(Clock.systemUTC(), log::warn);
        for (LegacyEnv.Warning w : result.warnings()) {
            switch (w.kind()) {
                case IN_USE -> warnings.envInUse(w.legacyName(), w.newName());
                case IGNORED_DIFFERENT -> warnings.envIgnored(w.legacyName(), w.newName());
                case DUPLICATE -> warnings.envDuplicate(w.legacyName(), w.newName());
            }
        }
        maskBlankNewNames(environment);
        if (!result.properties().isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource(SOURCE_NAME, new HashMap<String, Object>(result.properties())));
        }
    }

    /**
     * 빈 문자열 = 설정 안 됨(ADR-56). 스프링이 환경 변수 소스에서 {@code AOJISTUDIO_*=""}를 그대로 {@code aojistudio.*=""}로
     * 묶으면 yaml 기본값(dev 프로필의 5173 등)이나 {@code @Scheduled} 기본값을 빈 값이 덮어쓴다. 값이 빈 대상 변수를 뺀
     * 복사본으로 그 환경 변수 소스를 같은 이름·같은 자리에 바꿔 끼워 "없는 것"으로 만든다.
     */
    private static void maskBlankNewNames(ConfigurableEnvironment environment) {
        MutablePropertySources sources = environment.getPropertySources();
        for (PropertySource<?> source : sources.stream().toList()) {
            if (!(source instanceof SystemEnvironmentPropertySource systemSource)) {
                continue;
            }
            Map<String, Object> copy = new HashMap<>(systemSource.getSource());
            boolean changed = false;
            for (String suffix : LegacyEnv.names()) {
                String name = LegacyEnv.NEW_PREFIX + suffix;
                Object value = copy.get(name);
                if (value != null && value.toString().isBlank()) {
                    copy.remove(name);
                    changed = true;
                }
            }
            if (changed) {
                sources.replace(source.getName(), new SystemEnvironmentPropertySource(source.getName(), copy));
            }
        }
    }

    private static String read(ConfigurableEnvironment environment, String name) {
        for (PropertySource<?> source : environment.getPropertySources()) {
            Object value = source.getProperty(name);
            if (value != null) {
                return value.toString();
            }
        }
        return null;
    }
}
