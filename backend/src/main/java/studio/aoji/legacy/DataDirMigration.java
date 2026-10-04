package studio.aoji.legacy;

import java.io.IOException;
import java.nio.file.AccessDeniedException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.function.BooleanSupplier;

/**
 * v1.0.x 호환 · v1.1.0 제거. 데이터 폴더 {@code .jaystudio/} → 새 이름 이동 판정·실행(ADR-55). 판정 순서는
 * F → E → B → A → A-RO → C → D 이고 처음 맞는 행 하나를 고른다. 마운트 루트 바로 아래 두 이름은 모두
 * {@code NOFOLLOW_LINKS}로 본다. 복사·병합·삭제는 하지 않으며 허용 조작은 상태 A의 rename 1회뿐이다.
 * 예외 메시지에는 링크 대상 경로·마운트 절대 경로를 넣지 않는다(NFR-07, NFR-08).
 */
public final class DataDirMigration {

    public enum Mode {
        NORMAL,
        LEGACY_READ_ONLY
    }

    /** 결과: 데이터 폴더 이름(마운트 루트 바로 아래)과 모드. */
    public record Result(String dirName, Mode mode) {
    }

    /** 폴더 이동 수단(주입해 실패를 테스트한다). */
    @FunctionalInterface
    public interface Mover {
        void move(Path from, Path to) throws IOException;
    }

    private enum Kind {
        MISSING,
        SYMLINK,
        DIRECTORY,
        OTHER
    }

    private DataDirMigration() {
    }

    /** 운영 mover: 같은 부모 안의 디렉터리 rename 1회(REPLACE_EXISTING 없음). */
    public static Mover atomicMover() {
        return (from, to) -> Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
    }

    public static Result run(Path mountRoot, String newName, BooleanSupplier writableProbe, Mover mover,
            LegacyWarnings warnings) {
        Path current = mountRoot.resolve(newName);
        Path legacy = mountRoot.resolve(LegacyNames.LEGACY_DATA_DIR);
        Kind currentKind = kindOf(current);
        Kind legacyKind = kindOf(legacy);

        // 1 F
        if (currentKind == Kind.SYMLINK || currentKind == Kind.OTHER) {
            throw new IllegalStateException(newName + "가 " + describe(currentKind)
                    + " · 아무것도 바꾸지 않았습니다. 확인한 뒤 다시 기동하세요");
        }
        // 2 E
        if (currentKind == Kind.MISSING && (legacyKind == Kind.SYMLINK || legacyKind == Kind.OTHER)) {
            throw new IllegalStateException(LegacyNames.LEGACY_DATA_DIR + "가 " + describe(legacyKind)
                    + " · 아무것도 바꾸지 않았습니다. 확인한 뒤 다시 기동하세요");
        }
        // 3 B
        if (currentKind == Kind.DIRECTORY && legacyKind != Kind.MISSING) {
            warnings.dataDirBothExist();
            return new Result(newName, Mode.NORMAL);
        }
        // 4 A / 5 A-RO
        if (currentKind == Kind.MISSING && legacyKind == Kind.DIRECTORY) {
            if (!writableProbe.getAsBoolean()) {
                warnings.dataDirReadOnly();
                return new Result(LegacyNames.LEGACY_DATA_DIR, Mode.LEGACY_READ_ONLY);
            }
            moveOrFail(mover, legacy, current, newName);
            if (kindOf(current) != Kind.DIRECTORY || kindOf(legacy) != Kind.MISSING) {
                throw new IllegalStateException("데이터 폴더를 옮긴 직후 상태가 올바르지 않습니다(" + newName
                        + "가 실제 디렉터리가 아니거나 " + LegacyNames.LEGACY_DATA_DIR + "가 남음) · 확인한 뒤 다시 기동하세요");
            }
            warnings.dataDirMoved(
                    countRegular(current.resolve("teams"), ".json"),
                    countRegular(current.resolve("trash"), null),
                    isRegular(current.resolve("collect-token")),
                    isRegular(current.resolve("helper-token")));
            return new Result(newName, Mode.NORMAL);
        }
        // 6 C, 7 D
        return new Result(newName, Mode.NORMAL);
    }

    private static void moveOrFail(Mover mover, Path from, Path to, String newName) {
        String reason;
        try {
            mover.move(from, to);
            return;
        } catch (AtomicMoveNotSupportedException e) {
            reason = "원자적 이동을 지원하지 않는 파일시스템";
        } catch (AccessDeniedException e) {
            reason = "접근 거부";
        } catch (FileAlreadyExistsException e) {
            reason = newName + "가 그 사이에 생김";
        } catch (IOException e) {
            reason = "입출력 오류";
        }
        throw new IllegalStateException("데이터 폴더를 옮기지 못했습니다(" + LegacyNames.LEGACY_DATA_DIR + "/ → " + newName
                + "/) · " + reason + " · 마운트 쓰기 권한을 확인하거나 폴더 이름을 직접 바꾼 뒤 다시 기동하세요");
    }

    private static Kind kindOf(Path path) {
        try {
            BasicFileAttributes attrs = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
            if (attrs.isSymbolicLink()) {
                return Kind.SYMLINK;
            }
            return attrs.isDirectory() ? Kind.DIRECTORY : Kind.OTHER;
        } catch (NoSuchFileException e) {
            return Kind.MISSING;
        } catch (IOException e) {
            throw new IllegalStateException(path.getFileName() + " 상태를 읽을 수 없습니다 · 마운트 권한을 확인한 뒤 다시 기동하세요");
        }
    }

    private static String describe(Kind kind) {
        return kind == Kind.SYMLINK ? "심볼릭 링크입니다" : "디렉터리가 아닙니다";
    }

    private static boolean isRegular(Path path) {
        return Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS);
    }

    /** 폴더 바로 아래 일반 파일 개수(내용은 열지 않는다). suffix가 null이면 전부. */
    private static int countRegular(Path dir, String suffix) {
        if (kindOf(dir) != Kind.DIRECTORY) {
            return 0;
        }
        int count = 0;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                if (isRegular(entry) && (suffix == null || name.endsWith(suffix)) && !name.startsWith(".")) {
                    count++;
                }
            }
        } catch (IOException e) {
            return count;
        }
        return count;
    }
}
