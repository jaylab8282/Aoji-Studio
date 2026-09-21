package studio.jay.live;

import org.springframework.context.ApplicationEvent;
import studio.jay.events.EventRow;

/**
 * {@link LiveState}가 바뀔 때마다 발행하는 이벤트 (T-007 연결 지점, architecture.md §3.2
 * "SseHub.broadcast(live, event)"). {@code SseHub}가 이 이벤트를 {@code @Async} 리스너로 구독해
 * 방송한다. 이 태스크(T-006)에는 리스너가 없으므로 발행은 아무 효과가 없고 수집 응답을 막지 않는다.
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
