import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollectorStatus } from "./CollectorStatus";
import { snapshotStore } from "../../state/snapshotStore";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";

describe("CollectorStatus", () => {
  afterEach(() => {
    snapshotStore.reset();
  });

  it("[FR-003-AC6] hookConfigured true → 'hook 설정됨' + 마지막 수신 hh:mm:ss", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, hookConfigured: true },
      live: { ...fixture.live, lastReceivedAt: "2026-09-22T10:20:30+09:00" },
    });

    render(<CollectorStatus />);

    expect(screen.getByText("hook 설정됨")).toBeInTheDocument();
    expect(screen.getByText("마지막 수신 10:20:30")).toBeInTheDocument();
  });

  it("[FR-003-AC6] hookConfigured false → 'hook 설정 안 됨'", () => {
    const fixture = buildSnapshotFixture();
    snapshotStore.replace({
      ...fixture,
      registry: { ...fixture.registry, hookConfigured: false },
    });

    render(<CollectorStatus />);

    expect(screen.getByText("hook 설정 안 됨")).toBeInTheDocument();
  });

  it("[FR-003-AC6] lastReceivedAt null → '마지막 수신 없음'", () => {
    snapshotStore.replace(buildSnapshotFixture());

    render(<CollectorStatus />);

    expect(screen.getByText("마지막 수신 없음")).toBeInTheDocument();
  });

  it("[FR-003-AC6] ready false → 두 줄 스켈레톤", () => {
    render(<CollectorStatus />);

    expect(screen.getByLabelText("수집 상태 로딩 중")).toBeInTheDocument();
    expect(screen.getByLabelText("마지막 수신 로딩 중")).toBeInTheDocument();
  });
});
