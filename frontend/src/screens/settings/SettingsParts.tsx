/**
 * ui-spec.md SCR-07 카드 공통 조각 (`docs/ui/screens/07-settings.html` `.c7`·`.kv7`·`.acts`).
 * 카드 껍데기(제목 줄 + 칩), 값 표 행(라벨 132 + 값, 로딩 중 스켈레톤), 고정폭 글자, 아래 줄(보조 글 + 버튼).
 * 로딩 중에는 값 자리에 `0`이나 빈 문구를 먼저 보여주지 않는다(ui-rules 5).
 */
import type { ReactNode } from "react";
import { Chip } from "../../components/ui/Chip";
import { Skeleton } from "../../components/ui/Skeleton";

interface SettingsCardProps {
  title: string;
  /** 화면 원본의 `data-wf` 영역 이름(`07-3`·`07-4`·`07-5`). */
  wf: string;
  /** 제목 옆 중립 칩(프로젝트 폴더 `읽기 전용`). */
  badge?: string;
  children: ReactNode;
}

export function SettingsCard({ title, wf, badge, children }: SettingsCardProps) {
  return (
    <section aria-label={title} data-wf={wf} className="grid min-w-0 gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <h2 className="text-section font-semibold text-text">{title}</h2>
        {badge === undefined ? null : <Chip>{badge}</Chip>}
      </div>
      {children}
    </section>
  );
}

/** 값 표 `<dl>`. */
export function KvTable({ children }: { children: ReactNode }) {
  return <dl className="kv7-grid">{children}</dl>;
}

interface KvRowProps {
  label: string;
  /** 값이 여러 조각(경로 + 설명)으로 나뉘는 행을 테스트가 한 덩어리로 읽기 위한 표식. */
  testId: string;
  loading?: boolean;
  children?: ReactNode;
}

export function KvRow({ label, testId, loading = false, children }: KvRowProps) {
  return (
    <>
      <dt className="pt-0.5 text-aux text-text-muted">{label}</dt>
      <dd data-testid={testId} className="min-w-0 text-text-secondary">
        {loading ? <Skeleton className="h-4 w-48" aria-label={`${label} 로딩 중`} /> : children}
      </dd>
    </>
  );
}

/** 고정폭 값(`.mono`). */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-text-mono">{children}</span>;
}

/** 카드 아래 줄: 위 구분선 + 보조 글과 버튼. */
export function CardActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">{children}</div>;
}

/** 아래 줄의 보조 글(`.reason`). */
export function Reason({ children }: { children: ReactNode }) {
  return <span className="min-w-reason-min flex-1 text-aux text-text-muted">{children}</span>;
}
