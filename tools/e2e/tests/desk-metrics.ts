// 02 책상 실측 도우미 (FR-006-AC4·AC10, ADR-50 B). 옛 E2E-13 799·1054행을 이식한 배치 8 순서 13·14가 쓴다.
// spec 파일이 아니므로 Playwright가 테스트로 수집하지 않는다(testMatch `*.spec.ts`).
import { expect, type Page } from "@playwright/test";

import { SETUP_REFLECT_TIMEOUT_MS, spriteBox } from "./ui-helpers";

/** 02 책상 칸 폭(`auto-fill 100px`, ui-spec SCR-02). 이름 줄은 이 폭, 상태 줄은 `STATUS_MAX_WIDTH`까지다. */
export const COLUMN_PITCH = 100;
/** 책상 칸 사이 간격(ui-spec SCR-02 "책상 칸 100px 고정, 사이 8"). 이웃 칸의 중심 간 거리 = 칸 폭 + 간격이다. */
export const DESK_GAP = 8;
export const STATUS_MAX_WIDTH = 96;

/** 상태 줄 문구 형식(`lib/text.ts agentStatusWithParent`). 선택자가 엉뚱한 요소를 잡으면 여기서 드러난다. */
export const STATUS_LINE_PATTERN = /^(작업 중|권한 대기|대기)( · 부모 .+)?$/;

export interface DeskMetric {
  name: string;
  label: string;
  /** 책상 SVG의 중심. 열 중앙 정렬이므로 중심 간 거리가 곧 열 pitch다. */
  centerX: number;
  centerY: number;
  /** 이름 칩에 **그려진 글자**의 좌·우 끝과 폭(요소 상자가 아니라 글자 범위 — `paintExtent`). */
  labelLeft: number;
  labelRight: number;
  labelWidth: number;
  /** 상태 줄의 문구와 그려진 글자의 좌·우 끝·폭(clamp가 걸리면 칸 폭에서 잘린 뒤의 범위). */
  statusText: string;
  statusLeft: number;
  statusRight: number;
  statusWidth: number;
  /** 상태 줄의 `title` 속성. 부모 접미가 있을 때만 전체 문구가 들어간다(ADR-50 B). */
  statusTitle: string | null;
  /** 상태 줄의 레이아웃 폭(`clientWidth`)과 잘리지 않은 글자 폭(`scrollWidth`). 둘이 다르면 clamp가 걸린 것이다. */
  statusClientWidth: number;
  statusScrollWidth: number;
}

/** 층 카드 안 책상들의 실측값(DOM 순서 = FR-006-AC1 정렬 순서). */
export async function deskMetrics(page: Page, workflowName: string): Promise<DeskMetric[]> {
  return page.locator(`section[data-floor=${JSON.stringify(workflowName)}]`).evaluate((card) => {
    /**
     * 요소에 **그려진 글자**의 가로 범위. 두 글자 줄의 상자가 항상 칸 폭과 같아져 상자 기준 겹침 판정이 공허해지므로
     * `Range`로 글자 범위를 재고, 자기 자신이나 조상이 가로로 잘라내면(`overflow-x: hidden` = clamp) 그 상자들과
     * 교차시켜 **눈에 보이는 범위**만 남긴다.
     */
    const paintExtent = (element: Element | null): { left: number; right: number; width: number } => {
      if (element === null) return { left: 0, right: 0, width: 0 };
      const range = document.createRange();
      range.selectNodeContents(element);
      const textBox = range.getBoundingClientRect();
      range.detach();
      let left = textBox.left;
      let right = textBox.right;
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        if (getComputedStyle(node).overflowX !== "hidden") continue;
        const clip = node.getBoundingClientRect();
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      return { left, right, width: Math.max(0, right - left) };
    };
    return Array.from(card.querySelectorAll("[data-wf='02-7']")).map((root) => {
      const svg = root.querySelector("svg[data-testid='pixel-char']");
      const box = (svg ?? root).getBoundingClientRect();
      const labelSpan = root.querySelector("span[title]");
      const labelRect = paintExtent(labelSpan);
      // 상태 줄은 책상 묶음(`Desk`)의 마지막 자식 span이다. 구조가 바뀌면 빈 문구로 드러난다.
      const statusSpan = root.lastElementChild;
      const statusRect = paintExtent(statusSpan);
      return {
        name: root.getAttribute("data-agent-name") ?? "",
        label: labelSpan?.textContent ?? "",
        centerX: box.left + box.width / 2,
        centerY: box.top + box.height / 2,
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        labelWidth: labelRect.width,
        statusText: statusSpan?.textContent ?? "",
        statusLeft: statusRect.left,
        statusRight: statusRect.right,
        statusWidth: statusRect.width,
        statusTitle: statusSpan?.getAttribute("title") ?? null,
        statusClientWidth: statusSpan?.clientWidth ?? 0,
        statusScrollWidth: statusSpan?.scrollWidth ?? 0,
      };
    });
  });
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 같은 줄(중심 y가 같은) 책상들의 묶음. 번짐·겹침은 줄 안에서만 일어난다. */
function rows(desks: DeskMetric[]): DeskMetric[][] {
  const grouped: DeskMetric[][] = [];
  for (const desk of desks) {
    const row = grouped.find((candidate) => Math.abs((candidate[0] as DeskMetric).centerY - desk.centerY) < 2);
    if (row === undefined) {
      grouped.push([desk]);
    } else {
      row.push(desk);
    }
  }
  return grouped;
}

/** 같은 줄에서 상태 줄끼리 겹치는 쌍(요소 가림 판정 — `docs/ui/README.md` "요소 가림은 결함"). */
export function statusOverlaps(desks: DeskMetric[]): string[] {
  const found: string[] = [];
  for (const row of rows(desks)) {
    for (let index = 1; index < row.length; index += 1) {
      const left = row[index - 1] as DeskMetric;
      const right = row[index] as DeskMetric;
      if (left.statusRight > right.statusLeft) {
        found.push(`${left.name}↔${right.name} ${round2(left.statusRight - right.statusLeft)}px`);
      }
    }
  }
  return found;
}

/**
 * 보통 층의 이웃 두 칸(책상 칸 100px)에 부모 접미가 붙은 책상을 실제로 놓고 상태 줄 clamp를 단언한다(ADR-50 B,
 * FR-006-AC10·AC4). 투영값은 쓰지 않는다 — 두 책상이 같은 줄의 이웃 칸에 실제로 있고 접미가 실제로 붙은 상태에서 잰 값만 쓴다.
 */
export async function assertSuffixPair(options: {
  page: Page;
  workflowName: string;
  pair: readonly [string, string];
  parentLabel: string;
  phase: string;
}): Promise<void> {
  const { page, workflowName, pair, parentLabel, phase } = options;
  const desks = await deskMetrics(page, workflowName);
  const expectedStatus = `작업 중 · 부모 ${parentLabel}`;

  const left = desks.find((desk) => desk.name === pair[0]);
  const right = desks.find((desk) => desk.name === pair[1]);
  expect(left, `${phase} ${pair[0]} 책상을 찾지 못했습니다`).toBeDefined();
  expect(right, `${phase} ${pair[1]} 책상을 찾지 못했습니다`).toBeDefined();
  const pairDesks = [left as DeskMetric, right as DeskMetric];

  // 선택자가 엉뚱한 요소를 잡지 않았는지 고정한다(모든 책상의 상태 줄이 조립 규칙대로다).
  for (const desk of desks) {
    expect(desk.statusText, `${phase} ${desk.name} 상태 줄 문구`).toMatch(STATUS_LINE_PATTERN);
  }

  // ① 접미가 실제로 붙었다(먼저 고정해야 겹침 0건이 공허하지 않다).
  for (const desk of pairDesks) {
    expect(desk.statusText, `${phase} ${desk.name} 상태 줄`).toBe(expectedStatus);
  }

  // ③ 그려진 상태 줄끼리 겹치지 않는다(FR-006-AC10).
  expect(statusOverlaps(desks), `${phase} 보통 층에서 상태 줄이 인접 열 상태 줄과 겹칩니다`).toEqual([]);

  // ④ 그려진 상태 줄이 상태 줄 최대 폭(96) 안에 있다(책상 칸 100px 안).
  for (const desk of pairDesks) {
    expect(round2(desk.statusWidth), `${phase} ${desk.name} 상태 줄 폭이 칸 폭을 넘습니다`).toBeLessThanOrEqual(
      STATUS_MAX_WIDTH + 1,
    );
  }

  // ② 두 책상은 같은 줄의 이웃 칸이다(centerX 차이 = 책상 칸 100px + 사이 8px). 가림 판정 뒤에 둔다 — 실패했을 때 먼저 드러나야 하는
  // 사실이 "글자가 겹쳤다"이기 때문이다.
  const [leftDesk, rightDesk] = pairDesks as [DeskMetric, DeskMetric];
  expect(Math.abs(leftDesk.centerY - rightDesk.centerY), `${phase} 두 책상이 같은 행이 아닙니다`).toBeLessThan(2);
  expect(
    Math.abs(rightDesk.centerX - leftDesk.centerX - (COLUMN_PITCH + DESK_GAP)),
    `${phase} 두 책상이 이웃 칸이 아닙니다(centerX 차이 ${round2(rightDesk.centerX - leftDesk.centerX)}px, 칸 폭 ${COLUMN_PITCH}px + 간격 ${DESK_GAP}px)`,
  ).toBeLessThan(1);

  // 잘린 전체 문구는 같은 요소의 네이티브 title로 본다(FR-006-AC4와 같은 방식).
  for (const desk of pairDesks) {
    expect(desk.statusTitle, `${phase} ${desk.name} 상태 줄 title`).toBe(expectedStatus);
  }

  // clamp가 실제로 걸렸다 — 자르지 않은 글자 폭이 칸 폭보다 넓다(넓지 않으면 위 판정이 공허해진다).
  for (const desk of pairDesks) {
    expect(
      desk.statusScrollWidth,
      `${phase} ${desk.name} 상태 줄이 칸 폭을 넘지 않아 clamp 검증이 공허합니다`,
    ).toBeGreaterThan(desk.statusClientWidth);
  }
}

/** 책상 묶음 안 부모 접미 문구가 보일 때까지 기다린다. */
export async function waitForSuffix(page: Page, name: string, text: string): Promise<void> {
  await expect(spriteBox(page, name).getByText(text, { exact: true })).toBeVisible({ timeout: SETUP_REFLECT_TIMEOUT_MS });
}
