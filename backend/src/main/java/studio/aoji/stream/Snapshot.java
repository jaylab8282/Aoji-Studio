package studio.aoji.stream;

import java.time.OffsetDateTime;
import java.util.List;
import studio.aoji.events.EventRowResponse;
import studio.aoji.live.Live;
import studio.aoji.registry.RegistrySnapshot;

/**
 * api-spec {@code Snapshot}. {@code GET /api/state} 응답이자 SSE {@code snapshot} 메시지 본문이다
 * (realtime-spec.md §2). {@link SnapshotAssembler}가 호출 시점의 registry·live·최근 이벤트로 조립한다.
 *
 * @param recentEvents 최신순 50건 이하(FR-005-AC6)
 */
public record Snapshot(
        OffsetDateTime serverTime,
        Config config,
        RegistrySnapshot registry,
        Live live,
        List<EventRowResponse> recentEvents) {

    public Snapshot {
        recentEvents = List.copyOf(recentEvents);
    }
}
