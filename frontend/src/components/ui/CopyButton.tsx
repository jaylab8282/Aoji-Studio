/**
 * ui-spec.md §공통 CopyButton (03·07): `navigator.clipboard.writeText`. 성공 시 1.5초 `복사됨` 표시.
 * 표시 지속 시간은 이름 있는 코드 상수로 둔다(conventions.md §7 MUST, ADR-34).
 *
 * 복사할 값이 아직 없으면(`value === null`) 비활성이다 — 눌러도 아무 일이 없는 활성 버튼을 만들지
 * 않는다(ui-rules.md 2). 비활성 이유 줄은 붙이지 않는다: ADR-35 목록에 이 지점이 없고,
 * 값이 로딩 중인 상태는 같은 카드 안 스켈레톤으로 이미 보인다.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { COPY_BUTTON_COPIED_LABEL } from "../../lib/text";

const COPIED_DISPLAY_MS = 1500;

interface CopyButtonProps {
  /** 복사할 값. 아직 받지 못했으면 null. */
  value: string | null;
  /** 버튼 라벨(`명령 복사`, `설정 예시 복사` 등 화면이 정한 확정 문구). */
  label: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleClick(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 권한 거부 등 실패 시에는 `복사됨`을 보이지 않는다.
      // 실패 문구는 확정 문서에 없으므로 새로 만들지 않는다(conventions.md §2 MUST).
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_DISPLAY_MS);
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={value === null}
      onClick={value === null ? undefined : () => void handleClick(value)}
    >
      {copied ? COPY_BUTTON_COPIED_LABEL : label}
    </Button>
  );
}
