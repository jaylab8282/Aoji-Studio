package studio.aoji.files;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 마운트 루트 밖으로 나가는 경로·심볼릭 링크를 막는다 (architecture.md §3.1, NFR-07).
 * 파일 경로는 사용자 입력으로 직접 만들지 않는다. name·워크플로우 이름 규칙을 통과한 조각만
 * {@link #resolve(String...)}로 넣는다. 심볼릭 링크는 따라가지 않는다: 읽기 대상이 마운트 밖을
 * 가리키면 {@link #isSymlinkEscapingMount(Path)}가 true를 주고(호출자가 형식 오류로 처리),
 * 쓰기 대상이 링크 자체면 {@link #assertNotSymlink(Path)}가 거부한다.
 */
public final class PathGuard {

    private final Path mountRoot;

    public PathGuard(Path mountRoot) {
        this.mountRoot = resolveMountRoot(mountRoot);
    }

    /**
     * 마운트 루트 자체도 심볼릭 링크(예: macOS {@code /var} → {@code /private/var})를 거칠 수 있으므로
     * 실제 경로로 정규화한다. 마운트 루트가 아직 없으면(드묾) 절대 경로만 정규화한다.
     */
    private static Path resolveMountRoot(Path mountRoot) {
        try {
            return mountRoot.toRealPath();
        } catch (IOException e) {
            return mountRoot.toAbsolutePath().normalize();
        }
    }

    public Path mountRoot() {
        return mountRoot;
    }

    /**
     * 이름 규칙 검증을 통과한 경로 조각들로만 마운트 루트 밑 경로를 만든다.
     * 각 조각은 경로 구분자·상위 폴더 이동을 포함할 수 없다.
     */
    public Path resolve(String... segments) {
        Path candidate = mountRoot;
        for (String segment : segments) {
            if (segment == null
                    || segment.isEmpty()
                    || segment.contains("/")
                    || segment.contains("\\")
                    || segment.equals("..")
                    || segment.equals(".")) {
                throw new IllegalArgumentException("허용되지 않은 경로 조각입니다: " + segment);
            }
            candidate = candidate.resolve(segment);
        }
        Path normalized = candidate.normalize();
        if (!normalized.startsWith(mountRoot)) {
            throw new IllegalArgumentException("마운트 루트를 벗어난 경로입니다: " + normalized);
        }
        return normalized;
    }

    /**
     * 파일이 심볼릭 링크이고 실제 대상이 마운트 루트 밖(또는 대상을 확인할 수 없음)이면 true.
     * 이 검사에 걸린 경로는 읽지 않는다.
     */
    public boolean isSymlinkEscapingMount(Path candidate) {
        if (!Files.isSymbolicLink(candidate)) {
            return false;
        }
        try {
            Path real = candidate.toRealPath();
            return !real.startsWith(mountRoot);
        } catch (IOException e) {
            // 링크 대상을 확인할 수 없으면 안전한 쪽으로 마운트 밖으로 간주한다.
            return true;
        }
    }

    /** 쓰기 대상 자체가 심볼릭 링크면 거부한다(링크를 통한 마운트 밖 덮어쓰기 방지). */
    public void assertNotSymlink(Path target) {
        if (Files.isSymbolicLink(target)) {
            throw new IllegalArgumentException("쓰기 대상이 심볼릭 링크입니다: " + target);
        }
    }
}
