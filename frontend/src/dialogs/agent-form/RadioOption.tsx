/**
 * 06 폼 전용 라디오 한 칸(`역할`, `사용 도구` 방식). 06 말고는 라디오를 쓰는 화면이 없어
 * 공통 컴포넌트로 올리지 않는다.
 *
 * 비활성 이유는 ADR-35가 지정한 지점(`팀장` 라디오의 `이미 팀장이 있습니다 (<lead>)`)에만 넘긴다.
 * 소속이 `(없음)`이라 라디오 전체가 비활성인 경우처럼 지정이 없는 비활성에는 이유를 붙이지 않는다.
 */
interface RadioOptionProps {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** ADR-35가 지정한 지점에서만 넘긴다. */
  disabledReason?: string;
  onSelect: () => void;
}

export function RadioOption({ name, label, checked, disabled = false, disabledReason, onSelect }: RadioOptionProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <label className={`inline-flex items-center gap-1.5 text-body ${disabled ? "text-text-faint" : "text-text"}`}>
        <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} />
        {label}
      </label>
      {disabledReason ? <span className="text-aux text-text-faint">{disabledReason}</span> : null}
    </span>
  );
}
