import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventsTable } from "./EventsTable";
import { connectionStore } from "../../state/connectionStore";
import { EVENTS_CARD_SUBTITLE, EVENTS_CARD_TITLE } from "../../lib/text";
import type { EventRow } from "../../api/types";

/**
 * 브라우저 기본 포커스 표시를 지우는 클래스(금지 대상).
 * 문자열을 조립해 Tailwind가 이 테스트 문구에서 죽은 유틸리티를 만들지 않게 한다.
 */
const OUTLINE_RESET_CLASSES = [
  `outline-${"none"}`,
  `focus:outline-${"none"}`,
  `focus-visible:outline-${"none"}`,
];

// ui-spec.md SCR-01 "실시간 이벤트 카드"(ADR-66): 카드가 남은 높이를 채우고 표 안에서만 세로 스크롤하며 머리 행은 sticky다.
// 50개는 전부 DOM에 남는다(FR-005-AC6 — 페이지네이션·가상 스크롤·행 수 축소 없음).

function buildEvent(id: number): EventRow {
  return {
    id,
    at: "2026-09-22T10:20:30+09:00",
    hookEventName: "PreToolUse",
    kind: "tool",
    title: "도구 실행 · Bash",
    summary: `export TOKEN=•••••••• #${id}`,
    sessionId: "session-1",
    agentId: `agent-${id}`,
    agentType: "dev-lead",
    agentLabel: "dev-lead",
    toolName: "Bash",
    workflow: "dev-team",
  };
}


describe("EventsTable", () => {
  afterEach(() => {
    connectionStore.reset();
  });

  it("[FR-005-AC6][ADR-66] 카드 min-h 220·남은 높이 flex-1, 표 영역 overflow-auto·tabIndex=0·role=region·aria-labelledby(카드 제목 id), 머리 칸 sticky", () => {
    const { container } = render(<EventsTable recentEvents={[buildEvent(1)]} />);

    const card = container.querySelector('[data-wf="01-6"]')!;
    expect(card).toHaveClass("min-h-events-min", "flex-1", "flex-col");

    const region = screen.getByRole("region", { name: EVENTS_CARD_TITLE });
    const classes = region.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("overflow-auto");
    expect(classes).toContain("min-h-0");
    expect(classes.filter((cls) => cls.includes("h-96"))).toEqual([]);
    expect(region).toHaveAttribute("tabindex", "0");
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);
    const heading = screen.getByRole("heading", { name: EVENTS_CARD_TITLE });
    expect(heading.id).not.toBe("");
    expect(region).toHaveAttribute("aria-labelledby", heading.id);
    expect(region).not.toHaveAttribute("aria-label");

    const table = screen.getByRole("table");
    expect(region).toContainElement(table);
    for (const th of screen.getAllByRole("columnheader")) {
      expect(th).toHaveClass("sticky", "top-0", "bg-card");
    }
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["시각", "워크플로우", "에이전트", "이벤트", "요약"]);
    const cols = [...table.querySelectorAll("col")].map((col) => col.className);
    expect(cols).toEqual(["w-col-time", "w-col-workflow", "w-col-agent", "w-col-event", ""]);
    // 표 행에는 hover 표현이 없다(행 클릭 없음).
    const bodyRow = table.querySelectorAll("tbody tr")[0];
    expect((bodyRow?.className ?? "").split(/\s+/).filter((cls) => cls.startsWith("hover:"))).toEqual([]);
  });

  it("[FR-005-AC6] 이벤트 50개 → 행 50개 전부 DOM, 부제 `최근 50개 · 최신순`, 페이지네이션·링크·버튼 0개", () => {
    const events = Array.from({ length: 50 }, (_, index) => buildEvent(index + 1));

    render(<EventsTable recentEvents={events} />);

    expect(EVENTS_CARD_SUBTITLE).toBe("최근 50개 · 최신순");
    expect(screen.getByText("최근 50개 · 최신순")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(51);
    expect(screen.getAllByRole("cell")).toHaveLength(50 * 5);
    expect(screen.getByText("export TOKEN=•••••••• #50")).toBeVisible();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/전체 로그 화면 없음/)).not.toBeInTheDocument();
  });

  it("[FR-005-AC6] 행은 입력 순서(최신순) 그대로이고 시각은 hh:mm:ss", () => {
    const first = buildEvent(2);
    const second = { ...buildEvent(1), at: "2026-09-22T10:20:29+09:00" };

    render(<EventsTable recentEvents={[first, second]} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[4]?.textContent)).toEqual([
      "export TOKEN=•••••••• #2",
      "export TOKEN=•••••••• #1",
    ]);
    expect(within(rows[0]!).getAllByRole("cell")[0]?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("[FR-005-AC7] 워크플로우 밖 행(workflow null)은 워크플로우 열이 `-`, 있으면 이름", () => {
    render(<EventsTable recentEvents={[{ ...buildEvent(1), workflow: null }, buildEvent(2)]} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getAllByRole("cell")[1]).toHaveTextContent(/^-$/);
    expect(within(rows[1]!).getAllByRole("cell")[1]).toHaveTextContent(/^dev-team$/);
  });

  it("[FR-005-AC8] 요약·에이전트는 고정폭 말줄임(truncate) + title 같은 문자열, 마스킹된 `••••••••` 유지, 원문 없음", () => {
    const masked = "export TOKEN=••••••••";
    render(<EventsTable recentEvents={[{ ...buildEvent(1), summary: masked }]} />);

    const summary = screen.getByText(masked);
    expect(summary).toHaveAttribute("title", masked);
    expect(summary).toHaveClass("truncate", "font-mono");
    const agent = screen.getByText("dev-lead");
    expect(agent).toHaveAttribute("title", "dev-lead");
    expect(agent).toHaveClass("truncate", "font-mono");
    expect(document.body.innerHTML).not.toContain("sk-live");
  });

  it("[FR-005-AC8] 각주 `token·key·password 같은 민감 값은 ••••••••로 가립니다`", () => {
    render(<EventsTable recentEvents={[buildEvent(1)]} />);

    expect(screen.getByText("token·key·password 같은 민감 값은 ••••••••로 가립니다")).toBeInTheDocument();
  });

  it("[FR-005-AC6] kind permission 행의 `이벤트` 칸만 text-waiting 600, 그 밖 kind는 아니다", () => {
    const permission: EventRow = { ...buildEvent(1), kind: "permission", title: "권한 요청 · Bash" };
    const denied: EventRow = { ...buildEvent(2), kind: "permission-denied", title: "권한 거부 · Bash" };
    const tool = buildEvent(3);

    render(<EventsTable recentEvents={[permission, denied, tool]} />);

    expect(screen.getByText("권한 요청 · Bash")).toHaveClass("text-waiting", "font-semibold");
    expect(screen.getByText("권한 거부 · Bash")).not.toHaveClass("text-waiting");
    expect(screen.getByText("도구 실행 · Bash")).not.toHaveClass("text-waiting");
    expect(document.querySelectorAll("td.text-waiting")).toHaveLength(1);
  });

  it("[FR-005-AC6] 연결 표시: connected → 시안 `실시간 연결됨`, 끊김 → 빨강 `연결 끊김`", () => {
    connectionStore.setConnected();
    render(<EventsTable recentEvents={[buildEvent(1)]} />);

    expect(screen.getByTestId("connection-indicator")).toHaveTextContent("실시간 연결됨");
    expect(screen.getByTestId("connection-indicator")).toHaveClass("text-live");

    act(() => connectionStore.setDisconnected(3));

    expect(screen.getByTestId("connection-indicator")).toHaveTextContent("연결 끊김");
    expect(screen.getByTestId("connection-indicator")).toHaveClass("text-danger");
    expect(screen.queryByText("실시간 연결됨")).not.toBeInTheDocument();
  });
});
