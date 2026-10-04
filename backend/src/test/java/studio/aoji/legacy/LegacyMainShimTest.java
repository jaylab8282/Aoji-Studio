package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringApplicationRunListener;
import org.springframework.context.ConfigurableApplicationContext;
import studio.aoji.AojiStudioApplication;
import studio.jay.JayStudioApplication;

@SuppressWarnings("removal")
class LegacyMainShimTest {

    @TempDir
    Path tmp;

    @Test
    @DisplayName("[ADR-58] shim은 @Deprecated(forRemoval = true)이고 Spring 애노테이션이 없다")
    void shimIsDeprecatedForRemoval() {
        Deprecated d = JayStudioApplication.class.getAnnotation(Deprecated.class);

        assertThat(d).isNotNull();
        assertThat(d.forRemoval()).isTrue();
        assertThat(d.since()).isEqualTo("1.0.1");
        assertThat(JayStudioApplication.class.getAnnotations())
                .allSatisfy(a -> assertThat(a.annotationType().getName()).doesNotStartWith("org.springframework"));
    }

    @Test
    @DisplayName("[ADR-58] shim 실행 → '[legacy] main-class' 1줄 후 새 메인과 같은 컨텍스트가 뜬다")
    void shimStartsSameContext() throws IOException {
        Path mount = tmp.resolve("mount");
        Path data = tmp.resolve("data");
        copyDir(Path.of("..", "tools", "fixtures", "project-basic"), mount);
        Files.createDirectories(data);

        Logger logger = (Logger) LoggerFactory.getLogger(LegacyWarnings.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        AtomicReference<ConfigurableApplicationContext> started = new AtomicReference<>();
        try {
            SpringApplication.withHook(application -> new SpringApplicationRunListener() {
                @Override
                public void started(ConfigurableApplicationContext context, java.time.Duration timeTaken) {
                    started.set(context);
                }
            }, () -> JayStudioApplication.main(new String[] {
                "--server.port=0",
                "--aojistudio.host-path=/Users/someone/Desktop/AojiStudio",
                "--aojistudio.public-port=4180",
                "--aojistudio.mount-path=" + mount,
                "--aojistudio.data-path=" + data,
                "--spring.main.banner-mode=off"
            }));

            ConfigurableApplicationContext context = started.get();
            assertThat(context).isNotNull();
            try {
                assertThat(context.isRunning()).isTrue();
                assertThat(context.getBeansOfType(AojiStudioApplication.class)).hasSize(1);
                assertThat(context.getEnvironment().getProperty("local.server.port", Integer.class)).isPositive();
            } finally {
                context.close();
            }
        } finally {
            logger.detachAppender(appender);
        }

        assertThat(appender.list).hasSize(1);
        assertThat(appender.list.get(0).getFormattedMessage()).startsWith("[legacy] main-class · ");
    }

    private static void copyDir(Path from, Path to) throws IOException {
        try (Stream<Path> walk = Files.walk(from)) {
            for (Path p : (Iterable<Path>) walk::iterator) {
                Path target = to.resolve(from.relativize(p).toString());
                if (Files.isDirectory(p)) {
                    Files.createDirectories(target);
                } else {
                    Files.copy(p, target);
                }
            }
        }
    }
}
