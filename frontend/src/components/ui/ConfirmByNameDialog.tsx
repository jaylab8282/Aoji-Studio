/**
 * 이름 입력 확인형 삭제·제거 팝업의 공통 껍데기 (`Dialog sm`, ADR-71).
 * ui-spec.md SCR-05-3(워크플로우 삭제, FR-017-AC2)와 SCR-06-6(워크플로우에서 제거, FR-012-AC1)은
 * "제목 + 안내 + 확인을 위해 이름 입력 + 취소 + <동작>"로 같은 구성이므로 화면별로 따로 만들지 않고 이 컴포넌트 하나를 쓴다.
 *
 * 이름이 정확히 일치할 때만 실행 버튼이 활성이다(FR-017-AC3, FR-012-AC1). 비활성 표현은 `Button`이 처리한다.
 * 이유 줄(`reason`, ADR-71): 이름이 같아지기 전에는 확정 버튼 위에 한 줄(`<이름>을(를) 똑같이 입력하면 삭제 버튼이 켜집니다`)을
 * 보이고 버튼과 `aria-describedby`로 잇는다. 문구는 호출부가 `lib/text.ts`에서 넘긴다. 넘기지 않으면 줄이 없다.
 * 진행 중(`pending`)·`confirmDisabled` 비활성에는 이유 줄을 붙이지 않는다(ADR-35).
 */
import { useId, useState } from "react";
import { Dialog, DialogFooter, DialogHeader } from "./Dialog";
import { Button } from "./Button";
import { Field } from "./Field";
import { TextInput } from "./TextInput";
import { CANCEL_BUTTON_LABEL, CONFIRM_BY_NAME_INPUT_LABEL } from "../../lib/text";

interface ConfirmByNameDialogProps {
  /** 제목. 문구 조립은 호출부가 `lib/text.ts`로 한다. */
  title: string;
  /** 제목 아래 안내 줄(05-3은 1줄, 06-6은 최대 2줄). */
  notes: string[];
  /** 입력이 이 값과 정확히 같아야 실행 버튼이 활성이 된다. */
  expectedName: string;
  confirmLabel: string;
  confirmPendingLabel: string;
  /** 이름이 다를 때 확정 버튼 위에 보이는 이유 줄. */
  reason?: string;
  pending: boolean;
  /**
   * 요청이 끝난 뒤에도 실행 버튼만 비활성으로 묶어 둘 때 쓴다(05-3 FR-017-E1 안내 표시 중,
   * 같은 요청을 두 번 보내지 않기 위함 — ADR-34). `취소`·ESC는 그대로 열려 있다.
   */
  confirmDisabled?: boolean;
  /** 서버 `ApiError.message` 등 팝업 안에 표시할 사유. */
  errorMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmByNameDialog({
  title,
  notes,
  expectedName,
  confirmLabel,
  confirmPendingLabel,
  reason,
  pending,
  confirmDisabled = false,
  errorMessage,
  onConfirm,
  onClose,
}: ConfirmByNameDialogProps) {
  const inputId = useId();
  const reasonId = useId();
  const [typedName, setTypedName] = useState("");
  const nameMatches = typedName === expectedName;

  return (
    <Dialog title={title} size="sm" onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="confirm-by-name-dialog">
        <div className="flex flex-col gap-2">
          <DialogHeader title={title} />
          {notes.map((note) => (
            <p key={note} className="text-aux text-text-secondary">
              {note}
            </p>
          ))}
        </div>

        <Field label={CONFIRM_BY_NAME_INPUT_LABEL} htmlFor={inputId}>
          <TextInput
            id={inputId}
            value={typedName}
            placeholder={expectedName}
            disabled={pending}
            onChange={(event) => setTypedName(event.target.value)}
          />
        </Field>

        {errorMessage === null ? null : (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-aux text-danger">
            {errorMessage}
          </p>
        )}

        {reason !== undefined && !nameMatches ? (
          <p id={reasonId} className="text-right text-aux text-text-muted">
            {reason}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button
            variant="danger"
            disabled={!nameMatches || pending || confirmDisabled}
            aria-describedby={reason !== undefined && !nameMatches ? reasonId : undefined}
            onClick={onConfirm}
          >
            {pending ? confirmPendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
