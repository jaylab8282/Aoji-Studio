import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

const writeText = vi.fn<(text: string) => Promise<void>>();

function setClipboard() {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("CopyButton (ui-spec §공통)", () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    setClipboard();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("누르면 값을 클립보드에 쓰고 `복사됨`을 1.5초 동안 보여준 뒤 라벨로 돌아온다", async () => {
    // 고정 대기(sleep)가 아니라 타이머를 결정론적으로 밀어 1.5초 경계를 확인한다.
    vi.useFakeTimers();
    const command = 'cd "/Users/jaybee" && claude';
    render(<CopyButton value={command} label="명령 복사" />);

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));

    // 클립보드 프라미스가 처리될 때까지 마이크로태스크만 흘린다(타이머는 그대로).
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith(command);
    expect(screen.getByRole("button", { name: "복사됨" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(screen.getByRole("button", { name: "복사됨" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("button", { name: "명령 복사" })).toBeInTheDocument();
  });

  it("복사할 값이 없으면(null) 비활성이고 클립보드를 호출하지 않는다", () => {
    render(<CopyButton value={null} label="설정 예시 복사" />);

    const button = screen.getByRole("button", { name: "설정 예시 복사" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("클립보드 쓰기가 실패하면 `복사됨`을 보여주지 않는다", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<CopyButton value="example" label="명령 복사" />);

    fireEvent.click(screen.getByRole("button", { name: "명령 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "복사됨" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "명령 복사" })).toBeInTheDocument();
  });
});
