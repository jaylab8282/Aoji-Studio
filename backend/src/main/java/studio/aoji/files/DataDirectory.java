package studio.aoji.files;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import studio.aoji.config.AppProperties;

/**
 * 데이터 폴더({@code collect-token}·{@code teams/}·{@code trash/}·{@code helper-token})의 단일 출처(ADR-55·ADR-61).
 * 이름은 {@code .aojistudio} 하나로 고정이다. 기동 시 마운트 루트 바로 아래 이 이름이 심볼릭 링크이거나
 * 디렉터리가 아니면(상태 F) 아무것도 바꾸지 않고 기동을 실패시킨다(NOFOLLOW_LINKS, NFR-07).
 * 없으면 그대로 두고 만들지 않는다 - 만들기는 {@code CollectTokenStore} 등 쓰는 쪽이 한다.
 * {@code ".aojistudio"} 이름 리터럴은 이 클래스 한 곳에만 둔다(conventions §3).
 */
@Component
public class DataDirectory {

    static final String NAME = ".aojistudio";
    public static final String TEAMS = "teams";
    public static final String TRASH = "trash";
    public static final String COLLECT_TOKEN = "collect-token";
    public static final String HELPER_TOKEN = "helper-token";

    private final Path mountRoot;

    @Autowired
    public DataDirectory(AppProperties appProperties) {
        this(Path.of(appProperties.getMountPath()));
    }

    public DataDirectory(Path mountRoot) {
        this.mountRoot = mountRoot;
    }

    @PostConstruct
    public void init() {
        verify();
    }

    /** 테스트 편의: 상태를 판정해 확정한 인스턴스. */
    public static DataDirectory resolved(Path mountRoot) {
        DataDirectory dir = new DataDirectory(mountRoot);
        dir.init();
        return dir;
    }

    /** 예외 메시지에는 링크 대상 경로·마운트 절대 경로를 넣지 않는다(NFR-07, NFR-08). */
    private void verify() {
        BasicFileAttributes attrs;
        try {
            attrs = Files.readAttributes(path(), BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        } catch (NoSuchFileException e) {
            return;
        } catch (IOException e) {
            throw new IllegalStateException(NAME + " 상태를 읽을 수 없습니다 · 마운트 권한을 확인한 뒤 다시 기동하세요");
        }
        if (attrs.isSymbolicLink() || !attrs.isDirectory()) {
            throw new IllegalStateException(NAME + "가 " + (attrs.isSymbolicLink() ? "심볼릭 링크입니다" : "디렉터리가 아닙니다")
                    + " · 아무것도 바꾸지 않았습니다. 확인한 뒤 다시 기동하세요");
        }
    }

    /** 마운트 루트 바로 아래 데이터 폴더 이름(상대 경로 표기·{@code PathGuard.resolve}용). */
    public String name() {
        return NAME;
    }

    public Path path() {
        return mountRoot.resolve(NAME);
    }

    public Path collectTokenFile() {
        return path().resolve(COLLECT_TOKEN);
    }

    public Path helperTokenFile() {
        return path().resolve(HELPER_TOKEN);
    }

    public Path teamsDir() {
        return path().resolve(TEAMS);
    }

    /** 마운트 루트 기준 상대 경로 표기({@code .aojistudio/teams/*.json} 등). */
    public String relative(String... segments) {
        return NAME + (segments.length == 0 ? "" : "/" + String.join("/", segments));
    }

    public Path mountRoot() {
        return mountRoot;
    }
}
