/**
 * ui-spec.md SCR-02 줌 묶음(`02-9`): 캔버스 위 왼쪽 아래 16px에 떠 있는 가로 묶음(`bg-chrome`, `border-strong`, 안 여백 6, 간격 6).
 * `zoom-in`(`aria-label` `확대`)·`zoom-out`(`축소`) 34×34 아이콘 버튼 + `scan 맞춤`(`title` `모든 층이 보이게 맞춤`).
 * 50~200%, 10%p 단위(FR-006-AC6). 한계에 닿은 방향의 버튼은 눌러도 달라지지 않으므로 비활성이다.
 */
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { ZOOM_FIT_LABEL, ZOOM_FIT_TITLE, ZOOM_GROUP_LABEL, ZOOM_IN_LABEL, ZOOM_OUT_LABEL } from "../../lib/text";

interface ZoomControlsProps {
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

export function ZoomControls({ canZoomIn, canZoomOut, onZoomIn, onZoomOut, onZoomFit }: ZoomControlsProps) {
  return (
    <div
      role="group"
      aria-label={ZOOM_GROUP_LABEL}
      data-wf="02-9"
      className="absolute bottom-4 left-4 z-10 flex gap-1.5 rounded-card border border-border-strong bg-chrome p-1.5"
    >
      <Button variant="secondary" size="icon" aria-label={ZOOM_IN_LABEL} title={ZOOM_IN_LABEL} disabled={!canZoomIn} onClick={onZoomIn}>
        <Icon name="zoom-in" />
      </Button>
      <Button variant="secondary" size="icon" aria-label={ZOOM_OUT_LABEL} title={ZOOM_OUT_LABEL} disabled={!canZoomOut} onClick={onZoomOut}>
        <Icon name="zoom-out" />
      </Button>
      <Button variant="secondary" title={ZOOM_FIT_TITLE} onClick={onZoomFit}>
        <Icon name="scan" />
        {ZOOM_FIT_LABEL}
      </Button>
    </div>
  );
}
