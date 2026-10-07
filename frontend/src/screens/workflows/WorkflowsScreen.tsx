/**
 * ui-spec.md SCR-02 에이전트 워크플로우 층 뷰. 구성(ui-rules.md 7): 요약 줄(`02-2`) → 범례·필터 줄(`02-3`) → [저장 후 안내 줄]
 * → 로비(`02-4`) → [층 스크롤 영역: 04-6 목록 → 층 그리드(가로 3열·세로 2열)] → 하단 컨트롤 영역(줌 왼쪽 + 미니맵 오른쪽).
 *
 * 화면 자체 `<main>`·`<h1>`을 두지 않는다: `<main>`은 `AppShell` 하나가 세로 스크롤을 맡고, 화면 제목 `<h1>`은 상단 바 하나(D-125).
 * 이 화면 루트는 셸 본문 칸 높이를 채우는 세로 flex(`h-full min-h-0`)라 04-3 띠가 나와 본문 칸이 줄어도 칸 안 이중 스크롤이 없다 —
 * 요약·범례·로비는 스크롤하지 않고, 층 스크롤 영역(`flex-1`)만 자체 스크롤한다.
 * 캔버스(격자·테두리)·줌·미니맵 떠 있는 배치·02 로딩 스켈레톤은 T-R3-14 범위라 이 태스크는 기존 구조(층 스크롤 영역 + 하단 컨트롤
 * 영역)를 그대로 둔다. 로비는 줌 대상이 아니므로(ui-spec 줌 묶음 행 "04-6·로비 제외") 스크롤 영역 밖 위쪽에 둔다.
 *
 * `AppShell`이 `snapshotStore.ready`가 될 때까지 스켈레톤을 그리므로 이 화면은 항상
 * config·registry·live가 준비된 뒤에만 렌더된다(HomeScreen과 같은 패턴).
 */
import { useRef, useState } from "react";
import { AgentsDirMissing } from "../../components/ui/AgentsDirMissing";
import { Banner } from "../../components/ui/Banner";
import { EmptyWorkflowCard } from "../../components/ui/EmptyWorkflowCard";
import { FORMAT_ERROR_LIST_ELEMENT_ID, FormatErrorList } from "../../components/ui/FormatErrorList";
import { searchWorkflows } from "../../lib/derive/search";
import { AGENT_CREATED_RESTART_NOTICE } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { FilterBar } from "./FilterBar";
import { FloorGrid } from "./FloorGrid";
import { Legend } from "./Legend";
import { Lobby } from "./Lobby";
import { Minimap } from "./Minimap";
import { useAgentCreatedNotice, useFormatErrorScroll } from "./screenSignals";
import { SummaryBar } from "./SummaryBar";
import { ZoomControls } from "./ZoomControls";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

export function WorkflowsScreen() {
  const { config, registry, live } = useSnapshotStore();
  const [search, setSearch] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // 06에서 넘어온 신호: 만들기 성공 안내 줄(FR-010-AC6)과 04-6 스크롤(FR-011-E3).
  const showCreatedNotice = useAgentCreatedNotice();
  useFormatErrorScroll(FORMAT_ERROR_LIST_ELEMENT_ID);

  if (config === null || registry === null || live === null) return null;

  const searchResults = searchWorkflows(registry.workflows, search);
  const filteredResults =
    selectedFloor === "" ? searchResults : searchResults.filter((result) => result.workflow.name === selectedFloor);

  function handleZoomIn() {
    setZoom((value) => clampZoom(value + ZOOM_STEP));
  }

  function handleZoomOut() {
    setZoom((value) => clampZoom(value - ZOOM_STEP));
  }

  /** `맞춤` = 층 스크롤 영역의 `clientWidth`·`clientHeight` 안에 층 영역 전체가 들어가는 배율(ui-spec.md SCR-02 줌 버튼 행). */
  function handleZoomFit() {
    const content = contentRef.current;
    const scrollArea = scrollRef.current;
    if (!content || !scrollArea) return;
    const scaleFactor = zoom / 100;
    // `getBoundingClientRect`는 변환이 적용된 크기이므로 현재 배율로 나눠 100% 기준 크기를 구한다.
    const rect = content.getBoundingClientRect();
    const naturalWidth = rect.width / scaleFactor;
    const naturalHeight = rect.height / scaleFactor;
    if (naturalWidth === 0 || naturalHeight === 0) return;
    const fit = Math.floor(
      Math.min(scrollArea.clientWidth / naturalWidth, scrollArea.clientHeight / naturalHeight) * 100,
    );
    setZoom(clampZoom(fit));
  }

  return (
    <div data-testid="workflows" className="flex h-full min-h-0 flex-col gap-3 px-gutter pt-4">
      <SummaryBar registry={registry} />
      <div
        data-wf="02-3"
        className="flex flex-none items-center gap-3 whitespace-nowrap portrait:flex-col portrait:items-stretch"
      >
        <Legend registry={registry} live={live} />
        <FilterBar
          workflows={registry.workflows}
          search={search}
          onSearchChange={setSearch}
          selectedFloor={selectedFloor}
          onSelectedFloorChange={setSelectedFloor}
          writable={registry.writable}
        />
      </div>
      {/* FR-010-AC6: 만들기 성공 뒤 범례·필터 줄 아래에 한 줄로 남는 안내(토스트가 아니다, 8초). */}
      {showCreatedNotice ? <Banner tone="soft">{AGENT_CREATED_RESTART_NOTICE}</Banner> : null}
      <Lobby lobby={live.lobby} />

      <div ref={scrollRef} data-testid="floor-scroll-area" className="min-h-0 flex-1 overflow-auto pb-4">
        <div className="flex flex-col gap-3">
          <FormatErrorList formatErrors={registry.formatErrors} />

          <div
            ref={contentRef}
            className="flex flex-col gap-3"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
          >
            {registry.agentsDirMissing ? (
              <AgentsDirMissing hostPath={config.hostPath} />
            ) : registry.workflows.length === 0 ? (
              <EmptyWorkflowCard writable={registry.writable} />
            ) : (
              <FloorGrid
                results={filteredResults}
                registryAgents={registry.agents}
                live={live}
                writable={registry.writable}
              />
            )}
          </div>
        </div>
      </div>

      {/* 하단 컨트롤 영역: 층 스크롤 영역 밖 전용 영역(높이 176px). 줌 버튼 왼쪽 끝 아래, 미니맵 오른쪽 끝 아래(T-R3-14가 떠 있는 배치로 바꾼다). */}
      <div data-testid="bottom-controls" className="flex h-44 shrink-0 items-end justify-between bg-page pb-8">
        <ZoomControls zoom={zoom} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onZoomFit={handleZoomFit} />
        <Minimap workflows={registry.workflows} scrollRef={scrollRef} zoom={zoom} />
      </div>
    </div>
  );
}
