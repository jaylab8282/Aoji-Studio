import { act, fireEvent, render, screen } from "@testing-library/react";
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
    filePath: ".aojistudio/teams/a.json",
    lead: "dev-lead",
    members: [],
    brokenRefs: [],
    rawMemberCount: 1,
    ...overrides,
  };
}

/**
 * 미니맵 뷰포트 테두리의 height(%). `Minimap`이 `style`에 %로 적는다(ui-spec.md SCR-02 미니맵 행).
 */
function minimapViewportHeightPercent(): number {
  const viewport = screen.getByRole("img", { name: "미니맵" }).querySelector<HTMLElement>("div.absolute");
  expect(viewport, "미니맵 뷰포트 테두리를 찾지 못했다").not.toBeNull();
  expect(viewport!.style.height).toMatch(/%$/);
  return Number.parseFloat(viewport!.style.height);
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
    // ADR-42 호출처 배선: 02도 `설정 열기`를 그린다(07만 숨긴다) — T-FIX-08 리뷰 probe M11.
    expect(screen.getByRole("button", { name: "설정 열기" })).toBeInTheDocument();
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

  it("[FR-006-AC6][T-FIX-10] 미니맵 zoom 호출처 배선 — 줌 버튼을 누르면 뷰포트 테두리가 새 배율의 scrollHeight로 다시 계산된다", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });

    renderWorkflowsScreen();

    const scrollArea = screen.getByTestId("floor-scroll-area");
    const scaled = scrollArea.querySelector<HTMLElement>('[style*="scale"]');
    expect(scaled, "층 영역의 transform: scale 래퍼를 찾지 못했다").not.toBeNull();

    // jsdom은 레이아웃을 계산하지 않는다. 02는 층 영역에 `transform: scale`을 걸어 줌을 구현하므로
    // 층 스크롤 영역의 `scrollHeight`가 배율에 비례한다 — 그 성질만 심는다(`clientHeight`는 스크롤
    // 컨테이너 자신의 크기라 배율과 무관하게 그대로다). 수치는 T-024 E2E 실측(100%에서 3351px / 628px).
    const BASE_SCROLL_HEIGHT = 3351;
    const CLIENT_HEIGHT = 628;
    const currentScale = () =>
      Number.parseFloat(/scale\(([\d.]+)\)/.exec(scaled!.style.transform)?.[1] ?? "1");
    Object.defineProperty(scrollArea, "clientHeight", { configurable: true, get: () => CLIENT_HEIGHT });
    Object.defineProperty(scrollArea, "scrollHeight", {
      configurable: true,
      get: () => BASE_SCROLL_HEIGHT * currentScale(),
    });

    // 심은 수치로 한 번 재게 한다(mount 시점 측정은 이 getter 이전이라 0이었다).
    fireEvent.scroll(scrollArea);
    expect(currentScale()).toBe(1);
    const before = minimapViewportHeightPercent();
    expect(before).toBeCloseTo((CLIENT_HEIGHT / BASE_SCROLL_HEIGHT) * 100, 2);

    // 확대만 하고 스크롤은 일으키지 않는다 — 배율 변경 자체가 재측정의 방아쇠다(T-FIX-10).
    fireEvent.click(screen.getByRole("button", { name: "확대 (현재 100%)" }));
    expect(currentScale()).toBeCloseTo(1.1, 5);

    // 화면이 `zoom`을 미니맵에 넘기지 않으면(배선 누락) 이 값은 before 그대로 남는다
    // — T-024 리뷰 뮤테이션 M4(`zoom={zoom}` → `zoom={100}`)가 단위 테스트를 전부 통과했던 사각이다.
    expect(minimapViewportHeightPercent()).toBeCloseTo((CLIENT_HEIGHT / (BASE_SCROLL_HEIGHT * 1.1)) * 100, 2);
    expect(minimapViewportHeightPercent()).toBeLessThan(before);
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
