import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  const viewport = screen.queryByTestId("minimap-viewport");
  expect(viewport, "미니맵 뷰포트 테두리를 찾지 못했다").not.toBeNull();
  expect(viewport!.style.getPropertyValue("--viewport-height")).toMatch(/%$/);
  return Number.parseFloat(viewport!.style.getPropertyValue("--viewport-height"));
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

  it("[FR-006-E2] formatErrors>0 → 캔버스 맨 위 04-6 카드(role=alert, data-wf 04-6-1)", () => {
    const fixture = buildSnapshotFixture();
    const formatErrors: FormatError[] = [{ kind: "agent", file: "broken.md", message: "name 누락" }];
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, formatErrors, workflows: [] } });

    renderWorkflowsScreen();

    expect(screen.getByText("읽지 못한 정의·구성 파일 1개")).toBeInTheDocument();
    const card = screen.getByRole("alert", { name: "" });
    expect(card).toHaveAttribute("data-wf", "04-6-1");
    expect(screen.getByTestId("floor-scroll-area")).toContainElement(card);
  });

  it("[FR-006-E3] workflows 0 → EmptyWorkflowCard", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [] } });

    renderWorkflowsScreen();

    expect(screen.getByText("아직 워크플로우가 없습니다")).toBeInTheDocument();
  });

  it("[FR-006-AC10][FR-006-AC6] 줌·미니맵은 캔버스 위에 떠 있다(캔버스 형제 absolute 16px) — 캔버스는 격자·위쪽만 둥근 테두리·자체 스크롤이고 아래 여백 160으로 마지막 층을 줌·미니맵 위로 올릴 수 있다", () => {
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

    const canvas = screen.getByTestId("floor-scroll-area");
    const zoomControls = screen.getByRole("group", { name: "줌" });
    const minimap = screen.getByRole("button", { name: "미니맵 · 누른 곳으로 이동" });
    const wrap = canvas.parentElement as HTMLElement;

    expect(wrap).toHaveAttribute("data-wf", "02-5");
    expect(wrap.className).toContain("relative");
    // 캔버스: bg-page + 24px 격자, 위쪽만 둥근 테두리(아래 테두리 없음), 안 여백 16, 자체 스크롤, 남은 높이.
    for (const cls of ["canvas-grid", "bg-page", "rounded-t-card", "border-b-0", "p-4", "overflow-auto", "flex-1"]) {
      expect(canvas.className.split(/\s+/), cls).toContain(cls);
    }
    expect(canvas).toHaveAttribute("aria-label", "층 캔버스 · 줌 100%");
    expect(canvas).toHaveAttribute("tabindex", "0");
    expect(canvas).toContainElement(screen.getByRole("heading", { name: "워크플로우A" }));
    // 줌·미니맵은 캔버스 안(스크롤 내용)이 아니라 같은 래퍼의 형제 — 스크롤해도 제자리에 떠 있다.
    expect(canvas).not.toContainElement(zoomControls);
    expect(canvas).not.toContainElement(minimap);
    expect(wrap).toContainElement(zoomControls);
    expect(wrap).toContainElement(minimap);
    expect(zoomControls.className).toContain("absolute");
    expect(zoomControls.className).toContain("bottom-4");
    expect(zoomControls.className).toContain("left-4");
    expect(minimap.className).toContain("right-4");
    expect(minimap.className).toContain("bottom-4");
    // 하단 전용 영역(옛 176px)은 없다.
    expect(screen.queryByTestId("bottom-controls")).toBeNull();
    // 줌 대상 래퍼의 아래 여백 160(토큰 canvas-tail)은 줌과 같이 커진다.
    expect(canvas.querySelector('[style*="scale"]')?.className).toContain("pb-canvas-tail");
    // 층 위 fixed/sticky 오버레이는 없다(떠 있는 것은 absolute 둘뿐).
    for (const element of container.querySelectorAll("*")) {
      const classAttribute = element.getAttribute("class") ?? "";
      expect(classAttribute).not.toMatch(/(?:^|[\s:])(?:fixed|sticky)(?:\s|$)/);
    }
  });

  it("[FR-006-AC6] 줌 묶음: 확대·축소(아이콘, aria-label)·맞춤(title) — 50~200%, 10% 단계, 한계에서 해당 버튼 비활성, 캔버스 이름에 현재 줌", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });
    renderWorkflowsScreen();

    const zoomIn = screen.getByRole("button", { name: "확대" });
    const zoomOut = screen.getByRole("button", { name: "축소" });
    const fit = screen.getByRole("button", { name: /맞춤/ });
    expect(fit).toHaveAttribute("title", "모든 층이 보이게 맞춤");
    expect(zoomIn.querySelector("svg.lucide-zoom-in")).not.toBeNull();
    expect(zoomOut.querySelector("svg.lucide-zoom-out")).not.toBeNull();
    expect(fit.querySelector("svg.lucide-scan")).not.toBeNull();

    const canvas = screen.getByTestId("floor-scroll-area");
    fireEvent.click(zoomIn);
    expect(canvas).toHaveAttribute("aria-label", "층 캔버스 · 줌 110%");
    for (let i = 0; i < 20; i += 1) fireEvent.click(zoomIn);
    expect(canvas).toHaveAttribute("aria-label", "층 캔버스 · 줌 200%");
    expect(zoomIn).toBeDisabled();
    for (let i = 0; i < 20; i += 1) fireEvent.click(zoomOut);
    expect(canvas).toHaveAttribute("aria-label", "층 캔버스 · 줌 50%");
    expect(zoomOut).toBeDisabled();
    expect(zoomIn).toBeEnabled();
  });

  it("[FR-006-E1][FR-001-E1] agentsDirMissing → 캔버스 가운데 04-5 카드(폭 min(620,100%)·위 24), 줌·미니맵 숨김, 요약 에이전트 수 '-'", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, agentsDirMissing: true, agentCount: null, agents: [], workflows: [] },
    });
    renderWorkflowsScreen();

    const card = screen.getByRole("alert");
    expect(card).toHaveAttribute("data-wf", "04-5-1");
    expect(card.parentElement?.className).toContain("max-w-notice");
    expect(card.parentElement?.className).toContain("mt-6");
    // 02의 04-5 카드는 `설정 열기` 버튼을 그린다(07만 숨긴다, ADR-42).
    expect(within(card).getByRole("button", { name: "설정 열기" })).toBeEnabled();
    expect(screen.getByTestId("floor-scroll-area").className).toContain("justify-items-center");
    expect(screen.queryByRole("group", { name: "줌" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "미니맵 · 누른 곳으로 이동" })).not.toBeInTheDocument();
    expect(screen.getByTestId("workflows-counts").textContent).toMatch(/^에이전트 - · /);
    expect(screen.getByRole("button", { name: "워크플로우 밖 에이전트 - · 가져오기" })).toBeEnabled();
  });

  it("[FR-006-E3] workflows 0 → 캔버스 가운데 04-7 카드(data-wf 04-7-1)·'워크플로우 추가'(accent), 줌·미니맵 숨김", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [] } });
    renderWorkflowsScreen();

    const card = document.querySelector("[data-wf='04-7-1']") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.parentElement?.className).toContain("max-w-notice");
    const add = within(card).getByRole("button", { name: "워크플로우 추가" });
    expect(add.className).toContain("bg-action-soft");
    expect(card).toHaveAttribute("data-kind", "empty");
    expect(screen.queryByRole("group", { name: "줌" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("minimap-viewport")).not.toBeInTheDocument();
  });

  it("[FR-006-AC8] 검색 결과 0 → 캔버스 층 자리 '검색 결과가 없습니다'(muted), 줌·미니맵은 그대로", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });
    renderWorkflowsScreen();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz-없음" } });

    expect(screen.getByText("검색 결과가 없습니다")).toHaveClass("text-text-muted");
    expect(screen.getByRole("group", { name: "줌" })).toBeInTheDocument();
  });

  it("[FR-006-AC6] 미니맵은 검색·층 선택 필터를 무시하고 모든 층을 그린다", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: {
        ...fixture.registry,
        workflows: [buildWorkflow({ name: "가층" }), buildWorkflow({ name: "나층", lead: null, rawMemberCount: 0 })],
      },
    });
    renderWorkflowsScreen();
    expect(document.querySelectorAll("[data-block]")).toHaveLength(2);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "가층" } });
    fireEvent.change(screen.getByRole("combobox", { name: "층 선택" }), { target: { value: "가층" } });

    expect(screen.queryByRole("heading", { name: "나층" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-block]")).toHaveLength(2);
  });

  it("[FR-006-AC5] 로딩(첫 스냅샷 전) → 02 자체 스켈레톤: 정적 글자·주 동작은 보이고 수치·범례·로비 칩·층 2개는 스켈레톤, 스냅샷 값 버튼은 비활성(이유 없음), 줌 활성, 미니맵 없음", () => {
    snapshotStore.reset();
    const { container } = renderWorkflowsScreen();

    const root = screen.getByTestId("workflows-skeleton");
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getByRole("heading", { name: "AojiStudio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "로비 · 메인 세션" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeEnabled();
    expect(screen.getByRole("button", { name: "에이전트 만들기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "워크플로우 추가" })).toBeDisabled();
    expect(screen.queryByText("쓰기 권한 없음")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "에이전트 수 로딩 중" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "작업 중 수 로딩 중" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "로비 세션 로딩 중" })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "층 로딩 중 1" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "층 로딩 중 2" })).toBeInTheDocument();
    // 책상 칸 스켈레톤 100×110, 상태 색(범례·칩) 없음.
    expect(root.querySelectorAll("[data-skeleton].w-desk")).toHaveLength(8);
    expect(root.querySelector(".text-live, .text-waiting")).toBeNull();
    expect(screen.getByRole("group", { name: "줌" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확대" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "미니맵 · 누른 곳으로 이동" })).not.toBeInTheDocument();
  });

  it("[FR-006-AC5] 스냅샷이 오면 스켈레톤이 실제 화면으로 바뀐다(검색어는 유지)", () => {
    snapshotStore.reset();
    renderWorkflowsScreen();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "개발" } });

    const fixture = buildSnapshotFixture();
    act(() => {
      snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });
    });

    expect(screen.queryByTestId("workflows-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("workflows")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("개발");
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
      Number.parseFloat(scaled!.style.getPropertyValue("--zoom-scale") || "1");
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
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    expect(currentScale()).toBeCloseTo(1.1, 5);

    // 화면이 `zoom`을 미니맵에 넘기지 않으면(배선 누락) 이 값은 before 그대로 남는다
    // — T-024 리뷰 뮤테이션 M4(`zoom={zoom}` → `zoom={100}`)가 단위 테스트를 전부 통과했던 사각이다.
    expect(minimapViewportHeightPercent()).toBeCloseTo((CLIENT_HEIGHT / (BASE_SCROLL_HEIGHT * 1.1)) * 100, 2);
    expect(minimapViewportHeightPercent()).toBeLessThan(before);
  });

  it("[D-125][NFR-11] 화면 자체 <main>·<h1> 없음(셸이 하나), 루트는 본문 칸을 채우는 flex(h-full)이다", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });

    const { container } = renderWorkflowsScreen();

    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    const root = screen.getByTestId("workflows");
    expect(root.className).toContain("h-full");
    expect(root.className).toContain("min-h-0");
    // 스크롤하는 곳은 층 스크롤 영역 하나다(본문 칸이 이중 스크롤하지 않게 루트는 overflow를 갖지 않는다).
    expect(root.className).not.toContain("overflow");
    expect(screen.getByTestId("floor-scroll-area").className).toContain("overflow-auto");
  });

  it("[FR-006-AC7] data-wf 02-2·02-3·02-4·02-6 영역이 순서대로 있고 로비는 줌 대상 영역 밖에 있다", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });

    const { container } = renderWorkflowsScreen();

    const areas = Array.from(container.querySelectorAll("[data-wf]")).map((el) => el.getAttribute("data-wf"));
    expect(areas.slice(0, 3)).toEqual(["02-2", "02-3", "02-4"]);
    expect(areas).toContain("02-6");
    expect(screen.getByTestId("floor-scroll-area")).not.toContainElement(screen.getByRole("region", { name: "로비" }));
  });

  it("[FR-006-AC2] 층 그리드는 가로형 3열·세로형 2열, 인원 7명 이상 층은 한 줄 전체 폭(col-span-full), 층은 위에 붙는다", () => {
    const fixture = buildSnapshotFixture();
    const wideMembers = ["m1", "m2", "m3", "m4", "m5", "m6"];
    snapshotStore.replace({
      ...fixture,
      registry: {
        ...fixture.registry,
        workflows: [
          buildWorkflow({ name: "넓은층", lead: "lead", members: wideMembers, rawMemberCount: 7 }),
          buildWorkflow({ name: "보통층", lead: null, members: [], rawMemberCount: 0 }),
        ],
        agents: [],
      },
    });

    renderWorkflowsScreen();

    const grid = screen.getByTestId("floor-grid");
    expect(grid.className).toContain("grid-cols-3");
    expect(grid.className).toContain("portrait:grid-cols-2");
    expect(grid.className).toContain("items-start");
    const wide = screen.getByRole("region", { name: "넓은층 층" }).parentElement as HTMLElement;
    const normal = screen.getByRole("region", { name: "보통층 층" }).parentElement as HTMLElement;
    expect(wide.className).toContain("col-span-full");
    expect(normal.className).not.toContain("col-span");
  });

  it("[FR-001-E2] writable=false → 다섯 버튼(에이전트 만들기·워크플로우 추가·층 가져오기·만들기·삭제) 비활성 '쓰기 권한 없음'", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, writable: false, workflows: [buildWorkflow({ rawMemberCount: 0 })] },
    });

    renderWorkflowsScreen();

    for (const name of ["에이전트 만들기", "워크플로우 추가", "가져오기", "만들기", "삭제"]) {
      expect(screen.getByRole("button", { name }), name).toBeDisabled();
    }
    expect(screen.getAllByText("쓰기 권한 없음")).toHaveLength(5);
  });

  it("[FR-006-AC7] 안내 줄은 범례·필터 줄 아래, 로비 위에 box 모양 한 줄로 나온다 (FR-010-AC6)", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({ ...fixture, registry: { ...fixture.registry, workflows: [buildWorkflow()] } });
    const router = createMemoryRouter([{ path: "/workflows", element: <WorkflowsScreen /> }], {
      initialEntries: [{ pathname: "/workflows", state: AGENT_CREATED_NAV_STATE }],
    });
    const { container } = render(<RouterProvider router={router} />);

    const notice = screen.getByText("Claude Code가 새 정의를 바로 인식하지 못하면 재시작이 필요할 수 있습니다");
    const filters = container.querySelector("[data-wf='02-3']") as HTMLElement;
    const lobby = container.querySelector("[data-wf='02-4']") as HTMLElement;
    expect(notice.className).toContain("bg-inset");
    expect(filters.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(lobby) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
