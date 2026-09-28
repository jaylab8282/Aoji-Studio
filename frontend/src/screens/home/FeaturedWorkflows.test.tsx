import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FeaturedWorkflows } from "./FeaturedWorkflows";
import { workflowCardBorder } from "../../lib/derive/workflowCardBorder";
import { recentActivityLabel } from "../../lib/text";
import type { AgentLive, EventRow, Live, Registry, Status, Workflow } from "../../api/types";

function buildWorkflow(name: string, lead: string, members: string[]): Workflow {
  return {
    name,
    description: `${name} 설명`,
    filePath: `.jaystudio/teams/${name}.json`,
    lead,
    members,
    brokenRefs: [],
    rawMemberCount: members.length + 1,
  };
}

function buildRegistry(workflows: Workflow[]): Registry {
  return {
    revision: 1,
    scannedAt: "2026-09-22T10:00:00+09:00",
    agentsDirMissing: false,
    writable: true,
    agentCount: workflows.length,
    skillCount: 4,
    agents: [],
    workflows,
    formatErrors: [],
    hookConfigured: true,
  };
}

function buildAgentLive(name: string, status: Status): AgentLive {
  return {
    name,
    status,
    currentTool: null,
    sessionStartedAt: null,
    childCount: 0,
    cwd: null,
    parentLabel: null,
    lastEventAt: null,
    lastEvent: null,
  };
}

/** 서버가 이미 마스킹해 보낸 이벤트(FR-015-AC1은 서버 책임). 프론트는 이 문자열만 갖는다. */
function buildEvent(title: string, summary: string): EventRow {
  return {
    id: 1,
    at: "2026-09-22T10:20:30+09:00",
    hookEventName: "PreToolUse",
    kind: "tool",
    title,
    summary,
    sessionId: "session-1",
    agentId: "agent-1",
    agentType: "dev-lead",
    agentLabel: "dev-lead",
    toolName: "Bash",
    workflow: "워크플로우A",
  };
}

function withLastEvent(agent: AgentLive, event: EventRow): AgentLive {
  return { ...agent, lastEventAt: event.at, lastEvent: event };
}

function buildLive(agents: Record<string, AgentLive>): Live {
  return { lastReceivedAt: null, everReceived: true, agents, lobby: [], undefinedSubagents: [] };
}

function renderFeatured(live: Live) {
  const registry = buildRegistry([buildWorkflow("워크플로우A", "dev-lead", ["dev-02"])]);
  return render(
    <MemoryRouter>
      <FeaturedWorkflows registry={registry} live={live} />
    </MemoryRouter>,
  );
}

describe("FeaturedWorkflows", () => {
  it("[FR-006-AC5] 대표 카드 테두리도 02와 같은 `workflowCardBorder`를 쓴다: running>0·waiting>0 → running-border", () => {
    renderFeatured(
      buildLive({
        "dev-lead": buildAgentLive("dev-lead", "running"),
        "dev-02": buildAgentLive("dev-02", "waiting"),
      }),
    );

    const card = screen.getByRole("link", { name: /워크플로우A/ });
    const expected = workflowCardBorder({ running: 1, waiting: 1, leadMissing: false });

    expect(expected).toBe("border-running-border");
    expect(card.className).toContain(expected);
    // 칩은 권한 대기를 우선하지만(문구 유지) 테두리는 running이 우선한다.
    expect(screen.getByText("권한 대기 1명")).toBeInTheDocument();
    expect(card.className).not.toContain("border-waiting");
  });

  it("[ADR-46 A] 대표 카드 클릭 영역 hover·focus 표현이 같다: hover:bg-selected + focus-visible:bg-selected", () => {
    renderFeatured(buildLive({}));

    const card = screen.getByRole("link", { name: /워크플로우A/ });
    const classes = card.className.split(/\s+/).filter(Boolean);
    // 표면이 `bg/card`이고 선택 표시에 `bg/selected`를 쓰지 않는 부류 ①이다(ADR-46 A).
    expect(classes).toContain("hover:bg-selected");
    // 키보드 포커스에도 같은 표현을 준다(conventions.md §7 MUST, NFR-12).
    expect(classes).toContain("focus-visible:bg-selected");
    expect(classes).not.toContain("hover:bg-soft");
  });

  it("[ADR-46 B] 활동 줄에 truncate + title, title 문자열 = 화면 텍스트와 동일", () => {
    const title = "도구 실행 · Bash";
    const summary = "cd /Users/jay/very/long/path && ./gradlew build --info --stacktrace 로그를 남긴다";
    renderFeatured(
      buildLive({
        "dev-lead": withLastEvent(buildAgentLive("dev-lead", "running"), buildEvent(title, summary)),
      }),
    );

    // DOM 텍스트는 자르지 않는다(글자 수 상수 없음) — 잘림은 CSS가 한다.
    const expected = recentActivityLabel(title, summary);
    const line = screen.getByText(expected);
    const classes = line.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("truncate");
    expect(classes).toContain("min-w-0");
    expect(line.textContent).toBe(expected);
    // 마우스를 올리면 보이는 값도 화면 문자열과 같은 하나의 문자열이다.
    expect(line).toHaveAttribute("title", expected);
    expect(line.getAttribute("title")).toBe(line.textContent);
  });

  it("[ADR-46 B][FR-015-AC2] summary에 ••••••••가 있으면 title에도 ••••••••가 들어가고 마스킹 전 원문 문자열은 DOM·title 어디에도 없다", () => {
    const masked = "export TOKEN=••••••••";
    // 서버가 가린 원문. 프론트에 오지 않으므로 툴팁을 만드는 어떤 경로에도 나타날 수 없다
    // (`docs/ui/ui-rules.md:52`: 가리기 전 원문은 마우스 오버로도 보여주지 않는다).
    const raw = "export TOKEN=sk-live-0123456789abcdef";
    renderFeatured(
      buildLive({
        "dev-lead": withLastEvent(buildAgentLive("dev-lead", "running"), buildEvent("도구 실행 · Bash", masked)),
      }),
    );

    const line = screen.getByText(recentActivityLabel("도구 실행 · Bash", masked));
    const tooltip = line.getAttribute("title");
    expect(tooltip).toContain("••••••••");
    expect(tooltip).toBe(line.textContent);
    expect(tooltip).not.toContain("sk-live-0123456789abcdef");
    expect(document.body.innerHTML).not.toContain(raw);
    expect(document.body.innerHTML).not.toContain("sk-live-0123456789abcdef");
  });

  it("[FR-006-AC5] 대표 카드 테두리: running=0·waiting>0 → waiting, 모두 대기 → border", () => {
    const waitingOnly = renderFeatured(buildLive({ "dev-02": buildAgentLive("dev-02", "waiting") }));
    expect(screen.getByRole("link", { name: /워크플로우A/ }).className).toContain(
      workflowCardBorder({ running: 0, waiting: 1, leadMissing: false }),
    );
    waitingOnly.unmount();

    renderFeatured(buildLive({}));
    expect(screen.getByRole("link", { name: /워크플로우A/ }).className).toContain(
      workflowCardBorder({ running: 0, waiting: 0, leadMissing: false }),
    );
  });
});
