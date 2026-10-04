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
                        "aojistudio.data-path=" + dataDir,
                        "spring.datasource.url=jdbc:sqlite:" + dataDir.resolve("events.db"));
    }

    @Test
    @DisplayName("[FR-014-E1] AOJISTUDIO_HOST_PATH·JAYSTUDIO_HOST_PATH 둘 다 없음 → 기동 실패, 메시지에 AOJISTUDIO_HOST_PATH")
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
                        "aojistudio.host-path=/Users/jaybee/Desktop/JayStudio",
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

    @Test
    @DisplayName("필수 환경 변수 모두 있음 → 컨텍스트 기동 성공")
    void allRequiredPropertiesPresentStartsSuccessfully() {
        contextRunner()
                .withPropertyValues(
                        "aojistudio.host-path=/Users/jaybee/Desktop/JayStudio",
                        "aojistudio.public-port=4180")
                .run(context -> assertThat(context).hasNotFailed());
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {
    }
}
