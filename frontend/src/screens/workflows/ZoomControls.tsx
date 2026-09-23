/**
 * ui-spec.md SCR-02 줌 버튼(하단 컨트롤 영역 왼쪽 끝): +/−/맞춤, 50~200%, 10%p 단위(FR-006-AC6).
 * 세로 스택 + 버튼 사이 6px만 두고 감싸는 카드·패널·테두리는 두지 않는다(기준 PNG, ui-spec.md SCR-02 줌 버튼 행).
 * 정확한 계산·미니맵 연동의 E2E 검증은 T-024 범위다(이 태스크는 기능 자체를 구현한다).
 */
import { Button } from "../../components/ui/Button";
import { ZOOM_FIT_LABEL, ZOOM_IN_LABEL, ZOOM_OUT_LABEL } from "../../lib/text";

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onZoomFit }: ZoomControlsProps) {
  return (
    <div role="group" aria-label="줌 조절" className="flex flex-col items-start gap-1.5">
      <Button variant="secondary" size="sm" aria-label={`확대 (현재 ${zoom}%)`} onClick={onZoomIn}>
        {ZOOM_IN_LABEL}
      </Button>
      <Button variant="secondary" size="sm" aria-label={`축소 (현재 ${zoom}%)`} onClick={onZoomOut}>
        {ZOOM_OUT_LABEL}
      </Button>
      <Button variant="secondary" size="sm" aria-label="화면에 맞춤" onClick={onZoomFit}>
        {ZOOM_FIT_LABEL}
      </Button>
    </div>
  );
}
