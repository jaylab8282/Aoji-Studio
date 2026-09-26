/**
 * api-spec.yaml 계약대로 fetch를 감싼 유일한 진입점(conventions.md §3 Frontend MUST).
 * - 브라우저 토큰은 모듈 메모리에만 둔다(localStorage·sessionStorage·cookie 금지, architecture.md §5 ADR-01).
 * - 403 UNAUTHORIZED_TOKEN은 토큰 재발급 후 1회만 자동 재시도한다(conventions.md §4).
 * - 이 모듈이 던지는 오류는 예외 없이 `ApiError`다. 에러 응답뿐 아니라 네트워크 예외·형식이 깨진
 *   응답 본문도 `NETWORK_ERROR` + conventions.md §4 MUST 문구로 정규화하므로, 호출부는 `String(error)`
 *   같은 내부 표현을 화면에 올리지 않는다.
 */
import { UNKNOWN_ERROR_MESSAGE } from "../lib/text";
import type { ApiErrorBody, ApiErrorCode } from "./types";

const BROWSER_TOKEN_HEADER = "X-JayStudio-Browser-Token";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.fields = body.fields;
    this.details = body.details;
  }
}

/**
 * conventions.md §4 MUST: 화면에 오르는 오류는 언제나 `ApiError`다.
 * `ApiError`가 아닌 모든 예외(fetch 실패, JSON 파싱 실패, 그 밖의 런타임 오류)는
 * 내부 표현을 노출하지 않도록 `NETWORK_ERROR` + 공통 문구로 바꾼다.
 */
function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({ code: "NETWORK_ERROR", message: UNKNOWN_ERROR_MESSAGE });
}

// 브라우저 토큰은 메모리 모듈 변수에만 저장한다. 절대 storage류에 쓰지 않는다.
let cachedBrowserToken: string | null = null;
let tokenFetchPromise: Promise<string> | null = null;

async function fetchBrowserToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/auth/browser-token", { method: "GET" });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: UNKNOWN_ERROR_MESSAGE });
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  let body: { token: string };
  try {
    body = (await res.json()) as { token: string };
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: UNKNOWN_ERROR_MESSAGE });
  }
  cachedBrowserToken = body.token;
  return body.token;
}

/** 캐시된 토큰이 있으면 그대로, 없으면 발급받는다. `forceRefresh`면 새로 받는다. */
export async function getBrowserToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedBrowserToken) {
    return cachedBrowserToken;
  }
  if (!forceRefresh && tokenFetchPromise) {
    return tokenFetchPromise;
  }
  const promise = fetchBrowserToken();
  tokenFetchPromise = promise;
  try {
    return await promise;
  } catch (error) {
    throw normalizeError(error);
  } finally {
    if (tokenFetchPromise === promise) {
      tokenFetchPromise = null;
    }
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(body);
  } catch {
    return new ApiError({ code: "NETWORK_ERROR", message: UNKNOWN_ERROR_MESSAGE });
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
  /**
   * GET인데도 브라우저 토큰 헤더를 붙인다.
   * 변경 메서드에만 토큰을 요구하는 것이 기본 규칙이지만(architecture.md §5), api-spec.yaml이
   * `security: browserToken`을 명시한 GET 엔드포인트가 하나 있다 — `GET /api/helper/token`
   * (도우미 토큰은 브라우저 토큰을 통과한 요청에만 전달한다, FR-013-AC8). 그 한 곳만 켠다.
   */
  withBrowserToken?: boolean;
}

async function sendRequest<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  let requestBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  if (method !== "GET" || options.withBrowserToken === true) {
    headers[BROWSER_TOKEN_HEADER] = await getBrowserToken();
  }

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: requestBody });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: UNKNOWN_ERROR_MESSAGE });
  }

  if (res.status === 403 && !isRetry) {
    const error = await toApiError(res);
    if (error.code === "UNAUTHORIZED_TOKEN") {
      await getBrowserToken(true);
      return sendRequest<T>(method, path, body, options, true);
    }
    throw error;
  }

  if (!res.ok) {
    throw await toApiError(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** 모든 공개 호출의 단일 출구. 어떤 예외가 나와도 `ApiError`만 밖으로 나간다. */
async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await sendRequest<T>(method, path, body, options);
  } catch (error) {
    throw normalizeError(error);
  }
}

export function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}
