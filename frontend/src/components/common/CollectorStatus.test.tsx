import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectorStatus } from "./CollectorStatus";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

// ui-spec §공통 CollectorStatus·SCR-00, ADR-72. 오늘 = 2026-09-22(Asia/Seoul)로 고정한다.
const TODAY_NOON = "2026-09-22T12:00:00+09:00";

function seed(hookConfigured: boolean, everReceived: boolean, lastReceivedAt: string | null) {
  const fixture = buildSnapshotFixture();
  snapshotStore.replace({
    ...fixture,
    registry: { ...fixture.registry, hookConfigured },
    live: { ...fixture.live, everReceived, lastReceivedAt },
  });
}

function box() {
  return document.querySelector<HTMLElement>('[data-wf="NAV-3"]')!;
}

function rail() {
  return document.querySelector<HTMLElement>('[data-wf="NAV-3R"]')!;
}

describe("CollectorStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(TODAY_NOON));
  });

  afterEach(() => {
    vi.useRealTimers();
    snapshotStore.reset();
  });

  it("[FR-003-AC6] hookConfigured + everReceived → 시안 칩 'hook 설정됨', 마지막 수신 hh:mm:ss, 레일 hh:mm", () => {
    seed(true, true, "2026-09-22T10:20:30+09:00");

    render(<CollectorStatus />);

    expect(within(box()).getByText("수집 상태")).toBeInTheDocument();
    const chip = within(box()).getByText("hook 설정됨");
    expect(chip).toHaveAttribute("data-stage", "live");
    expect(chip).toHaveClass("bg-live-soft", "text-live");
    expect(box()).toHaveTextContent("마지막 수신 10:20:30");
    expect(rail()).toHaveTextContent("수집");
    expect(rail()).toHaveTextContent("10:20");
    expect(rail().querySelector('[data-stage="live"]')).toHaveClass("bg-live", "shadow-glow");
  });

  it("[FR-003-AC6] 오늘이 아니면 상자는 'yyyy-mm-dd hh:mm', 레일은 'mm-dd'", () => {
    seed(true, true, "2026-09-20T18:20:00+09:00");

    render(<CollectorStatus />);

    expect(box()).toHaveTextContent("마지막 수신 2026-09-20 18:20");
    expect(rail()).toHaveTextContent("09-20");
  });

  it("[FR-003-AC6] hookConfigured && !everReceived → 중립 칩 'hook 설정됨' + '마지막 수신 없음', 레일 '없음'", () => {
    seed(true, false, null);

    render(<CollectorStatus />);

    const chip = within(box()).getByText("hook 설정됨");
    expect(chip).toHaveAttribute("data-stage", "neutral");
    expect(chip).toHaveClass("bg-selected", "text-text-muted");
    expect(within(box()).getByText("마지막 수신 없음")).toBeInTheDocument();
    expect(rail()).toHaveTextContent("없음");
  });

  it("[FR-003-AC6] !hookConfigured → 빨강 칩 'hook 설정 안 됨' + '마지막 수신 없음', 레일 '미설정'", () => {
    seed(false, false, null);

    render(<CollectorStatus />);

    const chip = within(box()).getByText("hook 설정 안 됨");
    expect(chip).toHaveAttribute("data-stage", "unset");
    expect(chip).toHaveClass("bg-danger-soft", "text-danger");
    expect(within(box()).getByText("마지막 수신 없음")).toBeInTheDocument();
    expect(rail()).toHaveTextContent("미설정");
  });

  it("[FR-003-AC6] 시간이 지나도 단계가 바뀌지 않는다(이력 없음 + 수 시간 뒤에도 중립)", () => {
    seed(true, false, null);
    render(<CollectorStatus />);
    vi.setSystemTime(new Date("2026-09-22T23:30:00+09:00"));

    expect(within(box()).getByText("hook 설정됨")).toHaveAttribute("data-stage", "neutral");
  });

  it("[FR-003-AC6][NFR-12] 레일 축약: tabIndex 0, title·aria-label = '수집 상태 · <칩 글자> · 마지막 수신 <시각|없음>'", () => {
    seed(true, true, "2026-09-22T10:20:30+09:00");

    render(<CollectorStatus />);

    const mini = screen.getByRole("group", { name: "수집 상태 · hook 설정됨 · 마지막 수신 10:20:30" });
    expect(mini).toBe(rail());
    expect(mini).toHaveAttribute("tabindex", "0");
    expect(mini).toHaveAttribute("title", "수집 상태 · hook 설정됨 · 마지막 수신 10:20:30");
    // 툴팁은 래퍼(`Tooltip bubble="rail"`)가 `data-tip`으로 그린다(D-125).
    expect(mini.parentElement).toHaveAttribute("data-tip", "수집 상태 · hook 설정됨 · 마지막 수신 10:20:30");
    expect(mini.parentElement).toHaveClass("tooltip-rail");
  });

  it("[FR-003-AC6] 미설정이면 레일 label이 '수집 상태 · hook 설정 안 됨 · 마지막 수신 없음'", () => {
    seed(false, false, null);

    render(<CollectorStatus />);

    expect(rail()).toHaveAttribute("aria-label", "수집 상태 · hook 설정 안 됨 · 마지막 수신 없음");
  });

  it("[FR-003-AC6][NFR-11] 가로형 상자는 rail:에서 숨고 레일 축약은 rail:에서만 보인다", () => {
    seed(true, true, "2026-09-22T10:20:30+09:00");

    render(<CollectorStatus />);

    expect(box()).toHaveClass("rail:hidden");
    expect(rail().parentElement).toHaveClass("hidden", "rail:block");
    expect(rail()).toHaveClass("grid", "w-rail-item-w");
  });

  it("[FR-003-AC6] ready false → 칩·시각 스켈레톤, 레일은 '수집' + 스켈레톤(칩 글자·시각 없음)", () => {
    render(<CollectorStatus />);

    expect(screen.getByLabelText("수집 상태 로딩 중")).toBeInTheDocument();
    expect(screen.getByLabelText("마지막 수신 로딩 중")).toBeInTheDocument();
    expect(screen.getByLabelText("수집 축약 로딩 중")).toBeInTheDocument();
    expect(within(box()).getByText("수집 상태")).toBeInTheDocument();
    expect(rail()).toHaveTextContent("수집");
    expect(screen.queryByText("hook 설정됨")).not.toBeInTheDocument();
    expect(screen.queryByText("hook 설정 안 됨")).not.toBeInTheDocument();
  });
});
