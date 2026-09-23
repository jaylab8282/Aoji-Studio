/**
 * ui-spec.md SCR-02 상단바 오른쪽 "Claude 열기 · 기본 세션" 버튼(`TopBar`의 `rightExtra`로 꽂는다).
 * FR-013-AC3: 02에는 팀장 선택 목록·"팀장으로 열기" 메뉴가 없다. 버튼 하나뿐이다(와이어프레임 ▾ 메뉴 제거 확정).
 * 실제 도우미 호출(GET /api/helper/token → POST helperUrl+/open, 무응답 시 HelperMissingDialog, FR-013-AC1·AC6·AC9)
 * 연결은 T-021(터미널 열기 프론트 연동) 범위다.
 */
import { Button } from "../../components/ui/Button";
import { OPEN_DEFAULT_SESSION_BUTTON_LABEL } from "../../lib/text";

export function WorkflowsHeader() {
  return (
    <Button variant="secondary">
      <span aria-hidden="true" className="mr-2">
        {">_"}
      </span>
      {OPEN_DEFAULT_SESSION_BUTTON_LABEL}
    </Button>
  );
}
