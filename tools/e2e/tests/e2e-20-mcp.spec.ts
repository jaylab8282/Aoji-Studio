// E2E-20: 09 MCP 화면(T-R4-17, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: FR-023-AC1~AC5·E1, FR-024-AC1·AC4 = `project-usage/expected.json`의 `mcp`, FR-023-AC2 표지 0회(화면), FR-023-AC5 `.mcp.json` 수정 2초 반영,
// FR-023-AC6(입력·쓰기 버튼 0), 캡처 `09-mcp@1920x1080`(`github` 펼침, D-172).
//
// 파일 이름순으로 e2e-19a(`usage.jsonl` 재생)와 e2e-19b 뒤에 돈다. 이 spec은 다시 재생하지 않고 쌓인 데이터를 쓴다.
// e2e-19b가 기본 세션의 github 호출을 더했을 수 있어 그 한 칸만 `expected` 값 또는 + `LIVE_EXTRA_GITHUB_MAIN_CALLS`를 허용한다.
// `.mcp.json`을 바꾸는 테스트는 맨 뒤에 두고 `finally`로 원래 내용을 되돌린다. 목킹 없음(conventions §8).
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  ENV_MARKER,
  expandMcpRow,
  expectActualUsage,
  LIVE_EXTRA_GITHUB_MAIN_CALLS,
  locationLabel,
  MASK,
  mcpExpected,
  mcpList,
  mcpPeriodButton,
  mcpRow,
  mcpRowNames,
  type McpExpectedRow,
} from "./mcp-helpers";
import { expectRegionsVisible, navRegions, SCREENSHOT_DIR, settle, sizeLabel } from "./screen-helpers";
import {
  fixturePath,
  gotoReady,
  measureFileChangeReflection,
  readFixtureFile,
  writeFixtureFile,
} from "./ui-helpers";

test.describe.configure({ mode: "serial" });

const CAPTURE_SIZE = { width: 1920, height: 1080 } as const;
const TRANSPORT: Record<string, string> = {
  "docs-server": "stdio",
  "flat-http": "http",
  "flat-stdio": "stdio",
  "local-tool": "stdio",
  github: "http",
};

const rows = mcpExpected.rows;
const calledOnly = rows.filter((row) => row.locations.every((location) => location.kind === "called-only"));
const defined = rows.filter((row) => !calledOnly.includes(row));

async function expectRowSummary(page: import("@playwright/test").Page, row: McpExpectedRow): Promise<void> {
  const li = mcpRow(page, row.name);
  const context = `행 ${row.name}`;
  await expect(li, context).toHaveCount(1);

  // FR-023-AC1·AC3: 정의 위치 칩(합쳐진 모든 위치)
  for (const location of row.locations) {
    await expect(li.getByText(locationLabel(location), { exact: true }).first(), `${context} 위치 ${locationLabel(location)}`).toBeVisible();
  }
  // 활성 칩: true → `활성`, false → `비활성`, null → 없음
  await expect(li.getByText("활성", { exact: true }), `${context} 활성 칩`).toHaveCount(row.active === true ? 1 : 0);
  await expect(li.getByText("비활성", { exact: true }), `${context} 비활성 칩`).toHaveCount(row.active === false ? 1 : 0);

  // FR-024-AC4: 합집합 수(기본 세션·전체 상속 제외)
  await expect(
    li.getByRole("button", { name: `사용 에이전트 ${row.usedAgentCount}명`, exact: true }),
    `${context} 사용 에이전트`,
  ).toBeVisible();
}

test("[FR-023-AC1][FR-023-AC3][FR-024-AC4] 목록: 서버 N개·이름순·합쳐진 정의 위치·활성 칩·`호출 기록만` 점선 행·`사용 에이전트 N명` = expected.json", async ({
  page,
}) => {
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();
  await expect(mcpPeriodButton(page, "7일")).toHaveAttribute("aria-pressed", "true");

  await expect.poll(() => mcpRowNames(page)).toEqual(rows.map((row) => row.name));
  await expect(page.locator('[data-wf="09-2"]')).toContainText(new RegExp(`서버\\s*${rows.length}\\s*개`));
  // 다른 프로젝트 전용 설치 서버는 목록에 없다(T-FIX-15)
  for (const name of mcpExpected.notListed) {
    await expect(mcpRow(page, name), `목록에 없어야 하는 ${name}`).toHaveCount(0);
  }

  for (const row of rows) {
    await expectRowSummary(page, row);
  }
  // 호출 기록만 행은 `09-9`, 위치 칩 영역은 `09-6`
  await expect(page.locator('[data-wf="09-9"]')).toHaveCount(calledOnly.length);
  await expect(page.locator('[data-wf="09-6"]').first()).toBeVisible();
  // 같은 서버가 두 곳에 있으면(github) 한 행에 두 칩
  await expect(mcpRow(page, "github").getByText("프로젝트", { exact: true })).toBeVisible();
  await expect(mcpRow(page, "github").getByText("전역", { exact: true })).toBeVisible();
});

test("[FR-023-AC2][FR-023-AC3][FR-024-AC1][FR-024-AC2][FR-024-AC4] 펼침: 연결 방식·명령·URL·가린 값, 정의상(`전체 상속 N명`)·실제 사용, `정의 없음 · 연결 방식 알 수 없음` = expected.json", async ({
  page,
}) => {
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();

  for (const row of rows) {
    const li = await expandMcpRow(page, row.name);
    const context = `행 ${row.name}`;

    if (calledOnly.includes(row)) {
      // FR-023-AC3: 정의 없음 · 정의상 `-`
      await expect(li, `${context} 정의 없음`).toContainText("정의 없음 · 연결 방식 알 수 없음");
      await expect(li.locator('[data-wf="09-8"]'), `${context} 정의상`).toContainText("-");
      await expect(li, `${context} 전체 상속 없음`).not.toContainText("전체 상속");
    } else {
      const connection = li.locator('[data-wf="09-7"]');
      await expect(connection, `${context} 연결 정보`).toBeVisible();
      const transport = TRANSPORT[row.name];
      if (transport !== undefined) {
        await expect(connection.getByText(transport, { exact: true }), `${context} 연결 방식`).toBeVisible();
      }
      // FR-024-AC1: 정의상 name 목록 + `전체 상속 N명`
      const definition = li.locator('[data-wf="09-8"]');
      await expect(definition, `${context} 정의상`).toBeVisible();
      for (const agent of row.definedAgents) {
        await expect(definition, `${context} 정의상 ${agent}`).toContainText(agent);
      }
      if (row.definedAgents.length === 0) {
        await expect(definition, `${context} 정의상 없음`).toContainText("-");
      }
      if (row.inheritAllCount !== null) {
        await expect(definition, `${context} 전체 상속`).toContainText(`전체 상속 ${row.inheritAllCount}명`);
      }
    }

    // FR-024-AC2: 실제 사용(이름 + 횟수, `기본 세션` 포함) — github 기본 세션은 e2e-19b가 더했을 수 있다
    await expectActualUsage(li, row, {
      extraDefaultSessionCalls: [0, LIVE_EXTRA_GITHUB_MAIN_CALLS],
    });
  }
  expect(defined.length + calledOnly.length).toBe(rows.length);
  // FR-024-AC1: `tools` 생략 에이전트 수
  expect(mcpExpected.inheritAllAgents).toHaveLength(6);
});

test("[FR-023-AC2][NFR-14] 표지 문자열은 화면에 0회다: 모든 행을 펼쳐도 env·headers·URL 쿼리 값은 `••••••••`로만 보인다", async ({ page }) => {
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();
  for (const row of rows) {
    await expandMcpRow(page, row.name);
  }

  for (const [server, masked] of Object.entries(mcpExpected.masked)) {
    const li = mcpRow(page, server);
    for (const key of Object.keys(masked.env ?? {})) {
      await expect(li, `${server} env ${key}`).toContainText(new RegExp(`env\\s*${key}\\s*=\\s*${MASK}`));
    }
    for (const key of Object.keys(masked.headers ?? {})) {
      await expect(li, `${server} headers ${key}`).toContainText(new RegExp(`headers\\s*${key}\\s*:\\s*${MASK}`));
    }
    if (masked.urlQueryValues !== undefined) {
      await expect(li.locator('[data-wf="09-7"]'), `${server} URL 쿼리`).toContainText(masked.urlQueryValues);
    }
  }

  // 보이는 글자·접근성 이름·속성값·제목(title) 어디에도 표지가 없다
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(ENV_MARKER);
  expect(await page.content()).not.toContain(ENV_MARKER);
  await expect(page.getByText(ENV_MARKER, { exact: false })).toHaveCount(0);
});

test("[FR-023-AC4][FR-023-AC5][FR-023-AC6] 읽은 곳 카드·커넥터 안내·전역 읽은 시각, 입력·쓰기 버튼 0", async ({ page }) => {
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();

  // FR-023-AC4: 커넥터 안내는 항상
  await expect(page.locator('[data-wf="09-4"]')).toContainText(
    "claude.ai 커넥터(Gmail·Drive 등)는 로컬 설정에 없어 호출 기록이 있을 때만 보입니다",
  );

  // 읽은 곳 카드 네 칸: 정의 위치별 서버 수 = expected.json에서 센 값
  const countOf = (kind: string): number => rows.filter((row) => row.locations.some((location) => location.kind === kind)).length;
  const sources = page.locator('[data-wf="09-3"]');
  await expect(sources).toContainText(new RegExp(`읽음\\s*·\\s*서버\\s*${countOf("project")}`));
  await expect(sources).toContainText(new RegExp(`연결됨\\s*·\\s*읽기 전용\\s*·\\s*서버\\s*${countOf("global")}`));
  await expect(sources).toContainText(new RegExp(`연결됨\\s*·\\s*읽기 전용\\s*·\\s*서버\\s*${countOf("plugin")}`));
  await expect(sources).toContainText(new RegExp(`서버\\s*${countOf("agent")}\\s*·\\s*호출 기록만\\s*${calledOnly.length}`));
  await expect(sources).not.toContainText("연결 안 됨");
  await expect(page.locator('[data-wf="09-10"]')).toHaveCount(0);

  // FR-023-AC5: 전역 설정 읽은 시각(hh:mm:ss)
  await expect(sources).toContainText(/전역 설정 읽은 시각\s*\d{2}:\d{2}:\d{2}/);

  // FR-023-AC6: 입력·쓰기 버튼 없음
  const main = page.locator("main");
  await expect(main.getByRole("textbox")).toHaveCount(0);
  await expect(main.getByRole("combobox")).toHaveCount(0);
  await expect(main.getByRole("checkbox")).toHaveCount(0);
  await expect(main.getByRole("button", { name: /추가|수정|삭제|저장|만들기|활성화|비활성화|점검/ })).toHaveCount(0);
});

test("[E2E-13][FR-023-AC1] 캡처 09-mcp@1920x1080: `github` 행 펼침 (D-172)", async ({ page }) => {
  await page.setViewportSize(CAPTURE_SIZE);
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();
  await expect.poll(() => mcpRowNames(page)).toEqual(rows.map((row) => row.name));
  await expandMcpRow(page, "github");
  await settle(page);

  await expectRegionsVisible(
    page,
    [...navRegions(CAPTURE_SIZE), "09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7", "09-8", "09-9", "09-11", "09-12"],
    `09 ${sizeLabel(CAPTURE_SIZE)}`,
  );
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `09-mcp@${sizeLabel(CAPTURE_SIZE)}.png`),
    caret: "hide",
    animations: "disabled",
  });
});

test("[FR-023-AC5] `.mcp.json`에 서버를 더했다 빼면 2초 안에 목록에 나타났다 사라진다", async ({ page }, testInfo) => {
  const file = fixturePath(".mcp.json");
  const original = readFixtureFile(file);
  const parsed = JSON.parse(original) as { mcpServers: Record<string, unknown> };
  const added = "e2e20-added";
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();
  await expect(mcpRow(page, added)).toHaveCount(0);

  try {
    parsed.mcpServers[added] = { type: "stdio", command: "node", args: ["e2e20-added.js"] };
    await measureFileChangeReflection(
      testInfo,
      ".mcp.json 서버 추가 → 09 행",
      () => writeFixtureFile(file, `${JSON.stringify(parsed, null, 2)}\n`),
      async () => (await mcpRow(page, added).count()) === 1,
    );
    await expect(mcpRow(page, added).getByText("프로젝트", { exact: true })).toBeVisible();
    await expect(page.locator('[data-wf="09-2"]')).toContainText(new RegExp(`서버\\s*${rows.length + 1}\\s*개`));
  } finally {
    await measureFileChangeReflection(
      testInfo,
      ".mcp.json 서버 제거(원복) → 09 행",
      () => writeFixtureFile(file, original),
      async () => (await mcpRow(page, added).count()) === 0,
    );
  }
  await expect(page.locator('[data-wf="09-2"]')).toContainText(new RegExp(`서버\\s*${rows.length}\\s*개`));
  expect(readFixtureFile(file)).toBe(original);
});

test("[FR-023-E1] `.mcp.json` JSON 파싱 실패 → 그 출처만 빠지고 출처 오류 줄(`JSON 파싱 실패 (N행)`), 전역·플러그인·호출 기록 행은 그대로", async ({
  page,
}, testInfo) => {
  const file = fixturePath(".mcp.json");
  const original = readFixtureFile(file);
  await gotoReady(page, "/mcp");
  await expect(mcpList(page)).toBeVisible();
  await expect(page.locator('[data-wf="09-10"]')).toHaveCount(0);

  const projectOnly = rows.filter((row) => row.locations.every((location) => location.kind === "project"));
  expect(projectOnly.length).toBeGreaterThan(0);

  try {
    await measureFileChangeReflection(
      testInfo,
      ".mcp.json 깨뜨림 → 09 출처 오류 줄",
      () => writeFixtureFile(file, '{\n  "mcpServers": {\n    "github": {\n'),
      async () => (await page.locator('[data-wf="09-10"]').count()) === 1,
    );
    const errorLine = page.locator('[data-wf="09-10"]');
    await expect(errorLine).toContainText(/\.mcp\.json\s*·\s*JSON 파싱 실패 \(\d+행\)/);
    await expect(errorLine).toContainText("이 출처만 빼고 표시합니다");
    // 파싱 실패는 `설정 열기`가 없다(연결 안 됨 줄에만)
    await expect(errorLine.getByText("설정 열기", { exact: true })).toHaveCount(0);

    // 프로젝트 전용 서버는 빠지고 나머지 출처(전역·플러그인·호출 기록)는 그대로
    for (const row of projectOnly) {
      await expect(mcpRow(page, row.name), `프로젝트 전용 ${row.name}`).toHaveCount(0);
    }
    for (const row of rows.filter((candidate) => !projectOnly.includes(candidate))) {
      await expect(mcpRow(page, row.name), `남는 행 ${row.name}`).toHaveCount(1);
    }
  } finally {
    await measureFileChangeReflection(
      testInfo,
      ".mcp.json 원복 → 09 출처 오류 줄 사라짐",
      () => writeFixtureFile(file, original),
      async () => (await page.locator('[data-wf="09-10"]').count()) === 0,
    );
  }
  await expect.poll(() => mcpRowNames(page)).toEqual(rows.map((row) => row.name));
  expect(readFixtureFile(file)).toBe(original);
});
