/**
 * api-spec.yaml 계약대로 fetch를 감싼 유일한 진입점(conventions.md §3 Frontend MUST).
 * - 브라우저 토큰은 모듈 메모리에만 둔다(localStorage·sessionStorage·cookie 금지, architecture.md §5 ADR-01).
 * - 403 UNAUTHORIZED_TOKEN은 토큰 재발급 후 1회만 자동 재시도한다(conventions.md §4).
 * - 에러 응답은 항상 `ApiError`로 변환해 던진다.
 */
import type { ApiErrorBody, ApiErrorCode } from "./types";

const NETWORK_ERROR_MESSAGE = "서버에 연결할 수 없습니다 · 다시 시도하세요";
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

// 브라우저 토큰은 메모리 모듈 변수에만 저장한다. 절대 storage류에 쓰지 않는다.
let cachedBrowserToken: string | null = null;
let tokenFetchPromise: Promise<string> | null = null;

async function fetchBrowserToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/auth/browser-token", { method: "GET" });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: NETWORK_ERROR_MESSAGE });
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  const body = (await res.json()) as { token: string };
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
    return new ApiError({ code: "NETWORK_ERROR", message: NETWORK_ERROR_MESSAGE });
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};
  let requestBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  if (method !== "GET") {
    headers[BROWSER_TOKEN_HEADER] = await getBrowserToken();
  }

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: requestBody });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: NETWORK_ERROR_MESSAGE });
  }

  if (res.status === 403 && !isRetry) {
    const error = await toApiError(res);
    if (error.code === "UNAUTHORIZED_TOKEN") {
      await getBrowserToken(true);
      return request<T>(method, path, body, true);
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

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
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
