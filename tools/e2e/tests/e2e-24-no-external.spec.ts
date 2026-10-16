// E2E-24: 외부 요청 0 (T-R4-20, 배치 13). fixture: `project-usage` + `E2E_CLAUDE_HOME_FIXTURE=claude-home-basic`(architecture §8.2 배치 13).
// 검증 ID: NFR-17 — 01·02·03·07·08·09·10과 팝업(05R·05-3·06·08-1·08-2·08-3·10-1)을 열며 브라우저가 보낸 모든 요청(HTML·JS·CSS·글꼴·이미지·fetch·SSE)의
// 호스트가 `127.0.0.1`(앱 4185 · 열기 도우미 4191)뿐이다. 서버 쪽 외부 요청 0은 Backend `NoOutboundHttpTest`가 맡는다.
//
// 파일 이름순으로 e2e-22-statusline(마지막에 컨테이너 pause → unpause) 뒤에 돈다. 첫 테스트가 컨테이너가 running인지 단언한다.
// 요청은 `context.on('request')`로 모은다(페이지·워커·팝업 창 포함). 목킹·가로채기 없음(conventions §8).
import { expect, test, type Page } from "@playwright/test";

import { containerStatus } from "./container-helpers";
import { gotoReady } from "./ui-helpers";

test.describe.configure({ mode: "serial" });

/** 허용 호스트: 앱(4185)과 열기 도우미(4191) 모두 이 호스트다. */
const ALLOWED_HOST = "127.0.0.1";
const ALLOWED_PORTS = new Set(["4185", "4191"]);
/** 네트워크를 타지 않는 URL 종류. */
const LOCAL_SCHEMES = new Set(["data:", "blob:", "about:"]);

const requested: string[] = [];

test.beforeAll(() => {
  expect(containerStatus(), "e2e 컨테이너가 running이 아닙니다(e2e-22의 pause 뒤 unpause 확인)").toBe("running");
});

test.beforeEach(({ context }) => {
  context.on("request", (request) => requested.push(request.url()));
});

/** 화면을 열고 `app-shell-skeleton`이 사라진 뒤 0.5초 기다려 지연 요청(글꼴·도우미 health)이 나가게 한다(SSE가 열려 있어 `networkidle`은 쓰지 않는다). */
async function visit(page: Page, path: string): Promise<void> {
  await gotoReady(page, path);
  await page.waitForTimeout(500);
}

async function expectDialog(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByRole("dialog").or(page.getByRole("alertdialog")).first(), `팝업 ${String(name)}`).toBeVisible();
}

test("[NFR-17][E2E-24] 화면 01·02·03·07·08·09·10을 순서대로 열어 요청을 모은다", async ({ page }) => {
  await visit(page, "/");
  await visit(page, "/workflows");
  await visit(page, "/workflows/dev-team");
  await visit(page, "/settings");
  await visit(page, "/skills");
  await visit(page, "/mcp");
  await visit(page, "/cost");
  expect(requested.length, "요청을 하나도 모으지 못했습니다(수집 장치 점검)").toBeGreaterThan(0);
});

test("[NFR-17][E2E-24] 팝업 05R·05-3·06·08-1·08-2·08-3·10-1을 열어 요청을 모은다", async ({ page }) => {
  await visit(page, "/workflows?dialog=import");
  await expectDialog(page, "05R 에이전트 가져오기");

  await visit(page, "/workflows?dialog=workflow-delete&workflow=dev-team");
  await expectDialog(page, "05-3 워크플로우 삭제");

  await visit(page, "/workflows/dev-team?dialog=agent-edit&agent=proj-dev");
  await expect(page.locator('[data-wf="06-1"]')).toBeVisible();

  await visit(page, "/skills?dialog=skill-new");
  await expectDialog(page, "08-1 스킬 만들기");

  await visit(page, "/skills?dialog=skill-import");
  await expectDialog(page, "08-2 스킬 가져오기");

  await visit(page, "/skills?dialog=skill-delete&skill=release-notes");
  await expectDialog(page, "08-3 스킬 삭제");

  await visit(page, "/cost");
  await page
    .getByRole("button", { name: "단가", exact: true })
    .or(page.getByRole("link", { name: "단가", exact: true }))
    .click();
  await expectDialog(page, "10-1 단가표");
});

test("[NFR-17][E2E-24] 모은 요청의 호스트가 모두 127.0.0.1이다(앱 4185·도우미 4191)", async () => {
  const seen = new Map<string, number>();
  const offenders: string[] = [];
  for (const raw of requested) {
    const url = new URL(raw);
    if (LOCAL_SCHEMES.has(url.protocol)) {
      continue;
    }
    seen.set(url.host, (seen.get(url.host) ?? 0) + 1);
    const okScheme = url.protocol === "http:" || url.protocol === "ws:";
    if (!okScheme || url.hostname !== ALLOWED_HOST || !ALLOWED_PORTS.has(url.port)) {
      offenders.push(raw);
    }
  }
  test.info().annotations.push({
    type: "E2E-24 요청 호스트",
    description: `${requested.length}건 · ${[...seen.entries()].map(([host, count]) => `${host}×${count}`).join(", ")}`,
  });
  process.stdout.write(`[E2E-24 요청 호스트] ${requested.length}건 · ${[...seen.entries()].map(([h, c]) => `${h}×${c}`).join(", ")}\n`);
  expect(offenders, `외부 요청 ${offenders.length}건`).toEqual([]);
  expect(seen.has(`${ALLOWED_HOST}:4185`), "앱 요청(4185)이 모이지 않았습니다").toBe(true);
});
