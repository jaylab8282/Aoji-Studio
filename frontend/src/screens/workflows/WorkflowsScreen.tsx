/**
 * ui-spec.md SCR-02 에이전트 워크플로우 층 뷰. 구성(ui-rules.md 7): 요약·범례·검색 바
 * → [층 스크롤 영역: 04-6 목록 → 로비 → 층 그리드(3열)] → 하단 컨트롤 영역(줌 버튼 왼쪽 + 미니맵 오른쪽).
 *
 * 레이아웃(ADR-23, ui-spec.md SCR-02 "줌·미니맵 '고정'의 뜻"): 본문 루트는 뷰포트 높이에 맞춘 세로 flex
 * (`--height-body-viewport`)다. ① 요약·범례·검색 바는 스크롤하지 않고, ② 층 스크롤 영역이 남은 높이를
 * 모두 쓰며 자체 스크롤하고, ③ 하단 컨트롤 영역(176px)은 스크롤 영역 **밖**에 있다. 줌·미니맵을
 * `position: fixed`·`sticky`로 층 콘텐츠 위에 띄우지 않는다(FR-006-AC10: 책상 이름·상태 글자 가림 금지,
 * conventions.md §7 MUST).
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
    <main className="flex h-body-viewport flex-col">
      <div className="flex flex-col gap-6 px-page-x pt-8 pb-6">
        {/* FR-010-AC6: 만들기 성공 뒤 02 상단에 한 줄로 남는 안내(토스트가 아니다). */}
        {showCreatedNotice ? <Banner tone="soft">{AGENT_CREATED_RESTART_NOTICE}</Banner> : null}
        <SummaryBar registry={registry} live={live} />
        <FilterBar
          workflows={registry.workflows}
          search={search}
          onSearchChange={setSearch}
          selectedFloor={selectedFloor}
          onSelectedFloorChange={setSelectedFloor}
          writable={registry.writable}
        />
      </div>

      <div ref={scrollRef} data-testid="floor-scroll-area" className="min-h-0 flex-1 overflow-auto px-page-x pb-4">
        <div className="flex flex-col gap-4">
          <FormatErrorList formatErrors={registry.formatErrors} />

          <div
            ref={contentRef}
            className="flex flex-col gap-4"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
          >
            <Lobby lobby={live.lobby} />
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

      {/* 하단 컨트롤 영역: 층 스크롤 영역 밖 전용 영역(높이 176px). 줌 버튼 왼쪽 끝 아래, 미니맵 오른쪽 끝 아래. */}
      <div
        data-testid="bottom-controls"
        className="flex h-44 shrink-0 items-end justify-between bg-page px-page-x pb-8"
      >
        <ZoomControls zoom={zoom} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onZoomFit={handleZoomFit} />
        <Minimap workflows={registry.workflows} scrollRef={scrollRef} />
      </div>
    </main>
  );
}
