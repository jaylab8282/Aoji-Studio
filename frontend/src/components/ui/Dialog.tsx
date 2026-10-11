/**
 * ui-spec.md §공통 Dialog (05·06), ADR-71: 막(`bg-page` 0.78) + 가운데 카드(`bg-card`, `border-strong`, `rounded-card`,
 * 안 여백 24, 간격 16, 최대 높이 `100vh − 48`), 뒤 화면 `inert`, ESC 닫기(쌓인 창은 맨 위 창만), `role="dialog" aria-modal`.
 * `size`: `sm` 480(05-3·06-5·06-6·도우미 미설치) / `md` 560(05-L) / `lg` 880·`portrait:` 920(05-R·06) — `--container-dialog-*`.
 * 막을 눌러도 닫힌다(기존 동작). 카드는 body 아래 포털로 그리고, 뜨는 동안 body의 다른 자식(앱 루트·아래 팝업)에
 * `inert`를 걸었다가 닫을 때 우리가 건 것만 되돌린다. 닫으면 열기 전 초점으로 돌아간다.
 * 제목·아래 줄 버튼 배치는 `DialogHeader`·`DialogFooter`를 쓴다(제목 `font/section` 700 + 부제 aux muted, 버튼 오른쪽 정렬·도움말은 왼쪽).
 */
import { useEffect, useRef, useState } from "react";
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
  /** 화면 원본의 `data-wf` 영역 이름(`05L-1`·`06-1` 등). 카드(`role="dialog"`)에 붙는다. */
  wf?: string;
  /** 확인·충돌 창은 `alertdialog`(06-5). */
  role?: "dialog" | "alertdialog";
  /** 본문 요약 요소 id(`aria-describedby`, 06-5). */
  describedBy?: string;
  /** 06 폼처럼 높이가 `min(1180, 100vh − 48)`로 고정인 창. */
  tall?: boolean;
  children: ReactNode;
}

/**
 * 쌓인 창 순서(D-126·D-127): 나중에 연 창일수록 번호가 크다. 번호는 첫 렌더에 한 번 받는다 — 부모 창이 자식 창보다
 * 먼저 렌더되므로(자식은 부모의 children) 열린 순서와 같다. ESC는 열린 창 중 번호가 가장 큰 맨 위 창만 처리한다.
 */
let nextDialogOrder = 0;
const openDialogOrders = new Set<number>();

export function Dialog({ title, size = "md", onClose, wf, role = "dialog", describedBy, tall = false, children }: DialogProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [order] = useState(() => {
    nextDialogOrder += 1;
    return nextDialogOrder;
  });
  // 키 처리기는 한 번만 등록하고 최신 `onClose`는 ref로 읽는다. 부모가 매 렌더 새 함수를 넘겨도 처리기를 다시 달지 않는다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    openDialogOrders.add(order);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (order !== Math.max(...openDialogOrders)) return;
      onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      openDialogOrders.delete(order);
    };
  }, [order]);

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
        role={role}
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        data-wf={wf}
        tabIndex={-1}
        // 06 폼처럼 내용이 긴 팝업이 짧은 창에서 잘려 보이지 않도록 화면 높이를 넘으면 카드 안에서 스크롤한다.
        className={`dialog-card-max relative flex min-h-0 w-full flex-col gap-4 overflow-y-auto rounded-card border border-border-strong bg-card p-6 ${SIZE_CLASSES[size]} ${tall ? "dialog-form-height" : ""}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface DialogHeaderProps {
  title: string;
  /** 제목 아래 부제(aux muted). 고정폭 글자가 섞이면 노드로 넘긴다. */
  subtitle?: ReactNode;
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
  /** 화면 원본의 `data-wf` 영역 이름(`05L-4` 등). */
  wf?: string;
  /** 도움말·이유 줄. 왼쪽에 둔다. */
  note?: ReactNode;
  /** 버튼들. 오른쪽 정렬, 확정 동작이 오른쪽 끝. */
  children: ReactNode;
}

export function DialogFooter({ note, wf, children }: DialogFooterProps) {
  return (
    <div data-wf={wf} className="flex flex-none flex-wrap items-center justify-end gap-2">
      {note === undefined ? null : <span className="mr-auto text-aux text-text-muted">{note}</span>}
      {children}
    </div>
  );
}
