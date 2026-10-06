package studio.aoji.oldname;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceInitializationAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import studio.aoji.AojiStudioApplication;
import studio.aoji.config.AppProperties;

/** NFR-13 ② 옛 환경 변수·프로퍼티 키 거부 (ADR-62). 이 폴더(oldname/)만 옛 이름 글자를 쓸 수 있다. */
class OldEnvStartupTest {

    @TempDir
    Path mountRoot;

    @TempDir
    Path dataDir;

    /** 프로세스 환경 변수와 같은 경로(환경 변수 소스)로 값을 넣어 기동한다. 필수 두 값은 환경 변수로만 준다. */
    private void startWithEnv(Map<String, Object> fakeEnv) {
        ApplicationListener<ApplicationEnvironmentPreparedEvent> listener = new ApplicationListener<>() {
            @Override
            public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
                event.getEnvironment().getPropertySources()
                        .addFirst(new SystemEnvironmentPropertySource("fakeSystemEnvironment", new HashMap<>(fakeEnv)));
            }
        };
        new SpringApplicationBuilder(AojiStudioApplication.class)
                .listeners(listener)
                .run(
                        "--server.port=0",
                        "--spring.main.banner-mode=off",
                        "--aojistudio.mount-path=" + mountRoot,
                        "--aojistudio.data-path=" + dataDir,
                        "--spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"))
                .close();
    }

    @Test
    @DisplayName("[NFR-13-2][FR-014-E1][NFR-05] 환경을 옛 이름 HOST_PATH·PUBLIC_PORT만으로 → 기동 실패, 메시지에 AOJISTUDIO_HOST_PATH")
    void oldEnvNamesOnlyFailsStartup() {
        Map<String, Object> env = new HashMap<>();
        env.put("JAYSTUDIO_HOST_PATH", "/Users/someone/Desktop/AojiStudio");
        env.put("JAYSTUDIO_PUBLIC_PORT", "4999");

        assertThatThrownBy(() -> startWithEnv(env)).hasStackTraceContaining("AOJISTUDIO_HOST_PATH");
    }

    @Test
    @DisplayName("[NFR-13-2][FR-014-E1][NFR-05] AOJISTUDIO_HOST_PATH=\"\" → 기동 실패(빈 값은 옛 이름으로 채워지지 않는다)")
    void blankNewHostPathFailsStartup() {
        Map<String, Object> env = new HashMap<>();
        env.put("AOJISTUDIO_HOST_PATH", "");
        env.put("AOJISTUDIO_PUBLIC_PORT", "4999");
        env.put("JAYSTUDIO_HOST_PATH", "/Users/someone/Desktop/AojiStudio");

        assertThatThrownBy(() -> startWithEnv(env)).hasStackTraceContaining("AOJISTUDIO_HOST_PATH");
    }

    @Test
    @DisplayName("[NFR-13-2][NFR-05] 옛 프로퍼티 키 jaystudio.* 는 받지 않는다 → 기동 실패")
    void oldPropertyKeysAreNotAccepted() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        DataSourceAutoConfiguration.class,
                        DataSourceInitializationAutoConfiguration.class))
                .withUserConfiguration(TestConfig.class)
                .withPropertyValues(
                        "spring.datasource.driver-class-name=org.sqlite.JDBC",
                        "spring.sql.init.mode=always",
                        "spring.sql.init.schema-locations=classpath:schema.sql",
                        "aojistudio.data-path=" + dataDir,
                        "spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"),
                        "jaystudio.host-path=/Users/someone/Desktop/AojiStudio",
                        "jaystudio.public-port=4180")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .rootCause()
                            .hasMessageContaining("AOJISTUDIO_HOST_PATH");
                });
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {
    }

}
