/**
 * 테스트 전용 `GET /api/skills` fixture. api-spec.yaml `SkillsReport`·`SkillRow` 스키마를 그대로 따른다.
 */
import type { SkillDetail, SkillRow, SkillsReport } from "../../api/types";

export function buildSkillRow(name: string, overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    name,
    description: `${name} 설명`,
    filePath: `.claude/skills/${name}/SKILL.md`,
    userOnly: false,
    imported: false,
    formatError: null,
    definedAgents: [],
    usage: { call: 0, slash: 0, preload: 0, total: 0 },
    percent: 0,
    actualAgents: [],
    definedUnused: [],
    usedAgentCount: 0,
    ...overrides,
  };
}

export function buildSkillsReport(skills: SkillRow[], overrides: Partial<SkillsReport> = {}): SkillsReport {
  return {
    period: "7d",
    range: { from: "2026-10-09", to: "2026-10-15" },
    hookConfigured: true,
    totalUses: skills.reduce((sum, skill) => sum + skill.usage.total, 0),
    skills,
    ...overrides,
  };
}

/** 테스트 전용 `SkillDetail`(api-spec `GET /api/skills/{skill}`). */
export function buildSkillDetail(name: string, overrides: Partial<SkillDetail> = {}): SkillDetail {
  return {
    name,
    description: `${name} 설명`,
    userOnly: false,
    body: "# 지침\n",
    filePath: `.claude/skills/${name}/SKILL.md`,
    revision: "1760506325123-842",
    modifiedAt: "2026-10-15T14:31:52+09:00",
    imported: false,
    ...overrides,
  };
}
