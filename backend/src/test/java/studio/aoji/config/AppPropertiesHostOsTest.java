package studio.aoji.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/** 실행 환경 설정 검증 (ADR-77 결정 1, conventions.md §6, FR-014-E1, NFR-05). */
class AppPropertiesHostOsTest {

    private ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withUserConfiguration(TestConfig.class)
                .withPropertyValues(
                        "aojistudio.host-path=/home/jaybee/AojiStudio", "aojistudio.public-port=4180");
    }

    @Test
    @DisplayName("[FR-014-E1] AOJISTUDIO_HOST_OS=linux -> 기동 실패, 메시지에 AOJISTUDIO_HOST_OS")
    void unknownHostOsFailsStartup() {
        runner().withPropertyValues("aojistudio.host-os=linux").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .rootCause()
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("AOJISTUDIO_HOST_OS");
        });
    }

    @Test
    @DisplayName("[FR-014-E1] wsl + 배포판 없음 -> 기동 실패, 메시지에 AOJISTUDIO_WSL_DISTRO")
    void wslWithoutDistroFailsStartup() {
        runner().withPropertyValues("aojistudio.host-os=wsl").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .rootCause()
                    .hasMessageContaining("AOJISTUDIO_WSL_DISTRO");
        });
        runner().withPropertyValues("aojistudio.host-os=wsl", "aojistudio.wsl-distro=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("AOJISTUDIO_WSL_DISTRO");
        });
    }

    @Test
    @DisplayName("[FR-014-E1] wsl + 배포판 'a;b' / 공백 / 65자 -> 기동 실패")
    void wslWithInvalidDistroFailsStartup() {
        for (String bad : new String[] {"a;b", "a b", "a".repeat(65)}) {
            runner().withPropertyValues("aojistudio.host-os=wsl", "aojistudio.wsl-distro=" + bad).run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("AOJISTUDIO_WSL_DISTRO");
            });
        }
    }

    @Test
    @DisplayName("[FR-014-E1] wsl + 올바른 배포판 -> 기동 성공, hostOs wsl, wslDistro 그대로")
    void wslWithValidDistroStarts() {
        runner().withPropertyValues("aojistudio.host-os=wsl", "aojistudio.wsl-distro=Ubuntu-24.04").run(context -> {
            assertThat(context).hasNotFailed();
            AppProperties props = context.getBean(AppProperties.class);
            assertThat(props.hostOs()).isEqualTo("wsl");
            assertThat(props.wslDistro()).isEqualTo("Ubuntu-24.04");
        });
    }

    @Test
    @DisplayName("[FR-014-E1] 빈 값 -> macos, 배포판은 읽지 않아 null")
    void blankHostOsIsMacos() {
        runner().withPropertyValues("aojistudio.host-os=", "aojistudio.wsl-distro=Ubuntu-24.04").run(context -> {
            assertThat(context).hasNotFailed();
            AppProperties props = context.getBean(AppProperties.class);
            assertThat(props.hostOs()).isEqualTo("macos");
            assertThat(props.wslDistro()).isNull();
        });
    }

    @Test
    @DisplayName("[NFR-05] 설정을 안 주면 macos이고 배포판 예시 값으로 채우지 않는다")
    void unsetDoesNotFillExampleValues() {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            AppProperties props = context.getBean(AppProperties.class);
            assertThat(props.hostOs()).isEqualTo("macos");
            assertThat(props.wslDistro()).isNull();
            assertThat(props.getWslDistro()).isEmpty();
        });
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {}
}
