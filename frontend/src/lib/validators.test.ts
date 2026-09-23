import { describe, expect, it } from "vitest";
import { normalizeWorkflowName, workflowNameError } from "./validators";
import { WORKFLOW_NAME_RULE_MESSAGE } from "./text";

describe("validators", () => {
  it("[FR-008-AC2] 앞뒤 공백을 제거한 이름을 서버에 보낸다", () => {
    expect(normalizeWorkflowName("  개발부서  ")).toBe("개발부서");
    expect(workflowNameError("  개발부서  ")).toBeNull();
  });

  it("[FR-008-AC2] 한글·영문·숫자·공백·하이픈·언더스코어 1~40자는 통과", () => {
    expect(workflowNameError("개발부서")).toBeNull();
    expect(workflowNameError("dev team")).toBeNull();
    expect(workflowNameError("팀-2_A")).toBeNull();
    expect(workflowNameError("가".repeat(40))).toBeNull();
  });

  it("[FR-008-E2] 허용하지 않는 문자·길이는 사전 검증 문구를 돌려준다", () => {
    expect(workflowNameError("")).toBe(WORKFLOW_NAME_RULE_MESSAGE);
    expect(workflowNameError("   ")).toBe(WORKFLOW_NAME_RULE_MESSAGE);
    expect(workflowNameError("가".repeat(41))).toBe(WORKFLOW_NAME_RULE_MESSAGE);
    expect(workflowNameError("개발/부서")).toBe(WORKFLOW_NAME_RULE_MESSAGE);
    expect(workflowNameError("../etc")).toBe(WORKFLOW_NAME_RULE_MESSAGE);
    expect(workflowNameError("팀.json")).toBe(WORKFLOW_NAME_RULE_MESSAGE);
    expect(workflowNameError("개발부서!")).toBe(WORKFLOW_NAME_RULE_MESSAGE);
  });
});
