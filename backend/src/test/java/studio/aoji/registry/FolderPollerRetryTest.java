package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.config.AppProperties;
import studio.aoji.files.DataDirectory;
import studio.aoji.live.LiveStateService;
import studio.aoji.stream.SseHub;

/** FolderPoller는 재스캔이 실패하면 기준선을 올리지 않아 같은 변경을 다음 주기에 다시 감지한다. */
class FolderPollerRetryTest {

    @TempDir
    Path mountRoot;

    @SuppressWarnings("unchecked")
    @Test
    void failedRescanIsRetriedOnNextPollAndBroadcastsOnce() throws Exception {
        // [FR-001-AC3][NFR-02] 재스캔 1회 실패 후에도 변경이 유실되지 않고 다음 poll에서 방송된다
        Path agents = Files.createDirectories(mountRoot.resolve(".claude").resolve("agents"));
        Path dataDir = Files.createDirectories(mountRoot.resolve(".aojistudio"));
        AppProperties props = mock(AppProperties.class);
        when(props.getMountPath()).thenReturn(mountRoot.toString());
        DataDirectory dataDirectory = mock(DataDirectory.class);
        when(dataDirectory.helperTokenFile()).thenReturn(dataDir.resolve("helper-token"));
        when(dataDirectory.teamsDir()).thenReturn(dataDir.resolve("teams"));
        RegistryService registryService = mock(RegistryService.class);
        SseHub hub = mock(SseHub.class);
        RegistrySnapshot registry = mock(RegistrySnapshot.class);
        when(registryService.rescanNow(any(Consumer.class)))
                .thenThrow(new IllegalStateException("scan failed"))
                .thenAnswer(inv -> {
                    ((Consumer<RegistrySnapshot>) inv.getArgument(0)).accept(registry);
                    return registry;
                });

        FolderPoller poller =
                new FolderPoller(props, dataDirectory, registryService, mock(LiveStateService.class), hub);
        poller.init();
        Files.writeString(agents.resolve("a.md"), "---\nname: a\ndescription: d\n---\n", StandardCharsets.UTF_8);

        poller.poll(); // 재스캔 실패 - 예외를 삼키고 기준선을 올리지 않는다
        verify(hub, times(0)).broadcast(any(), any());
        poller.poll(); // 같은 변경을 다시 감지해 방송한다
        verify(hub, times(1)).broadcast(any(), any());
        poller.poll(); // 기준선이 올라갔으니 더 방송하지 않는다
        verify(registryService, times(2)).rescanNow(any(Consumer.class));
        assertThat(Files.exists(agents.resolve("a.md"))).isTrue();
    }
}
