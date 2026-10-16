import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Floor } from "./Floor";
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
    rawLead: "dev-lead",
    rawMembers: ["dev-02"],
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

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
      <LocationProbe />
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
  it("[FR-006-AC1] 팀장 배지가 팀장 책상에만 있다", () => {
    renderFloor({});
    expect(screen.getAllByText("팀장")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /dev-lead · .*팀장/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dev-02 · 대기 · 상세에서 보기/ })).toBeInTheDocument();
  });

  it("[FR-006-AC3][FR-006-AC11] lead null → 경고 줄 문구 + triangle-alert 아이콘 + 중립 색(주황·빨강 아님), 요약 자리 '팀장 없음'", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: ["dev-02"], rawMemberCount: 1 }) });

    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent("팀장이 없습니다 · 팀장을 만들거나 가져오세요");
    expect(warning).toHaveAttribute("data-wf", "02-8");
    // `Icon`은 lucide 아이콘을 그린다: 이름이 클래스로 남는다.
    expect(warning.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    const classNames = [warning.className, ...Array.from(warning.querySelectorAll("*")).map((el) => el.getAttribute("class") ?? "")].join(" ");
    expect(classNames).toContain("bg-inset");
    expect(classNames).not.toMatch(/waiting|danger|orange/);
    expect(within(screen.getByTestId("floor-summary")).getByText("팀장 없음")).toBeInTheDocument();
  });

  it("[FR-006-AC5] 요약 '실행 중 1명 · 권한 대기 1명' — 상태 사각형 + 상태 글자, 워크플로우 단위 상태 칩 없음", () => {
    renderFloor({
      live: {
        ...emptyLive,
        agents: {
          "dev-lead": buildAgentLive("dev-lead", "running"),
          "dev-02": buildAgentLive("dev-02", "waiting"),
        },
      },
    });

    const summary = screen.getByTestId("floor-summary");
    const running = within(summary).getByText("실행 중 1명");
    const waiting = within(summary).getByText("권한 대기 1명");
    expect(running.className).toContain("text-live");
    expect(waiting.className).toContain("text-waiting");
    expect(running.querySelector("span.bg-live")).not.toBeNull();
    expect(waiting.querySelector("span.bg-waiting")).not.toBeNull();
    expect(summary.textContent).toBe("실행 중 1명 · 권한 대기 1명");
    expect(within(summary).queryByText("모두 대기")).not.toBeInTheDocument();
  });

  it("[FR-006-AC5] 실행 중만 있으면 '실행 중 N명'만, 모두 대기 → '모두 대기'", () => {
    const runningOnly = renderFloor({
      live: { ...emptyLive, agents: { "dev-lead": buildAgentLive("dev-lead", "running") } },
    });
    expect(screen.getByTestId("floor-summary").textContent).toBe("실행 중 1명");
    runningOnly.unmount();

    renderFloor({});
    expect(screen.getByTestId("floor-summary")).toHaveTextContent("모두 대기");
  });

  it("[ADR-69] 책상 칸 hover는 bg-soft 하나 — 키보드 초점 표현은 공통 :focus-visible 링이 맡는다", () => {
    renderFloor({});

    const desk = screen.getByRole("button", { name: /dev-lead/ });
    const classes = desk.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("hover:bg-soft");
    expect(classes).not.toContain("hover:bg-selected");
    expect(classes.some((c) => c.startsWith("focus-visible:"))).toBe(false);
  });

  it("[FR-006-AC5] 층 카드 테두리는 상태와 무관하게 중립이다: 실행 중·권한 대기가 있어도 border-border, 시안·주황 테두리 0", () => {
    const { container } = renderFloor({
      live: {
        ...emptyLive,
        agents: {
          "dev-lead": buildAgentLive("dev-lead", "running"),
          "dev-02": buildAgentLive("dev-02", "waiting"),
        },
      },
    });

    const card = container.querySelector("section") as HTMLElement;
    const classes = card.className.split(/\s+/).filter(Boolean);
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-dashed");
    expect(classes).not.toContain("border-border-dashed");
    expect(classes.filter((c) => /^border-(running|live|waiting|danger)/.test(c))).toEqual([]);
  });

  it("[FR-006-AC5] 팀장 없는 층만 점선 테두리(border-border-dashed border-dashed)", () => {
    const withLead = renderFloor({});
    expect((withLead.container.querySelector("section") as HTMLElement).className).not.toContain("border-dashed");
    withLead.unmount();

    const noLead = renderFloor({
      workflow: buildWorkflow({ lead: null, members: ["dev-02"], rawMemberCount: 1 }),
      live: { ...emptyLive, agents: { "dev-02": buildAgentLive("dev-02", "waiting") } },
    });
    const classes = (noLead.container.querySelector("section") as HTMLElement).className.split(/\s+/);
    expect(classes).toContain("border-border-dashed");
    expect(classes).toContain("border-dashed");
    expect(classes).not.toContain("border-border");
    expect(classes.filter((c) => /^border-(waiting|danger)/.test(c))).toEqual([]);
  });

  it("[FR-006-AC11] duplicateWorkflows → 관련 층 모두 경고(같은 모양), 책상은 workflow(첫 층)에만", () => {
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
    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent("dup-agent이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요");
    expect(warning.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(screen.getByRole("button", { name: /dup-agent/ })).toBeInTheDocument();
    first.unmount();

    renderFloor({ workflow: workflowB, registryAgents });
    expect(screen.getAllByRole("note").map((note) => note.textContent)).toContain(
      "dup-agent이(가) 여러 워크플로우에 있습니다 · 구성 파일을 확인하세요",
    );
    expect(screen.queryByRole("button", { name: /dup-agent/ })).not.toBeInTheDocument();
  });

  it("[FR-006-AC12] 인원이 있어도(rawMemberCount>0) 삭제는 활성(danger)이고 이유 줄·aria-describedby가 없다", () => {
    renderFloor({ workflow: buildWorkflow({ rawMemberCount: 2 }) });

    const remove = screen.getByRole("button", { name: "삭제" });
    expect(remove).toBeEnabled();
    expect(remove.className).toContain("text-danger");
    expect(remove).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("팀원을 먼저 제거하세요")).not.toBeInTheDocument();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
  });

  it("[FR-006-AC12] rawMemberCount 0 → 삭제 활성(danger), 이유 줄 없음", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }) });
    const remove = screen.getByRole("button", { name: "삭제" });
    expect(remove).toBeEnabled();
    expect(remove.className).toContain("text-danger");
    expect(screen.queryByText("팀원을 먼저 제거하세요")).not.toBeInTheDocument();
  });

  it("[FR-006-AC12] writable=false만 삭제를 비활성으로 만든다(인원 0·1명 이상 모두 이유는 '쓰기 권한 없음' 하나)", () => {
    const withMembers = renderFloor({ writable: false, workflow: buildWorkflow({ rawMemberCount: 2 }) });
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(screen.queryByText("팀원을 먼저 제거하세요")).not.toBeInTheDocument();
    const reason = screen.getAllByText("쓰기 권한 없음").at(-1) as HTMLElement;
    expect(screen.getByRole("button", { name: "삭제" })).toHaveAttribute("aria-describedby", reason.id);
    withMembers.unmount();

    renderFloor({ writable: false, workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }) });
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
  });

  it("[FR-006-AC12][FR-017-AC1] 인원이 있어도 삭제를 누르면 같은 ?dialog=workflow-delete&workflow=<이름>으로 열린다(05-4는 창이 고른다)", () => {
    renderFloor({ workflow: buildWorkflow({ name: "워크플로우A", rawMemberCount: 2 }) });
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `?dialog=workflow-delete&workflow=${encodeURIComponent("워크플로우A")}`,
    );
  });

  it("[FR-017-AC1] 삭제를 누르면 ?dialog=workflow-delete&workflow=<이름>으로 열린다", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByTestId("location")).toHaveTextContent("?dialog=workflow-delete&workflow=");
  });

  it("[FR-001-E2] writable=false → 가져오기·만들기·삭제 비활성 '쓰기 권한 없음'", () => {
    renderFloor({ writable: false, workflow: buildWorkflow({ rawMemberCount: 0 }) });
    expect(screen.getByRole("button", { name: "가져오기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "만들기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(screen.getAllByText("쓰기 권한 없음")).toHaveLength(3);
    // 상세는 읽기 동작이라 그대로 활성이다.
    expect(screen.getByRole("button", { name: "워크플로우A 상세" })).toBeEnabled();
  });

  it("층 헤더 버튼은 아이콘 + 글자: 가져오기(import) · 만들기(plus) · 삭제(trash-2) · 상세(arrow-right)", () => {
    renderFloor({});
    expect(screen.getByRole("button", { name: "가져오기" }).querySelector("svg.lucide-import")).not.toBeNull();
    expect(screen.getByRole("button", { name: "만들기" }).querySelector("svg.lucide-plus")).not.toBeNull();
    expect(screen.getByRole("button", { name: "삭제" }).querySelector("svg.lucide-trash-2")).not.toBeNull();
    const detail = screen.getByRole("button", { name: "워크플로우A 상세" });
    expect(detail).toHaveTextContent("상세");
    expect(detail.querySelector("svg.lucide-arrow-right")).not.toBeNull();
  });

  it("[FR-006-AC1] 상세 → /workflows/<이름>, 책상 → /workflows/<이름>?agent=<name>, 가져오기·만들기는 대상 워크플로우를 실어 연다", () => {
    renderFloor({});

    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    expect(screen.getByTestId("location")).toHaveTextContent("dialog=import");
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    expect(screen.getByTestId("location")).toHaveTextContent("dialog=agent-new");
    expect(screen.getByTestId("location")).toHaveTextContent(`workflow=${encodeURIComponent("워크플로우A")}`);
  });

  it("[FR-006-AC1] 책상·상세 이동 경로", () => {
    const workflow = buildWorkflow();
    const registryAgents = [buildAgent({ name: "dev-lead" }), buildAgent({ name: "dev-02", role: "member" })];
    render(
      <MemoryRouter initialEntries={["/workflows"]}>
        <LocationProbe />
        <Routes>
          <Route
            path="*"
            element={<Floor workflow={workflow} registryAgents={registryAgents} live={emptyLive} writable matchedAgentNames={null} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /dev-02/ }));
    expect(screen.getByTestId("location")).toHaveTextContent(`/workflows/${encodeURIComponent("워크플로우A")}?agent=dev-02`);
  });

  it("[FR-006-AC8] 검색으로 이 층 책상이 모두 걸러지면 책상 영역을 그리지 않는다", () => {
    renderFloor({
      workflow: buildWorkflow({ lead: "dev-lead", members: ["dev-02"], rawMemberCount: 2 }),
      matchedAgentNames: [],
    });

    expect(screen.queryByText("dev-lead")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floor-desks")).toBeNull();
  });

  it("[FR-006-AC2][FR-006-AC10] 책상 영역은 칸 100px 고정 repeat(auto-fill, 100px), 카드 폭에 따라 열 수만 변한다", () => {
    const wide = renderFloor({
      workflow: buildWorkflow({
        lead: "dev-lead",
        members: ["dev-02", "dev-03", "dev-04", "dev-05", "dev-06", "dev-07"],
        rawMemberCount: 7,
        rawLead: "dev-lead",
        rawMembers: ["dev-02", "dev-03", "dev-04", "dev-05", "dev-06", "dev-07"],
      }),
    });
    const desks = screen.getByTestId("floor-desks");
    expect(desks.className).toContain("desk-grid");
    expect(desks.className).not.toContain("grid-cols-9");
    expect(desks.className).toContain("bg-inset");
    expect(desks.querySelectorAll("button")).toHaveLength(7);
    wide.unmount();
  });

  it("인원 0 → 책상 영역 없음(팀장 없음 경고 줄만)", () => {
    renderFloor({ workflow: buildWorkflow({ lead: null, members: [], rawMemberCount: 0 }), registryAgents: [] });
    expect(screen.queryByTestId("floor-desks")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("팀장이 없습니다 · 팀장을 만들거나 가져오세요");
  });

  it("층 헤더는 2줄이고 카드는 컨테이너 쿼리 기준(floor-container)이며 data-wf 02-6을 가진다", () => {
    const { container } = renderFloor({});
    const card = container.querySelector("section") as HTMLElement;
    expect(card.className).toContain("floor-container");
    expect(card).toHaveAttribute("aria-label", "워크플로우A 층");
    const header = card.querySelector("[data-wf='02-6']") as HTMLElement;
    expect(header.children).toHaveLength(2);
    expect(header.children[1]?.className).toContain("floor-header");
    expect(within(header).getByRole("heading", { level: 3, name: "워크플로우A" })).toBeInTheDocument();
    expect(within(header).getByText("2명")).toBeInTheDocument();
  });
});
