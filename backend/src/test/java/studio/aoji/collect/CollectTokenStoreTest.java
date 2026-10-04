package studio.aoji.collect;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import studio.aoji.config.AppProperties;

/**
 * {@code .aojistudio/collect-token} 읽기·생성 (architecture.md §6.3, ADR-16, NFR-05).
 * 실제 파일시스템(임시 폴더)만 쓰고 mock을 두지 않는다.
 */
class CollectTokenStoreTest {

    @TempDir
    Path mountRoot;

    @AfterEach
    void restoreWritePermission() throws IOException {
        // 읽기 전용으로 바꾼 테스트가 @TempDir 정리에 실패하지 않도록 되돌린다.
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("rwxr-xr-x"));
    }

    private ApplicationContextRunner contextRunner() {
        return new ApplicationContextRunner()
                .withUserConfiguration(TestConfig.class)
                .withPropertyValues(
                        "aojistudio.host-path=/Users/jaybee/Desktop/AojiStudio",
                        "aojistudio.public-port=4180",
                        "aojistudio.mount-path=" + mountRoot);
    }

    @Test
    @DisplayName("[NFR-05] 토큰 파일 생성 불가(읽기 전용 fixture) → 기동 실패")
    void readOnlyMountFailsStartupWhenTokenMissing() throws IOException {
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));

        contextRunner().run(context -> {
            assertThat(context).hasFailed();
            IllegalStateException cause = findCause(context.getStartupFailure(), IllegalStateException.class);
            assertThat(cause).isNotNull();
            assertThat(cause.getMessage()).contains("collect-token");
        });
    }

    @Test
    @DisplayName("[NFR-05] 기존 토큰 있으면 읽기 전용에서도 기동")
    void existingTokenAllowsStartupOnReadOnlyMount() throws IOException {
        Path dataDir = Files.createDirectories(mountRoot.resolve(".aojistudio"));
        Files.writeString(dataDir.resolve("collect-token"), "a".repeat(64), StandardCharsets.UTF_8);
        Files.setPosixFilePermissions(mountRoot, PosixFilePermissions.fromString("r-xr-xr-x"));

        contextRunner().run(context -> {
            assertThat(context).hasNotFailed();
            CollectTokenStore store = context.getBean(CollectTokenStore.class);
            assertThat(store.matches("a".repeat(64))).isTrue();
        });
    }

    @Test
    @DisplayName("[NFR-05] 0바이트 토큰 → 기동 실패")
    void emptyTokenFileFailsStartup() throws IOException {
        Path dataDir = Files.createDirectories(mountRoot.resolve(".aojistudio"));
        Files.createFile(dataDir.resolve("collect-token"));

        contextRunner().run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .rootCause()
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("비어");
        });
    }

    @Test
    @DisplayName("토큰 파일 없음 → 생성하고 기동, 모드 600")
    void createsTokenFileWhenMissing() {
        contextRunner().run(context -> {
            assertThat(context).hasNotFailed();
            Path tokenFile = mountRoot.resolve(".aojistudio").resolve("collect-token");
            assertThat(tokenFile).exists();
            String content = Files.readString(tokenFile, StandardCharsets.UTF_8);
            assertThat(content).hasSize(64);
            assertThat(Files.getPosixFilePermissions(tokenFile))
                    .isEqualTo(PosixFilePermissions.fromString("rw-------"));
        });
    }

    @SuppressWarnings("unchecked")
    private static <T extends Throwable> T findCause(Throwable throwable, Class<T> type) {
        Throwable cursor = throwable;
        while (cursor != null) {
            if (type.isInstance(cursor)) {
                return (T) cursor;
            }
            cursor = cursor.getCause();
        }
        return null;
    }

    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    static class TestConfig {
        @Bean
        studio.aoji.registry.ProjectFolderScanner projectFolderScanner() {
            return new studio.aoji.registry.ProjectFolderScanner(new studio.aoji.registry.AgentDefinitionParser());
        }

        @Bean
        studio.aoji.legacy.LegacyWarnings legacyWarnings() {
            return new studio.aoji.legacy.LegacyWarnings(java.time.Clock.systemUTC(), line -> { });
        }

        @Bean
        studio.aoji.files.DataDirectory dataDirectory(AppProperties appProperties,
                studio.aoji.registry.ProjectFolderScanner scanner, studio.aoji.legacy.LegacyWarnings warnings) {
            return new studio.aoji.files.DataDirectory(appProperties, scanner, warnings);
        }

        @Bean
        CollectTokenStore collectTokenStore(studio.aoji.files.DataDirectory dataDirectory) {
            return new CollectTokenStore(dataDirectory);
        }
    }
}
