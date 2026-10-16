package studio.aoji.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.stream.Stream;

/** {@code tools/fixtures/<이름>}을 임시 폴더로 복사한다(실제 {@code .claude}·{@code .aojistudio}는 쓰지 않는다). */
public final class FixtureFiles {

    private static final Path FIXTURES = Path.of("..", "tools", "fixtures");

    private FixtureFiles() {}

    public static Path fixtureDir(String name) {
        return FIXTURES.resolve(name);
    }

    /** fixture 폴더 내용을 {@code target}에 복사한다. {@code expected.json}은 제외한다. */
    public static void copyInto(String fixtureName, Path target) throws IOException {
        Path source = fixtureDir(fixtureName);
        try (Stream<Path> walk = Files.walk(source)) {
            for (Path path : (Iterable<Path>) walk::iterator) {
                Path relative = source.relativize(path);
                if (relative.toString().equals("expected.json")) {
                    continue;
                }
                Path destination = target.resolve(relative.toString());
                if (Files.isDirectory(path)) {
                    Files.createDirectories(destination);
                } else {
                    Files.createDirectories(destination.getParent());
                    Files.copy(path, destination, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }
}
