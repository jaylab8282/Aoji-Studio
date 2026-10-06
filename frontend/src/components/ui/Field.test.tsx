import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

// ui-spec.md §공통 Field, conventions.md §4: 에러는 필드 아래 `help.err`(role=alert), 입력에 aria-invalid·aria-describedby, 도움말은 그대로.
describe("Field", () => {
  it("[NFR-12] 에러가 있으면 입력에 aria-invalid·aria-describedby, 에러 줄은 role=alert danger 600", () => {
    render(
      <Field label="이름 (name)" htmlFor="n" error="이미 있는 이름입니다">
        <TextInput id="n" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "이름 (name)" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("이미 있는 이름입니다");
    expect(alert).toHaveClass("text-danger", "font-semibold");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(input).toHaveAccessibleDescription("이미 있는 이름입니다");
  });

  it("[NFR-12] 에러가 있어도 도움말은 그대로 남고 둘 다 aria-describedby에 들어 있다(에러가 먼저)", () => {
    render(
      <Field label="이름 (name)" htmlFor="n" hint="소문자·숫자·하이픈 1~64자" error="이미 있는 이름입니다">
        <TextInput id="n" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "이름 (name)" });
    const hint = screen.getByText("소문자·숫자·하이픈 1~64자");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("text-text-muted");
    const ids = input.getAttribute("aria-describedby")?.split(" ");
    expect(ids).toEqual([screen.getByRole("alert").id, hint.id]);
    // 에러 줄이 도움말보다 위(앞)에 온다.
    expect(screen.getByRole("alert").compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("[NFR-12] 에러가 없으면 aria-invalid·role=alert가 없고 도움말만 aria-describedby로 잇는다", () => {
    render(
      <Field label="이름 (name)" htmlFor="n" hint="1~64자">
        <TextInput id="n" />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "이름 (name)" });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAccessibleDescription("1~64자");
  });

  it("[NFR-12] 라벨 aux 600 text-secondary, 필수 표시는 라벨 밖 muted 400이라 접근성 이름은 라벨 글자 그대로", () => {
    render(
      <Field label="설명 (description)" htmlFor="d" required>
        <TextInput id="d" />
      </Field>,
    );

    expect(screen.getByText("설명 (description)")).toHaveClass("text-aux", "font-semibold", "text-text-secondary");
    expect(screen.getByRole("textbox", { name: "설명 (description)" })).toBeInTheDocument();
    expect(screen.getByText("필수")).toHaveClass("text-text-muted", "font-normal");
  });
});
