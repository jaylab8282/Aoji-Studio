package studio.aoji.statusline;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Arrays;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import studio.aoji.collect.CollectTokenStore;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.files.DataDirectory;

/**
 * 기동 때 {@code .aojistudio/statusline.mjs}를 배치한다 (ADR-83 결정 1). 원본은 jar 리소스
 * {@code statusline/aojistudio-statusline.mjs}(빌드 때 {@code helper/}에서 복사)이고, 파일이 없거나 내용이 다를 때만
 * {@link AtomicFileWriter}로 쓴다. 쓰기 권한이 없으면 쓰지 않고 그대로 기동한다(이미 있던 파일을 쓴다). 대상이
 * 심볼릭 링크이거나 일반 파일이 아니면 건드리지 않는다(NFR-07). {@link CollectTokenStore}를 주입받아 데이터 폴더가
 * 먼저 만들어진 뒤에 실행된다.
 */
@Component
public class StatuslineScriptInstaller {

    static final String RESOURCE = "statusline/aojistudio-statusline.mjs";
    static final String FILE_NAME = "statusline.mjs";
    private static final Logger log = LoggerFactory.getLogger(StatuslineScriptInstaller.class);

    private final DataDirectory dataDirectory;
    private final AtomicFileWriter fileWriter;

    public StatuslineScriptInstaller(
            DataDirectory dataDirectory, AtomicFileWriter fileWriter, CollectTokenStore collectTokenStore) {
        this.dataDirectory = dataDirectory;
        this.fileWriter = fileWriter;
    }

    @PostConstruct
    void install() {
        byte[] content = resourceBytes();
        Path target = dataDirectory.path().resolve(FILE_NAME);
        try {
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) {
                    log.warn("statusline.mjs를 배치하지 않았습니다: reason=NOT_REGULAR_FILE");
                    return;
                }
                if (Arrays.equals(Files.readAllBytes(target), content)) {
                    return;
                }
            }
            fileWriter.write(target, content);
        } catch (IOException | RuntimeException e) {
            log.warn("statusline.mjs를 배치하지 않았습니다: reason={}", e.getClass().getSimpleName());
        }
    }

    private static byte[] resourceBytes() {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new IllegalStateException("상태줄 스크립트 리소스를 읽을 수 없습니다 · 빌드를 확인하세요", e);
        }
    }
}
