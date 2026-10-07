import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FORMAT_ERROR_LIST_ELEMENT_ID, FormatErrorList } from "./FormatErrorList";
import type { FormatError } from "../../api/types";

const ERRORS: FormatError[] = [
  { kind: "agent", file: "broken.md", message: "name 누락" },
  { kind: "agent", file: "Web_Tester.md", message: "name 형식 위반" },
  { kind: "agent", file: "dup.md", message: "name 중복 (other.md)" },
  { kind: "workflow", file: "team.json", message: "구성 파일 형식 오류" },
  { kind: "broken-ref", file: "ghost", message: "구성 파일 참조 깨짐 (워크플로우A)", workflow: "워크플로우A" },
];

describe("FormatErrorList", () => {
  it("[FR-002-AC2][FR-006-E2] 카드 머리 '읽지 못한 정의·구성 파일 N개' + 보조 줄, role=alert, data-wf 04-6-1, file-warning 아이콘", () => {
    const { container } = render(<FormatErrorList formatErrors={ERRORS} />);

    const card = screen.getByRole("alert");
    expect(card).toHaveAttribute("data-wf", "04-6-1");
    expect(card.id).toBe(FORMAT_ERROR_LIST_ELEMENT_ID);
    expect(card.className).toContain("border-danger-border");
    expect(screen.getByRole("heading", { name: "읽지 못한 정의·구성 파일 5개" })).toHaveClass("text-danger");
    expect(
      screen.getByText("층·에이전트 수·가져오기 목록에서 뺐습니다 · 에디터에서 고쳐 저장하면 2초 안에 반영됩니다"),
    ).toHaveClass("truncate");
    expect(container.querySelector("svg.lucide-file-warning")).not.toBeNull();
  });

  it("[FR-002-AC2][FR-002-AC5][FR-002-AC6][FR-006-E2] 두 열 표(파일 280 고정폭 mono / 사유): 정의 파일 오류·구성 파일 형식 오류·참조 깨짐", () => {
    render(<FormatErrorList formatErrors={ERRORS} />);

    const rows = within(screen.getByTestId("format-error-table")).getAllByRole("row");
    expect(rows.map((row) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent))).toEqual([
      ["broken.md", "name 누락"],
      ["Web_Tester.md", "name 형식 위반"],
      ["dup.md", "name 중복 (other.md)"],
      ["team.json", "구성 파일 형식 오류"],
      ["ghost", "구성 파일 참조 깨짐 (워크플로우A)"],
    ]);
    const fileCell = screen.getByText("dup.md");
    expect(fileCell).toHaveClass("font-mono");
    expect(fileCell).toHaveClass("w-invalid-file");
    expect(fileCell).toHaveAttribute("title", "dup.md");
  });

  it("[FR-006-E2] 표는 카드 안 최대 190 스크롤(max-h-invalid-max overflow-auto)", () => {
    render(<FormatErrorList formatErrors={ERRORS} />);
    const table = screen.getByTestId("format-error-table");
    expect(table).toHaveClass("max-h-invalid-max");
    expect(table).toHaveClass("overflow-auto");
  });

  it("[FR-002-AC3] 06이 보낸 신호로 초점을 받을 수 있다(tabIndex -1)", () => {
    render(<FormatErrorList formatErrors={ERRORS} />);
    const card = screen.getByRole("alert");
    card.focus();
    expect(card).toHaveFocus();
  });

  it("[FR-006-E2] 빈 배열 → 렌더하지 않음", () => {
    const { container } = render(<FormatErrorList formatErrors={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
