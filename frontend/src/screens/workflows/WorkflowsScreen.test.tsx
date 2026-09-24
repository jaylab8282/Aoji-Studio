import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowsScreen } from "./WorkflowsScreen";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { AGENT_CREATED_NOTICE_MS } from "./screenSignals";
import { AGENT_CREATED_NAV_STATE } from "../../lib/workflowsNavState";
import type { FormatError, Workflow } from "../../api/types";

function buildWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "워크플로우A",
    description: "",
    filePath: ".jaystudio/teams/a.json",
    lead: "dev-lead",
    members: [],
    brokenRefs: [],
    rawMemberCount: 1,
    ...overrides,
  };
}

function renderWorkflowsScreen() {
  const router = createMemoryRouter([{ path: "/workflows", element: <WorkflowsScreen /> }], {
    initialEntries: ["/workflows"],
  });
  return render(<RouterProvider router={router} />);
}

describe("WorkflowsScreen", () => {
  afterEach(() => {
    snapshotStore.reset();
  });

  it("[FR-006-E1] agentsDirMissing → 층 그리드 자리 AgentsDirMissing", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentsDirMissing: true, agentCount: null, agents: [], workflows: [] },
    });

    renderWorkflowsScreen();

    expect(screen.getByText("에이전트 폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("아직 워크플로우가 없습니다")).not.toBeInTheDocument();
  });

  it("[FR-006-E2] formatErrors>0 → 층 위 목록", () => {
    const fixture = buildSnapshotFixture();
    const formatErrors: FormatError[] = [{ kind: "agent", file: "broken.md", message: "name 누락" }];
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, formatErrors, workflows: [] } });

    renderWorkflowsScreen();

    expect(screen.getByText("읽지 못한 정의 파일 1개")).toBeInTheDocument();
  });

  it("[FR-006-E3] workflows 0 → EmptyWorkflowCard", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [] } });

    renderWorkflowsScreen();

    expect(screen.getByText("아직 워크플로우가 없습니다")).toBeInTheDocument();
  });

  it("[FR-006-AC10] 줌·미니맵은 층 스크롤 영역 밖 하단 컨트롤 영역에 있고 층 그리드 위에 겹치는 fixed/sticky 요소가 없다", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: {
        ...fixture.registry,
        workflows: [buildWorkflow()],
        agents: [
          {
            name: "dev-lead",
            description: "",
            filePath: ".claude/agents/dev-lead.md",
            workflow: "워크플로우A",
            role: "lead",
            duplicateWorkflows: [],
          },
        ],
      },
    });

    const { container } = renderWorkflowsScreen();

    const scrollArea = screen.getByTestId("floor-scroll-area");
    const bottomControls = screen.getByTestId("bottom-controls");
    const zoomControls = screen.getByRole("group", { name: "줌 조절" });
    const minimap = screen.getByRole("img", { name: "미니맵" });

    // 층 그리드는 자체 스크롤 영역 안에, 줌·미니맵은 그 밖 하단 컨트롤 영역(176px) 안에 있다.
    expect(scrollArea.className).toContain("overflow-auto");
    expect(scrollArea).toContainElement(screen.getByRole("heading", { name: "워크플로우A" }));
    expect(scrollArea).not.toContainElement(zoomControls);
    expect(scrollArea).not.toContainElement(minimap);
    expect(bottomControls).toContainElement(zoomControls);
    expect(bottomControls).toContainElement(minimap);
    expect(bottomControls.className).toContain("h-44");
    expect(scrollArea.nextElementSibling).toBe(bottomControls);

    // 층 콘텐츠 위에 띄우는 오버레이 금지(ADR-23, conventions.md §7 MUST).
    for (const element of container.querySelectorAll("*")) {
      const classAttribute = element.getAttribute("class") ?? "";
      expect(classAttribute).not.toMatch(/(?:^|[\s:])(?:fixed|sticky)(?:\s|$)/);
      expect(element.getAttribute("style") ?? "").not.toMatch(/position:\s*(?:fixed|sticky)/);
    }
  });

  it("workflows 1개 이상 → 층 카드 렌더", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: {
        ...fixture.registry,
        workflows: [buildWorkflow()],
        agents: [
          { name: "dev-lead", description: "", filePath: ".claude/agents/dev-lead.md", workflow: "워크플로우A", role: "lead", duplicateWorkflows: [] },
        ],
      },
    });

    renderWorkflowsScreen();

    expect(screen.getByRole("heading", { name: "워크플로우A" })).toBeInTheDocument();
    expect(screen.queryByText("아직 워크플로우가 없습니다")).not.toBeInTheDocument();
  });

  it("[FR-010-AC6] 만들기 성공 안내 줄은 02 상단에 8초만 보인다", async () => {
    vi.useFakeTimers();
    try {
      const fixture = buildSnapshotFixture();
      snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });
      const router = createMemoryRouter([{ path: "/workflows", element: <WorkflowsScreen /> }], {
        initialEntries: [{ pathname: "/workflows", state: AGENT_CREATED_NAV_STATE }],
      });
      render(<RouterProvider router={router} />);

      const notice = "Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다";
      expect(screen.getByText(notice)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(AGENT_CREATED_NOTICE_MS - 100);
      });
      expect(screen.getByText(notice)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
