package studio.aoji.files;

import java.nio.file.Path;

/** 테스트용: 임시 마운트 루트의 상태를 판정해 확정한 {@link DataDirectory}. */
public final class TestDataDirectories {

    private TestDataDirectories() {
    }

    public static DataDirectory forMount(Path mountRoot) {
        return DataDirectory.resolved(mountRoot);
    }
}
