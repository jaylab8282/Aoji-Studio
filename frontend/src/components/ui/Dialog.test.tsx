import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogFooter, DialogHeader, type DialogSize } from "./Dialog";

// ui-spec.md §공통 Dialog, ADR-71.
describe("Dialog", () => {
  it("[NFR-12] size별 최대 폭 변수: sm 480·md 560·lg 880(+portrait 920)·price 680, 기본은 md", () => {
    const expected: Record<DialogSize, string[]> = {
      sm: ["max-w-dialog-sm"],
      md: ["max-w-dialog-md"],
      lg: ["max-w-dialog-lg", "portrait:max-w-dialog-lg-portrait"],
      price: ["max-w-dialog-price"],
    };
    for (const [size, classes] of Object.entries(expected) as Array<[DialogSize, string[]]>) {
      const { unmount } = render(
        <Dialog title="팝업" size={size} onClose={vi.fn()}>
          내용
        </Dialog>,
      );
      const dialog = screen.getByRole("dialog", { name: "팝업" });
      for (const cls of classes) expect(dialog, size).toHaveClass(cls);
      expect(dialog).toHaveClass("bg-card", "border-border-strong", "rounded-card", "p-6", "gap-4", "dialog-card-max");
      unmount();
    }

    render(
      <Dialog title="기본" onClose={vi.fn()}>
        내용
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "기본" })).toHaveClass("max-w-dialog-md");
  });

  it("[NFR-12] ESC로 닫히고, 막(scrim) 클릭으로도 닫힌다", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog title="팝업" onClose={onClose}>
        내용
      </Dialog>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const scrim = document.body.querySelector<HTMLElement>(".opacity-78");
    expect(scrim).toHaveClass("bg-page");
    fireEvent.click(scrim as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(container).toBeInTheDocument();
  });

  it("[NFR-12][D-126][D-127] 쌓인 창: ESC는 맨 위 창만 닫고, 위 창이 닫힌 뒤에는 아래 창이 닫힌다. onClose가 매 렌더 새 함수여도 처리기는 한 번만 달린다", () => {
    const lowerClose = vi.fn();
    const upperClose = vi.fn();
    function Stack({ upper }: { upper: boolean }) {
      return (
        <Dialog title="아래" onClose={() => lowerClose()}>
          {upper ? (
            <Dialog title="위" onClose={() => upperClose()}>
              위 내용
            </Dialog>
          ) : null}
        </Dialog>
      );
    }
    const { rerender } = render(<Stack upper />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(upperClose).toHaveBeenCalledTimes(1);
    expect(lowerClose).not.toHaveBeenCalled();

    rerender(<Stack upper={false} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(upperClose).toHaveBeenCalledTimes(1);
    expect(lowerClose).toHaveBeenCalledTimes(1);
  });

  it("[NFR-12] wf·role·describedBy·tall 속성: data-wf, alertdialog, aria-describedby, 06 폼 높이 클래스", () => {
    render(
      <Dialog title="충돌" role="alertdialog" describedBy="body-id" wf="06-5-1" tall onClose={vi.fn()}>
        <p id="body-id">본문</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("alertdialog", { name: "충돌" });
    expect(dialog).toHaveAttribute("data-wf", "06-5-1");
    expect(dialog).toHaveAttribute("aria-describedby", "body-id");
    expect(dialog).toHaveClass("dialog-form-height");
  });

  it("[NFR-12] role=dialog aria-modal=true, 이름은 제목", () => {
    render(
      <Dialog title="워크플로우 추가" onClose={vi.fn()}>
        내용
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "워크플로우 추가" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("[NFR-12] 뜨는 동안 뒤 화면(body의 다른 자식)이 inert이고, 닫으면 풀린다. 이미 inert인 것은 건드리지 않는다", () => {
    const behind = document.createElement("div");
    behind.id = "behind";
    document.body.appendChild(behind);
    const already = document.createElement("div");
    already.setAttribute("inert", "");
    document.body.appendChild(already);

    const { unmount } = render(
      <Dialog title="팝업" onClose={vi.fn()}>
        내용
      </Dialog>,
    );
    expect(behind).toHaveAttribute("inert");
    // 팝업 자신(포털 호스트)은 inert가 아니다.
    expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();

    unmount();
    expect(behind).not.toHaveAttribute("inert");
    expect(already).toHaveAttribute("inert");

    behind.remove();
    already.remove();
  });

  it("[NFR-12] 팝업 위 팝업: 아래 팝업도 inert이고 위 팝업이 닫히면 아래 팝업이 다시 살아난다", () => {
    render(
      <Dialog title="아래" onClose={vi.fn()}>
        아래 내용
      </Dialog>,
    );
    const lower = screen.getByRole("dialog", { name: "아래" });
    expect(lower.closest("[inert]")).toBeNull();

    const upper = render(
      <Dialog title="위" onClose={vi.fn()}>
        위 내용
      </Dialog>,
    );
    expect(lower.closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "위" }).closest("[inert]")).toBeNull();

    upper.unmount();
    expect(lower.closest("[inert]")).toBeNull();
  });

  it("[NFR-12] 열 때 카드가 초점을 받고 닫으면 열기 전 초점으로 돌아간다", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Dialog title="팝업" onClose={vi.fn()}>
        내용
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("[NFR-12] DialogHeader는 제목 700 + 부제 aux muted, DialogFooter는 버튼 오른쪽·도움말 왼쪽", () => {
    render(
      <>
        <DialogHeader title="제목" subtitle="부제" />
        <DialogFooter note="도움말">
          <button type="button">확인</button>
        </DialogFooter>
      </>,
    );
    expect(screen.getByRole("heading", { name: "제목" })).toHaveClass("text-section", "font-bold");
    expect(screen.getByText("부제")).toHaveClass("text-aux", "text-text-muted");
    expect(screen.getByText("도움말")).toHaveClass("mr-auto");
    expect(screen.getByText("도움말").parentElement).toHaveClass("justify-end");
  });
});
