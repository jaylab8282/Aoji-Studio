package studio.aoji.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import studio.aoji.AojiStudioApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceInitializationAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/**
 * 필수 환경 변수 검증 (architecture.md §4.2, FR-014-E1, NFR-05).
 * 실제 auto-configuration(DataSource, SQL 초기화)까지 포함해 진짜 기동 경로를 재현한다.
 */
class AppStartupTest {

    @TempDir
    Path dataDir;

    private ApplicationContextRunner contextRunner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        DataSourceAutoConfiguration.class,
                        DataSourceInitializationAutoConfiguration.class))
                .withUserConfiguration(TestConfig.class)
                .withPropertyValues(
                        "spring.datasource.driver-class-name=org.sqlite.JDBC",
                        "spring.sql.init.mode=always",
                        "spring.sql.init.schema-locations=classpath:schema.sql",
                        "aojistudio.data-path=" + dataDir,
                        "spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @Test
    @DisplayName("[FR-014-E1] AOJISTUDIO_HOST_PATH 없음 → 기동 실패, 메시지에 AOJISTUDIO_HOST_PATH")
    void hostPathMissingFailsStartup() {
        contextRunner()
                .withPropertyValues("aojistudio.public-port=4180")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .rootCause()
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("AOJISTUDIO_HOST_PATH");
                });
    }

    @Test
    @DisplayName("[NFR-05] AOJISTUDIO_PUBLIC_PORT 빈값 + 옛 이름 없음 → 기동 실패")
    void publicPortBlankFailsStartup() {
        contextRunner()
                .withPropertyValues(
                        "aojistudio.host-path=/Users/jaybee/Desktop/AojiStudio",
                        "aojistudio.public-port=")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .rootCause()
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("AOJISTUDIO_PUBLIC_PORT");
                });
    }

    @Test
    @DisplayName("필수 환경 변수 모두 있음 → 컨텍스트 기동 성공")
    void allRequiredPropertiesPresentStartsSuccessfully() {
        contextRunner()
                .withPropertyValues(
                        "aojistudio.host-path=/Users/jaybee/Desktop/AojiStudio",
                        "aojistudio.public-port=4180")
                .run(context -> assertThat(context).hasNotFailed());
    }

    /** 환경 변수 소스(SystemEnvironmentPropertySource)에 값을 넣어 SpringApplication을 직접 기동한다. */
    private ConfigurableApplicationContext start(Map<String, Object> fakeEnv, String... profiles) {
        return new SpringApplicationBuilder(AojiStudioApplication.class)
                .listeners(new FakeEnvListener(fakeEnv))
                .profiles(profiles)
                .run(
                        "--server.port=0",
                        "--spring.main.banner-mode=off",
                        "--aojistudio.host-path=/Users/jaybee/Desktop/AojiStudio",
                        "--aojistudio.public-port=4995",
                        "--aojistudio.mount-path=" + mountRoot,
                        "--aojistudio.data-path=" + dataDir,
                        "--spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @TempDir
    Path mountRoot;

    @Test
    @DisplayName("[NFR-05][ADR-47] dev 프로필 → 허용 Origin 5173 유지, 기동 성공")
    void devProfileKeepsAllowedOrigin5173() {
        try (ConfigurableApplicationContext ctx = start(new HashMap<>(), "dev")) {
            assertThat(ctx.isRunning()).isTrue();
            assertThat(ctx.getEnvironment().getProperty("aojistudio.allowed-origins"))
                    .isEqualTo("http://127.0.0.1:5173");
            assertThat(ctx.getBean(AppProperties.class).getAllowedOrigins()).isEqualTo("http://127.0.0.1:5173");
        }
    }

    @Test
    @DisplayName("[NFR-05][ADR-47] AOJISTUDIO_ALLOWED_ORIGINS=\"\" + dev 프로필 → 미설정으로 보아 5173 유지, 기동 성공")
    void blankAllowedOriginsKeepsDevDefault() {
        Map<String, Object> env = new HashMap<>();
        env.put("AOJISTUDIO_ALLOWED_ORIGINS", "");
        try (ConfigurableApplicationContext ctx = start(env, "dev")) {
            assertThat(ctx.isRunning()).isTrue();
            assertThat(ctx.getBean(AppProperties.class).getAllowedOrigins()).isEqualTo("http://127.0.0.1:5173");
        }
    }

    @Test
    @DisplayName("[NFR-05][ADR-47] AOJISTUDIO_POLL_INTERVAL_MS=\"\" → 미설정으로 보아 기본 1000으로 기동 성공")
    void blankPollIntervalKeepsDefault() {
        Map<String, Object> env = new HashMap<>();
        env.put("AOJISTUDIO_POLL_INTERVAL_MS", "");
        try (ConfigurableApplicationContext ctx = start(env)) {
            assertThat(ctx.isRunning()).isTrue();
            assertThat(ctx.getBean(AppProperties.class).getPollIntervalMs()).isEqualTo("1000");
        }
    }

    /** 환경 변수 소스를 가장 앞에 넣는다. */
    static final class FakeEnvListener implements ApplicationListener<ApplicationEnvironmentPreparedEvent>, Ordered {
        private final Map<String, Object> fakeEnv;

        FakeEnvListener(Map<String, Object> fakeEnv) {
            this.fakeEnv = fakeEnv;
        }

        @Override
        public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
            event.getEnvironment().getPropertySources()
                    .addFirst(new SystemEnvironmentPropertySource("fakeSystemEnvironment", new HashMap<>(fakeEnv)));
        }

        @Override
        public int getOrder() {
            return Ordered.HIGHEST_PRECEDENCE;
        }
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {
    }
}
