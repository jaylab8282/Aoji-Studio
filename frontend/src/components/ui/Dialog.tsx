/**
 * ui-spec.md §공통 Dialog(05·06): 가운데 모달, 배경 dim, `bg-card` 12px, ESC·`취소`로 닫기.
 */
import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * `lg`는 목록 표가 들어가는 팝업(05-R)용 폭이다. 기본값 `md`는 05-L·05-3처럼 입력 한두 개짜리 팝업.
 * 와이어프레임 p.6도 왼쪽 입력 팝업보다 오른쪽 가져오기 팝업을 넓게 그린다.
 */
type DialogSize = "md" | "lg";

const SIZE_CLASSES: Record<DialogSize, string> = {
  md: "max-w-md",
  lg: "max-w-3xl",
};

interface DialogProps {
  title: string;
  size?: DialogSize;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ title, size = "md", onClose, children }: DialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-page/80"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 폭은 `size` 두 단계뿐이다(ADR-40). 높이는 지정하지 않지만, 06 폼처럼 내용이 긴 팝업이
        // 짧은 창에서 잘려 보이지 않는 일이 없도록 화면 높이를 넘으면 팝업 안에서 스크롤한다
        // (docs/ui/README.md: 요소 가림은 결함). Tailwind 기본 스케일 클래스만 쓴다.
        className={`w-full ${SIZE_CLASSES[size]} max-h-screen overflow-y-auto rounded-card bg-card p-card-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
