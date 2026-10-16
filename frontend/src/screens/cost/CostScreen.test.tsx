import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CostScreen } from "./CostScreen";
import { REFETCH_INTERVAL_MS } from "../../state/useThrottledRefetch";
import { pricingStore } from "../../state/pricingStore";
import { usageSignalStore } from "../../state/usageSignalStore";
import {
  MISSING_LIMIT,
  NEVER_LIMITS,
  NOT_CONNECTED_TRANSCRIPTS,
  PRICES,
  buildCostReport,
  buildLimits,
  okLimit,
  sums,
} from "../../test/fixtures/cost";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Responders {
  cost?: (url: string) => Response | Promise<Response>;
  limits?: () => Response | Promise<Response>;
  pricing?: () => Response | Promise<Response>;
}

function stubApi(responders: Responders = {}): { costUrls: string[]; limitsCalls: () => number } {
  const costUrls: string[] = [];
  let limitsCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/cost")) {
        costUrls.push(url);
        return (responders.cost ?? (() => jsonResponse(buildCostReport())))(url);
      }
      if (url.startsWith("/api/limits")) {
        limitsCalls += 1;
        return (responders.limits ?? (() => jsonResponse(buildLimits())))();
      }
      if (url.startsWith("/api/pricing")) return (responders.pricing ?? (() => jsonResponse(PRICES)))();
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return { costUrls, limitsCalls: () => limitsCalls };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/cost"]}>
      <CostScreen />
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** 합계 줄이 채워질 때까지(첫 조회 응답) 기다린다. */
async function waitForTiles() {
  await screen.findByText("입력 토큰");
  await waitFor(() => expect(tileOf("입력 토큰")).toHaveTextContent(/\d/));
}

function tileOf(label: string): HTMLElement {
  return screen.getByText(label, { exact: true }).parentElement as HTMLElement;
}

function rowsOf(panel: HTMLElement): string[][] {
  return within(panel)
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("cell").length > 0)
    .map((row) => within(row).getAllByRole("cell").map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()));
}

beforeEach(() => {
  pricingStore.reset();
  usageSignalStore.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CostScreen 합계·금액", () => {
  it("[FR-025-AC1] 토큰 4칸: 라벨과 값이 형제(부모가 칸)이고 값은 천 단위 쉼표", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();

    const tiles = container.querySelector('[data-wf="10-4"]') as HTMLElement;
    const expected: Array<[string, string]> = [
      ["입력 토큰", "1,000"],
      ["출력 토큰", "500"],
      ["캐시 생성 토큰", "200"],
      ["캐시 읽기 토큰", "98,300"],
    ];
    for (const [label, value] of expected) {
      const tile = tileOf(label);
      expect(tile.tagName).toBe("SECTION");
      expect(tiles).toContainElement(tile);
      expect(tile.children).toHaveLength(2);
      expect(tile.children[1]).toHaveTextContent(value);
      expect(tile).toHaveTextContent(new RegExp(`^${label}${value}$`));
    }
  });

  it("[FR-026-AC1] 추정 금액은 `$` + 소수 둘째 자리, 합계 줄과 같은 값", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const amount = container.querySelector('[data-wf="10-5"]') as HTMLElement;
    expect(amount).toHaveTextContent("추정 금액 (USD)");
    expect(amount).toHaveTextContent("$1.23");
    expect(amount).not.toHaveTextContent("$1.2345");
  });

  it("[FR-026-AC2] `API 단가 환산 · 실제 청구액 아님`은 항상, 구독 플랜이 확인됐을 때만 `구독 요금제에서는 청구되지 않는 금액입니다`를 덧붙인다", async () => {
    stubApi();
    const { container, unmount } = renderScreen();
    await waitForTiles();
    const amount = container.querySelector('[data-wf="10-5"]') as HTMLElement;
    expect(amount).toHaveTextContent("API 단가 환산 · 실제 청구액 아님");
    await waitFor(() => expect(amount).toHaveTextContent("구독 요금제에서는 청구되지 않는 금액입니다"));
    unmount();

    stubApi({ limits: () => jsonResponse(buildLimits({ plan: { value: null, receivedAt: null } })) });
    const second = renderScreen();
    await waitForTiles();
    await screen.findByText("알 수 없음");
    const amount2 = second.container.querySelector('[data-wf="10-5"]') as HTMLElement;
    expect(amount2).toHaveTextContent("API 단가 환산 · 실제 청구액 아님");
    expect(amount2).not.toHaveTextContent("구독 요금제에서는 청구되지 않는 금액입니다");
  });

  it("[FR-026-AC6] 단가 없는 모델이 있으면 금액 칸 점선 칩 `단가 없는 모델 N개 제외`, 없으면 칩 없음", async () => {
    stubApi();
    const { container, unmount } = renderScreen();
    await waitForTiles();
    expect(container.querySelector('[data-wf="10-5"]')).toHaveTextContent("단가 없는 모델 1개 제외");
    unmount();

    stubApi({ cost: () => jsonResponse(buildCostReport({ estimate: { usd: 1.2345, excludedModelCount: 0 } })) });
    const second = renderScreen();
    await waitForTiles();
    expect(second.container.querySelector('[data-wf="10-5"]')).not.toHaveTextContent("단가 없는 모델");
  });
});

describe("CostScreen 대화 기록 띠", () => {
  it("[FR-025-AC6] 띠: `읽은 파일 N / 전체` + 진행 막대 + `새 기록은 10초 안에 반영`, `usage-changed` 메시지의 transcripts는 GET 없이 바로 반영", async () => {
    const { costUrls } = stubApi();
    renderScreen();
    await waitForTiles();

    const strip = screen.getByRole("status", { name: "대화 기록 읽기 상태" });
    expect(strip).toHaveAttribute("data-wf", "10-3");
    expect(strip).toHaveTextContent("대화 기록");
    expect(strip).toHaveTextContent("~/.claude/projects/");
    expect(strip).toHaveTextContent("읽은 파일 1,280 / 1,280");
    expect(strip).toHaveTextContent("새 기록은 10초 안에 반영");
    const bar = within(strip).getByRole("progressbar", { name: "읽은 파일" });
    expect(bar).toHaveAttribute("aria-valuenow", "1280");
    expect(bar).toHaveAttribute("aria-valuemax", "1280");

    const before = costUrls.length;
    act(() =>
      usageSignalStore.signal(["cost"], { connected: true, state: "reading", readFiles: 412, totalFiles: 1280, skippedFiles: 3 }),
    );
    // 신호 직후(재조회 대기 전)에 이미 띠가 진행값을 보인다.
    expect(strip).toHaveTextContent("읽은 파일 412 / 1,280");
    expect(within(strip).getByRole("progressbar", { name: "읽은 파일" })).toHaveAttribute("aria-valuenow", "412");
    expect(costUrls.length).toBe(before);
  });

  it("[FR-025-E2] `건너뛴 파일 N개`: 0이면 글자 없음, 있으면 `file-warning` 옆에 표시", async () => {
    stubApi();
    const { container, unmount } = renderScreen();
    await waitForTiles();
    const strip = container.querySelector('[data-wf="10-3"]') as HTMLElement;
    expect(strip).toHaveTextContent("건너뛴 파일 3개");
    expect(strip.querySelector("svg.lucide-file-warning")).not.toBeNull();
    unmount();

    stubApi({
      cost: () => jsonResponse(buildCostReport({ transcripts: { connected: true, state: "ready", readFiles: 5, totalFiles: 5, skippedFiles: 0 } })),
    });
    const second = renderScreen();
    await waitForTiles();
    expect(second.container.querySelector('[data-wf="10-3"]')).not.toHaveTextContent("건너뛴");
  });

  it("[FR-025-E2] 기간 안 기록이 0이면 합계·차트·표 자리에 점선 카드 `기간 안 사용 기록이 없습니다`, 띠·한도 카드는 그대로", async () => {
    stubApi({
      cost: () =>
        jsonResponse(
          buildCostReport({
            totals: sums(0, 0, 0, 0),
            estimate: { usd: 0, excludedModelCount: 0 },
            byDate: [{ date: "2026-10-15", tokens: sums(0, 0, 0, 0), usd: 0 }],
            byModel: [],
            bySession: [],
            byAgent: [],
          }),
        ),
    });
    const { container } = renderScreen();
    const card = await screen.findByText("기간 안 사용 기록이 없습니다");
    expect(card.closest("section")).toHaveAttribute("data-kind", "empty");
    expect(screen.queryByText("입력 토큰")).toBeNull();
    expect(screen.queryByRole("tab", { name: "모델별" })).toBeNull();
    expect(container.querySelector('[data-wf="10-3"]')).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "구독 · 사용 한도" })).toBeInTheDocument();
  });

  it("[FR-025-E1] 연결 안 됨: 띠 `대화 기록 · 연결 안 됨`·안내·`설정 열기`, 토큰 칸·금액 `-`, 안내 카드, 나눔 탭 없음, 금액 문구는 그대로", async () => {
    stubApi({ cost: () => jsonResponse(buildCostReport({ transcripts: NOT_CONNECTED_TRANSCRIPTS })) });
    const { container } = renderScreen();
    const strip = await screen.findByRole("alert", { name: "대화 기록 읽기 상태" });
    await waitFor(() => expect(strip).toHaveTextContent("대화 기록 · 연결 안 됨"));
    expect(strip).toHaveTextContent("~/.claude/projects/");
    expect(strip).toHaveTextContent("이 폴더가 컨테이너에 연결되지 않아 토큰 사용량을 읽을 수 없습니다");
    expect(strip).not.toHaveTextContent("읽은 파일");

    for (const label of ["입력 토큰", "출력 토큰", "캐시 생성 토큰", "캐시 읽기 토큰"]) {
      expect(tileOf(label)).toHaveTextContent(new RegExp(`^${label}-$`));
    }
    const amount = container.querySelector('[data-wf="10-5"]') as HTMLElement;
    expect(amount).toHaveTextContent("-");
    expect(amount).not.toHaveTextContent("$");
    expect(amount).toHaveTextContent("API 단가 환산 · 실제 청구액 아님");

    const notice = container.querySelector('[data-wf="10-7"]') as HTMLElement;
    expect(notice).toHaveTextContent("대화 기록이 연결되지 않았습니다");
    expect(notice).toHaveTextContent(
      "설정의 전역 Claude 설정 연결에서 ~/.claude/projects/를 연결하면 날짜·모델·세션·에이전트별 토큰 사용량이 보입니다.",
    );
    expect(screen.queryByRole("tab", { name: "모델별" })).toBeNull();
    // 한도 카드는 그대로
    expect(await screen.findByText("5시간 한도")).toBeInTheDocument();

    fireEvent.click(within(strip).getByRole("button", { name: "설정 열기" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/settings");
  });

  it("[FR-025-E1] 안내 카드의 `설정 열기`도 `/settings`로 이동한다", async () => {
    stubApi({ cost: () => jsonResponse(buildCostReport({ transcripts: NOT_CONNECTED_TRANSCRIPTS })) });
    const { container } = renderScreen();
    await screen.findByText("대화 기록이 연결되지 않았습니다");
    fireEvent.click(within(container.querySelector('[data-wf="10-7"]') as HTMLElement).getByRole("button", { name: "설정 열기" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/settings");
  });
});

describe("CostScreen 날짜별 차트", () => {
  it("[FR-025-AC4] 막대마다 tabIndex=0·`MM-DD (요일) 합계 N.NM 토큰, 추정 $N.NN`, 막대 위 `$N.NN`·x축 `MM-DD`, y축 눈금", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const chart = container.querySelector('[data-wf="10-7"]') as HTMLElement;
    expect(chart).toHaveAttribute("aria-label", "날짜별 토큰 사용량");
    expect(chart).toHaveTextContent("날짜별");
    expect(chart).toHaveTextContent("토큰 합 · 막대 위 추정 금액");
    expect(chart).toHaveTextContent("입력·출력·캐시 생성");

    const bars = Array.from(chart.querySelectorAll('[tabindex="0"]'));
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual([
      "10-13 (화) 합계 0.1M 토큰, 추정 $0.40",
      "10-14 (수) 합계 0.0M 토큰, 추정 $0.83",
      "10-15 (목) 합계 0.0M 토큰, 추정 $0.00",
    ]);
    expect(chart.querySelectorAll(".chart-amount")).toHaveLength(3);
    expect(Array.from(chart.querySelectorAll(".chart-amount")).map((amount) => amount.textContent)).toEqual(["$0.40", "$0.83", "$0.00"]);
    expect(within(chart).getAllByText("10-14").length).toBeGreaterThan(0);
    expect(within(chart).getByText("0.04M")).toBeInTheDocument();
  });

  it("[FR-025-AC4] 막대에 hover·focus하면 툴팁(`role=tooltip`) `MM-DD (요일) · N.NM 토큰 · $N.NN` / `입력 N · 출력 N` / `캐시 생성 N · 캐시 읽기 N`, 벗어나면 사라진다", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const chart = container.querySelector('[data-wf="10-7"]') as HTMLElement;
    expect(screen.queryByRole("tooltip")).toBeNull();

    const bar = chart.querySelector('[aria-label^="10-14 ("]') as HTMLElement;
    fireEvent.focus(bar);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("10-14 (수) · 0.0M 토큰 · $0.83");
    expect(tip).toHaveTextContent("입력 900 · 출력 450");
    expect(tip).toHaveTextContent("캐시 생성 200 · 캐시 읽기 0");
    expect(bar).toHaveAttribute("aria-describedby", tip.id);
    expect(bar).toHaveClass("bg-soft");
    fireEvent.blur(bar);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(chart.querySelector('[aria-label^="10-13 ("]') as HTMLElement);
    expect(screen.getByRole("tooltip")).toHaveTextContent("입력 100 · 출력 50");
    fireEvent.mouseLeave(chart.querySelector('[aria-label^="10-13 ("]') as HTMLElement);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("[FR-025-AC4] 같은 값의 화면 읽기용 표가 있다(시각적으로 숨김, 날짜·합·토큰 4가지·금액)", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const table = (container.querySelector('[data-wf="10-7"]') as HTMLElement).querySelector("table") as HTMLElement;
    expect(table).toHaveClass("sr-only");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "날짜",
      "토큰 합 (M)",
      "입력",
      "출력",
      "캐시 생성",
      "캐시 읽기",
      "추정 금액",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("10-14 (수)0.0M9004502000$0.83");
  });
});

describe("CostScreen 나눔", () => {
  it("[FR-025-AC4][FR-026-AC6] 모델별(기본): 머리 7칸, 서버 순서, 단가 없는 모델은 `단가 없음` 칩 줄(10-9), 합계 줄 = totals·estimate + `단가 없는 모델 N개 제외`", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const card = container.querySelector('[data-wf="10-10"]') as HTMLElement;
    expect(card).toHaveAttribute("aria-label", "나눔");
    expect(within(card).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["모델별", "세션별", "에이전트별"]);
    expect(within(card).getByRole("tab", { name: "모델별" })).toHaveAttribute("aria-selected", "true");

    const panel = within(card).getByRole("tabpanel");
    expect(within(panel).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "모델",
      "입력",
      "출력",
      "캐시 생성",
      "캐시 읽기",
      "토큰 합",
      "추정 금액",
    ]);
    const rows = rowsOf(panel);
    expect(rows).toEqual([
      ["claude-opus-4-6", "700", "300", "200", "90,000", "91,200", "$1.23"],
      ["claude-haiku-4-5", "300", "200", "0", "8,300", "8,800", "$0.00"],
      ["claude-opus-5-5", "0", "0", "0", "0", "0", "단가 없음"],
      ["합계", "1,000", "500", "200", "98,300", "100,000", "$1.23단가 없는 모델 1개 제외"],
    ]);
    const noPrice = panel.querySelector('[data-wf="10-9"]') as HTMLElement;
    expect(noPrice).toHaveTextContent("claude-opus-5-5");
    expect(within(noPrice).getByText("단가 없음")).toBeInTheDocument();
    // 숫자 열은 오른쪽 정렬
    expect(within(panel).getByRole("columnheader", { name: "토큰 합" })).toHaveClass("text-right");
  });

  it("[FR-025-AC3] 세션별: 세션 id 앞 8자·프로젝트 폴더(말줄임 + title)·시작 시각 `MM-DD hh:mm`·진입 방식(CLI/데스크톱 앱/원래 값/-)·토큰 합·금액, 서버 순서(토큰 합 내림차순)", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const card = container.querySelector('[data-wf="10-10"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("tab", { name: "세션별" }));
    expect(within(card).getByRole("tab", { name: "세션별" })).toHaveAttribute("aria-selected", "true");

    const panel = within(card).getByRole("tabpanel");
    expect(within(panel).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "세션",
      "프로젝트 폴더",
      "시작 시각",
      "진입 방식",
      "토큰 합",
      "추정 금액",
    ]);
    expect(rowsOf(panel)).toEqual([
      ["e5f6a7b8", "/home/fixture/work/aoji-fixture-app", "10-14 09:05", "CLI", "1,550", "$0.83"],
      ["a1b2c3d4", "-", "-", "데스크톱 앱", "98,450", "$0.40"],
      ["c0ffee00", "/home/fixture/work/other", "10-13 23:30", "sdk-ts", "0", "$0.00"],
      ["합계", "", "", "", "100,000", "$1.23단가 없는 모델 1개 제외"],
    ]);
    expect(within(panel).getByText("/home/fixture/work/aoji-fixture-app")).toHaveAttribute("title", "/home/fixture/work/aoji-fixture-app");
    expect(panel).not.toHaveTextContent("e5f6a7b8-0000");
  });

  it("[FR-025-AC2] 에이전트별: 에이전트 name·`기본 세션`·`미확인` 포함, 4가지 토큰·토큰 합·금액, 합계 줄", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const card = container.querySelector('[data-wf="10-10"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("tab", { name: "에이전트별" }));

    const panel = within(card).getByRole("tabpanel");
    expect(within(panel).getAllByRole("columnheader")[0]).toHaveTextContent("에이전트");
    expect(rowsOf(panel)).toEqual([
      ["기본 세션", "800", "400", "200", "90,000", "91,400", "$1.00"],
      ["web-reviewer", "200", "100", "0", "8,300", "8,600", "$0.23"],
      ["미확인", "0", "0", "0", "0", "0", "$0.00"],
      ["합계", "1,000", "500", "200", "98,300", "100,000", "$1.23단가 없는 모델 1개 제외"],
    ]);
  });

  it("[FR-025-AC4] 나눔 합계 줄의 토큰 합 = 토큰 4칸의 합, 금액은 `$` 둘째 자리", async () => {
    stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    const panel = within(container.querySelector('[data-wf="10-10"]') as HTMLElement).getByRole("tabpanel");
    const total = rowsOf(panel).find((cells) => cells[0] === "합계");
    expect(total).toBeDefined();
    const [, input, output, cacheCreation, cacheRead, sum] = total as string[];
    const n = (text: string | undefined) => Number((text ?? "").replace(/,/g, ""));
    expect(n(input) + n(output) + n(cacheCreation) + n(cacheRead)).toBe(n(sum));
  });
});

describe("CostScreen 구독·한도 카드", () => {
  function limitsCard(): HTMLElement {
    return screen.getByRole("region", { name: "구독 · 사용 한도" });
  }

  it("[FR-027-AC4] 플랜 값 + `상태줄 · N분 전 hh:mm:ss`, 5시간·주간 `N%`·`초기화 <시각>`·`role=meter` 이름 `… 사용률 N%`·행마다 출처(상태줄/한도 캐시)", async () => {
    vi.setSystemTime(new Date("2026-10-15T14:31:05+09:00"));
    stubApi({
      limits: () =>
        jsonResponse(
          buildLimits({
            fiveHour: okLimit(42, "2026-10-15T16:00:00+09:00", "statusline", "2026-10-15T14:28:05+09:00"),
            sevenDay: okLimit(63, "2026-10-19T09:00:00+09:00", "cache", "2026-10-15T14:30:12+09:00"),
          }),
        ),
    });
    renderScreen();
    await screen.findByText("5시간 한도");
    const card = limitsCard();
    const text = card.textContent ?? "";
    expect(text.indexOf("구독 플랜")).toBeLessThan(text.indexOf("5시간 한도"));
    expect(text.indexOf("5시간 한도")).toBeLessThan(text.indexOf("주간 한도"));
    expect(text.indexOf("주간 한도")).toBeLessThan(text.indexOf("Claude Code CLI"));
    expect(card).toHaveTextContent("max");
    expect(card).toHaveTextContent("42%");
    expect(card).toHaveTextContent("63%");
    expect(card).toHaveTextContent("상태줄 · 3분 전 14:28:05");
    expect(card).toHaveTextContent("한도 캐시 · 0분 전 14:30:12");
    expect(card).toHaveTextContent("초기화 16:00");
    expect(card).toHaveTextContent("초기화 10-19 (월) 09:00");
    expect(within(card).getByRole("meter", { name: "5시간 한도 사용률 42%" })).toHaveAttribute("aria-valuenow", "42");
    expect(within(card).getByRole("meter", { name: "주간 한도 사용률 63%" })).toHaveAttribute("aria-valuenow", "63");
  });

  it("[FR-027-AC5] 초기화 시각이 지났으면 `초기화됨 · 새 값 대기`(막대 비움, meter 없음)", async () => {
    vi.setSystemTime(new Date("2026-10-15T14:31:05+09:00"));
    stubApi({
      limits: () =>
        jsonResponse(
          buildLimits({
            fiveHour: okLimit(90, "2026-10-15T14:00:00+09:00", "statusline", "2026-10-15T13:00:00+09:00"),
          }),
        ),
    });
    renderScreen();
    await screen.findByText("초기화됨 · 새 값 대기");
    const card = limitsCard();
    expect(within(card).queryByRole("meter", { name: /5시간/ })).toBeNull();
    expect(within(card).getByRole("meter", { name: "주간 한도 사용률 63%" })).toBeInTheDocument();
    expect(card).not.toHaveTextContent("90%");
  });

  it("[FR-027-E2] 항목이 `missing`이면 그 항목만 `값 없음`(muted, 막대 비움), 플랜 null은 `알 수 없음`", async () => {
    stubApi({ limits: () => jsonResponse(buildLimits({ plan: { value: null, receivedAt: null }, fiveHour: MISSING_LIMIT })) });
    renderScreen();
    await screen.findByText("값 없음");
    const card = limitsCard();
    expect(screen.getByText("값 없음")).toHaveClass("text-text-muted");
    expect(card).toHaveTextContent("알 수 없음");
    expect(within(card).queryByRole("meter", { name: /5시간/ })).toBeNull();
    expect(within(card).getByRole("meter", { name: "주간 한도 사용률 63%" })).toBeInTheDocument();
  });

  it("[FR-027-E1] 전부 `never` → 점선 상자 `받은 적 없음` + 상태줄 연동 안내 + `설정 열기`(→ /settings), meter 없음", async () => {
    stubApi({ limits: () => jsonResponse(NEVER_LIMITS) });
    renderScreen();
    await screen.findByText("받은 적 없음");
    const card = limitsCard();
    expect(card).toHaveTextContent("설정의 상태줄 연동 예시를 Claude Code 설정에 넣으면 구독 플랜과 한도 값이 들어옵니다");
    expect(within(card).queryByRole("meter")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "설정 열기" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/settings");
  });

  it("[FR-027-AC6] 상태줄 안내(`info`)는 값 상태와 상관없이 항상 있다", async () => {
    stubApi({ limits: () => jsonResponse(NEVER_LIMITS) });
    const { container, unmount } = renderScreen();
    await screen.findByText("받은 적 없음");
    const note = container.querySelector('[data-wf="10-8"]') as HTMLElement;
    expect(note).toHaveTextContent(
      "Claude Code CLI 세션이 돌 때만 상태줄 값이 갱신되고, 데스크톱 앱 세션에서는 상태줄이 돌지 않을 수 있습니다",
    );
    expect(note.querySelector("svg.lucide-info")).not.toBeNull();
    unmount();

    stubApi();
    const second = renderScreen();
    await screen.findByText("5시간 한도");
    expect(second.container.querySelector('[data-wf="10-8"]')).toBeInTheDocument();
  });

  it("[FR-027-AC4] 한도 조회 실패 → 카드 자리 Alert + `다시 시도`로 다시 조회, 상태줄 안내는 그대로", async () => {
    let calls = 0;
    stubApi({
      limits: () => {
        calls += 1;
        return calls === 1 ? jsonResponse({ code: "IO_FAILED", message: "한도를 읽지 못했습니다" }, 500) : jsonResponse(buildLimits());
      },
    });
    const { container } = renderScreen();
    expect(await within(await screen.findByRole("region", { name: "구독 · 사용 한도" })).findByRole("alert")).toHaveTextContent(
      "한도를 읽지 못했습니다",
    );
    expect(container.querySelector('[data-wf="10-8"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("5시간 한도");
  });

  it("[FR-027-AC8] `usage-changed` limits 신호 → `/api/limits`를 다시 조회하고(1초 묶음), cost 조회는 늘지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { costUrls, limitsCalls } = stubApi();
    renderScreen();
    await waitFor(() => expect(limitsCalls()).toBe(1));
    await waitFor(() => expect(costUrls).toHaveLength(1));

    act(() => usageSignalStore.signal(["limits"], null));
    act(() => usageSignalStore.signal(["limits"], null));
    expect(limitsCalls()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_INTERVAL_MS + 50);
    });
    expect(limitsCalls()).toBe(2);
    expect(costUrls).toHaveLength(1);
  });
});

describe("CostScreen 조회·단가 버튼", () => {
  it("[FR-025-AC6] `usage-changed` cost 신호 → `/api/cost` 다시 조회: 1초에 1회 이하·마지막 신호 뒤 1회 (ADR-94)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { costUrls, limitsCalls } = stubApi();
    renderScreen();
    await waitFor(() => expect(costUrls).toHaveLength(1));

    act(() => usageSignalStore.signal(["cost"], null));
    act(() => usageSignalStore.signal(["cost"], null));
    act(() => usageSignalStore.signal(["cost"], null));
    expect(costUrls).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_INTERVAL_MS + 50);
    });
    expect(costUrls).toHaveLength(2);

    act(() => usageSignalStore.signal(["skills"], null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_INTERVAL_MS * 2);
    });
    expect(costUrls).toHaveLength(2);
    expect(limitsCalls()).toBe(1);
  });

  it("[FR-025-AC7] 기간 7일(기본)·30일·전체: 기간을 바꾸면 그 기간·브라우저 시간대로 다시 조회하고 날짜 범위를 보인다", async () => {
    const { costUrls } = stubApi();
    const { container } = renderScreen();
    await waitForTiles();
    expect(costUrls[0]).toMatch(/^\/api\/cost\?period=7d&tz=/);
    expect(screen.getByRole("button", { name: "7일" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('[data-testid="period-range"]')).toHaveTextContent("10-13 ~ 10-15");

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    await waitFor(() => expect(costUrls.some((url) => url.startsWith("/api/cost?period=all&tz="))).toBe(true));
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
  });

  it("[FR-026-AC3] `단가` 버튼: `GET /api/pricing` 응답 전에는 비활성, 응답 뒤 활성이고 누르면 `?dialog=price`", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubApi({ pricing: async () => (await gate, jsonResponse(PRICES)) });
    renderScreen();
    const button = screen.getByRole("button", { name: "단가" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.getByTestId("location")).toHaveTextContent("/cost");

    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: "단가" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "단가" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/cost?dialog=price");
  });

  it("[FR-025-AC1] 조회 실패 → 합계·차트·표 자리 Alert + `다시 시도`로 다시 조회, 제목 줄·한도 카드는 그대로", async () => {
    let calls = 0;
    stubApi({
      cost: () => {
        calls += 1;
        return calls === 1 ? jsonResponse({ code: "IO_FAILED", message: "비용을 읽지 못했습니다" }, 500) : jsonResponse(buildCostReport());
      },
    });
    renderScreen();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("비용을 읽지 못했습니다"))).toBe(true);
    expect(screen.getByText("Claude Code 대화 기록의 토큰 수로 계산합니다 · 대화 내용은 읽지 않습니다")).toBeInTheDocument();
    expect(await screen.findByText("5시간 한도")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitForTiles();
    expect(screen.queryByText("비용을 읽지 못했습니다")).toBeNull();
  });

  it("[FR-025-AC1] 로딩: 응답 전에는 토큰 값·금액·나눔 행이 스켈레톤이다", async () => {
    stubApi({ cost: () => new Promise<Response>(() => undefined) });
    const { container } = renderScreen();
    expect(tileOf("입력 토큰").querySelector("[data-skeleton]")).not.toBeNull();
    expect(container.querySelector('[data-wf="10-5"] [data-skeleton]')).not.toBeNull();
    expect(screen.getAllByTestId("cost-split-skeleton-row")).toHaveLength(4);
    expect(container.querySelector('[data-wf="10-7"]')).toHaveAttribute("aria-busy", "true");
  });
});
