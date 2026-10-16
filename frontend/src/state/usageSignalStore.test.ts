import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TranscriptStatus } from "../api/types";
import { USAGE_AREAS, usageSignalStore, useTranscriptSignal, useUsageSignal } from "./usageSignalStore";

const READING: TranscriptStatus = { connected: true, state: "reading", readFiles: 412, totalFiles: 1280, skippedFiles: 3 };
const READY: TranscriptStatus = { connected: true, state: "ready", readFiles: 1280, totalFiles: 1280, skippedFiles: 3 };

describe("usageSignalStore (realtime-spec §5 usage-changed)", () => {
  beforeEach(() => {
    usageSignalStore.reset();
  });

  it("[realtime-spec §5] 신호는 알린 영역의 카운터만 올린다", () => {
    usageSignalStore.signal(["skills", "mcp"], null);
    expect(usageSignalStore.getSnapshot().counters).toEqual({ skills: 1, mcp: 1, cost: 0, limits: 0, settings: 0 });

    usageSignalStore.signal(["skills"], null);
    expect(usageSignalStore.getSnapshot().counters.skills).toBe(2);
    expect(usageSignalStore.getSnapshot().counters.mcp).toBe(1);
  });

  it("[realtime-spec §5] 한 알림에 같은 영역이 겹쳐도 한 번만 올린다", () => {
    usageSignalStore.signal(["cost", "cost"], null);
    expect(usageSignalStore.getSnapshot().counters.cost).toBe(1);
  });

  it("[realtime-spec §5] transcripts가 있으면 교체하고 null이면 이전 값을 유지한다", () => {
    usageSignalStore.signal(["cost"], READING);
    expect(usageSignalStore.getSnapshot().transcripts).toEqual(READING);

    usageSignalStore.signal(["skills"], null);
    expect(usageSignalStore.getSnapshot().transcripts).toEqual(READING);

    usageSignalStore.signal(["cost"], READY);
    expect(usageSignalStore.getSnapshot().transcripts).toEqual(READY);
  });

  it("[realtime-spec §5] 재연결: signalAll은 전 영역을 올리고 transcripts는 그대로 둔다", () => {
    usageSignalStore.signal(["cost"], READING);
    usageSignalStore.signalAll();

    for (const area of USAGE_AREAS) {
      expect(usageSignalStore.getSnapshot().counters[area]).toBe(area === "cost" ? 2 : 1);
    }
    expect(usageSignalStore.getSnapshot().transcripts).toEqual(READING);
  });

  it("[realtime-spec §5] 훅은 자기 영역이 바뀔 때만 값을 바꾼다", () => {
    const skills = renderHook(() => useUsageSignal("skills"));
    const mcp = renderHook(() => useUsageSignal("mcp"));
    const transcripts = renderHook(() => useTranscriptSignal());
    expect(skills.result.current).toBe(0);
    expect(transcripts.result.current).toBeNull();

    act(() => usageSignalStore.signal(["skills"], null));
    expect(skills.result.current).toBe(1);
    expect(mcp.result.current).toBe(0);

    act(() => usageSignalStore.signal(["cost"], READING));
    expect(transcripts.result.current).toEqual(READING);
    expect(skills.result.current).toBe(1);
  });
});
