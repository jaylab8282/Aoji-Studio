/**
 * 06 수정 모드에서 정의 파일을 읽는 동안의 필드 스켈레톤(ui-spec.md SCR-06 제목 행 `로딩` 열).
 * 06 폼은 스냅샷이 아니라 자체 API 호출(`GET /api/agents/{name}`)로 채워지므로
 * 공통 스켈레톤(ADR-32)의 예외 목록에 있는 자체 스켈레톤이다.
 */
import { Skeleton } from "../../components/ui/Skeleton";

const FIELD_ROWS = 5;

export function AgentFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="agent-form-skeleton">
      {Array.from({ length: FIELD_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-btn-sm w-full" />
      ))}
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
