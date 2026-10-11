/**
 * ui-spec.md SCR-02 미니맵(`02-10`): 캔버스 위 오른쪽 아래 16px에 **떠 있는** `button`(`bg-chrome`, `border-strong`, 안 여백 8).
 * 크기 3단계 = 토큰 `--spacing-minimap-w/h`(가로형 200×124, 폭 1599 이하 가로형 168×104, 세로형 160×200 · 블록 2열).
 * 블록 표현(FR-006-AC2·AC5): 층 = `bg-selected` 사각형(상태색 없음), 인원 7명 이상 층은 전체 폭, 팀장 없는 층은 점선 사각형.
 * 블록은 `registry.workflows` 전체를 그린다 — 검색·층 선택 필터는 무시한다.
 * 보이는 영역 테두리(`brand-blue` 2px) 기준 컨테이너는 **캔버스**(`scrollTop`·`clientHeight`·`scrollHeight`, 줌 배율이 적용된 값, 최소 4%).
 * 재측정 시점(전수, ADR-48 A): ① 마운트 ② 캔버스 `scroll` ③ `window` `resize` ④ `workflows` 변경 ⑤ `zoom` 변경.
 * 검색·층 선택·`live.lobby`로는 다시 재지 않는다. 누르면 누른 위치로 캔버스를 스크롤한다. 워크플로우 0개면 숨긴다.
 */
import { useEffect, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import type { Workflow } from "../../api/types";
import { floorColumnSpan } from "../../lib/derive/floorLayout";
import { MINIMAP_LABEL } from "../../lib/text";

/** 테두리가 사라지지 않도록 하는 최소 높이(%). ui-spec.md SCR-02 미니맵 행. */
const MIN_VIEWPORT_PERCENT = 4;

interface MinimapProps {
  workflows: Workflow[];
  /** 캔버스(04-6 카드·층 그리드를 담는 자체 스크롤 컨테이너). */
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

/** 블록 한 칸: 넓은 층(7명 이상)은 전체 폭, 팀장 없는 층은 점선 사각형(색은 중립 `bg-selected` 하나). */
function blockClass(workflow: Workflow): string {
  const wide = floorColumnSpan(agentCountOf(workflow)) === 3 ? "minimap-block-wide " : "";
  const look = workflow.lead === null ? "border border-dashed border-border-dashed" : "bg-selected";
  return `${wide}rounded-dot ${look}`;
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

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
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
    <button
      type="button"
      data-wf="02-10"
      aria-label={MINIMAP_LABEL}
      title={MINIMAP_LABEL}
      onClick={handleClick}
      className="absolute right-4 bottom-4 z-10 h-minimap-h w-minimap-w cursor-pointer overflow-hidden rounded-card border border-border-strong bg-chrome p-2 text-left"
    >
      <span className="minimap-grid">
        {workflows.map((workflow) => (
          <span key={workflow.name} data-block={workflow.name} className={blockClass(workflow)} />
        ))}
      </span>
      <span
        aria-hidden="true"
        data-testid="minimap-viewport"
        className="minimap-viewport-box absolute inset-x-1 rounded-dot border-2 border-brand-blue"
        style={{ "--viewport-top": `${viewport.top}%`, "--viewport-height": `${viewport.height}%` } as CSSProperties}
      />
    </button>
  );
}
