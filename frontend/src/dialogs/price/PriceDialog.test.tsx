import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PriceDialog } from "./PriceDialog";
import { priceText } from "../../lib/derive/priceRows";
import { pricingStore } from "../../state/pricingStore";
import { PRICES } from "../../test/fixtures/cost";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubPricing(respond: () => Response): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return respond();
    }),
  );
  return urls;
}

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <PriceDialog onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => pricingStore.reset());
afterEach(() => vi.unstubAllGlobals());

// ui-spec SCR-10-1: 읽기 전용 단가표.
describe("PriceDialog", () => {
  it("[FR-026-AC4] 읽기 전용: 입력란·저장·기본값으로·모델 추가 없음, 주 동작 `닫기` 하나가 처음 초점, 출처 링크 없음", async () => {
    stubPricing(() => jsonResponse(PRICES));
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "단가" });
    await screen.findByText("claude-haiku-4-5");

    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(within(dialog).queryByRole("spinbutton")).toBeNull();
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /저장|기본값|추가|삭제|수정/ })).toBeNull();
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["닫기"]);
    expect(buttons[0]).toHaveFocus();
    expect(dialog.querySelector('[data-wf="10-1-3"]')).toHaveTextContent(
      "단가표에 없는 모델은 단가 없음으로 표시하고 합계에서 뺍니다 · 새 모델 단가는 앱 업데이트 때 추가됩니다",
    );
    expect(within(dialog.querySelector('[data-wf="10-1-3"]') as HTMLElement).getByText("단가 없음").tagName).toBe("B");
  });

  it("[FR-026-AC3] 제목 `단가` + `100만 토큰당 USD · 읽기 전용` + `Anthropic 가격표 · 확인 <날짜>`, 표 머리 5칸, 서버 순서(모델 이름 오름차순) 그대로, 단가는 소수 둘째(셋째가 0이 아니면 셋째까지)", async () => {
    stubPricing(() => jsonResponse(PRICES));
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "단가" });
    await screen.findByText("claude-haiku-4-5");

    expect(dialog).toHaveTextContent("100만 토큰당 USD · 읽기 전용");
    expect(dialog).toHaveTextContent("Anthropic 가격표 · 확인 2026-10-15");
    const table = dialog.querySelector('[data-wf="10-1-2"]') as HTMLElement;
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "모델",
      "입력",
      "출력",
      "캐시 생성",
      "캐시 읽기",
    ]);
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["claude-haiku-4-5", "1.00", "5.00", "1.25", "0.10"],
      ["claude-opus-4-6", "5.00", "25.00", "6.25", "0.50"],
      ["claude-sonnet-4-6", "3.00", "15.00", "3.75", "0.125"],
    ]);
    expect(priceText(0.3)).toBe("0.30");
    expect(priceText(0.125)).toBe("0.125");
  });

  it("[FR-026-AC4] `닫기`와 ESC가 창을 닫는다", async () => {
    stubPricing(() => jsonResponse(PRICES));
    const onClose = renderDialog();
    await screen.findByText("claude-haiku-4-5");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("[FR-026-AC3] 이미 받은 단가표는 다시 조회하지 않고, 조회 실패는 Alert + `다시 시도`로 다시 조회한다", async () => {
    let calls = 0;
    const urls = stubPricing(() => {
      calls += 1;
      return calls === 1 ? jsonResponse({ code: "IO_FAILED", message: "단가표를 읽지 못했습니다" }, 500) : jsonResponse(PRICES);
    });
    renderDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("단가표를 읽지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("claude-haiku-4-5");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(urls).toEqual(["/api/pricing", "/api/pricing"]);

    render(
      <MemoryRouter>
        <PriceDialog onClose={vi.fn()} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText("claude-haiku-4-5").length).toBeGreaterThan(0));
    expect(urls).toHaveLength(2);
  });
});
