package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceInitializationAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import studio.aoji.config.AppProperties;

/** 옛 프로퍼티 키 거부 (ADR-56). AppStartupTest에서 옮김 - 표준 테스트에는 옛 이름을 두지 않는다. */
class LegacyPropertyKeyStartupTest {

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
    @DisplayName("[ADR-56] 옛 프로퍼티 키 jaystudio.* 는 받지 않는다 → 기동 실패")
    void legacyPropertyKeysAreNotAccepted() {
        contextRunner()
                .withPropertyValues(
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
