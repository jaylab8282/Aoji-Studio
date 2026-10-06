import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TopBar } from "./TopBar";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import { LOCAL_ONLY_TEXT, PROJECT_CHIP_PREFIX } from "../../lib/text";

// ui-spec.md §공통 `TopBar`, conventions.md §7 MUST, ADR-30.
// 칩 표시 여부는 화면이 넘긴 설정(`showProjectChip`)으로만 정한다. TopBar는 라우트를 읽지 않는다.
describe("TopBar", () => {
  const hostPath = buildSnapshotFixture().config.hostPath;

  beforeEach(() => {
    snapshotStore.replace(buildSnapshotFixture());
  });

  afterEach(() => {
    snapshotStore.reset();
  });

  it("[ADR-30] 칩 표시 설정 on → 프로젝트 칩을 그린다", () => {
    render(<TopBar breadcrumb="홈" showProjectChip />);

    expect(screen.getByText(`${PROJECT_CHIP_PREFIX}${hostPath}`)).toBeInTheDocument();
    expect(screen.getByText(LOCAL_ONLY_TEXT)).toBeInTheDocument();
  });

  it("[ADR-30] 칩 표시 설정 off → 프로젝트 칩도 칩 스켈레톤도 없다", () => {
    render(<TopBar breadcrumb="개발부서" showProjectChip={false} />);

    expect(screen.queryByText(`${PROJECT_CHIP_PREFIX}${hostPath}`)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("프로젝트 칩 로딩 중")).not.toBeInTheDocument();
    expect(screen.getByText("개발부서")).toBeInTheDocument();
  });

  it("[ADR-30] 설정을 넘기지 않으면 칩을 그리지 않는다(기본 미표시)", () => {
    render(<TopBar breadcrumb="설정" />);

    expect(screen.queryByText(`${PROJECT_CHIP_PREFIX}${hostPath}`)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("프로젝트 칩 로딩 중")).not.toBeInTheDocument();
  });

  it("[ADR-30][ADR-32] 칩 표시 on + 첫 스냅샷 전 → 칩 자리에 자체 스켈레톤", () => {
    snapshotStore.reset();
    render(<TopBar breadcrumb="홈" showProjectChip />);

    expect(screen.getByLabelText("프로젝트 칩 로딩 중")).toBeInTheDocument();
    expect(screen.queryByText(`${PROJECT_CHIP_PREFIX}${hostPath}`)).not.toBeInTheDocument();
  });

  it("[NFR-12] 제목은 h1, data-wf는 화면 원본 이름, 칩은 title = 전체 경로 + data-clamp", () => {
    render(<TopBar breadcrumb="홈" showProjectChip wf="01-1" />);

    expect(screen.getByRole("heading", { level: 1, name: "홈" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveAttribute("data-wf", "01-1");
    const chip = screen.getByText(`${PROJECT_CHIP_PREFIX}${hostPath}`);
    expect(chip).toHaveAttribute("title", hostPath);
    expect(chip).toHaveAttribute("data-clamp");
  });

  it("[NFR-11] 오른쪽: 화면 주 동작이 '127.0.0.1 전용' 바로 왼쪽, 전용 글자가 맨 끝", () => {
    render(<TopBar breadcrumb="에이전트 워크플로우" rightExtra={<button type="button">Claude 열기 · 기본 세션</button>} />);

    const items = [...screen.getByRole("banner").children].map((el) => el.textContent);
    expect(items.at(-1)).toBe(LOCAL_ONLY_TEXT);
    expect(items.at(-2)).toBe("Claude 열기 · 기본 세션");
    expect(screen.getByRole("banner")).toHaveClass("h-header", "bg-chrome", "px-gutter");
  });

  it("[NFR-12] 03처럼 제목이 노드면 h1을 만들지 않고 그대로 둔다", () => {
    render(<TopBar breadcrumb={<nav aria-label="위치">브레드크럼</nav>} />);

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "위치" })).toBeInTheDocument();
  });
});
