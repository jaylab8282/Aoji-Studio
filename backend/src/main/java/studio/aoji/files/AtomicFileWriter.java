package studio.aoji.files;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/**
 * 파일 원자적 쓰기 (architecture.md §3.1, ADR-08, conventions.md §3 Backend MUST).
 *
 * <p>{@code target}과 같은 디렉터리에 {@code .<파일명>.<난수>.tmp}로 내용을 쓴 뒤
 * {@link StandardCopyOption#ATOMIC_MOVE}로 {@code target}에 옮긴다. 쓰는 도중 실패해도 대상
 * 파일은 이전 내용(또는 없음) 그대로 보호된다. 임시 파일명이 {@code .}으로 시작하고
 * {@code .tmp}로 끝나므로 폴러({@code FolderPoller})가 스캔 중 무시한다.
 *
 * <p>{@code Files.write}를 직접 호출하지 않는다(conventions.md §3 MUST) — 이 클래스가 그 규칙의
 * 유일한 구현이다. 호출자는 항상 이 클래스를 통해서만 파일을 쓴다.
 */
@Component
public class AtomicFileWriter {

    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * {@code target}을 원자적으로 만들거나 교체한다. 대상이 이미 있으면 덮어쓴다(수정 API용,
     * T-009~T-011). 임시 파일 쓰기·이동 어느 단계에서 실패해도 임시 파일을 지우고 예외를 던진다.
     */
    public void write(Path target, byte[] content) throws IOException {
        Path directory = target.getParent();
        if (directory == null) {
            throw new IOException("대상 경로에 디렉터리가 없습니다: " + target);
        }
        Path tmp = directory.resolve(tmpFileName(target));
        try {
            Files.write(tmp, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
    }

    private static String tmpFileName(Path target) {
        return "." + target.getFileName() + "." + randomSuffix() + ".tmp";
    }

    private static String randomSuffix() {
        byte[] bytes = new byte[8];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
