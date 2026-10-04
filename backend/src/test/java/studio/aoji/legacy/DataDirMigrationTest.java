package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static studio.aoji.legacy.LegacyTestSupport.fingerprint;
import static studio.aoji.legacy.LegacyTestSupport.write;

import java.io.IOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DataDirMigrationTest {

    private static final String NEW = ".aojistudio";
    private static final String OLD = LegacyNames.LEGACY_DATA_DIR;

    @TempDir
    Path mount;

    @TempDir
    Path outside;

    private final List<String> lines = new ArrayList<>();
    private final LegacyWarnings warnings = new LegacyWarnings(Clock.systemUTC(), lines::add);

    private void legacyTree(Path dir) throws IOException {
        write(dir.resolve("teams/a.json"), "{\"a\":1}");
        write(dir.resolve("teams/b.json"), "{\"b\":2}");
        write(dir.resolve("trash/x.20260101-000000.md"), "trash");
        write(dir.resolve("collect-token"), "t".repeat(64));
        write(dir.resolve("helper-token"), "h".repeat(64));
        Files.setPosixFilePermissions(dir.resolve("collect-token"), PosixFilePermissions.fromString("rw-------"));
    }

    private DataDirMigration.Result run(boolean writable) {
        return DataDirMigration.run(mount, NEW, () -> writable, DataDirMigration.atomicMover(), warnings);
    }

    private DataDirMigration.Result run(boolean writable, DataDirMigration.Mover mover) {
        return DataDirMigration.run(mount, NEW, () -> writable, mover, warnings);
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] 상태 A: 옮긴 뒤 .jaystudio 없음·sha256 동일·토큰 모드 600·경고 1줄(teams·trash 개수)")
    void stateA() throws IOException {
        legacyTree(mount.resolve(OLD));
        Map<String, String> before = fingerprint(mount.resolve(OLD));

        DataDirMigration.Result result = run(true);

        assertThat(result).isEqualTo(new DataDirMigration.Result(NEW, DataDirMigration.Mode.NORMAL));
        assertThat(Files.exists(mount.resolve(OLD), LinkOption.NOFOLLOW_LINKS)).isFalse();
        assertThat(fingerprint(mount.resolve(NEW))).isEqualTo(before);
        assertThat(Files.getPosixFilePermissions(mount.resolve(NEW).resolve("collect-token")))
                .isEqualTo(PosixFilePermissions.fromString("rw-------"));
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).startsWith("[legacy] data-dir · ").contains("teams 2, trash 1")
                .contains("collect-token").contains("helper-token");
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] 상태 B: 아무것도 안 옮김·두 폴더 sha256 불변·경고 1줄에 '401'과 '07의 새 설정 예시'")
    void stateB() throws IOException {
        legacyTree(mount.resolve(OLD));
        write(mount.resolve(NEW).resolve("teams/new.json"), "{}");
        Map<String, String> oldBefore = fingerprint(mount.resolve(OLD));
        Map<String, String> newBefore = fingerprint(mount.resolve(NEW));

        DataDirMigration.Result result = run(true);

        assertThat(result).isEqualTo(new DataDirMigration.Result(NEW, DataDirMigration.Mode.NORMAL));
        assertThat(fingerprint(mount.resolve(OLD))).isEqualTo(oldBefore);
        assertThat(fingerprint(mount.resolve(NEW))).isEqualTo(newBefore);
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).contains("401").contains("07의 새 설정 예시");
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] 상태 C·D: 아무것도 안 함·경고 0")
    void stateCAndD() throws IOException {
        // D
        assertThat(run(true)).isEqualTo(new DataDirMigration.Result(NEW, DataDirMigration.Mode.NORMAL));
        assertThat(fingerprint(mount)).isEmpty();
        // C
        write(mount.resolve(NEW).resolve("teams/a.json"), "{}");
        Map<String, String> before = fingerprint(mount);
        assertThat(run(true)).isEqualTo(new DataDirMigration.Result(NEW, DataDirMigration.Mode.NORMAL));
        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(lines).isEmpty();
    }

    @Test
    @DisplayName("[NFR-09][NFR-07][ADR-55] 상태 E: .jaystudio가 심볼릭 링크 / 일반 파일 → 기동 실패, 아무것도 바꾸지 않음")
    void stateE() throws IOException {
        Path target = Files.createDirectories(mount.resolve("somewhere"));
        Files.createSymbolicLink(mount.resolve(OLD), target);
        Map<String, String> before = fingerprint(mount);

        assertThatThrownBy(() -> run(true)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(OLD).hasMessageNotContaining("somewhere");
        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(Files.exists(mount.resolve(NEW), LinkOption.NOFOLLOW_LINKS)).isFalse();

        Files.delete(mount.resolve(OLD));
        write(mount.resolve(OLD), "file");
        Map<String, String> before2 = fingerprint(mount);
        assertThatThrownBy(() -> run(true)).isInstanceOf(IllegalStateException.class);
        assertThat(fingerprint(mount)).isEqualTo(before2);
        assertThat(lines).isEmpty();
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] rename 실패 주입(AtomicMoveNotSupported·AccessDenied·FileAlreadyExists) → 기동 실패 예외·원본 그대로·.aojistudio 없음")
    void renameFailures() throws IOException {
        legacyTree(mount.resolve(OLD));
        Map<String, String> before = fingerprint(mount.resolve(OLD));
        List<IOException> failures = List.of(
                new AtomicMoveNotSupportedException("a", "b", "x"),
                new AccessDeniedException("a"),
                new FileAlreadyExistsException("a"));

        for (IOException failure : failures) {
            assertThatThrownBy(() -> run(true, (from, to) -> {
                throw failure;
            })).isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("데이터 폴더를 옮기지 못했습니다")
                    .hasMessageNotContaining(mount.toString());
            assertThat(fingerprint(mount.resolve(OLD))).isEqualTo(before);
            assertThat(Files.exists(mount.resolve(NEW), LinkOption.NOFOLLOW_LINKS)).isFalse();
        }
        assertThat(lines).isEmpty();
    }

    @Test
    @DisplayName("[NFR-07][ADR-55] 상태 F: .aojistudio가 링크(마운트 안·밖)·일반 파일 × .jaystudio 있음·없음 → 기동 실패, 불변, 메시지에 링크 대상 경로 0건")
    void stateF() throws IOException {
        Path inside = Files.createDirectories(mount.resolve("insideTarget"));
        Path outsideDir = Files.createDirectories(outside.resolve("outsideTarget"));
        for (boolean legacyPresent : new boolean[] {false, true}) {
            for (String kind : new String[] {"inside", "outside", "file"}) {
                Path aoji = mount.resolve(NEW);
                if (Files.exists(aoji, LinkOption.NOFOLLOW_LINKS)) {
                    Files.delete(aoji);
                }
                switch (kind) {
                    case "inside" -> Files.createSymbolicLink(aoji, inside);
                    case "outside" -> Files.createSymbolicLink(aoji, outsideDir);
                    default -> write(aoji, "plain file");
                }
                if (legacyPresent && !Files.exists(mount.resolve(OLD))) {
                    legacyTree(mount.resolve(OLD));
                }
                Map<String, String> before = fingerprint(mount);

                assertThatThrownBy(() -> run(true)).as(kind + "/" + legacyPresent)
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining(NEW)
                        .hasMessageNotContaining("insideTarget")
                        .hasMessageNotContaining("outsideTarget");
                assertThat(fingerprint(mount)).isEqualTo(before);
            }
        }
        assertThat(lines).isEmpty();
    }

    @Test
    @DisplayName("[FR-001-E2][NFR-09][ADR-55] 상태 A-RO: 쓰기 불가 + .jaystudio만 → 이동 0, 결과 .jaystudio·LEGACY_READ_ONLY, 경고 1줄, sha256 불변")
    void stateAReadOnly() throws IOException {
        legacyTree(mount.resolve(OLD));
        Map<String, String> before = fingerprint(mount);
        AtomicInteger moves = new AtomicInteger();

        DataDirMigration.Result result = run(false, (from, to) -> moves.incrementAndGet());

        assertThat(result).isEqualTo(new DataDirMigration.Result(OLD, DataDirMigration.Mode.LEGACY_READ_ONLY));
        assertThat(moves).hasValue(0);
        assertThat(fingerprint(mount)).isEqualTo(before);
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).startsWith("[legacy] data-dir · ").contains("쓰기 권한이 없어").contains("옮기지 않았습니다");
    }

    @Test
    @DisplayName("[FR-001-E2][NFR-09][ADR-55] A-RO + .jaystudio가 링크 → 상태 E가 먼저(기동 실패) / 쓰기 가능 + rename 실패는 A-RO로 넘어가지 않는다")
    void readOnlyPrecedenceAndNoFallbackOnRenameFailure() throws IOException {
        Path target = Files.createDirectories(mount.resolve("linkTarget"));
        Files.createSymbolicLink(mount.resolve(OLD), target);
        assertThatThrownBy(() -> run(false)).isInstanceOf(IllegalStateException.class);
        Files.delete(mount.resolve(OLD));

        legacyTree(mount.resolve(OLD));
        assertThatThrownBy(() -> run(true, (from, to) -> {
            throw new AccessDeniedException("x");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(lines).isEmpty();
    }

    @Test
    @DisplayName("[NFR-09][ADR-55] 빈 마운트에 .aojistudio-write-probe 같은 부수 파일은 만들지 않는다(상태 A·B·C·D는 프로브를 부르지 않는다)")
    void probeOnlyInStateA() throws IOException {
        AtomicInteger probes = new AtomicInteger();
        write(mount.resolve(NEW).resolve("teams/a.json"), "{}");
        DataDirMigration.run(mount, NEW, () -> {
            probes.incrementAndGet();
            return true;
        }, DataDirMigration.atomicMover(), warnings);
        try (Stream<Path> s = Files.list(mount)) {
            assertThat(s.count()).isEqualTo(1);
        }
        assertThat(probes).hasValue(0);
    }
}
