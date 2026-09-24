/**
 * 테스트 전용 `AgentDetail`·`AgentDef` fixture. api-spec.yaml 스키마를 그대로 따른다.
 */
import type { AgentDef, AgentDetail } from "../../api/types";

export function buildAgentDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    name: "dev-lead",
    description: "개발 총괄",
    model: null,
    tools: null,
    body: "지침 본문",
    filePath: ".claude/agents/dev-lead.md",
    revision: "1758343512345-1834",
    modifiedAt: "2026-09-22T10:00:00+09:00",
    workflow: "개발부서",
    role: "lead",
    status: "idle",
    hasLiteralInheritModel: false,
    ...overrides,
  };
}

export function buildAgentDef(overrides: Partial<AgentDef> = {}): AgentDef {
  return {
    name: "dev-lead",
    description: "개발 총괄",
    filePath: ".claude/agents/dev-lead.md",
    workflow: "개발부서",
    role: "lead",
    duplicateWorkflows: [],
    ...overrides,
  };
}
