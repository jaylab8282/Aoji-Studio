package studio.aoji.legacy;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Set;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;

/**
 * 도우미 토큰 파일 읽기 판정(ADR-57, NFR-07). 일반 파일일 때만 읽고, 아니면 "없음 + 사유"다. 읽기는 한 번에 한다:
 * 부모 확인 → 대상 분류 → {@code Files.newByteChannel(path, READ, NOFOLLOW_LINKS)}로 연 채널에서 읽는다.
 * 확인 뒤 따로 {@code readString}하는 2단계 읽기는 없다(TOCTOU) - 확인과 열기 사이에 링크로 바뀌어도
 * NOFOLLOW_LINKS 열기가 실패하므로 링크 대상은 읽히지 않는다. 사유에는 링크 대상 경로·값을 담지 않는다.
 */
@Component
public class HelperTokenReader {

    /** hex 64자 + 여유. 이보다 크면 토큰 파일로 보지 않는다. */
    static final int MAX_BYTES = 1024;

    /** 열기 함수(테스트에서 옵션을 단언한다). */
    @FunctionalInterface
    public interface Opener {
        SeekableByteChannel open(Path path, Set<? extends OpenOption> options) throws IOException;
    }

    /** token이 null이면 "없음". reason이 있으면 읽지 않은 사유. */
    public record Outcome(String token, LegacyWarnings.NotReadReason reason) {
        static Outcome absent() {
            return new Outcome(null, null);
        }

        static Outcome absent(LegacyWarnings.NotReadReason reason) {
            return new Outcome(null, reason);
        }
    }

    private final Opener opener;
    private final Consumer<Path> beforeOpen;

    public HelperTokenReader() {
        this(Files::newByteChannel, p -> { });
    }

    /** 테스트용: 열기 함수와 "부모 확인 뒤·열기 전" 훅을 주입한다. */
    public HelperTokenReader(Opener opener, Consumer<Path> beforeOpen) {
        this.opener = opener;
        this.beforeOpen = beforeOpen;
    }

    /**
     * @param file 토큰 파일 경로
     * @param requireRealParentDirectory true면 부모 폴더가 심볼릭 링크가 아닌 실제 디렉터리일 때만 읽는다
     */
    public Outcome read(Path file, boolean requireRealParentDirectory) {
        if (requireRealParentDirectory) {
            Path parent = file.getParent();
            BasicFileAttributes parentAttrs = attrs(parent);
            if (parentAttrs == null) {
                return Outcome.absent();
            }
            if (parentAttrs.isSymbolicLink() || !parentAttrs.isDirectory()) {
                return Outcome.absent(LegacyWarnings.NotReadReason.PARENT_NOT_DIRECTORY);
            }
        }
        BasicFileAttributes fileAttrs = attrs(file);
        if (fileAttrs == null) {
            return Outcome.absent();
        }
        if (!fileAttrs.isRegularFile()) {
            return Outcome.absent(classify(fileAttrs));
        }
        beforeOpen.accept(file);
        try (SeekableByteChannel channel = opener.open(file, Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))) {
            if (channel.size() > MAX_BYTES) {
                return Outcome.absent(LegacyWarnings.NotReadReason.UNREADABLE);
            }
            ByteBuffer buffer = ByteBuffer.allocate((int) channel.size());
            while (buffer.hasRemaining() && channel.read(buffer) > 0) {
                // 채널이 끝날 때까지 읽는다
            }
            String content = new String(buffer.array(), 0, buffer.position(), StandardCharsets.UTF_8).strip();
            return content.isEmpty() ? Outcome.absent() : new Outcome(content, null);
        } catch (NoSuchFileException e) {
            return Outcome.absent();
        } catch (IOException e) {
            // 열기 실패(예: 그 사이 링크로 교체 → ELOOP). 사유만 분류하고 링크 대상은 따라가지 않는다.
            BasicFileAttributes now = attrs(file);
            return Outcome.absent(now == null ? LegacyWarnings.NotReadReason.UNREADABLE : classify(now));
        }
    }

    private static LegacyWarnings.NotReadReason classify(BasicFileAttributes attrs) {
        if (attrs.isSymbolicLink()) {
            return LegacyWarnings.NotReadReason.SYMLINK;
        }
        if (attrs.isDirectory()) {
            return LegacyWarnings.NotReadReason.DIRECTORY;
        }
        return attrs.isRegularFile() ? LegacyWarnings.NotReadReason.UNREADABLE : LegacyWarnings.NotReadReason.OTHER;
    }

    private static BasicFileAttributes attrs(Path path) {
        try {
            return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        } catch (IOException e) {
            return null;
        }
    }
}
