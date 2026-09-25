/**
 * 테스트 전용 Settings fixture. api-spec.yaml `Settings` 스키마를 그대로 따른다
 * (`mountPath`는 계약에 없다 — ADR-20/D-021).
 */
import type { Settings } from "../../api/types";

export function buildSettingsFixture(overrides: Partial<Settings> = {}): Settings {
  return {
    hostPath: "/Users/jaybee/Desktop/JayStudio",
    agentCount: 7,
    skillCount: 3,
    writable: true,
    formatErrorCount: 0,
    agentsDirMissing: false,
    terminalApp: "macOS 기본 터미널",
    defaultSessionCommand: 'cd "/Users/jaybee/Desktop/JayStudio" && claude',
    leadSessionCommandTemplate:
      'cd "/Users/jaybee/Desktop/JayStudio" && claude --agent <팀장 name>',
    helperUrl: "http://127.0.0.1:4181",
    collectUrl: "http://127.0.0.1:4180/hooks/events",
    hookConfigured: true,
    hookSettingsExample:
      '{\n  "hooks": {\n    "SessionStart": [\n      {\n        "type": "http",\n        "url": "http://127.0.0.1:4180/hooks/events",\n        "timeout": 3\n      }\n    ]\n  }\n}',
    teamsPath: ".jaystudio/teams/*.json",
    trashPath: ".jaystudio/trash/",
    retentionDays: 30,
    allowedHttpHookUrlsNote:
      "allowedHttpHookUrls가 설정되어 있으면 수집 주소를 허용 목록에 추가하세요",
    ...overrides,
  };
}
