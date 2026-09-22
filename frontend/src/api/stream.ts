/**
 * SSE 클라이언트 (realtime-spec.md §4·§5).
 * `EventSource`의 자동 재연결은 쓰지 않고 여기서 상태 기계를 직접 구현한다.
 * 컴포넌트는 이 파일을 직접 다루지 않고 `state/connectionStore.ts`·`state/snapshotStore.ts`만 구독한다.
 */
import { apiGet, getBrowserToken } from "./client";
import { connectionStore } from "../state/connectionStore";
import { snapshotStore } from "../state/snapshotStore";
import type { EventRow, Live, Registry, Snapshot } from "./types";

const HEARTBEAT_TIMEOUT_MS = 45_000;
const INITIAL_BACKOFF_SEC = 5;
const MAX_BACKOFF_SEC = 30;

type MessageType = "snapshot" | "registry" | "live" | "event" | "heartbeat";
const MESSAGE_TYPES: MessageType[] = ["snapshot", "registry", "live", "event", "heartbeat"];

export interface StreamClient {
  connect: () => void;
  reconnectNow: () => void;
  stop: () => void;
}

/** 테스트에서 독립된 인스턴스를 만들 수 있도록 팩토리로 둔다. */
export function createStreamClient(): StreamClient {
  let eventSource: EventSource | null = null;
  let backoffSec = INITIAL_BACKOFF_SEC;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeq = 0;
  let hasEverConnected = false;
  let stopped = false;

  function clearCountdown(): void {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function clearIdleTimer(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function resetIdleTimer(): void {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      handleDisconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  function closeEventSource(): void {
    if (eventSource) {
      eventSource.onerror = null;
      eventSource.close();
      eventSource = null;
    }
  }

  /** 첫 snapshot을 한 번도 못 받았으면 `GET /api/state`로 첫 화면을 채운다. */
  async function attemptStateFallback(): Promise<void> {
    if (hasEverConnected) return;
    try {
      const data = await apiGet<Snapshot>("/api/state");
      snapshotStore.replace(data);
    } catch {
      // 그래도 실패하면 04-2 스켈레톤 + 04-3 배너를 그대로 둔다.
    }
  }

  function handleDisconnect(): void {
    if (stopped) return;
    if (!eventSource && countdownTimer) return; // 이미 재연결 대기 중
    closeEventSource();
    clearIdleTimer();
    // 토큰 만료 가능성 대비: 다음 시도에 쓸 토큰을 1회 갱신한다(realtime-spec §4 "토큰 만료").
    void getBrowserToken(true).catch(() => {});
    void attemptStateFallback();
    scheduleReconnect();
  }

  function scheduleReconnect(): void {
    const retryInSec = backoffSec;
    connectionStore.setDisconnected(retryInSec);
    backoffSec = Math.min(backoffSec * 2, MAX_BACKOFF_SEC);

    clearCountdown();
    let remaining = retryInSec;
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        connect();
      } else {
        connectionStore.setRetryInSec(remaining);
      }
    }, 1000);
  }

  function handleMessage(type: MessageType, seqRaw: string, raw: string): void {
    const seq = Number(seqRaw);
    if (Number.isFinite(seq)) {
      if (seq <= lastSeq) return; // 중복 방어 (realtime-spec §2 순서 보장)
      lastSeq = seq;
    }
    resetIdleTimer();
    const receivedAt = new Date().toISOString();

    switch (type) {
      case "snapshot": {
        const data = JSON.parse(raw) as Snapshot;
        snapshotStore.replace(data);
        connectionStore.touch(receivedAt);
        connectionStore.setConnected();
        hasEverConnected = true;
        backoffSec = INITIAL_BACKOFF_SEC;
        break;
      }
      case "registry": {
        const data = JSON.parse(raw) as Registry;
        snapshotStore.setRegistry(data);
        connectionStore.touch(receivedAt);
        break;
      }
      case "live": {
        const data = JSON.parse(raw) as Live;
        snapshotStore.setLive(data);
        connectionStore.touch(receivedAt);
        break;
      }
      case "event": {
        const data = JSON.parse(raw) as EventRow;
        snapshotStore.prependEvent(data);
        connectionStore.touch(receivedAt);
        break;
      }
      case "heartbeat": {
        connectionStore.touch(receivedAt);
        break;
      }
    }
  }

  function connect(): void {
    if (stopped) return;
    clearCountdown();
    connectionStore.setConnecting();

    void (async () => {
      let token: string;
      try {
        token = await getBrowserToken();
      } catch {
        await attemptStateFallback();
        scheduleReconnect();
        return;
      }
      if (stopped) return;

      const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
      eventSource = es;
      resetIdleTimer();

      for (const type of MESSAGE_TYPES) {
        es.addEventListener(type, ((event: MessageEvent) => {
          handleMessage(type, event.lastEventId, event.data as string);
        }) as EventListener);
      }

      es.onerror = () => {
        handleDisconnect();
      };
    })();
  }

  function reconnectNow(): void {
    clearCountdown();
    connect();
  }

  function stop(): void {
    stopped = true;
    clearCountdown();
    clearIdleTimer();
    closeEventSource();
  }

  return { connect, reconnectNow, stop };
}

const defaultClient = createStreamClient();

/** 앱 부팅 시 한 번만 호출한다(`app/main.tsx`). */
export function startStream(): void {
  defaultClient.connect();
}

export function reconnectNow(): void {
  defaultClient.reconnectNow();
}

export function stopStream(): void {
  defaultClient.stop();
}
