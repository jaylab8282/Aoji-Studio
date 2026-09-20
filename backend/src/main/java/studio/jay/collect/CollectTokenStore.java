package studio.jay.collect;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Set;
import org.springframework.stereotype.Component;
import studio.jay.config.AppProperties;

/**
 * 기동 시 {@code .jaystudio/collect-token}을 읽거나 만든다 (architecture.md §6.3, ADR-16, NFR-05).
 * 파일이 있으면 읽기만 하고(읽기 전용 마운트에서도 기동 가능), 없고 만들 수 없으면 기동을 실패시킨다.
 */
@Component
public class CollectTokenStore {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Set<PosixFilePermission> OWNER_READ_WRITE =
            PosixFilePermissions.fromString("rw-------");

    private final AppProperties appProperties;
    private volatile String token;

    public CollectTokenStore(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    @PostConstruct
    void init() {
        this.token = loadOrCreate(Path.of(appProperties.getMountPath()));
    }

    /**
     * 토큰 파일을 읽거나(있으면) 새로 만든다(없으면). 만들 수 없으면 {@link IllegalStateException}.
     */
    static String loadOrCreate(Path mountRoot) {
        Path jaystudioDir = mountRoot.resolve(".jaystudio");
        Path tokenFile = jaystudioDir.resolve("collect-token");

        if (Files.exists(tokenFile)) {
            String content;
            try {
                content = Files.readString(tokenFile, StandardCharsets.UTF_8).strip();
            } catch (IOException e) {
                throw new IllegalStateException(
                        "collect-token 파일을 읽을 수 없습니다 · 권한을 확인한 뒤 다시 기동하세요", e);
            }
            if (content.isEmpty()) {
                throw new IllegalStateException(
                        "collect-token 파일이 비어 있습니다 · 파일을 삭제한 뒤 다시 기동하거나 유효한 토큰을 넣으세요");
            }
            return content;
        }

        try {
            Files.createDirectories(jaystudioDir);
            String generated = HexFormat.of().formatHex(randomBytes(32));
            Files.writeString(
                    tokenFile,
                    generated,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE_NEW,
                    StandardOpenOption.WRITE);
            try {
                Files.setPosixFilePermissions(tokenFile, OWNER_READ_WRITE);
            } catch (UnsupportedOperationException ignored) {
                // POSIX 권한을 지원하지 않는 파일시스템(예: 일부 CI 환경)에서는 건너뛴다.
            }
            return generated;
        } catch (IOException e) {
            throw new IllegalStateException(
                    "collect-token 파일을 만들 수 없습니다(" + jaystudioDir + ") · 마운트 쓰기 권한을 확인하세요", e);
        }
    }

    private static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    /** 상수 시간 비교로 수집 토큰 값을 검사한다. */
    public boolean matches(String candidate) {
        if (candidate == null || token == null) {
            return false;
        }
        return MessageDigest.isEqual(
                token.getBytes(StandardCharsets.UTF_8), candidate.getBytes(StandardCharsets.UTF_8));
    }
}
