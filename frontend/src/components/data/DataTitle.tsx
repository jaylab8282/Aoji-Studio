/**
 * ui-spec.md §공통 `DataTitle`(`ttl`, 08·09·10): 제목 `font/title` 700 + 보조 글자(`text-muted`, 위 4) / 오른쪽 `ctl` 묶음
 * (기간 선택·동작, 줄바꿈 허용). 아래 정렬. `docs/ui/screens/_base.css` `.ttl`.
 * `subtitle`은 고정폭 글자가 섞이면 노드로 넘긴다. 오른쪽 묶음(`children`)이 없으면 그리지 않는다.
 */
import type { ReactNode } from "react";

interface DataTitleProps {
  title: string;
  subtitle?: ReactNode;
  /** 화면 원본의 `data-wf` 영역 이름(`08-2` 등). */
  wf?: string;
  /** 오른쪽 `ctl` 묶음(기간 선택·동작 버튼). */
  children?: ReactNode;
}

export function DataTitle({ title, subtitle, wf, children }: DataTitleProps) {
  return (
    <section data-wf={wf} className="flex flex-none flex-wrap items-end gap-3">
      <div className="ttl-grow">
        <h2 className="text-title font-bold tracking-title text-text">{title}</h2>
        {subtitle === undefined ? null : <p className="mt-1 text-text-muted">{subtitle}</p>}
      </div>
      {children === undefined ? null : (
        <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">{children}</div>
      )}
    </section>
  );
}
