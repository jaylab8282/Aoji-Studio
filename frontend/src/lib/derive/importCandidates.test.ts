import { describe, expect, it } from "vitest";
import {
  descriptionFirstLine,
  hiddenSelectedCount,
  isLeadOptionDisabled,
  leadSelectedBy,
  outsideAgents,
  toImportMembers,
} from "./importCandidates";
import type { AgentDef } from "../../api/types";

function buildAgent(overrides: Partial<AgentDef> = {}): AgentDef {
  return {
    name: "dev-02",
    description: "",
    filePath: ".claude/agents/dev-02.md",
    workflow: null,
    role: null,
    duplicateWorkflows: [],
    ...overrides,
  };
}

describe("outsideAgents", () => {
  it("[FR-009-AC1] workflow null인 에이전트만 name 오름차순", () => {
    const agents = [
      buildAgent({ name: "zeta" }),
      buildAgent({ name: "dev-lead", workflow: "개발부서", role: "lead" }),
      buildAgent({ name: "alpha" }),
      buildAgent({ name: "Beta" }),
    ];

    expect(outsideAgents(agents).map((agent) => agent.name)).toEqual(["Beta", "alpha", "zeta"]);
  });

  it("[FR-009-AC1] 입력 배열을 바꾸지 않는다(순수 함수)", () => {
    const agents = [buildAgent({ name: "b" }), buildAgent({ name: "a" })];
    outsideAgents(agents);
    expect(agents.map((agent) => agent.name)).toEqual(["b", "a"]);
  });
});

describe("descriptionFirstLine", () => {
  it("[FR-009-AC1] 설명은 첫 줄만 쓴다", () => {
    expect(descriptionFirstLine("첫 줄\n둘째 줄")).toBe("첫 줄");
    expect(descriptionFirstLine("")).toBe("");
  });
});

describe("isLeadOptionDisabled", () => {
  it("[FR-009-AC4] 대상 워크플로우에 팀장이 있으면 모든 행의 팀장이 비활성", () => {
    expect(isLeadOptionDisabled({ targetLead: "dev-lead", leadSelectedBy: null, rowName: "a" })).toBe(true);
    expect(isLeadOptionDisabled({ targetLead: "dev-lead", leadSelectedBy: "a", rowName: "a" })).toBe(true);
  });

  it("[FR-009-E1] 한 행이 팀장이면 다른 행만 비활성(자기 행은 유지)", () => {
    expect(isLeadOptionDisabled({ targetLead: null, leadSelectedBy: "a", rowName: "b" })).toBe(true);
    expect(isLeadOptionDisabled({ targetLead: null, leadSelectedBy: "a", rowName: "a" })).toBe(false);
    expect(isLeadOptionDisabled({ targetLead: null, leadSelectedBy: null, rowName: "a" })).toBe(false);
  });
});

describe("leadSelectedBy", () => {
  it("[FR-009-E1] 역할이 lead인 첫 행을 찾는다", () => {
    expect(leadSelectedBy(["a", "b"], { b: "lead" })).toBe("b");
    expect(leadSelectedBy(["a", "b"], { a: "member" })).toBeNull();
  });
});

describe("toImportMembers", () => {
  it("[FR-009-AC5] 체크한 행만 담고 역할 기본값은 팀원", () => {
    expect(toImportMembers(["a", "b"], { b: "lead" })).toEqual([
      { name: "a", role: "member" },
      { name: "b", role: "lead" },
    ]);
  });
});

describe("hiddenSelectedCount", () => {
  it("[ADR-37] 선택 - 검색결과 = 가려진 수", () => {
    const visible = [buildAgent({ name: "dev-02" }), buildAgent({ name: "qa-01" })];

    // 검색 결과에 남은 선택은 세지 않는다.
    expect(hiddenSelectedCount(["dev-02", "qa-01"], visible)).toBe(0);
    // 결과에서 빠진 선택만 센다.
    expect(hiddenSelectedCount(["dev-02", "zeta"], visible)).toBe(1);
    // 검색 결과가 0행이면 선택 전부가 가려진다.
    expect(hiddenSelectedCount(["dev-02", "qa-01"], [])).toBe(2);
    // 선택이 없으면 0이다(안내 줄을 그리지 않는 조건).
    expect(hiddenSelectedCount([], visible)).toBe(0);
  });
});
