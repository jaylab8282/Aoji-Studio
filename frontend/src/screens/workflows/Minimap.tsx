/**
 * ui-spec.md SCR-02 미니맵(하단 컨트롤 영역 오른쪽 끝): 층 그리드 축소 사각형 + 현재 뷰포트 테두리(running).
 * 사각형은 층 그리드와 같은 3열 비율·span(FR-006-AC2, `workflowLayout.ts`)으로 놓고 색은 중립
 * (`bg-selected`)이다. 워크플로우 단위의 작업 상태는 표시하지 않는다(FR-006-AC5, conventions.md §3
 * "색만 있는 상태 표시 금지"). 워크플로우 0개면 숨긴다.
 *
 * 기준 컨테이너는 window가 아니라 **층 스크롤 영역**이다(ADR-23, ui-spec.md SCR-02 미니맵 행):
 * 테두리 위치 = `scrollTop / scrollHeight`, 높이 = `clientHeight / scrollHeight`(같은 좌표계 = 줌 배율이
 * 적용된 층 스크롤 영역 기준, 최소 4%). 클릭하면 층 스크롤 영역을 그 위치로 스크롤한다.
 *
 * 줌(`zoom`)은 층 영역에 `transform: scale`로 걸리므로 배율이 바뀌면 층 스크롤 영역의 `scrollHeight`가
 * 함께 바뀐다(`clientHeight`는 스크롤 컨테이너 자신의 크기라 그대로다). 그래서 `zoom`을 prop으로 받아
 * 측정 effect의 의존성에 둔다 — 스크롤 이벤트가 없어도 배율 변경만으로 다시 계산된다(T-FIX-10,
 * 이연 Minor T-015 m2: 예전에는 줌 아웃 시 브라우저의 `scrollTop` clamp가 내는 scroll 이벤트에 우연히
 * 의존했다).
 */
import { useEffect, useState, type MouseEvent, type RefObject } from "react";
import type { Workflow } from "../../api/types";
import { floorColumnSpan } from "../../lib/derive/workflowLayout";

/** 테두리가 사라지지 않도록 하는 최소 높이(%). ui-spec.md SCR-02 미니맵 행. */
const MIN_VIEWPORT_PERCENT = 4;

interface MinimapProps {
  workflows: Workflow[];
  /** 층 스크롤 영역(04-6 목록·로비·층 그리드를 담는 자체 스크롤 컨테이너). */
  scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * 현재 줌 배율(%). 층 영역의 `transform: scale`이 바뀌면 층 스크롤 영역의 `scrollHeight`도 바뀌므로
   * 이 값이 뷰포트 재측정의 방아쇠다(ui-spec.md SCR-02 미니맵 행 "둘 다 zoom 배율이 적용된 값으로 통일").
   */
  zoom: number;
}

function agentCountOf(workflow: Workflow): number {
  return (workflow.lead ? 1 : 0) + workflow.members.length;
}

/** 층 카드가 넓을수록(3칸) 세로도 길다: 층 그리드의 축소 비율을 그대로 옮긴다. */
function blockClass(workflow: Workflow): string {
  return floorColumnSpan(agentCountOf(workflow)) === 3 ? "col-span-3 h-10" : "col-span-1 h-6";
}

export function Minimap({ workflows, scrollRef, zoom }: MinimapProps) {
  const [viewport, setViewport] = useState({ top: 0, height: 100 });

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (scrollArea === null) return;

    function updateViewport() {
      if (scrollArea === null) return;
      const scrollHeight = scrollArea.scrollHeight || 1;
      setViewport({
        top: Math.min((scrollArea.scrollTop / scrollHeight) * 100, 100),
        height: Math.max((scrollArea.clientHeight / scrollHeight) * 100, MIN_VIEWPORT_PERCENT),
      });
    }

    // `zoom`이 바뀐 렌더의 커밋 뒤에 돌므로, 여기서 읽는 `scrollHeight`는 이미 새 배율이 반영된 값이다.
    updateViewport();
    scrollArea.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      scrollArea.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [scrollRef, workflows, zoom]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const scrollArea = scrollRef.current;
    if (scrollArea === null) return;
    const mapRect = event.currentTarget.getBoundingClientRect();
    const fractionY = (event.clientY - mapRect.top) / mapRect.height;
    scrollArea.scrollTo({
      top: fractionY * scrollArea.scrollHeight - scrollArea.clientHeight / 2,
      behavior: "smooth",
    });
  }

  if (workflows.length === 0) return null;

  return (
    <div
      role="img"
      aria-label="미니맵"
      onClick={handleClick}
      className="relative h-24 w-36 cursor-pointer overflow-hidden rounded-control border border-border bg-inset"
    >
      <div className="grid grid-cols-3 content-start gap-1 p-1.5">
        {workflows.map((workflow) => (
          <span key={workflow.name} className={`rounded-dot bg-selected ${blockClass(workflow)}`} />
        ))}
      </div>
      <div
        className="absolute inset-x-1 rounded-dot border border-running"
        style={{ top: `${viewport.top}%`, height: `${viewport.height}%` }}
      />
    </div>
  );
}
