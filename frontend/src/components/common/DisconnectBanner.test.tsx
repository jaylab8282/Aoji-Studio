import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DisconnectBanner } from "./DisconnectBanner";
import { connectionStore } from "../../state/connectionStore";

describe("DisconnectBanner", () => {
  afterEach(() => {
    connectionStore.reset();
  });

  it("[FR-016-AC1] disconnected → 배너 문구·지금 재연결 렌더", () => {
    connectionStore.setDisconnected(12);

    render(<DisconnectBanner />);

    expect(screen.getByText("실시간 연결이 끊겼습니다 · 12초 후 재연결")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지금 재연결" })).toBeInTheDocument();
  });

  it("[FR-016-AC1] connected 상태 → 배너를 렌더하지 않는다", () => {
    connectionStore.setConnected();

    const { container } = render(<DisconnectBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("스냅샷을 한 번도 못 받았으면 '아직 받은 데이터가 없습니다'를 보여준다", () => {
    connectionStore.setDisconnected(5);

    render(<DisconnectBanner />);

    expect(screen.getByText("아직 받은 데이터가 없습니다")).toBeInTheDocument();
  });
});
