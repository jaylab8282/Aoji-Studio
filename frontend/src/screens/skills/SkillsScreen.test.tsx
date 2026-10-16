import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsScreen } from "./SkillsScreen";
import { SKILLS_REFETCH_INTERVAL_MS } from "./useSkillsReport";
import type { SkillsReport } from "../../api/types";
import { skillsViewStore } from "../../state/skillsViewStore";
import { snapshotStore } from "../../state/snapshotStore";
import { usageSignalStore } from "../../state/usageSignalStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { buildSkillRow, buildSkillsReport } from "../../test/fixtures/skills";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** `GET /api/skills?period=…` 응답만 바꿔 가며 쓰는 fetch 대역(테스트 전용). 요청 URL을 모은다. */
function stubSkills(respond: (url: string) => Response | Promise<Response>): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.startsWith("/api/skills")) throw new Error(`unexpected fetch: ${url}`);
      urls.push(url);
      return respond(url);
    }),
  );
  return urls;
}

function seedRegistry(overrides: { skillCount?: number; writable?: boolean; revision?: number } = {}) {
  const base = buildSnapshotFixture();
  snapshotStore.replace({
    ...base,
    registry: {
      ...base.registry,
      skillCount: overrides.skillCount ?? 3,
      writable: overrides.writable ?? true,
      revision: overrides.revision ?? 1,
    },
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/skills"]}>
      <SkillsScreen />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function rowOf(name: string): HTMLElement {
  const button = screen.getByRole("button", { name: new RegExp(`^${name} (펼치기|접기)$`) });
  return button.closest("li") as HTMLElement;
}

async function waitForRows() {
  await screen.findByRole("region", { name: "스킬 목록" });
  await waitFor(() => expect(screen.queryByTestId("expandable-skeleton-row")).toBeNull());
}

const SAMPLE: SkillsReport = buildSkillsReport([
  buildSkillRow("alpha", {
    description: "알파 설명\n둘째 줄",
    definedAgents: ["dev", "lead"],
    usage: { call: 2, slash: 1, preload: 7, total: 10 },
    percent: 62.5,
    actualAgents: [
      { agent: "dev", count: 6 },
      { agent: null, count: 4 },
    ],
    definedUnused: ["lead"],
    usedAgentCount: 2,
  }),
  buildSkillRow("bravo", { userOnly: true, usage: { call: 0, slash: 6, preload: 0, total: 6 }, percent: 37.5 }),
  buildSkillRow("charlie", { imported: true }),
]);

describe("SkillsScreen", () => {
  beforeEach(() => {
    seedRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    snapshotStore.reset();
    skillsViewStore.reset();
    usageSignalStore.reset();
  });

  it("[FR-018-AC1] 제목 줄 `.claude/skills/ · N개 · 이름순`(N = registry.skillCount)과 행 순서(이름 오름차순)", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();

    const title = container.querySelector('[data-wf="08-2"]') as HTMLElement;
    expect(within(title).getByRole("heading", { name: "스킬" })).toBeInTheDocument();
    expect(title).toHaveTextContent(".claude/skills/ · 3개 · 이름순 · 사용자 전용 스킬은 /<이름>으로만 부릅니다");
    const names = screen
      .getAllByRole("button", { name: /(펼치기|접기)$/ })
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["alpha 펼치기", "bravo 펼치기", "charlie 펼치기"]);
    expect(container.querySelector('[data-wf="08-1"]')).toBeNull();
  });

  it("[FR-018-AC1] 첫 응답 전에는 행 8개 스켈레톤이고 스킬 수·사용 합계 자리도 스켈레톤이다(0을 먼저 보이지 않는다)", async () => {
    stubSkills(() => new Promise<Response>(() => undefined));
    const { container } = renderScreen();

    expect(screen.getAllByTestId("expandable-skeleton-row")).toHaveLength(8);
    expect(container.querySelector('[data-wf="08-3"]')).not.toHaveTextContent(/사용 합계\s*0/);
    expect(screen.queryByText("기록 없음")).toBeNull();
  });

  it("[FR-018-AC5] 가져온 스킬은 `가져온 스킬` 칩(08-10)이고 `수정`은 비활성 + 사유 `가져온 스킬은 수정할 수 없습니다`, `삭제`는 활성이다", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    const row = rowOf("charlie");
    expect(within(row).getByText("가져온 스킬")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-wf", "08-10");
    const edit = within(row).getByRole("button", { name: "수정" });
    expect(edit).toBeDisabled();
    expect(document.getElementById(edit.getAttribute("aria-describedby") as string)).toHaveTextContent(
      "가져온 스킬은 수정할 수 없습니다",
    );
    expect(within(row).getByRole("button", { name: "삭제" })).toBeEnabled();
    // 일반 행은 `수정`이 활성이고 이유 줄이 없다.
    expect(within(rowOf("alpha")).getByRole("button", { name: "수정" })).toBeEnabled();
    expect(within(rowOf("alpha")).queryByText("가져온 스킬은 수정할 수 없습니다")).toBeNull();
    expect(within(rowOf("bravo")).getByText("사용자 전용")).toBeInTheDocument();
    expect(rowOf("bravo")).toHaveAttribute("data-wf", "08-11");
  });

  it("[FR-018-E1] 형식 오류 스킬: `형식 오류` 칩, 펼치면 사유(빨강 circle-alert), `삭제`는 가능하다", async () => {
    stubSkills(() =>
      jsonResponse(buildSkillsReport([buildSkillRow("bad-yaml", { formatError: "frontmatter 형식 오류: 닫는 --- 없음" })])),
    );
    renderScreen();
    await waitForRows();

    const row = rowOf("bad-yaml");
    expect(row).toHaveAttribute("data-wf", "08-9");
    expect(within(row).getByText("형식 오류")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "삭제" })).toBeEnabled();
    fireEvent.click(within(row).getByRole("button", { name: "bad-yaml 펼치기" }));
    const detail = row.querySelector('[data-wf="08-13"]') as HTMLElement;
    expect(detail).toHaveTextContent("frontmatter 형식 오류: 닫는 --- 없음");
    expect(detail.querySelector("svg")).not.toBeNull();
    // `수정`은 비활성 + 사유, `삭제`는 가능(FR-022-AC4)
    const edit = within(row).getByRole("button", { name: "수정" });
    expect(edit).toBeDisabled();
    expect(document.getElementById(edit.getAttribute("aria-describedby") as string)).toHaveTextContent(
      "에디터에서 SKILL.md를 고치세요",
    );
    fireEvent.click(edit);
    expect(screen.getByTestId("location")).not.toHaveTextContent("dialog=");
  });

  it("[FR-018-E2] 스킬이 없으면 에러가 아니라 빈 상태 카드(puzzle · `스킬이 없습니다` · 안내 · 두 버튼)를 보인다", async () => {
    seedRegistry({ skillCount: 0 });
    stubSkills(() => jsonResponse(buildSkillsReport([], { totalUses: 0 })));
    const { container } = renderScreen();

    expect(await screen.findByRole("heading", { name: "스킬이 없습니다" })).toBeInTheDocument();
    const card = container.querySelector('[data-wf="08-5"]') as HTMLElement;
    expect(card).toHaveAttribute("data-kind", "empty");
    expect(card).toHaveTextContent(".claude/skills/에 스킬 폴더가 없습니다. 새로 만들거나 외부 스킬 zip을 가져오세요.");
    expect(card.querySelector("svg.lucide-puzzle")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector('[data-wf="08-2"]')).toHaveTextContent("0개");
    expect(screen.queryByRole("region", { name: "스킬 목록" })).toBeNull();

    // 카드 안 두 버튼: `스킬 만들기`(primary, plus) · `가져오기`(secondary, import) → 각각 08-1·08-2를 연다
    const create = within(card).getByRole("button", { name: "스킬 만들기" });
    const importButton = within(card).getByRole("button", { name: "가져오기" });
    expect(create).toBeEnabled();
    expect(importButton).toBeEnabled();
    expect(create.querySelector("svg.lucide-plus")).not.toBeNull();
    expect(importButton.querySelector("svg.lucide-import")).not.toBeNull();
    fireEvent.click(create);
    expect(screen.getByTestId("location")).toHaveTextContent("/skills?dialog=skill-new");
    fireEvent.click(importButton);
    expect(screen.getByTestId("location")).toHaveTextContent("dialog=skill-import");
  });

  it("[FR-018-E2][FR-020-E2] 빈 상태에서 writable=false면 카드 안 두 버튼이 비활성이고 `쓰기 권한 없음`이 보인다", async () => {
    seedRegistry({ skillCount: 0, writable: false });
    stubSkills(() => jsonResponse(buildSkillsReport([], { totalUses: 0 })));
    const { container } = renderScreen();
    await screen.findByRole("heading", { name: "스킬이 없습니다" });

    const card = container.querySelector('[data-wf="08-5"]') as HTMLElement;
    expect(within(card).getByRole("button", { name: "스킬 만들기" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "가져오기" })).toBeDisabled();
    expect(card).toHaveTextContent("쓰기 권한 없음");
  });

  it("[FR-018-AC6] 행에 `사용 에이전트 N명`, 0명이면 흐리게(data-zero)", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    expect(within(rowOf("alpha")).getByRole("button", { name: "사용 에이전트 2명" })).not.toHaveAttribute("data-zero");
    const zero = within(rowOf("bravo")).getByRole("button", { name: "사용 에이전트 0명" });
    expect(zero).toHaveAttribute("data-zero");
    expect(zero).toHaveClass("text-text-muted");
  });

  it("[FR-018-AC7] 처음 모두 접힘 · 여러 행 동시 펼침 · `사용 에이전트 N명`으로도 펼침/접음 · 기간을 바꿔도 유지", async () => {
    const urls = stubSkills((url) => jsonResponse({ ...SAMPLE, period: url.includes("period=30d") ? "30d" : "7d" }));
    const { container } = renderScreen();
    await waitForRows();

    expect(container.querySelectorAll('[data-wf="08-13"]')).toHaveLength(0);
    for (const button of screen.getAllByRole("button", { name: /펼치기$/ })) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }

    fireEvent.click(screen.getByRole("button", { name: "alpha 펼치기" }));
    fireEvent.click(within(rowOf("bravo")).getByRole("button", { name: "사용 에이전트 0명" }));
    expect(container.querySelectorAll('[data-wf="08-13"]')).toHaveLength(2);
    expect(screen.getByRole("button", { name: "alpha 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "bravo 접기" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "30일" }));
    await waitFor(() => expect(urls.some((url) => url.includes("period=30d"))).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "30일" })).toHaveAttribute("aria-pressed", "true"));
    expect(container.querySelectorAll('[data-wf="08-13"]')).toHaveLength(2);

    fireEvent.click(within(rowOf("alpha")).getByRole("button", { name: "사용 에이전트 2명" }));
    expect(screen.getByRole("button", { name: "alpha 펼치기" })).toHaveAttribute("aria-expanded", "false");
  });

  it("[FR-018-AC7] 라우트를 떠났다 돌아오면(언마운트 후 다시 마운트) 모두 접혀 있다", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    const first = renderScreen();
    await waitForRows();
    fireEvent.click(screen.getByRole("button", { name: "alpha 펼치기" }));
    expect(screen.getByRole("button", { name: "alpha 접기" })).toBeInTheDocument();
    first.unmount();

    const { container } = renderScreen();
    await waitForRows();
    expect(screen.getByRole("button", { name: "alpha 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelectorAll('[data-wf="08-13"]')).toHaveLength(0);
  });

  it("[FR-019-AC2] % 는 소수 첫째 자리, 막대(role=img `활용도 N.N%`)의 길이 비율 = 이 스킬 total / 최대 total", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    const alpha = rowOf("alpha");
    expect(within(alpha).getByText("62.5%")).toBeInTheDocument();
    const alphaMeter = within(alpha).getByRole("img", { name: "활용도 62.5%" });
    expect(alphaMeter.querySelector("span")?.style.getPropertyValue("--meter-ratio")).toBe("1");
    const bravoMeter = within(rowOf("bravo")).getByRole("img", { name: "활용도 37.5%" });
    expect(bravoMeter.querySelector("span")?.style.getPropertyValue("--meter-ratio")).toBe("0.6");
    expect(within(rowOf("charlie")).getByText("0.0%")).toBeInTheDocument();
  });

  it("[FR-019-AC3] 펼친 내용: 설명·`호출 N · 직접 호출 N · 미리 넣음 N = N회`·정의상·실제 사용(기본 세션)·`정의됨 · 사용 0`", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();
    fireEvent.click(screen.getByRole("button", { name: "alpha 펼치기" }));

    const detail = rowOf("alpha").querySelector('[data-wf="08-13"]') as HTMLElement;
    expect(detail).toHaveTextContent("알파 설명");
    expect(detail).toHaveTextContent("둘째 줄");
    expect(detail).toHaveTextContent("사용 횟수 · 최근 7일");
    expect(detail).toHaveTextContent("호출 2 · 직접 호출 1 · 미리 넣음 7 = 10회");
    expect(detail).toHaveTextContent(/정의상 \(skills:\)\s*dev\s*lead/);
    expect(detail).toHaveTextContent(/실제 사용 \(횟수\)\s*dev6\s*기본 세션4/);
    expect(within(detail).getAllByText("정의됨 · 사용 0")).toHaveLength(1);
    expect(detail).toHaveTextContent(/lead\s*정의됨 · 사용 0/);
  });

  it("[FR-019-AC3] 정의상·실제 사용이 비면 `-`, 정의됨 · 사용 0 칩이 없다", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();
    fireEvent.click(screen.getByRole("button", { name: "charlie 펼치기" }));

    const detail = rowOf("charlie").querySelector('[data-wf="08-13"]') as HTMLElement;
    expect(within(detail).getAllByText("-")).toHaveLength(2);
    expect(within(detail).queryByText("정의됨 · 사용 0")).toBeNull();
    expect(detail).toHaveTextContent("호출 0 · 직접 호출 0 · 미리 넣음 0 = 0회");
  });

  it("[FR-019-AC7] 기간 안 모든 스킬 사용이 0이면 % 대신 `기록 없음`, 막대 없음, 사용 합계 0회", async () => {
    stubSkills(() =>
      jsonResponse(
        buildSkillsReport([buildSkillRow("alpha", { percent: null }), buildSkillRow("bravo", { percent: null })], {
          totalUses: 0,
        }),
      ),
    );
    const { container } = renderScreen();
    await waitForRows();

    expect(screen.getAllByText("기록 없음")).toHaveLength(2);
    expect(screen.queryByRole("img", { name: /^활용도/ })).toBeNull();
    expect(container.querySelector('[data-wf="08-3"]')).toHaveTextContent(/사용 합계\s*0\s*회/);
  });

  it("[FR-019-E1] hook 미설정이면 안내 줄(08-4, role=status, circle-alert)이 뜨고, 설정돼 있으면 줄 자체가 없다", async () => {
    stubSkills(() => jsonResponse({ ...SAMPLE, hookConfigured: false }));
    const first = renderScreen();
    await waitForRows();

    const note = screen.getByText("hook 이벤트가 없어 호출 기록을 셀 수 없습니다");
    expect(note).toHaveAttribute("role", "status");
    expect(note).toHaveAttribute("data-wf", "08-4");
    expect(note.querySelector("svg.lucide-circle-alert")).not.toBeNull();
    first.unmount();

    stubSkills(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();
    expect(container.querySelector('[data-wf="08-4"]')).toBeNull();
  });

  it("[FR-019-AC4] 기간 줄: 기본 7일(aria-pressed)·날짜 범위 MM-DD ~ MM-DD·`최근 7일` 머리 → 30일·전체로 바꾸면 그 기간으로 다시 조회하고 머리가 바뀐다", async () => {
    const urls = stubSkills((url) => {
      const period = /period=(7d|30d|all)/.exec(url)?.[1] as "7d" | "30d" | "all";
      return jsonResponse({
        ...SAMPLE,
        period,
        range: period === "all" ? { from: null, to: "2026-10-15" } : { from: period === "7d" ? "2026-10-09" : "2026-09-16", to: "2026-10-15" },
      });
    });
    renderScreen();
    await waitForRows();

    expect(urls[0]).toMatch(/^\/api\/skills\?period=7d&tz=/);
    expect(screen.getByRole("button", { name: "7일" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("period-range")).toHaveTextContent("10-09 ~ 10-15");
    expect(screen.getByText("활용도 · 최근 7일")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "30일" }));
    expect(await screen.findByText("활용도 · 최근 30일")).toBeInTheDocument();
    expect(screen.getByTestId("period-range")).toHaveTextContent("09-16 ~ 10-15");
    expect(screen.getByRole("button", { name: "30일" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(await screen.findByText("활용도 · 전체")).toBeInTheDocument();
    expect(screen.getByTestId("period-range")).toHaveTextContent("-");
    expect(urls.at(-1)).toMatch(/period=all/);
  });

  it("[FR-020-E2] writable=false면 `가져오기`·`스킬 만들기`·행 `수정`·행 `삭제` 네 버튼이 모두 비활성이고 이유 `쓰기 권한 없음`이 보인다(눌러도 이동하지 않는다)", async () => {
    seedRegistry({ writable: false });
    stubSkills(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();

    const title = container.querySelector('[data-wf="08-2"]') as HTMLElement;
    const headButtons = [within(title).getByRole("button", { name: "가져오기" }), within(title).getByRole("button", { name: "스킬 만들기" })];
    for (const button of headButtons) expect(button).toBeDisabled();
    expect(title).toHaveTextContent("쓰기 권한 없음");

    const edits = screen.getAllByRole("button", { name: "수정" });
    const deletes = screen.getAllByRole("button", { name: "삭제" });
    expect(edits).toHaveLength(3);
    expect(deletes).toHaveLength(3);
    for (const button of [...edits, ...deletes]) {
      expect(button).toBeDisabled();
      const reason = document.getElementById(button.getAttribute("aria-describedby") as string);
      expect(reason).toHaveTextContent("쓰기 권한 없음");
    }
    // 우선순위: 쓰기 권한 > 가져온 스킬 — 가져온 스킬 행도 `쓰기 권한 없음`이다
    expect(within(rowOf("charlie")).queryByText("가져온 스킬은 수정할 수 없습니다")).toBeNull();
    for (const button of [...headButtons, edits[0] as HTMLElement, deletes[0] as HTMLElement]) fireEvent.click(button);
    expect(screen.getByTestId("location")).toHaveTextContent("/skills");
    expect(screen.getByTestId("location")).not.toHaveTextContent("dialog=");
  });

  it("[FR-020-E2] 첫 스냅샷 전(writable 모름)에는 네 버튼이 비활성이고 이유 줄은 없다(ADR-44)", async () => {
    snapshotStore.reset();
    stubSkills(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();

    const title = container.querySelector('[data-wf="08-2"]') as HTMLElement;
    expect(within(title).getByRole("button", { name: "스킬 만들기" })).toBeDisabled();
    expect(within(title).getByRole("button", { name: "가져오기" })).toBeDisabled();
    expect(within(rowOf("alpha")).getByRole("button", { name: "수정" })).toBeDisabled();
    expect(screen.queryByText("쓰기 권한 없음")).toBeNull();
  });

  it("[FR-020-AC1] 제목 줄 `스킬 만들기`(primary, plus) → ?dialog=skill-new, `가져오기`(secondary, import) → ?dialog=skill-import, 행 `수정` → ?dialog=skill-edit&skill=<이름>", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await waitForRows();

    const title = container.querySelector('[data-wf="08-2"]') as HTMLElement;
    const create = within(title).getByRole("button", { name: "스킬 만들기" });
    const importButton = within(title).getByRole("button", { name: "가져오기" });
    expect(create).toBeEnabled();
    expect(create.querySelector("svg.lucide-plus")).not.toBeNull();
    expect(importButton.querySelector("svg.lucide-import")).not.toBeNull();
    expect(screen.queryByText("쓰기 권한 없음")).toBeNull();

    fireEvent.click(create);
    expect(screen.getByTestId("location")).toHaveTextContent("/skills?dialog=skill-new");
    fireEvent.click(importButton);
    expect(screen.getByTestId("location")).toHaveTextContent("dialog=skill-import");
    fireEvent.click(within(rowOf("bravo")).getByRole("button", { name: "수정" }));
    expect(screen.getByTestId("location")).toHaveTextContent("dialog=skill-edit&skill=bravo");
  });

  it("[FR-020-AC5] 저장 직후 안내 줄(08-4, info) `Claude Code가 새 스킬을 바로 인식하지 못하면 재시작이 필요할 수 있습니다`가 8000ms 보이고 사라진다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    stubSkills(() => jsonResponse(SAMPLE));
    const { container } = renderScreen();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector('[data-wf="08-4"]')).toBeNull();

    act(() => {
      skillsViewStore.afterSave();
    });
    const note = screen.getByText("Claude Code가 새 스킬을 바로 인식하지 못하면 재시작이 필요할 수 있습니다");
    expect(note).toHaveAttribute("role", "status");
    expect(note).toHaveAttribute("data-wf", "08-4");
    expect(note.querySelector("svg.lucide-info")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7900);
    });
    expect(screen.getByText(/새 스킬을 바로 인식하지 못하면/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByText(/새 스킬을 바로 인식하지 못하면/)).toBeNull();
  });

  it("[FR-020-AC5] 저장 후 안내 줄이 hook 미설정 안내보다 먼저 보이고(한 줄만), 사라진 뒤 hook 안내가 돌아온다. 화면을 다시 열면 지난 신호로는 띄우지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    stubSkills(() => jsonResponse({ ...SAMPLE, hookConfigured: false }));
    const first = renderScreen();
    const noteCount = () => first.container.querySelectorAll('[data-wf="08-4"]').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("hook 이벤트가 없어 호출 기록을 셀 수 없습니다")).toBeInTheDocument();

    act(() => {
      skillsViewStore.afterSave();
    });
    expect(noteCount()).toBe(1);
    expect(screen.queryByText("hook 이벤트가 없어 호출 기록을 셀 수 없습니다")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8100);
    });
    expect(screen.getByText("hook 이벤트가 없어 호출 기록을 셀 수 없습니다")).toBeInTheDocument();
    first.unmount();

    renderScreen();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText(/새 스킬을 바로 인식하지 못하면/)).toBeNull();
  });

  it("[FR-022-AC1] 행 `삭제`(writable) → ?dialog=skill-delete&skill=<이름>으로 이동한다", async () => {
    stubSkills(() => jsonResponse(SAMPLE));
    renderScreen();
    await waitForRows();

    fireEvent.click(within(rowOf("bravo")).getByRole("button", { name: "삭제" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/skills?dialog=skill-delete&skill=bravo");
  });

  it("[FR-019-AC5] `usage-changed`(skills)·registry revision 변화 → 재조회(묶음 간격 안의 알림은 한 번으로 묶고 마지막 알림 뒤 1회, 간격은 2초 반영 예산 안), 펼침은 유지", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    let call = 0;
    const urls = stubSkills(() => {
      call += 1;
      return jsonResponse(buildSkillsReport([buildSkillRow("alpha", { usage: { call, slash: 0, preload: 0, total: call }, percent: 100 })], { totalUses: call }));
    });
    renderScreen();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(urls).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "alpha 펼치기" }));
    expect(screen.getByRole("button", { name: "alpha 접기" })).toBeInTheDocument();

    // 알림 세 건(영역 신호 2 + revision 1)이 묶음 간격 안에 몰려도 조회는 마지막 알림 뒤 한 번이다.
    expect(SKILLS_REFETCH_INTERVAL_MS).toBeLessThan(2000);
    await act(async () => {
      usageSignalStore.signal(["skills"], null);
      await vi.advanceTimersByTimeAsync(300);
      usageSignalStore.signal(["skills"], null);
      const base = buildSnapshotFixture();
      snapshotStore.setRegistry({ ...base.registry, skillCount: 3, revision: 2 });
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(urls).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKILLS_REFETCH_INTERVAL_MS - 600 + 50);
    });
    expect(urls).toHaveLength(2);
    expect(screen.getByRole("button", { name: "alpha 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(rowOf("alpha").querySelector('[data-wf="08-13"]')).toHaveTextContent("호출 2");

    // 다른 영역(mcp) 신호는 무시한다.
    await act(async () => {
      usageSignalStore.signal(["mcp"], null);
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(urls).toHaveLength(2);
  });

  it("[FR-018-E1] 조회 실패 → 목록 자리에 서버 message `Alert` + `다시 시도`(누르면 다시 조회해 목록이 나온다)", async () => {
    let fail = true;
    const urls = stubSkills(() =>
      fail
        ? jsonResponse({ code: "IO_FAILED", message: "스킬 목록을 읽지 못했습니다" }, 500)
        : jsonResponse(SAMPLE),
    );
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("스킬 목록을 읽지 못했습니다");
    expect(screen.queryByRole("region", { name: "스킬 목록" })).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitForRows();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(urls).toHaveLength(2);
  });
});
