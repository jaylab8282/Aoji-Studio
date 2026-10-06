import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisconnectBanner } from "./DisconnectBanner";
import { connectionStore } from "../../state/connectionStore";
import { reconnectNow } from "../../api/stream";

vi.mock("../../api/stream", () => ({ reconnectNow: vi.fn() }));

describe("DisconnectBanner", () => {
  afterEach(() => {
    connectionStore.reset();
    vi.mocked(reconnectNow).mockClear();
  });

  it("[FR-016-AC1] disconnected → role=status 띠, 'wifi-off' + 문구 + N초(고정폭) + 지금 재연결", () => {
    connectionStore.setDisconnected(12);

    render(<DisconnectBanner />);

    const band = screen.getByRole("status");
    expect(band).toHaveAttribute("data-wf", "04-3-1");
    expect(band).toHaveClass("bg-danger-soft", "border-danger-border", "text-danger", "min-h-banner");
    expect(band).toHaveTextContent("실시간 연결이 끊겼습니다 · 12초 후 재연결");
    expect(screen.getByText("12")).toHaveClass("font-mono");
    expect(screen.getByTestId("disconnect-countdown")).toHaveTextContent(/^실시간 연결이 끊겼습니다 · 12초 후 재연결$/);
    expect(band.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "지금 재연결" })).toBeInTheDocument();
  });

  it("[FR-016-AC1] 재연결 대기 초가 줄면 N이 바뀐다", () => {
    connectionStore.setDisconnected(10);
    render(<DisconnectBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("10초 후 재연결");

    act(() => connectionStore.setRetryInSec(9));

    expect(screen.getByRole("status")).toHaveTextContent("실시간 연결이 끊겼습니다 · 9초 후 재연결");
  });

  it("[FR-016-AC2] 마지막 갱신 hh:mm:ss 기준 화면을 유지합니다", () => {
    connectionStore.touch("2026-09-22T14:32:05+09:00");
    connectionStore.setDisconnected(5);

    render(<DisconnectBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("마지막 갱신 14:32:05 기준 화면을 유지합니다");
    expect(screen.getByText("14:32:05")).toHaveClass("font-mono");
    expect(screen.getByTestId("disconnect-last-updated")).toHaveTextContent(/^마지막 갱신 14:32:05 기준 화면을 유지합니다$/);
  });

  it("[FR-016-AC2] 스냅샷을 한 번도 못 받았으면 '아직 받은 데이터가 없습니다'", () => {
    connectionStore.setDisconnected(5);

    render(<DisconnectBanner />);

    expect(screen.getByText("아직 받은 데이터가 없습니다")).toBeInTheDocument();
    expect(screen.queryByText(/마지막 갱신/)).not.toBeInTheDocument();
  });

  it("[FR-016-AC3] 지금 재연결 → stream.reconnectNow() 호출", () => {
    connectionStore.setDisconnected(7);
    render(<DisconnectBanner />);

    fireEvent.click(screen.getByRole("button", { name: "지금 재연결" }));

    expect(reconnectNow).toHaveBeenCalledTimes(1);
  });

  it("[FR-016-AC1] connected → 띠를 렌더하지 않는다", () => {
    connectionStore.setConnected();

    const { container } = render(<DisconnectBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
