package studio.aoji.config;

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
                        "jaystudio.data-path=" + dataDir,
                        "spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @Test
    @DisplayName("[FR-014-E1] JAYSTUDIO_HOST_PATH 없음 → 컨텍스트 기동 실패")
    void hostPathMissingFailsStartup() {
        contextRunner()
                .withPropertyValues("jaystudio.public-port=4180")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .rootCause()
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("JAYSTUDIO_HOST_PATH");
                });
    }

    @Test
    @DisplayName("[NFR-05] JAYSTUDIO_PUBLIC_PORT 빈값 → 기동 실패")
    void publicPortBlankFailsStartup() {
        contextRunner()
                .withPropertyValues(
                        "jaystudio.host-path=/Users/jaybee/Desktop/JayStudio",
                        "jaystudio.public-port=")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .rootCause()
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("JAYSTUDIO_PUBLIC_PORT");
                });
    }

    @Test
    @DisplayName("필수 환경 변수 모두 있음 → 컨텍스트 기동 성공")
    void allRequiredPropertiesPresentStartsSuccessfully() {
        contextRunner()
                .withPropertyValues(
                        "jaystudio.host-path=/Users/jaybee/Desktop/JayStudio",
                        "jaystudio.public-port=4180")
                .run(context -> assertThat(context).hasNotFailed());
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {
    }
}
