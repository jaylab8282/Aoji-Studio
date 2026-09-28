import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventsTable } from "./EventsTable";
import { EVENTS_CARD_TITLE, recentEventsSubtitle } from "../../lib/text";
import type { EventRow, Live } from "../../api/types";

/**
 * 브라우저 기본 포커스 표시를 지우는 클래스(ADR-46 A 금지 대상).
 * 문자열을 조립해 Tailwind가 이 테스트 문구에서 죽은 유틸리티를 만들지 않게 한다.
 */
const OUTLINE_RESET_CLASSES = [
  `outline-${"none"}`,
  `focus:outline-${"none"}`,
  `focus-visible:outline-${"none"}`,
];

// ui-spec.md SCR-01 "실시간 이벤트 표 영역"(ADR-46 C): 표는 `h-96` 고정 높이 자체 스크롤 컨테이너 안에
// 있고 머리 행은 sticky다. 50개는 전부 DOM에 남는다(FR-005-AC6 — 페이지네이션·가상 스크롤·행 수 축소 없음).

/** 서버가 이미 마스킹해 보낸 행(FR-005-AC8). 행마다 요약을 다르게 해 마지막 행까지 찾을 수 있게 한다. */
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

function buildLive(): Live {
  return {
    lastReceivedAt: "2026-09-22T10:20:30+09:00",
    everReceived: true,
    agents: {},
    lobby: [],
    undefinedSubagents: [],
  };
}

describe("EventsTable", () => {
  it("[ADR-46 C] 표 컨테이너에 h-96·overflow-y-auto·tabIndex=0·role=region·aria-labelledby(카드 제목 id), thead에 sticky", () => {
    render(<EventsTable live={buildLive()} recentEvents={[buildEvent(1)]} />);

    const region = screen.getByRole("region");
    const classes = region.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("h-96");
    expect(classes).toContain("overflow-y-auto");
    // 새 높이 토큰도 임의 픽셀 값도 쓰지 않는다(Tailwind 기본 스케일 `h-96`만).
    expect(classes.filter((cls) => cls.includes("["))).toEqual([]);
    // 키보드로도 스크롤된다. 포커스 표시는 브라우저 기본값을 그대로 쓴다.
    expect(region).toHaveAttribute("tabindex", "0");
    expect(classes.filter((cls) => OUTLINE_RESET_CLASSES.includes(cls))).toEqual([]);

    // 이름은 새 문구를 만들지 않고 기존 카드 제목(`실시간 이벤트`)을 가리킨다.
    const heading = screen.getByRole("heading", { name: EVENTS_CARD_TITLE });
    expect(heading.id).not.toBe("");
    expect(region).toHaveAttribute("aria-labelledby", heading.id);
    expect(region).toHaveAccessibleName(EVENTS_CARD_TITLE);
    expect(region).not.toHaveAttribute("aria-label");

    // 표는 그 컨테이너 안에 있고, 머리 행은 스크롤 중에도 보이게 sticky + 카드 배경이다.
    const table = screen.getByRole("table");
    expect(region).toContainElement(table);
    const thead = table.querySelector("thead");
    const theadClasses = (thead?.className ?? "").split(/\s+/).filter(Boolean);
    expect(theadClasses).toContain("sticky");
    expect(theadClasses).toContain("top-0");
    expect(theadClasses).toContain("bg-card");
    // 표 행에는 hover 표현이 없다(행 클릭 없음).
    const bodyRow = table.querySelectorAll("tbody tr")[0];
    expect((bodyRow?.className ?? "").split(/\s+/).filter((cls) => cls.startsWith("hover:"))).toEqual([]);
  });

  it("[ADR-46 C][FR-005-AC6] 이벤트 50개 fixture → 행 50개가 모두 렌더되고 최근 50개 · 전체 로그 화면 없음 문구 유지, 페이지네이션 요소 0개", () => {
    const events = Array.from({ length: 50 }, (_, index) => buildEvent(index + 1));

    render(<EventsTable live={buildLive()} recentEvents={events} />);

    // N은 변하지 않는다(= recentEvents.length).
    expect(screen.getByText(recentEventsSubtitle(50))).toBeInTheDocument();
    // 머리 행 1 + 본문 50행이 모두 DOM에 있다(스크롤로 접근한다).
    expect(screen.getAllByRole("row")).toHaveLength(51);
    expect(screen.getAllByRole("cell")).toHaveLength(50 * 5);
    // 스크롤로 가려지는 마지막 행도 레이아웃 상자를 갖는다.
    expect(screen.getByText("export TOKEN=•••••••• #50")).toBeVisible();
    // 페이지네이션·전체 로그 이동 요소를 만들지 않는다.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
