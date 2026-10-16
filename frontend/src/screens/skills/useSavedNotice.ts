/**
 * 08 안내 줄 ① (ui-spec SCR-08, FR-020-AC5): 08-1 저장·08-2 가져오기 성공 직후 `SKILL_SAVED_NOTICE`를 8000ms 보인다.
 * 신호는 `skillsViewStore.savedTick`이다. 화면을 다시 열 때 이미 지나간 신호로는 띄우지 않는다.
 */
import { useEffect, useState } from "react";
import { useSkillsViewStore } from "../../state/skillsViewStore";

/** FR-020-AC5: 저장 후 안내 줄 ①이 보이는 시간. */
export const SAVED_NOTICE_MS = 8000;

export function useSavedNotice(): boolean {
  const { savedTick } = useSkillsViewStore();
  const [seenTick, setSeenTick] = useState(savedTick);
  const [visibleTick, setVisibleTick] = useState<number | null>(null);

  // 렌더 중 상태 맞춤: 새 신호가 오면 그 신호로 안내를 켠다(effect에서 동기 setState를 하지 않는다).
  if (savedTick !== seenTick) {
    setSeenTick(savedTick);
    setVisibleTick(savedTick);
  }

  useEffect(() => {
    if (visibleTick === null) return undefined;
    const timer = setTimeout(() => setVisibleTick(null), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [visibleTick]);

  return visibleTick !== null;
}
