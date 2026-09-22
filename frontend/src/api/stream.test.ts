import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamClient } from "./stream";
import { snapshotStore } from "../state/snapshotStore";
import { connectionStore } from "../state/connectionStore";
import { buildSnapshotFixture } from "../test/fixtures/snapshot";

type Listener = (event: { lastEventId: string; data: string }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners: Record<string, Listener[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, id: string, data: unknown) {
    for (const listener of this.listeners[type] ?? []) {
      listener({ lastEventId: id, data: JSON.stringify(data) });
    }
  }

  triggerError() {
    this.onerror?.();
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush() {
  // getBrowserToken()·fetch 마이크로태스크를 흘려보낸다.
  await vi.advanceTimersByTimeAsync(0);
}

describe("stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/browser-token")) {
          return jsonResponse({ token: "a".repeat(64) });
        }
        if (url.includes("/api/state")) {
          return jsonResponse(buildSnapshotFixture());
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    snapshotStore.reset();
    connectionStore.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("[FR-016-AC4] snapshot 수신 → replace + connected", async () => {
    const client = createStreamClient();
    client.connect();
    await flush();

    const es = FakeEventSource.instances[0]!;
    es.emit("snapshot", "1", buildSnapshotFixture());

    expect(snapshotStore.getSnapshot().ready).toBe(true);
    expect(connectionStore.getSnapshot().state).toBe("connected");
  });

  it("[FR-016-AC2] 끊김 후 스토어 스냅샷 유지, lastUpdatedAt 표시", async () => {
    const client = createStreamClient();
    client.connect();
    await flush();

    const es = FakeEventSource.instances[0]!;
    es.emit("snapshot", "1", buildSnapshotFixture());
    expect(connectionStore.getSnapshot().lastUpdatedAt).not.toBeNull();

    es.triggerError();
    await flush();

    expect(connectionStore.getSnapshot().state).toBe("disconnected");
    // 화면은 마지막 스냅샷을 유지한다.
    expect(snapshotStore.getSnapshot().ready).toBe(true);
    expect(connectionStore.getSnapshot().lastUpdatedAt).not.toBeNull();
  });

  it("[FR-016-AC3] 백오프 5→10→20→30→30, 지금 재연결 즉시, 성공 시 5로 리셋", async () => {
    const client = createStreamClient();
    client.connect();
    await flush();

    // 1번째 끊김 → 5초
    FakeEventSource.instances.at(-1)!.triggerError();
    await flush();
    expect(connectionStore.getSnapshot().retryInSec).toBe(5);

    // 2번째 끊김(재시도 실패) → 10초
    await vi.advanceTimersByTimeAsync(5_000);
    await flush();
    FakeEventSource.instances.at(-1)!.triggerError();
    await flush();
    expect(connectionStore.getSnapshot().retryInSec).toBe(10);

    // 3번째 끊김 → 20초
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    FakeEventSource.instances.at(-1)!.triggerError();
    await flush();
    expect(connectionStore.getSnapshot().retryInSec).toBe(20);

    // 4번째 끊김 → 30초(최대)
    await vi.advanceTimersByTimeAsync(20_000);
    await flush();
    FakeEventSource.instances.at(-1)!.triggerError();
    await flush();
    expect(connectionStore.getSnapshot().retryInSec).toBe(30);

    // 5번째 끊김 → 30초 유지
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();
    FakeEventSource.instances.at(-1)!.triggerError();
    await flush();
    expect(connectionStore.getSnapshot().retryInSec).toBe(30);

    // 지금 재연결 → 즉시 connecting
    client.reconnectNow();
    expect(connectionStore.getSnapshot().state).toBe("connecting");
    await flush();

    // 성공(snapshot 수신) → 5로 리셋
    FakeEventSource.instances.at(-1)!.emit("snapshot", "999", buildSnapshotFixture());
    expect(connectionStore.getSnapshot().state).toBe("connected");

    FakeEventSource.instances.at(-1)!.triggerError();
    await flush();
    expect(connectionStore.getSnapshot().retryInSec).toBe(5);
  });

  it("[realtime-spec §2] seq가 이전보다 작거나 같은 메시지는 무시한다(중복 방어)", async () => {
    const client = createStreamClient();
    client.connect();
    await flush();

    const es = FakeEventSource.instances[0]!;
    const first = buildSnapshotFixture({ config: { ...buildSnapshotFixture().config, hostPath: "/first" } });
    const stale = buildSnapshotFixture({ config: { ...buildSnapshotFixture().config, hostPath: "/stale" } });

    es.emit("snapshot", "5", first);
    es.emit("snapshot", "3", stale); // seq 3 <= 5 → 무시

    expect(snapshotStore.getSnapshot().config?.hostPath).toBe("/first");
  });
});
