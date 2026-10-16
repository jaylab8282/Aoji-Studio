package studio.aoji.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import studio.aoji.stream.SseHub;

/**
 * {@code usage-changed} 방송 내용 (realtime-spec {@code UsageChanged.transcripts}): {@code cost} 방송은
 * 대화 기록 진행 객체를, 다른 영역은 null을 싣는다. 묶음 시간 규칙은 {@code SseStreamTest}가 본다.
 */
class UsageChangedNotifierTest {

    private final SseHub hub = mock(SseHub.class);
    private final UsageChangedNotifier notifier = new UsageChangedNotifier(hub);

    @Test
    @DisplayName("[FR-025-AC6] cost 방송은 transcripts 객체(connected·state·readFiles·totalFiles·skippedFiles)를 싣는다")
    void costBroadcastCarriesTranscripts() {
        notifier.setTranscriptsSupplier(
                () -> new TranscriptStatus(true, TranscriptStatus.READING, 412, 1280, 3).asMap());

        notifier.markChanged(UsageArea.COST);

        ArgumentCaptor<Map<String, Object>> transcripts = ArgumentCaptor.captor();
        verify(hub, timeout(2000)).broadcastUsageChanged(eq(List.of("cost")), transcripts.capture());
        assertThat(transcripts.getValue())
                .containsExactly(
                        Map.entry("connected", true),
                        Map.entry("state", "reading"),
                        Map.entry("readFiles", 412),
                        Map.entry("totalFiles", 1280),
                        Map.entry("skippedFiles", 3));
    }

    @Test
    @DisplayName("[FR-025-AC6] 방송 시점의 값을 싣는다 — 표시 요청 뒤 바뀐 진행이 반영된다")
    void costBroadcastUsesValueAtSendTime() {
        TranscriptStatus[] current = {new TranscriptStatus(true, TranscriptStatus.READING, 1, 10, 0)};
        notifier.setTranscriptsSupplier(() -> current[0].asMap());
        current[0] = new TranscriptStatus(true, TranscriptStatus.READY, 10, 10, 0);

        notifier.markChanged(UsageArea.COST);

        ArgumentCaptor<Map<String, Object>> transcripts = ArgumentCaptor.captor();
        verify(hub, timeout(2000)).broadcastUsageChanged(eq(List.of("cost")), transcripts.capture());
        assertThat(transcripts.getValue()).containsEntry("state", "ready").containsEntry("readFiles", 10);
    }

    @Test
    @DisplayName("[FR-025-AC6] cost 말고 다른 영역(limits)은 transcripts가 null")
    void otherAreasCarryNullTranscripts() {
        notifier.setTranscriptsSupplier(() -> new TranscriptStatus(true, TranscriptStatus.READY, 1, 1, 0).asMap());

        notifier.markChanged(UsageArea.LIMITS);

        verify(hub, timeout(2000)).broadcastUsageChanged(eq(List.of("limits")), eq((Map<String, Object>) null));
    }
}
