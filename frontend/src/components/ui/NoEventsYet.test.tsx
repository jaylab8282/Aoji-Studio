import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoEventsYet } from "./NoEventsYet";

// ui-spec.md SCR-04-1, ui-rules.md 04-1 다섯 문구(상태 막대 이유 줄은 HomeScreen.test `04-1-2`).
describe("NoEventsYet", () => {
  it("[FR-005-E1] ui-rules 04-1 문구: 제목·본문·명령 줄·보조 줄", () => {
    render(<NoEventsYet />);

    expect(screen.getByRole("heading", { name: "아직 수집된 활동이 없습니다" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "AojiStudio 폴더에서 Claude Code를 실행하면 에이전트 활동이 여기에 나타납니다. hook 설정이 없으면 이벤트를 받을 수 없습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(".claude/settings.json — 설정 화면의 hook 설정 예시를 복사해 붙여 넣으세요")).toBeInTheDocument();
    expect(screen.getByText("에이전트 수·스킬 수는 이벤트와 상관없이 정의 파일 기준으로 보입니다")).toBeInTheDocument();
  });

  it("[FR-005-E1] 점선 안내 카드(`04-1-1`)이고 명령 줄은 링크가 아니다(링크·버튼 0개), 옛 문구는 없다", () => {
    const { container } = render(<NoEventsYet />);

    const card = container.querySelector('[data-wf="04-1-1"]')!;
    expect(card).toHaveClass("border-dashed", "border-border-dashed", "text-center");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/^\.claude\/settings\.json —/).tagName).toBe("CODE");
    expect(card).not.toHaveTextContent(/설정 화면에서 예시 복사|워크플로우 탭에 표시|프로젝트 폴더에서/);
  });
});
