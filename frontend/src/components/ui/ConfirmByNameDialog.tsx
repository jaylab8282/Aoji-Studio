/**
 * 이름 입력 확인형 삭제·제거 팝업의 공통 껍데기 (`Dialog sm`, ADR-71, `05-3-workflow-delete.html`·`06-6-agent-remove.html`).
 * SCR-05-3(워크플로우 삭제, FR-017-AC2)와 SCR-06-6(워크플로우에서 제거, FR-012-AC1)은 같은 구성이라 이 컴포넌트 하나를 쓴다.
 * 구성: 제목 → 점 목록(`notes`) → 입력(고정폭, placeholder = 이름) → 에러 `Alert` → 이유 줄 → `취소` · 확정(`trash-2`, 이름 일치 시 danger).
 *
 * 이름이 정확히 일치할 때만 확정 버튼이 활성이다(FR-017-AC3, FR-012-AC1). 비활성 표현은 `Button`이 처리한다.
 * 이유 줄(`reason`, ADR-71): 이름이 같아지기 전에는 입력 아래·아래 줄 위에 한 줄을 보이고 확정 버튼과 `aria-describedby`로 잇는다.
 * 진행 중(`pending`)·`confirmDisabled` 비활성에는 이유 줄을 붙이지 않는다(ADR-35).
 * 문구는 호출부가 `lib/text.ts`에서 넘긴다.
 */
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Dialog, DialogFooter, DialogHeader } from "./Dialog";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { TextInput } from "./TextInput";
import { CANCEL_BUTTON_LABEL } from "../../lib/text";

interface ConfirmByNameDialogProps {
  /** 제목. 문구 조립은 호출부가 한다. */
  title: string;
  /** 제목 아래 점 목록(05-3은 2줄, 06-6은 2~3줄). 줄 안 고정폭 글자는 호출부가 `MonoText`로 넘긴다. */
  notes: ReactNode[];
  /** 입력 라벨(`확인을 위해 워크플로우 이름 입력` / `확인을 위해 name 입력`). */
  inputLabel: string;
  /** 입력이 이 값과 정확히 같아야 확정 버튼이 활성이 된다. */
  expectedName: string;
  confirmLabel: string;
  confirmPendingLabel: string;
  /** 이름이 다를 때 보이는 이유 줄. */
  reason: string;
  pending: boolean;
  /**
   * 요청이 끝난 뒤에도 확정 버튼만 비활성으로 묶어 둘 때 쓴다(05-3 FR-017-E1 안내 표시 중,
   * 같은 요청을 두 번 보내지 않기 위함 — ADR-34). `취소`·ESC는 그대로 열려 있다.
   */
  confirmDisabled?: boolean;
  /** 점 목록과 입력 사이 추가 영역(08-3 `미리 넣어 쓰는 에이전트` 상자). 없으면 그리지 않는다. */
  extra?: ReactNode;
  /** 서버 `ApiError.message` 등 팝업 안에 표시할 사유. */
  errorMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** 화면 원본의 `data-wf` 영역 이름(`05-3-1` / `06-6-1`). */
  wf: { dialog: string; input: string; footer: string };
}

export function ConfirmByNameDialog({
  title,
  notes,
  inputLabel,
  expectedName,
  confirmLabel,
  confirmPendingLabel,
  reason,
  pending,
  confirmDisabled = false,
  extra,
  errorMessage,
  onConfirm,
  onClose,
  wf,
}: ConfirmByNameDialogProps) {
  const inputId = useId();
  const reasonId = useId();
  const [typedName, setTypedName] = useState("");
  const nameMatches = typedName === expectedName;
  const reasonShown = !nameMatches;

  return (
    <Dialog title={title} size="sm" onClose={onClose} wf={wf.dialog}>
      <>
        <DialogHeader title={title} />

        <ul className="grid gap-1 text-body text-text-secondary">
          {notes.map((note, index) => (
            <li key={index} className="relative pl-3.5">
              <span aria-hidden="true" className="absolute top-2 left-0.5 size-1 rounded-dot bg-text-muted" />
              {note}
            </li>
          ))}
        </ul>

        {extra}

        <div data-wf={wf.input}>
          <Field label={inputLabel} htmlFor={inputId}>
            <TextInput
              id={inputId}
              mono
              autoComplete="off"
              value={typedName}
              placeholder={expectedName}
              disabled={pending}
              onChange={(event) => setTypedName(event.target.value)}
            />
          </Field>
        </div>

        {errorMessage === null ? null : <Alert message={errorMessage} />}

        {reasonShown ? (
          <p id={reasonId} className="text-aux text-text-muted">
            {reason}
          </p>
        ) : null}

        <DialogFooter wf={wf.footer}>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button
            variant="danger"
            disabled={!nameMatches || pending || confirmDisabled}
            aria-describedby={reasonShown ? reasonId : undefined}
            onClick={onConfirm}
          >
            <Icon name="trash-2" />
            {pending ? confirmPendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </>
    </Dialog>
  );
}
