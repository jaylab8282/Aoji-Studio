/**
 * 08-2 파일 선택 상자 (`08-2-skill-import.html` `.drop`, 영역 `08-2-2`): 고르기 전 = 점선 상자 + `zip 파일 선택`, 고른 뒤 =
 * `file-archive` + 파일 이름 + 크기 + `다른 파일 선택`. 끌어 놓기와 숨은 `input[type=file]`(`accept=".zip"`)로 고른다.
 * 고르면 바로 올린다(호출부 `onPick`). 거부·만료 `Alert`는 상자 바로 아래(`error`).
 */
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { formatBytes } from "../../lib/format/bytes";
import {
  SKILL_IMPORT_FILE_INPUT_LABEL,
  SKILL_IMPORT_LIMITS_HINT,
  SKILL_IMPORT_PICK_AGAIN_BUTTON_LABEL,
  SKILL_IMPORT_PICK_BUTTON_LABEL,
} from "../../lib/text";

interface SkillImportFilePickerProps {
  file: File | null;
  disabled: boolean;
  error: string | null;
  onPick: (file: File) => void;
}

export function SkillImportFilePicker({ file, disabled, error, onPick }: SkillImportFilePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files[0];
    if (dropped !== undefined) onPick(dropped);
  }

  return (
    <div className="grid gap-2">
      <div
        data-wf="08-2-2"
        data-dragging={dragging ? "" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`grid gap-2 rounded-card border border-dashed bg-inset p-3 ${
          dragging ? "border-border-strong" : "border-border-dashed"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          aria-label={SKILL_IMPORT_FILE_INPUT_LABEL}
          tabIndex={-1}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            // 같은 파일을 다시 골라도 change가 오도록 비운다.
            event.target.value = "";
            if (picked !== undefined) onPick(picked);
          }}
        />
        {file === null ? (
          <div className="flex items-center">
            <Button variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
              {SKILL_IMPORT_PICK_BUTTON_LABEL}
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="file-archive" className="text-text-muted" />
            <b title={file.name} data-clamp className="min-w-0 truncate font-mono font-medium text-text">
              {file.name}
            </b>
            <span className="flex-none font-mono text-text-muted tabular-nums">{formatBytes(file.size)}</span>
            <span className="flex-1" />
            <Button variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
              {SKILL_IMPORT_PICK_AGAIN_BUTTON_LABEL}
            </Button>
          </div>
        )}
        <span className="text-aux text-text-muted">{SKILL_IMPORT_LIMITS_HINT}</span>
      </div>
      {error === null ? null : <Alert message={error} block />}
    </div>
  );
}
