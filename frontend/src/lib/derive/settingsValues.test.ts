import { describe, expect, it } from "vitest";
import { settingsDisplayValues } from "./settingsValues";
import { buildSettingsFixture } from "../../test/fixtures/settings";
import { buildSnapshotFixture } from "../../test/fixtures/snapshot";
import type { Registry } from "../../api/types";

function registryFixture(overrides: Partial<Registry> = {}): Registry {
  return { ...buildSnapshotFixture().registry, ...overrides };
}

describe("settingsDisplayValues", () => {
  it("registry가 없으면 GET /api/settings 값을 그대로 쓴다", () => {
    const settings = buildSettingsFixture({ agentCount: 7, skillCount: 3, formatErrorCount: 1 });

    expect(settingsDisplayValues(settings, null)).toEqual({
      hostPath: "/Users/jaybee/Desktop/AojiStudio",
      agentCount: 7,
      skillCount: 3,
      writable: true,
      formatErrorCount: 1,
      agentsDirMissing: false,
      hookConfigured: true,
    });
  });

  it("[FR-001-AC4] registry(SSE·다시 읽기 응답)가 오면 스캔 수치를 registry 값으로 갱신한다", () => {
    const settings = buildSettingsFixture({ agentCount: 7, skillCount: 3, formatErrorCount: 0 });
    const registry = registryFixture({
      agentCount: 9,
      skillCount: 4,
      formatErrors: [{ kind: "agent", file: "broken.md", message: "name 누락" }],
    });

    const values = settingsDisplayValues(settings, registry);

    expect(values.agentCount).toBe(9);
    expect(values.skillCount).toBe(4);
    expect(values.formatErrorCount).toBe(1);
  });

  it("[FR-014-AC4] hostPath(맥북 경로)는 registry에 없으므로 settings 값을 유지한다", () => {
    const settings = buildSettingsFixture({ hostPath: "/Users/jaybee/Desktop/AojiStudio" });

    expect(settingsDisplayValues(settings, registryFixture()).hostPath).toBe(
      "/Users/jaybee/Desktop/AojiStudio",
    );
  });

  it("[FR-001-E1][FR-001-E2][FR-014-AC3] agentsDirMissing·writable·hookConfigured도 registry가 이긴다", () => {
    const settings = buildSettingsFixture({
      agentsDirMissing: false,
      writable: true,
      hookConfigured: true,
    });
    const registry = registryFixture({
      agentsDirMissing: true,
      writable: false,
      hookConfigured: false,
      agentCount: null,
    });

    const values = settingsDisplayValues(settings, registry);

    expect(values.agentsDirMissing).toBe(true);
    expect(values.writable).toBe(false);
    expect(values.hookConfigured).toBe(false);
    expect(values.agentCount).toBeNull();
  });
});
