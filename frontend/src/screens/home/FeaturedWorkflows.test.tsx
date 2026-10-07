import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FeaturedWorkflows, FeaturedWorkflowsSkeleton } from "./FeaturedWorkflows";
import { recentActivityLabel } from "../../lib/text";
import { formatTimestamp } from "../../lib/format/time";
import type { AgentLive, EventRow, Live, Registry, Status, Workflow } from "../../api/types";

function buildWorkflow(name: string, lead: string, members: string[]): Workflow {
  return {
    name,
    description: `${name} 설명`,
    filePath: `.aojistudio/teams/${name}.json`,
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
  it("[FR-005-AC3] 섹션 머리 `에이전트 워크플로우` + 부제 `대표 3개 · 실행 중·권한 대기가 있는 워크플로우 → 최근 활동순`, `전체 보기` 없음", () => {
    const { container } = renderFeatured(buildLive({}));

    expect(container.querySelector('[data-wf="01-5"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "에이전트 워크플로우" })).toBeInTheDocument();
    expect(screen.getByText("대표 3개 · 실행 중·권한 대기가 있는 워크플로우 → 최근 활동순")).toBeInTheDocument();
    expect(screen.queryByText(/전체 보기/)).not.toBeInTheDocument();
  });

  it("[FR-005-AC4] 카드: 이름·칩(점 포함)·설명·`에이전트 N · 스킬 N`·`워크플로우 보기` + arrow-right 아이콘, 카드 전체가 /workflows 링크", () => {
    renderFeatured(buildLive({ "dev-lead": buildAgentLive("dev-lead", "waiting") }));

    const card = screen.getByRole("link", { name: "워크플로우A · 권한 대기 1명 · 워크플로우 보기" });
    expect(card).toHaveAttribute("href", "/workflows");
    expect(within(card).getByRole("heading", { level: 3, name: "워크플로우A" })).toBeInTheDocument();
    expect(within(card).getByText("권한 대기 1명")).toBeInTheDocument();
    expect(within(card).getByText("워크플로우A 설명")).toBeInTheDocument();
    expect(card).toHaveTextContent("에이전트 2 · 스킬 4");
    expect(within(card).getByText("워크플로우 보기")).toBeInTheDocument();
    expect(card.querySelectorAll("svg")).toHaveLength(1);
    expect(card).not.toHaveTextContent("→");
  });

  it("[FR-005-AC1] 카드 테두리는 상태색이 아니다: 실행 중·대기가 있어도 border-border 하나(시안·주황 테두리 없음)", () => {
    renderFeatured(
      buildLive({
        "dev-lead": buildAgentLive("dev-lead", "running"),
        "dev-02": buildAgentLive("dev-02", "waiting"),
      }),
    );

    const card = screen.getByRole("link", { name: /워크플로우A/ });
    expect(card).toHaveClass("border-border");
    expect(card.className).not.toMatch(/border-(live|running|waiting)/);
    // 칩은 권한 대기를 우선한다(문구 유지).
    expect(screen.getByText("권한 대기 1명")).toBeInTheDocument();
  });

  it("[ADR-69] 대표 카드 hover·focus 표현이 같다: 테두리 border-dashed, 배경은 바꾸지 않는다", () => {
    renderFeatured(buildLive({}));

    const card = screen.getByRole("link", { name: /워크플로우A/ });
    const classes = card.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("hover:border-border-dashed");
    expect(classes).toContain("focus-visible:border-border-dashed");
    expect(classes.filter((cls) => /^(hover|focus-visible):bg-/.test(cls))).toEqual([]);
  });

  it("[FR-005-AC3] 활동 줄 ① 실행 중·대기가 있으면 `최근 활동 · <title> <summary>`, 한 줄 clamp + title(같은 문자열, data-clamp)", () => {
    const title = "도구 실행 · Bash";
    const summary = "cd /Users/jay/very/long/path && ./gradlew build --info --stacktrace 로그를 남긴다";
    renderFeatured(
      buildLive({
        "dev-lead": withLastEvent(buildAgentLive("dev-lead", "running"), buildEvent(title, summary)),
      }),
    );

    const expected = recentActivityLabel(title, summary);
    expect(expected).toBe(`최근 활동 · ${title} ${summary}`);
    const line = screen.getByTestId("activity-line");
    expect(line).toHaveTextContent(expected);
    expect(line.textContent).toBe(expected);
    expect(line).toHaveAttribute("title", expected);
    expect(line).toHaveAttribute("data-clamp");
    expect(line).toHaveClass("truncate", "min-w-0");
    // 요약은 고정폭 글자다.
    expect(within(line).getByText(summary)).toHaveClass("font-mono");
  });

  it("[FR-005-AC3] 활동 줄 ② 모두 대기이고 이벤트가 있으면 `마지막 활동 · <시각>`(ADR-72 형식), ③ 이벤트 없으면 `최근 활동 없음`", () => {
    const event = { ...buildEvent("도구 실행 · Bash", "x"), at: "2026-01-02T03:04:05+09:00" };
    const withEvent = renderFeatured(buildLive({ "dev-lead": withLastEvent(buildAgentLive("dev-lead", "idle"), event) }));

    const stamp = formatTimestamp(event.at);
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(screen.getByTestId("activity-line")).toHaveTextContent(`마지막 활동 · ${stamp}`);
    expect(screen.getByTestId("activity-line")).toHaveAttribute("title", `마지막 활동 · ${stamp}`);
    withEvent.unmount();

    renderFeatured(buildLive({ "dev-lead": buildAgentLive("dev-lead", "idle") }));
    expect(screen.getByTestId("activity-line")).toHaveTextContent(/^최근 활동 없음$/);
    expect(screen.getByTestId("activity-line")).toHaveAttribute("title", "최근 활동 없음");
    expect(screen.queryByText(/^활동 없음$/)).not.toBeInTheDocument();
  });

  it("[FR-015-AC2] summary에 ••••••••가 있으면 title에도 ••••••••가 들어가고 마스킹 전 원문 문자열은 DOM·title 어디에도 없다", () => {
    const masked = "export TOKEN=••••••••";
    // 서버가 가린 원문. 프론트에 오지 않으므로 툴팁을 만드는 어떤 경로에도 나타날 수 없다
    // (`docs/ui/ui-rules.md`: 가리기 전 원문은 마우스 오버로도 보여주지 않는다).
    const raw = "export TOKEN=sk-live-0123456789abcdef";
    renderFeatured(
      buildLive({
        "dev-lead": withLastEvent(buildAgentLive("dev-lead", "running"), buildEvent("도구 실행 · Bash", masked)),
      }),
    );

    const line = screen.getByTestId("activity-line");
    const tooltip = line.getAttribute("title");
    expect(tooltip).toContain("••••••••");
    expect(tooltip).toBe(line.textContent);
    expect(tooltip).toBe(recentActivityLabel("도구 실행 · Bash", masked));
    expect(tooltip).not.toContain("sk-live-0123456789abcdef");
    expect(document.body.innerHTML).not.toContain(raw);
    expect(document.body.innerHTML).not.toContain("sk-live-0123456789abcdef");
  });

  it("[FR-005-AC5] workflows 0 → 카드 대신 04-7 카드 한 장(`04-7-1`)", () => {
    const registry = buildRegistry([]);
    const { container } = render(
      <MemoryRouter>
        <FeaturedWorkflows registry={registry} live={buildLive({})} />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('[data-wf="04-7-1"]')).toHaveLength(1);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "워크플로우 추가" })).toBeEnabled();
  });

  it("[FR-005-AC3] 로딩 스켈레톤: 카드 3장 안 4줄(제목 2/5·설명 7/10·수 1/2·활동 4/5), 섹션 머리는 보인다", () => {
    const { container } = render(<FeaturedWorkflowsSkeleton />);

    expect(screen.getByText("에이전트 워크플로우")).toBeInTheDocument();
    const cards = container.querySelectorAll('[data-wf="01-5"] > .grid > div');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      const widths = [...card.querySelectorAll("[data-skeleton]")].map((el) => el.className.match(/w-[0-9/]+/)?.[0]);
      expect(widths).toEqual(["w-2/5", "w-7/10", "w-1/2", "w-4/5"]);
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
