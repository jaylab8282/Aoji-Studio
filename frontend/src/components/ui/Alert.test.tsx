import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "./Alert";
import { splitFirstSentence } from "../../lib/derive/splitFirstSentence";

// ui-spec.md §공통 Alert, ADR-73: 첫 `". "`까지 굵게, 나머지는 일반 다음 줄. 글자는 바뀌지 않는다.
const MESSAGE = "구성 파일을 만들지 못했습니다. 쓰기 권한이 없습니다. 마운트를 확인하세요";

describe("Alert", () => {
  it("[NFR-12] 블록형: 첫 `. `까지 굵게(600·danger), 나머지는 text-text 400 다음 줄", () => {
    render(<Alert block message={MESSAGE} />);

    const alert = screen.getByRole("alert");
    const lead = alert.querySelector('[data-part="lead"]');
    const rest = alert.querySelector('[data-part="rest"]');
    expect(lead).toHaveTextContent("구성 파일을 만들지 못했습니다.");
    expect(lead).toHaveClass("font-semibold");
    expect(rest).toHaveClass("font-normal", "text-text", "block");
    expect(rest?.textContent?.trim()).toBe("쓰기 권한이 없습니다. 마운트를 확인하세요");
    expect(alert).toHaveClass("items-start", "border-danger-border", "bg-danger-soft", "text-danger", "rounded-card", "text-aux");
  });

  it("[NFR-12] 두 조각을 이어 붙이면 원문 message와 글자가 같다", () => {
    for (const message of [MESSAGE, "한 문장뿐입니다", "끝에 마침표가 있습니다. ", "A. B. C"]) {
      const { lead, rest } = splitFirstSentence(message);
      expect(lead + rest, message).toBe(message);
    }

    render(<Alert block message={MESSAGE} />);
    const alert = screen.getByRole("alert");
    const parts = [...alert.querySelectorAll("[data-part]")].map((node) => node.textContent).join("");
    expect(parts).toBe(MESSAGE);
  });

  it("[NFR-12] `. `가 없으면 전체가 굵게, 나머지 줄은 없다", () => {
    render(<Alert block message="서버에 연결할 수 없습니다 · 다시 시도하세요" />);

    const alert = screen.getByRole("alert");
    expect(alert.querySelector('[data-part="lead"]')).toHaveTextContent("서버에 연결할 수 없습니다 · 다시 시도하세요");
    expect(alert.querySelector('[data-part="rest"]')).toBeNull();
  });

  it("[NFR-12] 한 줄형은 아이콘 가운데 정렬이고 분할하지 않는다", () => {
    render(<Alert message={MESSAGE} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("items-center");
    expect(alert.querySelector('[data-part="rest"]')).toBeNull();
    expect(alert).toHaveTextContent(MESSAGE);
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
