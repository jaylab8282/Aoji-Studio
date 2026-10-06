/**
 * `Alert` 블록형이 서버 `message`를 첫 문장과 나머지로 나누는 순수 함수(ADR-73).
 * 첫 `". "`까지(마침표 포함)가 앞 조각, 나머지(공백부터)가 뒤 조각이다 — 이어 붙이면 원문 글자와 같다.
 */
const SENTENCE_END = ". ";

export function splitFirstSentence(message: string): { lead: string; rest: string } {
  const index = message.indexOf(SENTENCE_END);
  if (index < 0) return { lead: message, rest: "" };
  const cut = index + 1;
  return { lead: message.slice(0, cut), rest: message.slice(cut) };
}
