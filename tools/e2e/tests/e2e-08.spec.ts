// E2E-08 다른 Origin 차단 (architecture.md §8.2 E2E-08·§5 Origin 규칙, tasks.md T-024 DoD "다른 Origin 차단").
// 실제 컨테이너·실제 정적 페이지 서버(4192)로만 검증한다. page.route 가로채기 없음(conventions.md §8).
import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";

/** 차단되어야 하는 워크플로우 추가 시도 이름(파일이 만들어지지 않았는지 확인하는 데 쓴다). */
const BLOCKED_WORKFLOW_NAME = "다른출처차단시도";

type CrossOriginFetchResult =
  | { kind: "response"; status: number; code: string | null }
  | { kind: "blocked-by-browser"; message: string };

type EventSourceResult =
  | { kind: "error"; readyState: number; messageCount: number; opened: boolean }
  | { kind: "open" }
  | { kind: "message" }
  | { kind: "timeout" };

test("[FR-003-AC1][FR-003-AC2][E2E-08] 다른 Origin 페이지의 POST /api/workflows → 403 FORBIDDEN_ORIGIN 또는 브라우저 CORS 차단, 워크플로우는 만들어지지 않는다", async ({
  page,
}) => {
  const state = readE2eState();
  const workflowsUrl = `${state.baseUrl}/api/workflows`;

  await page.goto(state.otherOriginUrl);
  await expect(page.getByTestId("other-origin-page")).toBeVisible();

  const observedStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.url() === workflowsUrl) {
      observedStatuses.push(response.status());
    }
  });

  const result: CrossOriginFetchResult = await page.evaluate(
    async ({ url, name }) => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: "" }),
        });
        let code: string | null = null;
        try {
          const body = (await response.json()) as { code?: string };
          code = body.code ?? null;
        } catch {
          code = null;
        }
        return { kind: "response" as const, status: response.status, code };
      } catch (error) {
        return { kind: "blocked-by-browser" as const, message: String(error) };
      }
    },
    { url: workflowsUrl, name: BLOCKED_WORKFLOW_NAME },
  );

  // 무엇으로 차단을 확인했는지 구분해 단언하고, 판정 근거를 보고서에 남긴다.
  const blockPath = `${result.kind} / 브라우저가 관측한 ${workflowsUrl} 응답 상태: ${
    observedStatuses.length === 0 ? "없음(요청 자체가 보내지지 않음)" : observedStatuses.join(",")
  }`;
  test.info().annotations.push({ type: "E2E-08 차단 근거", description: blockPath });
  // 배치 요약(run-e2e.sh)에도 한 줄 남긴다 — 어느 경로로 막혔는지가 바뀌면 회귀 원인 추적이 빨라진다
  // (T-024 리뷰 Suggestion. `response` = 서버 403, `blocked-by-browser` = 브라우저 CORS 차단).
  process.stdout.write(`[E2E-08 차단 경로] ${blockPath}\n`);

  if (result.kind === "response") {
    // 응답을 읽을 수 있었다면 403 FORBIDDEN_ORIGIN이어야 한다(architecture.md §5).
    expect(result.status).toBe(403);
    expect(result.code).toBe("FORBIDDEN_ORIGIN");
  } else {
    // 브라우저가 CORS로 막아 응답을 읽지 못한 경우(운영 프로필은 CORS 헤더를 내지 않는다).
    expect(result.message).toContain("Failed to fetch");
    expect(observedStatuses).not.toContain(201);
  }

  // 어느 경로로 막혔든 파일 부작용이 없어야 한다(fail-closed). 같은 출처 화면에서 스냅샷을 확인한다.
  await page.goto(`${state.baseUrl}/`);
  const snapshot = await page.evaluate(async () => {
    const response = await fetch("/api/state");
    return {
      status: response.status,
      workflowNames: ((await response.json()) as { registry: { workflows: { name: string }[] } })
        .registry.workflows.map((workflow) => workflow.name),
    };
  });
  expect(snapshot.status).toBe(200);
  expect(snapshot.workflowNames).not.toContain(BLOCKED_WORKFLOW_NAME);
});

test("[FR-003-AC1][FR-003-AC2][E2E-08] 허용 목록에 없는 Origin 헤더를 붙인 POST /api/workflows → 403 FORBIDDEN_ORIGIN", async ({
  request,
}) => {
  const state = readE2eState();

  const response = await request.post(`${state.baseUrl}/api/workflows`, {
    headers: { "Content-Type": "application/json", Origin: state.otherOriginUrl },
    data: { name: `${BLOCKED_WORKFLOW_NAME}2`, description: "" },
  });

  expect(response.status()).toBe(403);
  expect((await response.json()) as { code: string }).toMatchObject({ code: "FORBIDDEN_ORIGIN" });
});

test("[FR-003-AC1][FR-003-AC2][E2E-08] 다른 Origin 페이지의 EventSource(/api/stream) → error 이벤트, 메시지 0건", async ({
  page,
}) => {
  const state = readE2eState();

  await page.goto(state.otherOriginUrl);
  await expect(page.getByTestId("other-origin-page")).toBeVisible();

  const result: EventSourceResult = await page.evaluate((streamUrl) => {
    return new Promise<EventSourceResult>((resolvePromise) => {
      let messageCount = 0;
      let opened = false;
      const source = new EventSource(streamUrl);
      const timer = window.setTimeout(() => {
        source.close();
        resolvePromise({ kind: "timeout" });
      }, 10_000);
      const finish = (value: EventSourceResult) => {
        window.clearTimeout(timer);
        source.close();
        resolvePromise(value);
      };
      source.addEventListener("open", () => {
        opened = true;
        finish({ kind: "open" });
      });
      source.addEventListener("message", () => {
        messageCount += 1;
        finish({ kind: "message" });
      });
      source.addEventListener("error", () => {
        finish({ kind: "error", readyState: source.readyState, messageCount, opened });
      });
    });
  }, `${state.baseUrl}/api/stream?token=e2e-08-no-browser-token`);

  expect(result.kind).toBe("error");
  if (result.kind === "error") {
    expect(result.opened).toBe(false);
    expect(result.messageCount).toBe(0);
    // error 직후 EventSource는 CONNECTING(0) 또는 CLOSED(2)이며 OPEN(1)이 아니다.
    expect(result.readyState).not.toBe(1);
  }
});

test("[FR-003-AC2][E2E-08] 토큰 없는·틀린 POST /hooks/events → 401 빈 본문, 이벤트는 저장되지 않는다", async ({
  page,
  request,
}) => {
  const state = readE2eState();
  const rejectedSessionId = `e2e-08-rejected-${Date.now()}`;
  const payload = {
    session_id: rejectedSessionId,
    cwd: state.fixtureDir,
    hook_event_name: "SessionStart",
    permission_mode: "default",
  };

  const noToken = await request.post(`${state.baseUrl}/hooks/events`, {
    headers: { "Content-Type": "application/json" },
    data: payload,
  });
  expect(noToken.status()).toBe(401);
  expect(await noToken.text()).toBe("");

  const wrongToken = await request.post(`${state.baseUrl}/hooks/events`, {
    headers: { "Content-Type": "application/json", "X-JayStudio-Collect-Token": "f".repeat(64) },
    data: payload,
  });
  expect(wrongToken.status()).toBe(401);
  expect(await wrongToken.text()).toBe("");

  // 저장되지 않았는지 확인한다(같은 출처 화면에서 스냅샷 조회).
  await page.goto(`${state.baseUrl}/`);
  const sessionIds = await page.evaluate(async () => {
    const response = await fetch("/api/state");
    return ((await response.json()) as { recentEvents: { sessionId: string }[] }).recentEvents.map(
      (row) => row.sessionId,
    );
  });
  expect(sessionIds).not.toContain(rejectedSessionId);
});

test("[FR-003-AC1][FR-003-AC2][E2E-08] Origin 헤더가 없는 요청(curl 상당) → /api/state GET·/api/workflows POST 모두 403 FORBIDDEN_ORIGIN", async ({
  request,
}) => {
  const state = readE2eState();

  const get = await request.get(`${state.baseUrl}/api/state`);
  expect(get.status()).toBe(403);
  expect((await get.json()) as { code: string }).toMatchObject({ code: "FORBIDDEN_ORIGIN" });

  const post = await request.post(`${state.baseUrl}/api/workflows`, {
    headers: { "Content-Type": "application/json" },
    data: { name: `${BLOCKED_WORKFLOW_NAME}3`, description: "" },
  });
  expect(post.status()).toBe(403);
  expect((await post.json()) as { code: string }).toMatchObject({ code: "FORBIDDEN_ORIGIN" });
});
