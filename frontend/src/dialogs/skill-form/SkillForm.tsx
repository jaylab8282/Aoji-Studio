/**
 * ui-spec.md SCR-08-1 스킬 만들기·수정 폼 (`?dialog=skill-new` / `?dialog=skill-edit&skill=<name>`, FR-020, `08-1-skill-form.html`).
 * 폭은 공통 `Dialog`의 `size="lg"` + `tall`(06과 같은 계열 — 높이 `min(1180, 100vh − 48)`)이다.
 * 상태·요청은 `useSkillFormState`, 값 변환·사전 검증은 `lib/derive/skillForm.ts`가 한다.
 * 08-4(저장 충돌)는 이 폼 위에 뜨는 작은 창이라 컴포넌트 상태로 연다(URL 아님, ADR-14와 같은 방식).
 * 저장 성공 → 창이 닫히고 08에 새·바뀐 행과 안내 줄 ①이 보인다(FR-020-AC2·AC5, `skillsViewStore.afterSave`).
 */
import { useId } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter } from "../../components/ui/Dialog";
import { MonoText } from "../../components/ui/MonoText";
import { skillRequiredFilled } from "../../lib/derive/skillForm";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_BUTTON_LABEL,
  SKILL_FORM_CREATE_TITLE,
  SKILL_FORM_EDIT_TITLE,
  SKILL_FORM_FOOT_CREATE_LEAD,
  SKILL_FORM_FOOT_CREATE_TAIL,
  SKILL_FORM_FOOT_EDIT,
  skillFormFootPath,
  WRITABLE_FALSE_POPUP_NOTICE,
  AGENT_FORM_SUBMIT_LABEL,
  AGENT_FORM_SUBMIT_PENDING_LABEL,
  skillFilePathLabel,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { SkillConflictDialog } from "../skill-conflict/SkillConflictDialog";
import { SkillFormFields } from "./SkillFormFields";
import { useSkillFormState } from "./useSkillFormState";

interface SkillFormProps {
  mode: "create" | "edit";
  /** 수정 대상 이름(`?skill=`). 만들기면 null. */
  skillName: string | null;
  onClose: () => void;
}

export function SkillForm({ mode, skillName, onClose }: SkillFormProps) {
  const { registry } = useSnapshotStore();
  const prefix = useId();
  const ids = { name: `${prefix}-name`, description: `${prefix}-description`, body: `${prefix}-body` };
  const form = useSkillFormState({ mode, skillName, onClose });

  const writable = registry?.writable !== false;
  const title = mode === "create" ? SKILL_FORM_CREATE_TITLE : SKILL_FORM_EDIT_TITLE;
  const shownName = mode === "create" ? form.values.name.trim() : (skillName ?? "");

  return (
    <Dialog title={title} size="lg" tall wf="08-1-1" onClose={onClose}>
      <div className="flex flex-none items-baseline gap-3">
        <h2 className="flex-none text-section font-bold text-text">{title}</h2>
        {/* 만들기·이름 빈 값이면 경로를 숨긴다(ui-spec SCR-08-1 제목 행 `빈` 열). */}
        {mode === "create" && shownName === "" ? null : (
          <MonoText className="min-w-0 truncate text-aux text-text-muted">{skillFilePathLabel(shownName)}</MonoText>
        )}
      </div>

      {form.loadError !== null ? (
        <>
          <Alert message={form.loadError} />
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {CLOSE_BUTTON_LABEL}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
            <SkillFormFields
              mode={mode}
              values={form.values}
              loading={form.loading}
              disabled={form.pending}
              fieldErrors={form.fieldErrors}
              ids={ids}
              onChange={form.patchValues}
            />
          </div>
          {form.submitError === null ? null : <Alert block message={form.submitError} />}
          <DialogFooter
            wf="08-1-6"
            note={
              mode === "create" ? (
                <>
                  {SKILL_FORM_FOOT_CREATE_LEAD}
                  <MonoText>{skillFormFootPath(shownName)}</MonoText>
                  {SKILL_FORM_FOOT_CREATE_TAIL}
                </>
              ) : (
                SKILL_FORM_FOOT_EDIT
              )
            }
          >
            <Button variant="secondary" disabled={form.pending || form.loading} onClick={onClose}>
              {CANCEL_BUTTON_LABEL}
            </Button>
            <Button
              variant="primary"
              disabled={form.loading || form.pending || !writable || !skillRequiredFilled(form.values, mode)}
              onClick={() => void form.submit(false)}
            >
              {form.pending ? AGENT_FORM_SUBMIT_PENDING_LABEL : AGENT_FORM_SUBMIT_LABEL}
            </Button>
          </DialogFooter>
          {writable ? null : <p className="text-right text-aux text-text-muted">{WRITABLE_FALSE_POPUP_NOTICE}</p>}
        </>
      )}

      {form.conflictModifiedAt === null || skillName === null ? null : (
        <SkillConflictDialog
          fileName={`${skillName}/SKILL.md`}
          modifiedAt={form.conflictModifiedAt}
          reloading={form.reloading}
          overwriting={form.pending}
          onReload={() => void form.reload()}
          onOverwrite={() => void form.submit(true)}
          onClose={form.closeConflict}
        />
      )}
    </Dialog>
  );
}
