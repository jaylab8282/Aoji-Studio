package studio.aoji.stream;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import studio.aoji.events.EventRowResponse;
import studio.aoji.live.Live;
import studio.aoji.live.LiveStateChanged;
import studio.aoji.live.LiveStateService;
import studio.aoji.registry.RegistrySnapshot;

/**
 * SSE 연결 목록·방송·heartbeat (architecture.md §3.2 "SseHub.broadcast(...)", realtime-spec.md).
 * 접속 직후 {@code snapshot} 1건을 보내고, 이후 {@code registry}/{@code live}/{@code event}/
 * {@code heartbeat}(15초)를 모든 emitter에 순서대로 방송한다. {@code seq}는 서버 수명 내 방송마다
 * +1이고 같은 값을 모든 연결에 보낸다(realtime-spec §1 "같은 연결 안에서 seq는 항상 증가한다").
 *
 * <p>{@link #onLiveStateChanged(LiveStateChanged)}는 {@code @Async} 리스너로 hook 이벤트 저장·상태
 * 전이({@code LiveStateService}, 요청 스레드)가 끝난 뒤 방송만 별도 실행기에서 한다(conventions.md §3
 * MUST). 방송 하나당 {@code event} → {@code live} 순서를 지킨다(realtime-spec §2 "순서 보장").
 *
 * <p>모든 send는 {@link #lock} 안에서 실행해 emitter 목록 변경·다른 방송과의 경합으로 메시지가
 * 끼어들거나 접속 직후 첫 메시지가 {@code snapshot}이 아니게 되는 상황을 막는다. 실패한 emitter는
 * 그 자리에서 제거한다(architecture.md §9 "SSE 연결 누수").
 */
@Component
public class SseHub {

    private static final Logger log = LoggerFactory.getLogger(SseHub.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final Object lock = new Object();
    private final SnapshotAssembler snapshotAssembler;
    private final LiveStateService liveStateService;
    private long seq = 0;

    public SseHub(SnapshotAssembler snapshotAssembler, LiveStateService liveStateService) {
        this.snapshotAssembler = snapshotAssembler;
        this.liveStateService = liveStateService;
    }

    /** 새 SSE 연결을 등록하고 접속 직후 {@code snapshot} 1건을 보낸다. timeout 0(무제한). */
    public SseEmitter connect() {
        SseEmitter emitter = new SseEmitter(0L);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(ex -> emitters.remove(emitter));

        synchronized (lock) {
            emitters.add(emitter);
            sendToOne(emitter, "snapshot", ++seq, snapshotAssembler.assemble());
        }
        return emitter;
    }

    /**
     * hook 이벤트 1건 처리 후 방송(architecture.md §3.2 "SseHub.broadcast(live, event)").
     * {@link LiveStateService}가 이미 상태를 갱신한 뒤 발행하는 이벤트를 구독하므로, 여기서는
     * 해당 이벤트 행과 최신 {@code Live}만 조립해 {@code event} → {@code live} 순서로 내보낸다.
     */
    @EventListener
    @Async
    public void onLiveStateChanged(LiveStateChanged event) {
        EventRowResponse eventRow = liveStateService.toEventRowResponse(event.eventRow());
        Live live = liveStateService.live();
        synchronized (lock) {
            broadcastToAll("event", eventRow);
            broadcastToAll("live", live);
        }
    }

    /**
     * registry 변경 방송(T-004 {@code FolderPoller}·변경 API가 파일 쓰기 후 호출, realtime-spec
     * "registry 변경 시 registry → live 순서").
     */
    public void broadcast(RegistrySnapshot registry, Live live) {
        synchronized (lock) {
            broadcastToAll("registry", registry);
            broadcastToAll("live", live);
        }
    }

    /** 15초마다 모든 연결에 heartbeat(realtime-spec §2 "다른 메시지를 보냈어도 15초마다 보낸다"). */
    @Scheduled(fixedRate = 15_000)
    public void sendHeartbeat() {
        synchronized (lock) {
            broadcastToAll("heartbeat", Map.of("serverTime", OffsetDateTime.now().toString()));
        }
    }

    /** 서버 종료 시 모든 emitter를 완료한다(architecture.md §9). */
    @PreDestroy
    void shutdown() {
        synchronized (lock) {
            for (SseEmitter emitter : emitters) {
                emitter.complete();
            }
            emitters.clear();
        }
    }

    private void broadcastToAll(String type, Object data) {
        long id = ++seq;
        for (SseEmitter emitter : emitters) {
            sendToOne(emitter, type, id, data);
        }
    }

    private void sendToOne(SseEmitter emitter, String type, long id, Object data) {
        try {
            emitter.send(SseEmitter.event().id(Long.toString(id)).name(type).data(data, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException ex) {
            emitters.remove(emitter);
            emitter.completeWithError(ex);
            log.debug("SSE emitter removed after send failure");
        }
    }
}
