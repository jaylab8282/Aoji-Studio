/**
 * ui-spec.md §공통 CopyButton: `navigator.clipboard.writeText`. 성공 시 1.5초 "복사됨" 표시.
 */
import { useState } from "react";
import { Button } from "./Button";
import { COPY_BUTTON_COPIED_LABEL, COPY_BUTTON_DEFAULT_LABEL } from "../../lib/text";

const COPIED_DISPLAY_MS = 1500;

interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = COPY_BUTTON_DEFAULT_LABEL }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_DISPLAY_MS);
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void handleClick()}>
      {copied ? COPY_BUTTON_COPIED_LABEL : label}
    </Button>
  );
}
