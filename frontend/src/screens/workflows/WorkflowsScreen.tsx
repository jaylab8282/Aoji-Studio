/**
 * ui-spec.md SCR-02 에이전트 워크플로우 층 뷰. 구성(ui-rules.md 7): 요약 줄(`02-2`) → 범례·필터 줄(`02-3`) → [저장 후 안내 줄]
 * → 로비(`02-4`) → 캔버스(`02-5`, 남은 높이, 자체 스크롤) [04-6 카드 → 층 그리드(가로 3열·세로 2열)] + 캔버스 위에 떠 있는 줌(`02-9`)·미니맵(`02-10`).
 *
 * 화면 자체 `<main>`·`<h1>`을 두지 않는다: `<main>`은 `AppShell` 하나가 세로 스크롤을 맡고, 화면 제목 `<h1>`은 상단 바 하나(D-125).
 * 이 화면 루트는 셸 본문 칸 높이를 채우는 세로 flex(`h-full min-h-0`)라 04-3 띠가 나와 본문 칸이 줄어도 칸 안 이중 스크롤이 없다 —
 * 요약·범례·로비는 스크롤하지 않고 캔버스만 스크롤한다. 로비·04-6 카드는 줌 대상이 아니다.
 * 04-5(폴더 읽기 실패)·04-7(워크플로우 0개)는 캔버스 가운데 카드이고 줌·미니맵을 숨긴다.
 *
 * 첫 `snapshot` 전(`ready === false`)에는 이 화면이 직접 스켈레톤(04-2)을 그린다 — 라우트 `handle.ownLoading`(01과 같은 방식).
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
import { Canvas, ZoomSurface } from "./Canvas";
import { FloorGrid } from "./FloorGrid";
import { Legend } from "./Legend";
import { Lobby } from "./Lobby";
import { Minimap } from "./Minimap";
import { useAgentCreatedNotice, useFormatErrorScroll } from "./screenSignals";
import { SummaryBar } from "./SummaryBar";
import { WorkflowsSkeleton } from "./WorkflowsSkeleton";
import { ZoomControls } from "./ZoomControls";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 100;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

export function WorkflowsScreen() {
  const { ready, config, registry, live } = useSnapshotStore();
  const loaded = ready && config !== null && registry !== null && live !== null;
  const [search, setSearch] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // 06에서 넘어온 신호: 만들기 성공 안내 줄(FR-010-AC6)과 04-6 스크롤(FR-011-E3).
  const showCreatedNotice = useAgentCreatedNotice();
  useFormatErrorScroll(FORMAT_ERROR_LIST_ELEMENT_ID, loaded);

  const searchResults = registry === null ? [] : searchWorkflows(registry.workflows, search);
  const filteredResults =
    selectedFloor === "" ? searchResults : searchResults.filter((result) => result.workflow.name === selectedFloor);

  function handleZoomIn() {
    setZoom((value) => clampZoom(value + ZOOM_STEP));
  }

  function handleZoomOut() {
    setZoom((value) => clampZoom(value - ZOOM_STEP));
  }

  /**
   * `맞춤` = 캔버스 `clientWidth`·`clientHeight`(안 여백 제외) 안에 층 그리드 전체가 들어가는 배율(ui-spec 줌 묶음 행).
   * 04-6 카드·로비·아래 여백 160은 재지 않는다.
   */
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
    const style = getComputedStyle(scrollArea);
    const availableWidth =
      scrollArea.clientWidth - Number.parseFloat(style.paddingLeft || "0") - Number.parseFloat(style.paddingRight || "0");
    const availableHeight =
      scrollArea.clientHeight - Number.parseFloat(style.paddingTop || "0") - Number.parseFloat(style.paddingBottom || "0");
    const fit = Math.floor(Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight) * 100);
    setZoom(clampZoom(fit));
  }

  const zoomProps = {
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_MIN,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomFit: handleZoomFit,
  };

  if (!loaded) {
    return (
      <WorkflowsSkeleton
        search={search}
        onSearchChange={setSearch}
        scrollRef={scrollRef}
        contentRef={contentRef}
        zoom={zoom}
        {...zoomProps}
      />
    );
  }

  const centered = registry.agentsDirMissing || registry.workflows.length === 0;
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

      <Canvas
        scrollRef={scrollRef}
        zoom={zoom}
        center={centered}
        floating={
          centered ? null : (
            <>
              <ZoomControls {...zoomProps} />
              <Minimap workflows={registry.workflows} scrollRef={scrollRef} zoom={zoom} />
            </>
          )
        }
      >
        <FormatErrorList formatErrors={registry.formatErrors} />
        {centered ? (
          <div className="mt-6 w-full max-w-notice">
            {registry.agentsDirMissing ? (
              <AgentsDirMissing hostPath={config.hostPath} />
            ) : (
              <EmptyWorkflowCard writable={registry.writable} />
            )}
          </div>
        ) : (
          <ZoomSurface zoom={zoom} contentRef={contentRef}>
            <FloorGrid
              results={filteredResults}
              registryAgents={registry.agents}
              live={live}
              writable={registry.writable}
            />
          </ZoomSurface>
        )}
      </Canvas>
    </div>
  );
}
