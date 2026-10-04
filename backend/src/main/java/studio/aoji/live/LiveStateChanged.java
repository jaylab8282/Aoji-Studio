package studio.aoji.live;

import org.springframework.context.ApplicationEvent;
import studio.aoji.events.EventRow;

/**
 * {@link LiveState}가 바뀔 때마다 발행하는 이벤트 (architecture.md §3.2 "SseHub.broadcast(live, event)").
 * {@code studio.aoji.stream.SseHub#onLiveStateChanged}가 이 이벤트를 {@code @Async} 리스너로 구독해
 * {@code event} → {@code live} 순서로 방송한다(realtime-spec.md §2 "순서 보장"). 발행은
 * {@link LiveStateService}가 요청 스레드에서 상태를 이미 갱신한 뒤 하므로, 방송이 늦어져도 수집
 * 응답(204)이나 다음 hook 처리를 막지 않는다.
 */
public class LiveStateChanged extends ApplicationEvent {

    private final LiveState state;
    private final EventRow eventRow;

    public LiveStateChanged(Object source, LiveState state, EventRow eventRow) {
        super(source);
        this.state = state;
        this.eventRow = eventRow;
    }

    /** 갱신된 전체 상태(락 없이 읽는 불변 스냅샷). */
    public LiveState state() {
        return state;
    }

    /** 이 상태 변화를 일으킨 원본 이벤트(SSE {@code event} 메시지 방송용). */
    public EventRow eventRow() {
        return eventRow;
    }
}
