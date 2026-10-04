/**
 * 테스트 전용 Snapshot fixture. api-spec.yaml `Snapshot` 스키마를 그대로 따른다.
 */
import type { Snapshot } from "../../api/types";

export function buildSnapshotFixture(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    serverTime: "2026-09-22T10:00:00+09:00",
    config: {
      hostPath: "/Users/jaybee/Desktop/AojiStudio",
      publicOrigin: "http://127.0.0.1:4180",
      collectUrl: "http://127.0.0.1:4180/hooks/events",
      helperUrl: "http://127.0.0.1:4181",
      defaultSessionCommand: 'cd "/Users/jaybee/Desktop/AojiStudio" && claude',
    },
    registry: {
      revision: 1,
      scannedAt: "2026-09-22T10:00:00+09:00",
      agentsDirMissing: false,
      writable: true,
      agentCount: 0,
      skillCount: 0,
      agents: [],
      workflows: [],
      formatErrors: [],
      hookConfigured: true,
    },
    live: {
      lastReceivedAt: null,
      everReceived: false,
      agents: {},
      lobby: [],
      undefinedSubagents: [],
    },
    recentEvents: [],
    ...overrides,
  };
}
