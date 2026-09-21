package studio.jay.live;

import org.springframework.context.ApplicationEvent;
import studio.jay.events.EventRow;

/**
 * hook 이벤트가 검증·마스킹·저장(INSERT)까지 끝난 뒤 발행하는 이벤트
 * (architecture.md §3.2 데이터 흐름의 "SessionStateMachine.apply" → "SseHub.broadcast(live, event)"
 * 연결 지점). {@code HookCollectController}는 이 이벤트만 발행하고 상태 계산·SSE 방송은 하지 않는다.
 *
 * <p>{@code LiveStateService#onHookEventReceived}가 요청 스레드에서 이 이벤트를 동기로 구독해 상태를
 * 갱신하고 {@link LiveStateChanged}를 발행한다. {@code studio.jay.stream.SseHub}는 그 결과를
 * {@code @Async} 리스너로 구독해 방송만 한다. 상태 계산은 동기이므로 수집 응답(204)에 100ms 안에
 * 반영되고, 방송은 비동기라 응답을 막지 않는다(NFR-02, FR-003-AC3 100ms).
 */
public class HookEventReceived extends ApplicationEvent {

    private final HookPayload payload;
    private final EventRow eventRow;

    public HookEventReceived(Object source, HookPayload payload, EventRow eventRow) {
        super(source);
        this.payload = payload;
        this.eventRow = eventRow;
    }

    /** 원본 hook 입력. 상태 전이 계산(T-006)에 필요한 필드(agent_id 등)를 포함한다. */
    public HookPayload payload() {
        return payload;
    }

    /** 저장된 행(마스킹된 summary 포함, id 채워짐). SSE {@code event} 방송(T-007)에 그대로 쓴다. */
    public EventRow eventRow() {
        return eventRow;
    }
}
