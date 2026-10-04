import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Floor } from "./Floor";
import { workflowCardBorder } from "../../lib/derive/workflowCardBorder";
import type { AgentDef, AgentLive, Live, Workflow } from "../../api/types";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "워크플로우A",
    description: "",
    filePath: ".aojistudio/teams/a.json",
    lead: "dev-lead",
    members: ["dev-02"],
    brokenRefs: [],
    rawMemberCount: 2,
    ...overrides,
  };
}

function buildAgent(overrides: Partial<AgentDef> = {}): AgentDef {
  return {
    name: "dev-lead",
    description: "",
    filePath: ".claude/agents/dev-lead.md",
    workflow: "워크플로우A",
    role: "lead",
    duplicateWorkflows: [],
    ...overrides,
  };
}

function buildAgentLive(name: string, status: AgentLive["status"]): AgentLive {
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

const emptyLive: Live = { lastReceivedAt: null, everReceived: true, agents: {}, lobby: [], undefinedSubagents: [] };

function renderFloor(overrides: {
  workflow?: Workflow;
  registryAgents?: AgentDef[];
  live?: Live;
  writable?: boolean;
  matchedAgentNames?: string[] | null;
}) {
  const workflow = overrides.workflow ?? buildWorkflow();
  const registryAgents =
    overrides.registryAgents ??
    [
      workflow.lead ? buildAgent({ name: workflow.lead, workflow: workflow.name, role: "lead" }) : null,
      ...workflow.members.map((name) => buildAgent({ name, workflow: workflow.name, role: "member" })),
    ].filter((agent): agent is AgentDef => agent !== null);

  return render(
    <MemoryRouter>
      <Floor
        workflow={workflow}
        registryAgents={registryAgents}
        live={overrides.live ?? emptyLive}
        writable={overrides.writable ?? true}
        matchedAgentNames={overrides.matchedAgentNames ?? null}
      />
    </MemoryRouter>,
  );
}

describe("Floor", () => {
  it("[FR-006-AC1] 팀장 배지", () => {
    renderFloor({});
    expect(screen.getByText("팀장")).toBeInTheDocument();
  });

  it("[FR-006-AC3] lead null → 경고 줄 문구 + 요약 자리 '팀장 없음'", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: ["dev-02"], rawMemberCount: 1 }) });
    expect(screen.getByText("팀장이 없습니다 · 팀장을 만들거나 가져오세요")).toBeInTheDocument();
    expect(screen.getByText("팀장 없음")).toBeInTheDocument();
  });

  it("[FR-006-AC5] 요약 '실행 중 1명 · 권한 대기 1명', 워크플로우 단위 상태 표시(칩) 없음", () => {
    renderFloor({
      live: {
        ...emptyLive,
        agents: {
          "dev-lead": buildAgentLive("dev-lead", "running"),
          "dev-02": buildAgentLive("dev-02", "waiting"),
        },
      },
    });
    expect(screen.getByText("실행 중 1명 · 권한 대기 1명")).toBeInTheDocument();
    // 워크플로우 단위 상태 칩(`WorkflowChip`: "실행 중 N명" / "권한 대기 N명" 한 조각)은 두지 않는다.
    expect(screen.queryByText("실행 중 1명")).not.toBeInTheDocument();
    expect(screen.queryByText("권한 대기 1명")).not.toBeInTheDocument();
    expect(screen.queryByText("모두 대기")).not.toBeInTheDocument();
  });

  it("[ADR-46 A] 책상 칸 hover·focus 표현이 같다: hover:bg-selected + focus-visible:bg-selected", () => {
    renderFloor({});

    const desk = screen.getByRole("button", { name: /dev-lead/ });
    const classes = desk.className.split(/\s+/).filter(Boolean);
    // 표면이 `bg/inset`이고 선택 표시에 `bg/selected`를 쓰지 않는 부류 ①이다(ADR-46 A).
    expect(classes).toContain("hover:bg-selected");
    // 키보드 포커스에도 같은 표현을 준다(conventions.md §7 MUST, NFR-12).
    expect(classes).toContain("focus-visible:bg-selected");
    expect(classes).not.toContain("hover:bg-soft");
  });

  it("[ADR-50 B] 책상 칸 <button>이 w-full min-w-0이고 hover:bg-selected·focus-visible:bg-selected는 그대로다", () => {
    renderFloor({});

    const desk = screen.getByRole("button", { name: /dev-lead/ });
    const classes = desk.className.split(/\s+/).filter(Boolean);
    // 칸 폭을 받아야 `DeskSprite`의 글자 clamp 기준 폭이 생긴다(conventions.md §7 MUST).
    expect(classes).toContain("w-full");
    expect(classes).toContain("min-w-0");
    // hover·focus 표현은 그대로다(ADR-46 A 회귀 0).
    expect(classes).toContain("hover:bg-selected");
    expect(classes).toContain("focus-visible:bg-selected");
    // 칸 안 가운데 정렬도 그대로다 — 스프라이트 좌우 위치가 변하지 않는 근거다.
    expect(desk.parentElement?.className).toContain("justify-items-center");
  });

  it("[FR-006-AC5] 모두 대기 → '모두 대기'", () => {
    renderFloor({});
    expect(screen.getByText("모두 대기")).toBeInTheDocument();
  });

  it("[FR-006-AC5] 카드 테두리는 공용 `workflowCardBorder`를 따른다: running>0 → running-border(waiting 있어도)", () => {
    const { container } = renderFloor({
      live: {
        ...emptyLive,
        agents: {
          "dev-lead": buildAgentLive("dev-lead", "running"),
          "dev-02": buildAgentLive("dev-02", "waiting"),
        },
      },
    });

    const card = container.firstElementChild;
    const expected = workflowCardBorder({ running: 1, waiting: 1, leadMissing: false });
    expect(expected).toBe("border-running-border");
    expect(card?.className).toContain(expected);
    expect(card?.className).not.toContain("border-waiting");
  });

  it("[FR-006-AC5] 카드 테두리: running=0·waiting>0 → waiting, 모두 대기 → border, 팀장 없음 → danger-border", () => {
    const waitingOnly = renderFloor({
      live: { ...emptyLive, agents: { "dev-02": buildAgentLive("dev-02", "waiting") } },
    });
    expect(waitingOnly.container.firstElementChild?.className).toContain(
      workflowCardBorder({ running: 0, waiting: 1, leadMissing: false }),
    );
    waitingOnly.unmount();

    const allIdle = renderFloor({});
    expect(allIdle.container.firstElementChild?.className).toContain(
      workflowCardBorder({ running: 0, waiting: 0, leadMissing: false }),
    );
    allIdle.unmount();

    const noLead = renderFloor({ workflow: buildWorkflow({ lead: null, members: ["dev-02"], rawMemberCount: 1 }) });
    expect(noLead.container.firstElementChild?.className).toContain(
      workflowCardBorder({ running: 0, waiting: 0, leadMissing: true }),
    );
  });

  it("[FR-006-AC11] duplicateWorkflows → 관련 층 모두 경고, 책상은 workflow(첫 층)에만", () => {
    const dupAgent = buildAgent({
      name: "dup-agent",
      workflow: "워크플로우A",
      duplicateWorkflows: ["워크플로우A", "워크플로우B"],
    });
    const leadAgent = buildAgent({ name: "dev-lead", workflow: "워크플로우A" });
    const workflowA = buildWorkflow({ name: "워크플로우A", lead: "dev-lead", members: ["dup-agent"], rawMemberCount: 2 });
    const workflowB = buildWorkflow({ name: "워크플로우B", lead: null, members: ["dup-agent"], rawMemberCount: 1 });
    const registryAgents = [leadAgent, dupAgent];

    const first = renderFloor({ workflow: workflowA, registryAgents });
    expect(screen.getByText("dup-agent이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요")).toBeInTheDocument();
    expect(screen.getByText("dup-agent")).toBeInTheDocument();
    first.unmount();

    renderFloor({ workflow: workflowB, registryAgents });
    expect(screen.getByText("dup-agent이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요")).toBeInTheDocument();
    expect(screen.queryByText("dup-agent")).not.toBeInTheDocument();
  });

  it("[FR-006-AC12][FR-017-AC1] rawMemberCount>0 → 삭제 비활성 '팀원을 먼저 제거하세요'", () => {
    renderFloor({ workflow: buildWorkflow({ rawMemberCount: 2 }) });
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(screen.getByText("팀원을 먼저 제거하세요")).toBeInTheDocument();
  });

  it("[FR-006-AC12][FR-017-AC1] rawMemberCount 0 → 삭제 활성", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }) });
    expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled();
  });

  it("[FR-001-E2] writable=false → 가져오기·+ 만들기·삭제 비활성 '쓰기 권한 없음'", () => {
    renderFloor({ writable: false, workflow: buildWorkflow({ rawMemberCount: 0 }) });
    expect(screen.getByRole("button", { name: "가져오기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ 만들기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(screen.getAllByText("쓰기 권한 없음").length).toBeGreaterThan(0);
  });

  it("[FR-006-AC8] 검색으로 이 층 책상이 모두 걸러지면 빈 상자 대신 아무것도 그리지 않는다", () => {
    const { container } = renderFloor({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-02"], rawMemberCount: 2 }),
      matchedAgentNames: [],
    });

    expect(screen.queryByText("dev-lead")).not.toBeInTheDocument();
    expect(screen.queryByText("에이전트가 없습니다 · 만들거나 가져오세요")).not.toBeInTheDocument();
    expect(container.querySelector(".bg-inset")).toBeNull();
  });

  it("[FR-006-AC2][FR-006-AC10] 책상 열은 카드 폭 균등 분할: span-3(인원 7 이상) 9열, span-1 4열", () => {
    const wide = renderFloor({
      workflow: buildWorkflow({
        lead: "dev-lead",
        members: ["dev-02", "dev-03", "dev-04", "dev-05", "dev-06", "dev-07"],
        rawMemberCount: 7,
      }),
    });
    const wideDesks = wide.container.querySelector(".bg-inset");
    expect(wideDesks?.className).toContain("grid-cols-9");
    expect(wideDesks?.className).not.toContain("gap-x-");
    wide.unmount();

    const narrow = renderFloor({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-02", "dev-03"], rawMemberCount: 3 }),
    });
    const narrowDesks = narrow.container.querySelector(".bg-inset");
    expect(narrowDesks?.className).toContain("grid-cols-4");
    expect(narrowDesks?.className).not.toContain("gap-x-");
  });

  it("인원 0 → '에이전트가 없습니다 · 만들거나 가져오세요'", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }), registryAgents: [] });
    expect(screen.getByText("에이전트가 없습니다 · 만들거나 가져오세요")).toBeInTheDocument();
  });
});
