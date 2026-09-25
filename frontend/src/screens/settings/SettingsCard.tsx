/**
 * ui-spec.md SCR-07 카드 껍데기(와이어프레임 p.4의 카드 3개 공통).
 * 제목 줄 오른쪽에 배지(카드 1 `읽기 전용`)를 둘 수 있다.
 */
import type { ReactNode } from "react";

interface SettingsCardProps {
  title: string;
  badge?: string;
  children: ReactNode;
}

export function SettingsCard({ title, badge, children }: SettingsCardProps) {
  return (
    <section className="rounded-card border border-border bg-card p-card-lg flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-section font-semibold text-text">{title}</h2>
        {badge === undefined ? null : (
          <span className="rounded-badge bg-soft px-2 py-0.5 text-aux text-text-muted">{badge}</span>
        )}
      </div>
      {children}
    </section>
  );
}
