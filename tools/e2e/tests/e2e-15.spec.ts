// E2E-15 진입 주소 정규화 (architecture.md §8.2 E2E-15 행, ADR-41, ui-spec.md §공통 "진입 주소 정규화").
// fixture: `project-configured` — 워크플로우 추가(POST)가 403 없이 성공해야 하므로 쓰기 가능한 fixture
// 사본이면 되고, E2E-04와 같은 배치에서 뒤에 돌아 컨테이너·도우미를 한 번만 띄운다(파일 이름 순서상
// `e2e-04` → `e2e-15`이므로 이 spec이 만드는 워크플로우가 E2E-04의 단언에 끼어들지 않는다).
//
// 확인하는 것
//  1. `http://localhost:<포트>/workflows?x=1`로 열면 호스트명만 `127.0.0.1`로 바뀌고 포트·경로·쿼리가 남는다.
//  2. 정규화 뒤의 워크플로우 추가(POST)가 403 없이 성공한다(FR-008-AC4).
//  3. API 요청에 실린 `Origin` 값은 `http://127.0.0.1:<포트>` 하나뿐이다(`localhost`가 한 번도 안 실린다).
//
// 목킹 없음: 실제 컨테이너·실제 화면 버튼·실제 구성 파일 생성으로 확인한다(conventions.md §8).
// 주소·포트 literal 없음: 진입 주소는 `.e2e-state.json`의 `baseUrl`에서 호스트명만 바꿔 만든다.
import { expect, test } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import { addWorkflowViaUi, fixturePathExists, floorName, teamFile } from "./ui-helpers";

/** 이 spec이 UI로 만드는 워크플로우(FR-008-AC2 이름 규칙 `^[가-힣A-Za-z0-9 _-]+$`). */
const WORKFLOW = "e2e15-정규화";

/** 정규화 대상 루프백 별칭 호스트명(ADR-41). `[::1]`은 compose가 IPv4만 공개해 접속 자체가 되지 않으므로 쓰지 않는다. */
const LOOPBACK_ALIAS_HOST = "localhost";

interface ApiRequestLog {
  url: string;
  method: string;
  origin: string | null;
}

test("[ADR-41][FR-008-AC4][E2E-15] localhost 진입 → 주소가 127.0.0.1로 정규화(포트·경로·쿼리 유지)되고 워크플로우 추가(POST)가 403 없이 성공한다", async ({
  page,
}, testInfo) => {
  const state = readE2eState();
  const canonicalEntry = `${state.baseUrl}/workflows?x=1`;
  const aliasEntry = (() => {
    const url = new URL(canonicalEntry);
    url.hostname = LOOPBACK_ALIAS_HOST;
    return url.href;
  })();
  expect(aliasEntry, "진입 주소가 호스트명만 다른 같은 주소가 아닙니다").not.toBe(canonicalEntry);

  // API 요청의 Origin과 응답 상태를 모두 모은다(`request.allHeaders()`는 비동기라 promise로 모은다).
  const apiRequests: Promise<ApiRequestLog>[] = [];
  const apiResponses: { url: string; method: string; status: number }[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) {
      apiRequests.push(
        request
          .allHeaders()
          .then((headers) => ({ url: request.url(), method: request.method(), origin: headers.origin ?? null })),
      );
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      apiResponses.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
      });
    }
  });

  try {
    await page.goto(aliasEntry);
  } catch (error) {
    // 접속 자체가 되지 않으면 skip하지 않고 원인을 남긴 채 실패한다(architecture.md §8.2 E2E-15 행).
    throw new Error(
      `${aliasEntry} 진입 실패: ${error instanceof Error ? error.message : String(error)}\n` +
        "compose.e2e.yaml은 127.0.0.1(IPv4)로만 공개하므로, 브라우저가 localhost를 ::1로만 해석하면 " +
        "정규화 코드에 닿기 전에 접속이 끊긴다. 이때는 테스트를 skip하지 않고 이 사실을 보고해 architect 확인을 받는다.",
    );
  }

  // 첫 렌더·첫 API 호출 전에 `location.replace`가 일어나므로, 화면이 준비된 시점의 주소는 정규화된 값이다.
  await expect(page.getByTestId("app-shell-skeleton")).toHaveCount(0, { timeout: 10_000 });
  expect(page.url(), "진입 주소가 127.0.0.1로 정규화되지 않았습니다").toBe(canonicalEntry);
  const location = await page.evaluate(() => ({
    hostname: window.location.hostname,
    port: window.location.port,
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  expect(location.hostname).toBe(new URL(state.baseUrl).hostname);
  expect(location.port).toBe(new URL(state.baseUrl).port);
  expect(location.pathname).toBe("/workflows");
  expect(location.search).toBe("?x=1");

  // 정규화 뒤의 변경 요청(POST /api/workflows)이 성공한다 — 화면 버튼으로만 호출한다.
  await addWorkflowViaUi(page, WORKFLOW);
  await expect(floorName(page, WORKFLOW)).toBeVisible();
  expect(fixturePathExists(teamFile(WORKFLOW)), "구성 파일이 만들어지지 않았습니다").toBe(true);

  const workflowPosts = apiResponses.filter(
    (response) => response.method === "POST" && response.url === `${state.baseUrl}/api/workflows`,
  );
  expect(workflowPosts.map((response) => response.status)).toEqual([201]);
  expect(
    apiResponses.filter((response) => response.status === 403),
    "정규화 뒤에도 403이 난 API 요청이 있습니다",
  ).toEqual([]);

  // 요청에 실린 Origin은 정규화된 값 하나뿐이다(같은 출처 GET은 Origin을 싣지 않으므로 null을 뺀다).
  const logs = await Promise.all(apiRequests);
  const origins = [...new Set(logs.map((log) => log.origin).filter((origin) => origin !== null))];
  expect(origins).toEqual([state.baseUrl]);
  expect(
    logs.filter((log) => log.origin !== null && log.origin.includes(LOOPBACK_ALIAS_HOST)),
    "localhost Origin이 실린 API 요청이 있습니다",
  ).toEqual([]);

  testInfo.annotations.push({
    type: "E2E-15 진입·Origin 실측",
    description:
      `진입 ${aliasEntry} → 주소 ${page.url()} · API 요청 ${logs.length}건 ` +
      `(Origin 있는 요청 ${logs.filter((log) => log.origin !== null).length}건, 값 ${origins.join(",")})`,
  });
});
