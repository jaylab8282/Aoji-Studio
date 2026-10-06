/**
 * ui-spec.md §공통 Alert (05-L·05-R·05-3·06, `_base.css:127`, ADR-73): `border-danger-border bg-danger-soft rounded-card`
 * aux 600 `danger`, `circle-alert`, `role="alert"`.
 * 블록형(`block`)은 아이콘이 위 정렬이고 `message`의 첫 문장(첫 `". "`까지)을 굵게 `danger`, 나머지를 `text-text` 400
 * 다음 줄에 그린다. 분할은 스타일일 뿐이다 — 두 조각을 이어 붙이면 서버 `message`와 글자가 같다.
 */
import { Icon } from "./Icon";
import { splitFirstSentence } from "../../lib/derive/splitFirstSentence";

interface AlertProps {
  message: string;
  /** 블록형(여러 줄 사유). 기본은 한 줄형. */
  block?: boolean;
}

export function Alert({ message, block = false }: AlertProps) {
  const { lead, rest } = block ? splitFirstSentence(message) : { lead: message, rest: "" };
  return (
    <div
      role="alert"
      className={`flex gap-2 rounded-card border border-danger-border bg-danger-soft px-3 py-2 text-aux font-semibold text-danger ${
        block ? "items-start" : "items-center"
      }`}
    >
      <Icon name="circle-alert" className={block ? "mt-0.5" : undefined} />
      <span className="min-w-0">
        <b data-part="lead" className="font-semibold">{lead}</b>
        {rest === "" ? null : (
          <span data-part="rest" className="mt-0.5 block font-normal text-text">
            {rest}
          </span>
        )}
      </span>
    </div>
  );
}
