import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./Badge";
import { Checkbox } from "./Checkbox";
import { Chip } from "./Chip";
import { CommandLine } from "./CommandLine";
import { Link } from "./Link";
import { NoticeCard } from "./NoticeCard";
import { Radio } from "./Radio";
import { Skeleton } from "./Skeleton";
import { StatusDot } from "./StatusDot";
import { StatusLabel } from "./StatusLabel";
import { Tooltip } from "./Tooltip";

// ui-spec.md §공통 컴포넌트 표(Chip·StatusDot·StatusLabel·Badge·Skeleton·NoticeCard·CommandLine·Link·Checkbox·Radio·Tooltip).
describe("Chip", () => {
  it("[NFR-12] 시안·주황·빨강·중립 칩: 높이 24·rounded-chip·aux 600, 색 토큰 짝", () => {
    const expected = {
      live: ["bg-live-soft", "text-live"],
      waiting: ["bg-waiting-soft", "text-waiting"],
      danger: ["bg-danger-soft", "text-danger"],
      neutral: ["bg-selected", "text-text-muted"],
    } as const;
    for (const [tone, classes] of Object.entries(expected)) {
      const { unmount } = render(<Chip tone={tone as keyof typeof expected}>{tone}</Chip>);
      const chip = screen.getByText(tone);
      expect(chip).toHaveClass("h-chip", "rounded-chip", "text-aux", "font-semibold", ...classes);
      expect(chip.className).not.toMatch(/hover:/);
      unmount();
    }
  });

  it("[NFR-12] 경로 칩: 고정폭 400 text-mono, 말줄임, title·data-* 속성을 그대로 넘긴다", () => {
    render(
      <Chip path title="/a/b" data-clamp>
        프로젝트 · /a/b
      </Chip>,
    );
    const chip = screen.getByText("프로젝트 · /a/b");
    expect(chip).toHaveClass("font-mono", "text-text-mono", "text-ellipsis", "overflow-hidden", "h-chip", "bg-selected");
    expect(chip).not.toHaveClass("font-semibold");
    expect(chip).toHaveAttribute("title", "/a/b");
    expect(chip).toHaveAttribute("data-clamp");
  });
});

describe("StatusDot·StatusLabel", () => {
  it("[NFR-12] 상태 사각형 8×8 rounded-dot: 작업 중만 발광, 장애 danger", () => {
    const expected = {
      running: ["bg-live", "shadow-glow"],
      waiting: ["bg-waiting"],
      idle: ["bg-idle"],
      danger: ["bg-danger"],
    } as const;
    for (const [status, classes] of Object.entries(expected)) {
      const { container, unmount } = render(<StatusDot status={status as keyof typeof expected} />);
      const dot = container.firstElementChild as HTMLElement;
      expect(dot).toHaveClass("size-dot", "rounded-dot", ...classes);
      expect(dot).toHaveAttribute("aria-hidden", "true");
      if (status !== "running") expect(dot).not.toHaveClass("shadow-glow");
      unmount();
    }
  });

  it("[NFR-12] StatusLabel = 사각형 + 글자, 글자색은 작업 중 live·권한 대기 waiting·대기 text-muted(idle 색 아님)·장애 danger", () => {
    const { container, unmount } = render(
      <>
        <StatusLabel status="running" />
        <StatusLabel status="waiting" short />
        <StatusLabel status="idle" />
        <StatusLabel status="danger" label="장애" />
      </>,
    );
    const labels = [...container.children] as HTMLElement[];
    expect(labels.map((el) => el.textContent)).toEqual(["작업 중", "권한 대기", "대기", "장애"]);
    expect(labels[0]).toHaveClass("text-live");
    expect(labels[1]).toHaveClass("text-waiting");
    expect(labels[2]).toHaveClass("text-text-muted");
    expect(labels[2]).not.toHaveClass("text-idle");
    expect(labels[3]).toHaveClass("text-danger");
    for (const label of labels) expect(label.firstElementChild).toHaveClass("size-dot");
    unmount();
  });
});

describe("Badge", () => {
  it("[NFR-12] 높이 18·bg-selected·text-text·11px 600", () => {
    render(<Badge>팀장</Badge>);
    expect(screen.getByText("팀장")).toHaveClass("h-badge", "bg-selected", "text-text", "text-min", "font-semibold", "rounded-chip");
  });
});

describe("Skeleton", () => {
  it("[NFR-12] ui-spec §로딩: bg-soft·rounded-chip(4px), 기본 높이 12(h-3)·big 28(h-7), 애니메이션 없음", () => {
    const { unmount } = render(
      <>
        <Skeleton aria-label="기본" />
        <Skeleton big aria-label="큰 값" />
        <Skeleton className="h-5 w-24" aria-label="지정" />
      </>,
    );
    expect(screen.getByLabelText("기본")).toHaveClass("bg-soft", "rounded-chip", "h-3");
    expect(screen.getByLabelText("큰 값")).toHaveClass("h-7");
    const own = screen.getByLabelText("지정");
    expect(own).toHaveClass("h-5", "w-24");
    expect(own).not.toHaveClass("h-3");
    for (const label of ["기본", "큰 값", "지정"]) {
      expect(screen.getByLabelText(label).className).not.toMatch(/animate-|transition/);
    }
    unmount();
  });
});

describe("NoticeCard", () => {
  it("[NFR-12] empty: 점선 카드, lg 아이콘 muted, 제목 section 600, 본문 muted, 버튼 줄, role=alert 없음", () => {
    const { container } = render(
      <NoticeCard kind="empty" icon="folder-x" title="비어 있습니다" actions={<button type="button">추가</button>}>
        <p>본문입니다</p>
      </NoticeCard>,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass("border-dashed", "border-border-dashed", "bg-card", "text-center", "px-6", "py-8", "gap-2");
    expect(card).not.toHaveAttribute("role");
    expect(screen.getByRole("heading", { name: "비어 있습니다" })).toHaveClass("text-section", "font-semibold", "text-text");
    expect(card.querySelector("svg")).toHaveAttribute("width", "24");
    expect(screen.getByText("본문입니다").parentElement).toHaveClass("notice-body", "text-text-muted");
    expect(screen.getByRole("button", { name: "추가" })).toBeInTheDocument();
  });

  it("[NFR-12] error: border-danger-border, 제목·아이콘 danger, role=alert", () => {
    const { container } = render(<NoticeCard kind="error" icon="circle-alert" title="읽지 못했습니다" />);
    const card = screen.getByRole("alert");
    expect(card).toHaveClass("border-danger-border");
    expect(card).not.toHaveClass("border-dashed");
    expect(screen.getByRole("heading", { name: "읽지 못했습니다" })).toHaveClass("text-danger");
    expect(container.querySelector("svg")).toHaveClass("text-danger");
  });
});

describe("CommandLine", () => {
  it("[NFR-12] bg-inset·rounded-chip·고정폭 aux, overflow-wrap anywhere, 안 여백 6/8", () => {
    render(<CommandLine>cd /a && claude</CommandLine>);
    expect(screen.getByText("cd /a && claude")).toHaveClass(
      "bg-inset",
      "rounded-chip",
      "font-mono",
      "text-aux",
      "wrap-anywhere",
      "py-1.5",
      "px-2",
    );
  });
});

describe("Link", () => {
  it("[NFR-12] text-link 600 + 밑줄(decoration-action-border, offset 3), hover 밑줄 text-link, 높이 34, 뒤 아이콘", () => {
    render(
      <MemoryRouter>
        <Link to="/settings" trailingIcon="arrow-right">
          설정 열기
        </Link>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "설정 열기" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveClass(
      "text-link",
      "font-semibold",
      "underline",
      "decoration-action-border",
      "underline-offset-3",
      "hover:decoration-link",
      "min-h-control",
    );
    expect(link.lastElementChild?.tagName.toLowerCase()).toBe("svg");
  });
});

describe("Checkbox·Radio", () => {
  it("[NFR-12] Checkbox: 켬 = bg-action + check 아이콘, 끔 = 점선 bg-soft, 비활성 = 점선 bg-card + 라벨 muted", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Checkbox checked label="선택" onChange={onChange} />);
    const box = () => container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(screen.getByRole("checkbox", { name: "선택" })).toBeChecked();
    expect(box()).toHaveClass("size-4", "rounded-dot", "bg-action", "border-action");
    expect(box().querySelector("svg")).not.toBeNull();

    rerender(<Checkbox checked={false} label="선택" onChange={onChange} />);
    expect(box()).toHaveClass("border-border-dashed", "bg-soft");
    expect(box().querySelector("svg")).toBeNull();

    rerender(<Checkbox checked={false} disabled label="선택" onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: "선택" })).toBeDisabled();
    expect(box()).toHaveClass("border-dashed", "bg-card");
    expect(screen.getByText("선택").closest("label")).toHaveClass("text-text-muted", "cursor-not-allowed");
  });

  it("[NFR-12] Radio: 켬 = action 채움 + 안쪽 4px(radio-on), 끔 = 점선 bg-soft, 비활성 = 점선 bg-card", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Radio checked label="팀장" name="role" onChange={onChange} />);
    const circle = () => container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(screen.getByRole("radio", { name: "팀장" })).toBeChecked();
    expect(circle()).toHaveClass("size-4", "rounded-full", "bg-action", "border-action", "radio-on");

    rerender(<Radio checked={false} label="팀장" name="role" onChange={onChange} />);
    expect(circle()).toHaveClass("border-border-dashed", "bg-soft");
    expect(circle()).not.toHaveClass("radio-on");

    rerender(<Radio checked={false} disabled label="팀장" name="role" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "팀장" })).toBeDisabled();
    expect(circle()).toHaveClass("border-dashed", "bg-card");
  });
});

describe("Tooltip", () => {
  it("[NFR-12] 기본은 같은 요소 title로 전체를 보여 준다", () => {
    render(<Tooltip content="매우 긴 이름입니다">짧게…</Tooltip>);
    expect(screen.getByTitle("매우 긴 이름입니다")).toHaveTextContent("짧게…");
  });

  it("[NFR-12] bubble=rail: 래퍼 data-tip(글자는 DOM에 한 번만) + tooltip-rail, 가장자리 옵션", () => {
    const { container } = render(
      <Tooltip bubble="rail" edge="bottom" content="수집 상태" className="mt-auto">
        <button type="button">수집</button>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toHaveAttribute("data-tip", "수집 상태");
    expect(wrapper).toHaveAttribute("data-tip-edge", "bottom");
    expect(wrapper).toHaveClass("tooltip-rail", "mt-auto");
    expect(screen.queryByText("수집 상태")).not.toBeInTheDocument();
  });
});
