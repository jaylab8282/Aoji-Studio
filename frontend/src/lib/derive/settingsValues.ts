/**
 * ui-spec.md SCR-07 카드 1·3의 수치 갱신 규칙(FR-001-AC4, FR-014-AC3).
 *
 * 07은 진입 시 `GET /api/settings`로 값을 받고, 그 뒤 SSE `registry`(와 `다시 읽기` 응답)로
 * 스캔 수치를 갱신한다. 두 출처가 겹치는 필드는 언제나 더 최근인 `registry`가 이긴다.
 * 어느 필드가 겹치는지를 화면 컴포넌트가 아니라 이 순수 함수 한 곳이 정한다
 * (conventions.md §3 Frontend MUST: 파생 계산은 `lib/derive/*`).
 */
import type { Registry, Settings } from "../../api/types";

export interface SettingsDisplayValues {
  /** 맥북 경로(FR-014-AC4). `Registry`에는 없으므로 항상 `settings.hostPath`다. */
  hostPath: string;
  /** `agentsDirMissing`이면 null이고, 그때는 카드 본문이 04-5로 바뀐다(FR-001-E1). */
  agentCount: number | null;
  skillCount: number;
  writable: boolean;
  formatErrorCount: number;
  agentsDirMissing: boolean;
  hookConfigured: boolean;
}

export function settingsDisplayValues(
  settings: Settings,
  registry: Registry | null,
): SettingsDisplayValues {
  if (registry === null) {
    return {
      hostPath: settings.hostPath,
      agentCount: settings.agentCount,
      skillCount: settings.skillCount,
      writable: settings.writable,
      formatErrorCount: settings.formatErrorCount,
      agentsDirMissing: settings.agentsDirMissing,
      hookConfigured: settings.hookConfigured,
    };
  }
  return {
    hostPath: settings.hostPath,
    agentCount: registry.agentCount,
    skillCount: registry.skillCount,
    writable: registry.writable,
    formatErrorCount: registry.formatErrors.length,
    agentsDirMissing: registry.agentsDirMissing,
    hookConfigured: registry.hookConfigured,
  };
}
