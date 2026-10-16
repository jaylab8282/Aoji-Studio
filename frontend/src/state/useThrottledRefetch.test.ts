import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { UsagePeriod } from "../api/types";
import { REFETCH_INTERVAL_MS, useThrottledRefetch } from "./useThrottledRefetch";

describe("useThrottledRefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("[ADR-94][D-180] 재조회가 실패해도 onLoaded로 받은 직전 값은 지워지지 않고 에러만 알린다", async () => {
    const fetcher = vi
      .fn<(period: UsagePeriod) => Promise<string>>()
      .mockResolvedValueOnce("첫 값")
      .mockRejectedValueOnce(new ApiError({ code: "FILE_GONE", message: "재조회 실패" }));
    const onLoaded = vi.fn<(value: string) => void>();
    const { result, rerender } = renderHook(
      ({ trigger }) => useThrottledRefetch({ period: "7d", fetcher, onLoaded, trigger }),
      { initialProps: { trigger: "0" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenLastCalledWith("첫 값");
    expect(result.current.errorMessage).toBeNull();

    rerender({ trigger: "1" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_INTERVAL_MS);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.errorMessage).toBe("재조회 실패");
    // 실패 응답은 값 쪽 콜백을 부르지 않는다(값을 비우거나 덮지 않는다).
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });
});
