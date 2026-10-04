package studio.aoji.files;

import java.nio.file.Path;
import java.time.Clock;
import studio.aoji.legacy.DataDirMigration;
import studio.aoji.legacy.LegacyWarnings;

/** 테스트용: 임시 마운트 루트에서 마이그레이션을 실행해 확정한 {@link DataDirectory}. */
public final class TestDataDirectories {

    private TestDataDirectories() {
    }

    public static DataDirectory forMount(Path mountRoot) {
        return DataDirectory.resolved(mountRoot, () -> true, DataDirMigration.atomicMover(),
                new LegacyWarnings(Clock.systemUTC(), line -> { }));
    }
}
