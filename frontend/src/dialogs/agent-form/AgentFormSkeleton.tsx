/**
 * 06 수정 모드에서 정의 파일을 읽는 동안의 필드 스켈레톤(ui-spec.md SCR-06 제목 행 `로딩` 열).
 * 06 폼은 스냅샷이 아니라 자체 API 호출(`GET /api/agents/{name}`)로 채워지므로 자체 스켈레톤이다(ADR-32 예외).
 */
import { Skeleton } from "../../components/ui/Skeleton";

const FIELD_ROWS = 5;

export function AgentFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="agent-form-skeleton" aria-busy="true">
      {Array.from({ length: FIELD_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-control w-full" decorative />
      ))}
      <Skeleton className="h-24 w-full" decorative />
    </div>
  );
}
