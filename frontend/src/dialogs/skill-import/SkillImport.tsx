/**
 * ui-spec.md SCR-08-2 스킬 가져오기 (`?dialog=skill-import`, FR-021, `08-2-skill-import.html`).
 * 폭은 공통 `Dialog`의 `size="lg"`(높이는 내용만큼, 화면 안에서 넘치면 창 안 스크롤). 가로형 2열(왼쪽 파일·미리보기 / 오른쪽 경고·출처), 세로형 1열.
 * 고르면 바로 `POST /api/skills/import/preview`로 올리고(`useSkillImportState`), 출처를 적고 `가져오기`를 누르면 `POST /api/skills/import`다.
 * 스크립트 경고 상자는 `scriptCount > 0`일 때만 있다(FR-021-AC4). 날짜 문구의 오늘은 브라우저 시각이다(FR-021-AC5).
 * 성공 → 창이 닫히고 08에 `가져온 스킬` 칩 새 행 + 안내 줄 ①(`skillsViewStore.afterSave`).
 */
import { useId } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog, DialogFooter, DialogHeader } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { MonoText } from "../../components/ui/MonoText";
import { TextInput } from "../../components/ui/TextInput";
import { formatYmd } from "../../lib/format/time";
import {
  CANCEL_BUTTON_LABEL,
  SKILL_IMPORT_FOOT_NOTE,
  SKILL_IMPORT_LICENSE_LABEL,
  SKILL_IMPORT_PICK_FIRST_REASON,
  SKILL_IMPORT_SOURCE_HINT,
  SKILL_IMPORT_SOURCE_LABEL,
  SKILL_IMPORT_SOURCE_NOTE_LEAD,
  SKILL_IMPORT_SOURCE_NOTE_TAIL,
  SKILL_IMPORT_SUBMIT_LABEL,
  SKILL_IMPORT_SUBMIT_PENDING_LABEL,
  SKILL_IMPORT_SUBTITLE_LEAD,
  SKILL_IMPORT_SUBTITLE_PATH,
  SKILL_IMPORT_SUBTITLE_TAIL,
  SKILL_IMPORT_TITLE,
  SKILL_IMPORT_VERSION_LABEL,
  SKILL_IMPORT_WARN_NOTE,
  SKILL_IMPORT_WARN_TITLE,
  WRITABLE_FALSE_POPUP_NOTICE,
} from "../../lib/text";
import { useSnapshotStore } from "../../state/snapshotStore";
import { SkillImportFilePicker } from "./SkillImportFilePicker";
import { SkillImportPreview } from "./SkillImportPreview";
import { useSkillImportState } from "./useSkillImportState";

interface SkillImportProps {
  onClose: () => void;
}

export function SkillImport({ onClose }: SkillImportProps) {
  const { registry } = useSnapshotStore();
  const prefix = useId();
  const ids = { source: `${prefix}-source`, version: `${prefix}-version`, license: `${prefix}-license` };
  const state = useSkillImportState(onClose);

  const writable = registry?.writable !== false;
  const preview = state.preview;
  // 고르기 전·올리는 중·거부: 출처 입력은 비활성이고 `가져오기`는 이유 줄과 함께 비활성이다.
  const inputsOff = preview === null || state.submitting;
  const submitDisabled = preview === null || state.submitting || !writable;

  return (
    <Dialog title={SKILL_IMPORT_TITLE} size="lg" wf="08-2-1" onClose={onClose}>
      <DialogHeader
        title={SKILL_IMPORT_TITLE}
        subtitle={
          <>
            {SKILL_IMPORT_SUBTITLE_LEAD}
            <MonoText>{SKILL_IMPORT_SUBTITLE_PATH}</MonoText>
            {SKILL_IMPORT_SUBTITLE_TAIL}
          </>
        }
      />

      <div className="import-grid overflow-auto">
        <div className="grid min-w-0 content-start gap-3">
          <SkillImportFilePicker
            file={state.file}
            disabled={state.uploading || state.submitting}
            error={state.fileError}
            onPick={state.pickFile}
          />
          <SkillImportPreview preview={preview} loading={state.uploading} />
        </div>

        <div className="grid min-w-0 content-start gap-3">
          {preview !== null && preview.scriptCount > 0 ? (
            <div
              role="note"
              data-wf="08-2-4"
              className="flex items-start gap-2 rounded-card border border-border-strong bg-inset p-3 text-aux"
            >
              <Icon name="triangle-alert" className="mt-0.5 text-text" />
              <div className="grid">
                <b className="font-semibold text-text">{SKILL_IMPORT_WARN_TITLE}</b>
                <span className="text-text-muted">{SKILL_IMPORT_WARN_NOTE}</span>
              </div>
            </div>
          ) : null}

          <section
            data-wf="08-2-5"
            aria-label={SKILL_IMPORT_SOURCE_LABEL}
            className="grid gap-3 rounded-card border border-border bg-card p-3"
          >
            <Field
              label={SKILL_IMPORT_SOURCE_LABEL}
              htmlFor={ids.source}
              required
              hint={SKILL_IMPORT_SOURCE_HINT}
              error={state.fieldErrors.source}
            >
              <TextInput
                id={ids.source}
                mono
                value={state.source.source}
                disabled={inputsOff}
                onChange={(event) => state.patchSource({ source: event.target.value })}
              />
            </Field>
            <Field label={SKILL_IMPORT_VERSION_LABEL} htmlFor={ids.version} error={state.fieldErrors.version}>
              <TextInput
                id={ids.version}
                mono
                value={state.source.version}
                disabled={inputsOff}
                onChange={(event) => state.patchSource({ version: event.target.value })}
              />
            </Field>
            <Field label={SKILL_IMPORT_LICENSE_LABEL} htmlFor={ids.license} required error={state.fieldErrors.license}>
              <TextInput
                id={ids.license}
                mono
                value={state.source.license}
                disabled={inputsOff}
                onChange={(event) => state.patchSource({ license: event.target.value })}
              />
            </Field>
            <span className="text-aux text-text-muted">
              {SKILL_IMPORT_SOURCE_NOTE_LEAD}
              <MonoText>{formatYmd(new Date())}</MonoText>
              {SKILL_IMPORT_SOURCE_NOTE_TAIL}
            </span>
          </section>
        </div>
      </div>

      {state.submitError === null ? null : <Alert message={state.submitError} block />}
      <DialogFooter wf="08-2-6" note={SKILL_IMPORT_FOOT_NOTE}>
        <Button variant="secondary" disabled={state.submitting} onClick={onClose}>
          {CANCEL_BUTTON_LABEL}
        </Button>
        <Button
          variant="primary"
          disabled={submitDisabled}
          disabledReason={preview === null ? SKILL_IMPORT_PICK_FIRST_REASON : undefined}
          onClick={() => void state.submit()}
        >
          <Icon name="import" />
          {state.submitting ? SKILL_IMPORT_SUBMIT_PENDING_LABEL : SKILL_IMPORT_SUBMIT_LABEL}
        </Button>
      </DialogFooter>
      {writable ? null : <p className="text-right text-aux text-text-muted">{WRITABLE_FALSE_POPUP_NOTICE}</p>}
    </Dialog>
  );
}
