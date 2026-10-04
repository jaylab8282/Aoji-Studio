package studio.aoji.files;

import jakarta.annotation.PostConstruct;
import java.nio.file.Path;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import studio.aoji.config.AppProperties;
import studio.aoji.legacy.DataDirMigration;
import studio.aoji.legacy.LegacyWarnings;
import studio.aoji.registry.ProjectFolderScanner;

/**
 * 데이터 폴더({@code collect-token}·{@code teams/}·{@code trash/}·{@code helper-token})의 단일 출처(ADR-55).
 * 기동 시 {@link DataDirMigration}을 한 번 실행해 폴더 이름과 모드를 정하고, 이 값이 필요한 빈은 모두
 * 이 빈을 생성자 주입받는다 - 그래서 이동·판정이 다른 빈보다 먼저 끝났다는 순서가 보장된다.
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
    private final BooleanSupplier writableProbe;
    private final LegacyWarnings warnings;
    private final DataDirMigration.Mover mover;
    private volatile DataDirMigration.Result result;

    @Autowired
    public DataDirectory(AppProperties appProperties, ProjectFolderScanner scanner, LegacyWarnings warnings) {
        this(Path.of(appProperties.getMountPath()), () -> scanner.checkWritable(Path.of(appProperties.getMountPath())),
                DataDirMigration.atomicMover(), warnings);
    }

    /** 쓰기 판정·mover를 주입하는 생성자(테스트). */
    public DataDirectory(Path mountRoot, BooleanSupplier writableProbe, DataDirMigration.Mover mover,
            LegacyWarnings warnings) {
        this.mountRoot = mountRoot;
        this.writableProbe = writableProbe;
        this.mover = mover;
        this.warnings = warnings;
    }

    @PostConstruct
    public void init() {
        this.result = DataDirMigration.run(mountRoot, NAME, writableProbe, mover, warnings);
    }

    /** 마이그레이션을 실행해 결과를 확정한 인스턴스(테스트 편의). */
    public static DataDirectory resolved(Path mountRoot, BooleanSupplier writableProbe, DataDirMigration.Mover mover,
            LegacyWarnings warnings) {
        DataDirectory dir = new DataDirectory(mountRoot, writableProbe, mover, warnings);
        dir.init();
        return dir;
    }

    /** 마운트 루트 바로 아래 데이터 폴더 이름(상대 경로 표기·{@code PathGuard.resolve}용). */
    public String name() {
        return result.dirName();
    }

    /** {@code LEGACY_READ_ONLY}면 데이터 폴더가 옛 폴더이고 쓰기는 일어나지 않는다. */
    public boolean legacyReadOnly() {
        return result.mode() == DataDirMigration.Mode.LEGACY_READ_ONLY;
    }

    public Path path() {
        return mountRoot.resolve(result.dirName());
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

    /** 마운트 루트 기준 상대 경로 표기({@code <데이터 폴더>/teams/*.json} 등). */
    public String relative(String... segments) {
        return name() + (segments.length == 0 ? "" : "/" + String.join("/", segments));
    }

    public Path mountRoot() {
        return mountRoot;
    }
}
