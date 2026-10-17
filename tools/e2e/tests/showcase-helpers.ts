// E2E-13·E2E-16·상태 변경 단계(e2e-16z)가 함께 쓰는 showcase 상수·판정 도우미 (배치 8, project-showcase).
// spec 파일이 아니므로 Playwright가 테스트로 수집하지 않는다(testMatch `*.spec.ts`). spec끼리 import하면 테스트가 중복
// 등록되므로 공용 값은 여기에 둔다.
import { join } from "node:path";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { readE2eState } from "../lib/e2e-state";
import { SCENARIOS_DIR } from "../lib/replay";
import {
  OFFICE_COLUMNS,
  expectNavWidth,
  expectRegionsVisible,
  navRegions,
  sizeLabel,
  type Size,
} from "./screen-helpers";
import { fixturePath } from "./ui-helpers";

/** `tools/replay/scenarios/README.md` showcase.jsonl 대응표의 줄 수. */
export const SHOWCASE_LINE_COUNT = 30;
export const SHOWCASE_SCENARIO = join(SCENARIOS_DIR, "showcase.jsonl");

/** 재생 직후 상태 집계(README 대응표에서 도출). 시안(01·02·03)과 같은 구성이다. */
export const AGENT_COUNT = 21;
export const SKILL_COUNT = 12;
export const WORKFLOW_COUNT = 4;
export const RUNNING_COUNT = 7;
export const WAITING_COUNT = 1;
export const IDLE_COUNT = 13;
export const OUTSIDE_COUNT = 5;

export const DEV = "개발부서";
export const DEV_LEAD = "web-develop-tech-lead";
/** fixture 임시 사본 안 hook 설정 파일 경로 조각(`fixturePath`에 넘긴다). */
export const FIXTURE_SETTINGS_SEGMENTS = [".claude", "settings.json"] as const;

/** FR-003-AC9 12종(architecture.md §7.1). 07 `설정 예시 복사`가 만드는 hook 설정과 같은 목록이다. */
export const HOOK_EVENT_NAMES = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
];

/**
 * 수집 주소·토큰이 맞는 hook 설정. fixture 원본의 `settings.json`은 운영 포트·placeholder 토큰을 하드코딩하고 있어
 * E2E 컨테이너에서는 `hook 설정 안 됨`이 된다(D-052). 공식 캡처는 `hook 설정됨` 화면이어야 하므로 **임시 사본의**
 * settings.json을 상태 파일의 주소·토큰으로 다시 쓴다(원본 fixture는 건드리지 않는다).
 */
export function hookSettingsJson(): string {
  const state = readE2eState();
  const hook = {
    type: "http",
    url: `${state.baseUrl}/hooks/events`,
    headers: { "X-AojiStudio-Collect-Token": state.collectToken },
    timeout: 3,
  };
  const hooks: Record<string, unknown> = {};
  for (const eventName of HOOK_EVENT_NAMES) {
    hooks[eventName] = [{ hooks: [hook] }];
  }
  return `${JSON.stringify({ hooks }, null, 2)}\n`;
}

export function settingsFile(): string {
  return fixturePath(...FIXTURE_SETTINGS_SEGMENTS);
}

/** 이 describe가 전제하는 fixture인지 확인한다(`E2E_FIXTURE`가 어긋나면 바로 실패한다). */
export function assertFixture(expected: string): void {
  const state = readE2eState();
  expect(state.fixtureName, `이 실행 단위는 fixture \`${expected}\`로 돌려야 합니다(E2E_FIXTURE 확인).`).toBe(expected);
}

export function sidebarChip(page: Page, text: string) {
  return page.locator('[data-wf="NAV"]').getByText(text, { exact: true });
}

/** 공통 판정: 영역 + 사이드 탭 폭. 화면별 판정은 `extra`로 더한다. */
export function check(
  page: Page,
  screen: string,
  regions: readonly string[] | ((size: Size) => readonly string[]),
  extra?: (size: Size) => Promise<void>,
): (size: Size) => Promise<void> {
  return async (size) => {
    const screenRegions = typeof regions === "function" ? regions(size) : regions;
    await expectRegionsVisible(page, [...navRegions(size), ...screenRegions], `${screen} ${sizeLabel(size)}`);
    await expectNavWidth(page, size);
    if (extra !== undefined) await extra(size);
  };
}

export const HOME_REGIONS = ["01-1", "01-2", "01-3", "01-4", "01-5", "01-6"];
export const WORKFLOWS_REGIONS = ["02-1", "02-2", "02-3", "02-4", "02-5", "02-6", "02-7", "02-9", "02-10"];
/** 03 영역. `03-6`(빈 자리)은 마지막 줄이 꽉 차면 없다(ui-spec SCR-03 "빈 자리 칸"): 칸 9개(팀장 + 서브 1 + 7)가 열 수로 나누어떨어질 때. */
export const DETAIL_SEATS = 9;
export function detailRegions(size: Size): string[] {
  const columns = OFFICE_COLUMNS[sizeLabel(size)] as number;
  const regions = ["03-1", "03-2", "03-3", "03-4", "03-5", "03-7", "03-8", "03-9"];
  return DETAIL_SEATS % columns === 0 ? regions : [...regions, "03-6"];
}
/** 07 영역(v1.2.0: 상태줄 연동 `07-6`·전역 Claude 설정 연결 `07-7` 추가). */
export const SETTINGS_REGIONS = ["07-1", "07-2", "07-3", "07-4", "07-5", "07-6", "07-7"];

/** `GET /api/state`(Origin 헤더가 있어야 한다 — FR-003-AC1) 스냅샷의 live 부분. */
export async function fetchLive(request: APIRequestContext): Promise<{ agents: Record<string, { status: string }> }> {
  const { baseUrl } = readE2eState();
  const response = await request.get(`${baseUrl}/api/state`, { headers: { Origin: baseUrl } });
  expect(response.ok(), "GET /api/state 응답").toBe(true);
  return ((await response.json()) as { live: { agents: Record<string, { status: string }> } }).live;
}
