/**
 * 이름 입력 확인형 삭제·제거 팝업의 공통 껍데기.
 * ui-spec.md SCR-05-3(워크플로우 삭제, FR-017-AC2)와 SCR-06-6(워크플로우에서 제거, FR-012-AC1)은
 * "제목 + 안내 + 확인을 위해 이름 입력 + 취소 + <동작> (이름 일치 시 활성)"로 같은 구성이므로
 * 화면별로 따로 만들지 않고 이 컴포넌트 하나를 쓴다.
 *
 * 이름이 정확히 일치할 때만 실행 버튼이 활성이다(FR-017-AC3, FR-012-AC1).
 * 비활성 표현은 `Button`이 ADR-29대로 처리한다(채움 배경 없음 · 점선 · faint).
 * 실행 조건은 버튼 라벨(`… (이름 일치 시 활성)`)이 말하므로 별도 이유 줄을 덧붙이지 않는다.
 */
import { useId, useState } from "react";
import { Dialog } from "./Dialog";
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
  pending: boolean;
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
  pending,
  errorMessage,
  onConfirm,
  onClose,
}: ConfirmByNameDialogProps) {
  const inputId = useId();
  const [typedName, setTypedName] = useState("");
  const nameMatches = typedName === expectedName;

  return (
    <Dialog title={title} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="confirm-by-name-dialog">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-section font-semibold text-text">{title}</h2>
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

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={onClose}>
            {CANCEL_BUTTON_LABEL}
          </Button>
          <Button variant="danger" size="sm" disabled={!nameMatches || pending} onClick={onConfirm}>
            {pending ? confirmPendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
