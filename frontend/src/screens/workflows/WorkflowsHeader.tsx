/**
 * ui-spec.md SCR-02 상단바 오른쪽 "Claude 열기 · 기본 세션" 버튼(`TopBar`의 `rightExtra`로 꽂는다).
 * FR-013-AC3: 02에는 팀장 선택 목록·"팀장으로 열기" 메뉴가 없다. 버튼 하나뿐이다(와이어프레임 ▾ 메뉴 제거 확정).
 *
 * 누르면 도우미에 `{target:'default'}`만 보낸다(FR-013-AC1·AC6 — 명령 문자열은 보내지 않는다).
 * 무응답이면 `HelperMissingDialog`에 `config.defaultSessionCommand`를 실어 보여주고(FR-013-AC9·E1),
 * 403이면 버튼 옆에 확정 문구를 인라인으로 남긴다(FR-013-E2). 화면 이동은 없다.
 */
import { Button } from "../../components/ui/Button";
import { HelperMissingDialog } from "../../dialogs/helper-missing/HelperMissingDialog";
import { useHelperOpen } from "../../dialogs/helper-missing/useHelperOpen";
import { OPEN_DEFAULT_SESSION_BUTTON_LABEL } from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";

export function WorkflowsHeader() {
  const { config } = useSnapshotStore();
  const helper = useHelperOpen();
  // 이 버튼은 상단바에 있어 첫 스냅샷 전에도 보이고, ui-spec SCR-02 `로딩` 열이 `활성`으로 지정했다.
  // 스냅샷이 오기 전에는 도우미 주소·명령이 모두 없으므로 `useHelperOpen`이 호출하지 않는다.
  const command = config === null ? "" : config.defaultSessionCommand;

  return (
    <>
      <span className="flex items-center gap-2">
        {helper.errorMessage === null ? null : (
          <span role="alert" className="text-aux text-danger">
            {helper.errorMessage}
          </span>
        )}
        <Button variant="secondary" onClick={() => helper.open({ target: "default" }, command)}>
          <span aria-hidden="true" className="mr-2">
            {">_"}
          </span>
          {OPEN_DEFAULT_SESSION_BUTTON_LABEL}
        </Button>
      </span>
      {helper.missingCommand === null ? null : (
        <HelperMissingDialog command={helper.missingCommand} onClose={helper.closeMissingDialog} />
      )}
    </>
  );
}
