/**
 * ADR-14: `?dialog=` 쿼리 파라미터로 대화상자를 연다(대화상자 UI 자체는 각 담당 태스크에서 만든다).
 * 기존 쿼리는 보존한다(T-014 `EmptyWorkflowCard`의 패턴을 공용 훅으로 뽑았다).
 */
import { useLocation, useNavigate } from "react-router-dom";

export function useDialogNavigate(): (params: Record<string, string>) => void {
  const navigate = useNavigate();
  const location = useLocation();

  return function openDialog(params: Record<string, string>) {
    const search = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(params)) {
      search.set(key, value);
    }
    navigate({ pathname: location.pathname, search: `?${search.toString()}` });
  };
}
