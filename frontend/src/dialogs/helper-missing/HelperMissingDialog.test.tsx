import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelperMissingDialog } from "./HelperMissingDialog";

const COMMAND = 'cd "/Users/jaybee/Desktop/AojiStudio" && claude';
const writeText = vi.fn<(text: string) => Promise<void>>();

describe("HelperMissingDialog (ui-spec §공통)", () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("[FR-013-AC9] 제목·본문·선택한 명령·`명령 복사`·`닫기`를 보여준다", () => {
    render(<HelperMissingDialog command={COMMAND} onClose={() => {}} />);

    expect(screen.getByText("열기 도우미가 응답하지 않습니다")).toBeInTheDocument();
    expect(screen.getByText("helper/install.sh로 설치한 뒤 다시 시도하세요")).toBeInTheDocument();
    expect(screen.getByText(COMMAND)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "명령 복사",
      "닫기",
    ]);
    // 새 표현(ADR-71): Dialog sm 480 + 명령 줄은 CommandLine(bg-inset 고정폭).
    expect(screen.getByRole("dialog")).toHaveClass("max-w-dialog-sm");
    expect(screen.getByText(COMMAND)).toHaveClass("bg-inset", "font-mono");
  });

  it("[FR-013-E1] `명령 복사`가 팝업에 실린 명령을 그대로 복사한다", async () => {
    render(<HelperMissingDialog command={COMMAND} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(COMMAND));
    expect(await screen.findByRole("button", { name: "복사됨" })).toBeInTheDocument();
  });

  it("`닫기`와 ESC로 닫는다", () => {
    const onClose = vi.fn();
    render(<HelperMissingDialog command={COMMAND} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
