/**
 * ui-spec.md §공통 Dialog (05·06), ADR-71: 막(`bg-page` 0.78) + 가운데 카드(`bg-card`, `border-strong`, `rounded-card`,
 * 안 여백 24, 간격 16, 최대 높이 `100vh − 48`), 뒤 화면 `inert`, ESC 닫기, `role="dialog" aria-modal`.
 * `size`: `sm` 480(05-3·06-5·06-6·도우미 미설치) / `md` 560(05-L) / `lg` 880·`portrait:` 920(05-R·06) — `--container-dialog-*`.
 * 막을 눌러도 닫힌다(기존 동작). 카드는 body 아래 포털로 그리고, 뜨는 동안 body의 다른 자식(앱 루트·아래 팝업)에
 * `inert`를 걸었다가 닫을 때 우리가 건 것만 되돌린다. 닫으면 열기 전 초점으로 돌아간다.
 * 제목·아래 줄 버튼 배치는 `DialogHeader`·`DialogFooter`를 쓴다(제목 `font/section` 700 + 부제 aux muted, 버튼 오른쪽 정렬·도움말은 왼쪽).
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export type DialogSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "max-w-dialog-sm",
  md: "max-w-dialog-md",
  lg: "max-w-dialog-lg portrait:max-w-dialog-lg-portrait",
};

interface DialogProps {
  title: string;
  size?: DialogSize;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ title, size = "md", onClose, children }: DialogProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 뒤 화면 inert: 이 팝업 호스트를 뺀 body 자식 전부. 이미 inert인 것은 건드리지 않는다.
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const marked: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === host || child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      marked.push(child);
    }
    const card = cardRef.current;
    if (card !== null && !card.contains(document.activeElement)) card.focus();
    return () => {
      for (const child of marked) child.removeAttribute("inert");
      if (previousFocus !== null && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div ref={hostRef} role="presentation" className="fixed inset-0 z-50 grid place-items-center p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-page opacity-78" onClick={onClose} />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // 06 폼처럼 내용이 긴 팝업이 짧은 창에서 잘려 보이지 않도록 화면 높이를 넘으면 카드 안에서 스크롤한다.
        className={`dialog-card-max relative flex min-h-0 w-full flex-col gap-4 overflow-y-auto rounded-card border border-border-strong bg-card p-6 ${SIZE_CLASSES[size]}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface DialogHeaderProps {
  title: string;
  /** 제목 아래 부제(aux muted). */
  subtitle?: string;
}

export function DialogHeader({ title, subtitle }: DialogHeaderProps) {
  return (
    <div className="grid gap-1">
      <h2 className="text-section font-bold text-text">{title}</h2>
      {subtitle === undefined ? null : <p className="text-aux text-text-muted">{subtitle}</p>}
    </div>
  );
}

interface DialogFooterProps {
  /** 도움말·이유 줄. 왼쪽에 둔다. */
  note?: ReactNode;
  /** 버튼들. 오른쪽 정렬, 확정 동작이 오른쪽 끝. */
  children: ReactNode;
}

export function DialogFooter({ note, children }: DialogFooterProps) {
  return (
    <div className="flex flex-none flex-wrap items-center justify-end gap-2">
      {note === undefined ? null : <span className="mr-auto text-aux text-text-muted">{note}</span>}
      {children}
    </div>
  );
}
