package studio.aoji.api;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import studio.aoji.stream.Snapshot;
import studio.aoji.stream.SnapshotAssembler;
import studio.aoji.stream.SseHub;

/**
 * 전체 스냅샷·SSE 스트림 (api-spec {@code GET /api/state}, {@code GET /api/stream},
 * realtime-spec.md). Origin 규칙·브라우저 토큰 검사는 {@code OriginFilter}·{@code BrowserTokenFilter}가
 * {@code /api/*}에 걸려 있는 필터로 이미 적용한다(architecture.md §5) — 이 컨트롤러는 별도 인증
 * 검사를 하지 않는다.
 */
@RestController
@RequestMapping("/api")
public class StateController {

    private final SnapshotAssembler snapshotAssembler;
    private final SseHub sseHub;

    public StateController(SnapshotAssembler snapshotAssembler, SseHub sseHub) {
        this.snapshotAssembler = snapshotAssembler;
        this.sseHub = sseHub;
    }

    @GetMapping("/state")
    public Snapshot state() {
        return snapshotAssembler.assemble();
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return sseHub.connect();
    }
}
