import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmByNameDialog } from "./ConfirmByNameDialog";

// ui-spec.md §공통 ConfirmByNameDialog, ADR-71: Dialog sm, 이름이 같아지기 전 확정 버튼 비활성 + 버튼 위 이유 줄(aria-describedby).
function renderDialog(reason?: string) {
  return render(
    <ConfirmByNameDialog
      title="dev-team을(를) 삭제할까요?"
      notes={["정의 파일은 지워지지 않습니다"]}
      expectedName="dev-team"
      confirmLabel="삭제"
      confirmPendingLabel="삭제 중…"
      reason={reason}
      pending={false}
      errorMessage={null}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("ConfirmByNameDialog", () => {
  it("[NFR-12] 폭 sm(480), 이름이 다르면 확정 버튼 비활성 + 이유 줄이 버튼 aria-describedby로 이어진다", () => {
    renderDialog("dev-team을(를) 똑같이 입력하면 삭제 버튼이 켜집니다");

    expect(screen.getByRole("dialog")).toHaveClass("max-w-dialog-sm");
    const confirm = screen.getByRole("button", { name: "삭제" });
    expect(confirm).toBeDisabled();
    const reason = screen.getByText("dev-team을(를) 똑같이 입력하면 삭제 버튼이 켜집니다");
    expect(confirm).toHaveAttribute("aria-describedby", reason.id);
    // 이유 줄은 확정 버튼(아래 줄)보다 위에 있다.
    expect(reason.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("[NFR-12] 이름을 똑같이 입력하면 버튼이 켜지고 이유 줄이 사라진다", () => {
    renderDialog("dev-team을(를) 똑같이 입력하면 삭제 버튼이 켜집니다");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "dev-team" } });

    const confirm = screen.getByRole("button", { name: "삭제" });
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("dev-team을(를) 똑같이 입력하면 삭제 버튼이 켜집니다")).not.toBeInTheDocument();
  });

  it("[NFR-12] 이유 문구를 넘기지 않으면 이유 줄 자리가 없다", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "삭제" })).not.toHaveAttribute("aria-describedby");
  });
});
