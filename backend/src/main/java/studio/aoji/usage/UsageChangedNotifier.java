package studio.aoji.usage;

import jakarta.annotation.PreDestroy;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import studio.aoji.stream.SseHub;

/**
 * 영역별 {@code usage-changed} 묶음 방송 (ADR-86 결정 4, realtime-spec §2). 같은 영역은 1초에 최대 1회
 * 보내고, 마지막 변화 뒤 1초 안에 반드시 1회 보낸다(첫 변화는 곧바로, 이어지는 변화는 직전 방송 + 1초에
 * 한 번으로 합친다). 영역끼리는 서로 막지 않는다. 방송 전에 {@link #MIN_DELAY_MILLIS}만 기다려 같은
 * hook의 {@code event} → {@code live} 방송이 먼저 나가게 한다.
 */
@Component
public class UsageChangedNotifier {

    static final long WINDOW_MILLIS = 1000;
    static final long MIN_DELAY_MILLIS = 30;
    private static final Logger log = LoggerFactory.getLogger(UsageChangedNotifier.class);

    private final SseHub sseHub;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "usage-changed-notifier");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, AreaState> states = new HashMap<>();

    public UsageChangedNotifier(SseHub sseHub) {
        this.sseHub = sseHub;
    }

    /** 영역 값이 바뀌었음을 알린다. 방송은 묶음 규칙에 따라 늦게 나갈 수 있다. */
    public void markChanged(Collection<String> areas) {
        for (String area : areas) {
            markChanged(area);
        }
    }

    public synchronized void markChanged(String area) {
        AreaState state = states.computeIfAbsent(area, key -> new AreaState());
        if (state.pending) {
            return;
        }
        state.pending = true;
        long sinceLast = state.lastSentNanos == null
                ? Long.MAX_VALUE
                : TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - state.lastSentNanos);
        long delay = Math.max(MIN_DELAY_MILLIS, WINDOW_MILLIS - sinceLast);
        scheduler.schedule(() -> send(area), delay, TimeUnit.MILLISECONDS);
    }

    private void send(String area) {
        synchronized (this) {
            AreaState state = states.get(area);
            state.pending = false;
            state.lastSentNanos = System.nanoTime();
        }
        try {
            sseHub.broadcastUsageChanged(List.of(area), null);
        } catch (RuntimeException e) {
            log.warn("usage-changed 방송 실패: area={}", area);
        }
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
    }

    private static final class AreaState {
        private boolean pending;
        private Long lastSentNanos;
    }
}
