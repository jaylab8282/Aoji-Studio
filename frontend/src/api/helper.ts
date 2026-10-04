/**
 * 열기 도우미 호출 (FR-013, api-spec.yaml `/health`·`/open`, architecture.md ADR-11·ADR-12).
 * 브라우저가 맥북 호스트의 도우미(`config.helperUrl`)를 **직접** 호출하는 유일한 모듈이다
 * (conventions.md §3 Frontend MUST: "도우미 호출은 `api/helper.ts`만").
 *
 * 계약에서 움직이지 않는 것:
 * - 보내는 값은 `target`과 (lead일 때) `leadName`뿐이다. 경로·명령·옵션은 보내지 않는다(FR-013-AC6).
 * - 도우미 토큰은 서버(`GET /api/helper/token`, `client.ts` 경유)로만 받고 헤더로만 보낸다(FR-013-AC8).
 * - 응답을 2초 넘게 기다리지 않는다(FR-013-AC9·AC10). 타임아웃·연결 실패는 모두 `no-response`다.
 *
 * 도우미는 터미널 프로세스를 `spawn`한 시점에 204를 돌려준다(종료 코드를 기다리지 않는다 — macOS
 * 자동화 권한 대화상자가 떠 있는 동안 응답이 매달려 2초를 넘기면 "미설치"라는 사실과 다른 안내가
 * 뜨기 때문이다, T-020 확정). 그래서 이 모듈은 204(=`res.ok`)를 그대로 성공으로 본다.
 */
import { ApiError, apiGet } from "./client";
import { UNKNOWN_ERROR_MESSAGE } from "../lib/text";

/** FR-013-AC9·AC10이 값까지 확정한 대기 한도. */
export const HELPER_TIMEOUT_MS = 2000;

/** api-spec.yaml `securitySchemes.helperToken`. */
export const LEGACY_HELPER_TOKEN_HEADER = "X-JayStudio-Helper-Token"; // LEGACY v1.0.x (ADR-57): 값 불변, 새 도우미는 두 헤더 수용

/** `POST /open` 본문. 이 두 모양 밖의 키를 만들지 않는다(FR-013-AC6). */
export type HelperOpenRequest = { target: "default" } | { target: "lead"; leadName: string };

/**
 * 호출 결과. 화면 문구는 화면 쪽(`lib/text.ts`)이 정하고, 이 모듈은 어떤 갈래인지만 알린다.
 * - `opened`: 204. 터미널 실행을 도우미가 받았다.
 * - `no-response`: 도우미가 없거나 2초 안에 응답하지 않음(토큰 파일 없음 포함) → 미설치 안내(FR-013-AC9·E1).
 * - `auth-failed`: 도우미가 403으로 거부(Origin·토큰) → FR-013-E2 확정 문구.
 * - `message`: 도우미(400·415·500)나 서버가 준 사유를 그대로 표시한다(FR-013-E3, conventions.md §4 MUST).
 */
export type HelperOpenResult =
  | { kind: "opened" }
  | { kind: "no-response" }
  | { kind: "auth-failed" }
  | { kind: "message"; message: string };

/** `GET /api/helper/token` 결과. 토큰 파일이 없으면 `token: null`이 온다(api-spec.yaml). */
export type HelperTokenResult =
  | { kind: "token"; token: string }
  | { kind: "no-token" }
  | { kind: "error"; message: string };

/**
 * 2초 안에 응답이 오지 않거나 연결이 실패하면 `null`. `AbortSignal.timeout`이 아니라
 * `AbortController` + `setTimeout`으로 만든다 — 단위 테스트가 가짜 타이머로 2초 경계를 밀 수 있다.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HELPER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 도우미 응답 본문의 `message`만 꺼낸다. 없거나 형식이 깨졌으면 공통 문구(conventions.md §4 MUST). */
async function helperMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === "string" && message !== "") return message;
    }
  } catch {
    // 아래 공통 문구로 떨어진다.
  }
  return UNKNOWN_ERROR_MESSAGE;
}

/**
 * `GET /api/helper/token` (FR-013-AC8). 서버 호출이므로 `client.ts`를 지난다.
 * api-spec.yaml이 이 GET에 `security: browserToken`을 명시했고 서버(`HelperTokenController`)가
 * 헤더를 직접 검사하므로, 브라우저 토큰 헤더를 붙여 보낸다(GET 기본값은 미첨부다).
 */
export async function getHelperToken(): Promise<HelperTokenResult> {
  try {
    const body = await apiGet<{ token: string | null }>("/api/helper/token", {
      withBrowserToken: true,
    });
    return body.token === null ? { kind: "no-token" } : { kind: "token", token: body.token };
  } catch (error) {
    // client.ts가 모든 예외를 `ApiError`로 정규화한다. 서버가 준 message를 가공 없이 넘긴다.
    return {
      kind: "error",
      message: error instanceof ApiError ? error.message : UNKNOWN_ERROR_MESSAGE,
    };
  }
}

/**
 * 도우미 `GET /health` (FR-013-AC10). Origin 검사만 하므로 토큰을 보내지 않는다.
 * 2초 안에 응답이 오면 설치된 것으로 본다. 본문 형식까지 따지지 않는다 — "미설치"라고 단정하는
 * 조건은 좁게 둔다(사실과 다른 안내를 띄우지 않기 위해, FR-013-AC9).
 */
export async function checkHelperHealth(helperUrl: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${helperUrl}/health`, { method: "GET" });
  return res !== null && res.ok;
}

/**
 * 도우미 `POST /open` (FR-013-AC6). 토큰을 먼저 받고(없으면 호출하지 않는다) 본문에는
 * `target`(+`leadName`)만 담는다.
 */
export async function openHelperSession(
  helperUrl: string,
  request: HelperOpenRequest,
): Promise<HelperOpenResult> {
  const token = await getHelperToken();
  // 토큰 파일은 도우미가 첫 실행 때 만든다(architecture.md §6.3). 없으면 도우미가 없는 것이므로
  // 호출하지 않고 미설치 안내로 보낸다(FR-013-AC9).
  if (token.kind === "no-token") return { kind: "no-response" };
  if (token.kind === "error") return { kind: "message", message: token.message };

  const res = await fetchWithTimeout(`${helperUrl}/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [LEGACY_HELPER_TOKEN_HEADER]: token.token,
    },
    body: JSON.stringify(request),
  });

  if (res === null) return { kind: "no-response" };
  if (res.ok) return { kind: "opened" };
  if (res.status === 403) return { kind: "auth-failed" };
  return { kind: "message", message: await helperMessage(res) };
}
