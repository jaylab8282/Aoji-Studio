import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormatErrorList } from "./FormatErrorList";
import type { FormatError } from "../../api/types";

describe("FormatErrorList", () => {
  it("[FR-002-AC2] 파일명+사유 행, 중복은 상대 파일명", () => {
    const formatErrors: FormatError[] = [
      { kind: "agent", file: "broken.md", message: "name 누락" },
      { kind: "agent", file: "dup.md", message: "name 중복 (other.md)" },
      { kind: "workflow", file: "team.json", message: "구성 파일 형식 오류" },
      { kind: "broken-ref", file: "ghost", message: "구성 파일 참조 깨짐 (워크플로우A)", workflow: "워크플로우A" },
    ];

    render(<FormatErrorList formatErrors={formatErrors} />);

    expect(screen.getByText("읽지 못한 정의 파일 4개")).toBeInTheDocument();
    expect(screen.getByText("dup.md")).toBeInTheDocument();
    expect(screen.getByText(/name 중복 \(other\.md\)/)).toBeInTheDocument();
    expect(screen.getByText(/구성 파일 참조 깨짐 \(워크플로우A\)/)).toBeInTheDocument();
  });

  it("빈 배열 → 렌더하지 않음", () => {
    const { container } = render(<FormatErrorList formatErrors={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
