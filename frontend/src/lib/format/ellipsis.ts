/**
 * 12자 넘는 이름을 말줄임한다(ui-rules.md 4, FR-006-AC4). 전체 텍스트는 호출부에서
 * `Tooltip`(`title`) 등으로 따로 보여준다. 순수 함수.
 */
const DEFAULT_MAX_LENGTH = 12;

export function ellipsis(text: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
