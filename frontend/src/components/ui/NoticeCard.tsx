/**
 * ui-spec.md §공통 NoticeCard (04-1·04-5·04-7·05-R 빈 상태·03 없음, `_base.css:118-125`).
 * 가운데 정렬 카드(위아래 32·좌우 24, 간격 8): `lg` 아이콘 → 제목(`font/section` 600) → 본문(`text-muted`, 최대 56ch) → 버튼 줄.
 * 종류: `empty`(점선 `border-dashed`) / `error`(`border-danger-border`, 제목·아이콘 `danger`, `role="alert"`).
 * 문구는 호출부가 `lib/text.ts` 상수로 넘긴다.
 */
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type NoticeKind = "empty" | "error";

interface NoticeCardProps {
  kind: NoticeKind;
  icon: IconName;
  title: string;
  /** 본문(여러 줄이면 `<p>`를 여러 개 넘긴다). */
  children?: ReactNode;
  /** 버튼 줄. */
  actions?: ReactNode;
  /** 화면 원본의 `data-wf` 영역 이름(`04-5-1`·`04-7-1` 등). */
  wf?: string;
}

export function NoticeCard({ kind, icon, title, children, actions, wf }: NoticeCardProps) {
  const isError = kind === "error";
  return (
    <section
      role={isError ? "alert" : undefined}
      data-kind={kind}
      data-wf={wf}
      className={`grid min-w-0 justify-items-center gap-2 rounded-card border bg-card px-6 py-8 text-center ${
        isError ? "border-danger-border" : "border-dashed border-border-dashed"
      }`}
    >
      <Icon name={icon} size="lg" className={isError ? "text-danger" : "text-text-muted"} />
      <h2 className={`text-section font-semibold ${isError ? "text-danger" : "text-text"}`}>{title}</h2>
      {children === undefined ? null : <div className="notice-body grid gap-2 text-text-muted">{children}</div>}
      {actions === undefined ? null : <div className="mt-2 flex gap-2">{actions}</div>}
    </section>
  );
}
