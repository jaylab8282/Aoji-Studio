/**
 * 진입 주소 정규화 (ADR-41, architecture.md §5 / conventions.md §3 Frontend MUST).
 *
 * 확정 진입 주소는 `127.0.0.1:<포트>` 하나다. `http://localhost:<포트>`·`http://[::1]:<포트>`로 앱을
 * 열면 정적 파일과 같은 출처 GET은 통과하지만(`Origin` 헤더 없음 → `Sec-Fetch-Site`) POST·PUT·DELETE와
 * 도우미 호출은 `Origin: http://localhost:<포트>`를 보내 403 `FORBIDDEN_ORIGIN`이 된다 —
 * "조회는 되는데 쓰기만 실패"하는 함정이다. 허용 목록을 넓히지 않고(FR-013-AC7이 도우미 허용 Origin
 * 기본값을 값까지 확정했다) 프론트가 첫 렌더·첫 API 호출 전에 진입 주소를 정규화해 막는다.
 *
 * 규칙: 호스트명만 바꾼다. 스킴·포트·경로·쿼리·해시는 그대로 둔다. 서버가 알려주는 공개 주소와 비교해
 * 이동시키지 않는다(포트가 다른 배치에서 잘못된 주소로 튕길 수 있다). 와일드카드 바인딩 주소는
 * 정규화 대상에 넣지 않는다(conventions.md §6 MUST).
 */

/** 정규화 결과 호스트명. */
export const CANONICAL_HOSTNAME = "127.0.0.1";

/**
 * 정규화 대상 루프백 호스트명 별칭(`localhost`, IPv6 루프백).
 * `URL.hostname`·`location.hostname`은 IPv6를 대괄호째 돌려주므로 대괄호까지 포함해 판정한다.
 * 문자열 리터럴 대신 정규식으로 둔다 — 대괄호가 든 리터럴은 ADR-33 자리표시 검사에 걸린다.
 */
const LOOPBACK_ALIAS = /^(?:localhost|\[::1\])$/;

/**
 * `href`가 `http:` + 루프백 별칭 호스트명이면 호스트명만 `127.0.0.1`로 바꾼 href를,
 * 그 밖이면 `null`(이동 없음)을 돌려준다.
 *
 * 정규화 결과를 다시 넣으면 호스트명이 `127.0.0.1`이라 `null`이 되므로 리다이렉트 루프가 없다.
 */
export function canonicalHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") {
    return null;
  }
  if (!LOOPBACK_ALIAS.test(url.hostname)) {
    return null;
  }
  url.hostname = CANONICAL_HOSTNAME;
  return url.href;
}

/**
 * `redirectToCanonical`이 받는 최소 형태. 실제 `window.location`이 그대로 들어가고,
 * 단위 테스트는 가짜 객체를 넣는다(ADR-41 구현 기준).
 */
export interface CanonicalizableLocation {
  readonly href: string;
  replace(url: string): void;
}

/**
 * 진입 주소가 정규화 대상이면 같은 경로의 `127.0.0.1` 주소로 `replace`하고 `true`를,
 * 아니면 아무것도 하지 않고 `false`를 돌려준다. `true`면 호출부는 화면을 그리지 않는다.
 */
export function redirectToCanonical(loc: CanonicalizableLocation): boolean {
  const next = canonicalHref(loc.href);
  if (next === null) {
    return false;
  }
  loc.replace(next);
  return true;
}
