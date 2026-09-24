import { describe, expect, it } from "vitest";
import {
  MODEL_CHOICES,
  TOOL_CHECKBOXES,
  agentFilePathOf,
  agentNameRuleViolated,
  buildCreateRequest,
  buildUpdateRequest,
  createFormValues,
  detailToFormValues,
  errorSlot,
  explicitToolsEmpty,
  leadTakenBy,
  modelChoiceOf,
  modelRequestValue,
  parseOtherTools,
  requiredFilled,
  selectedTools,
  splitTools,
} from "./agentForm";
import { buildAgentDetail } from "../../test/fixtures/agent";

describe("agentForm", () => {
  it("[FR-010-AC3][ADR-13] 선택지는 상속·sonnet·opus·haiku·직접 입력 다섯 개다", () => {
    expect(MODEL_CHOICES).toEqual(["inherit", "sonnet", "opus", "haiku", "custom"]);
  });

  it("[FR-010-AC3][ADR-13] model 원본 → 선택값: null·inherit → 상속, 별칭 → 그 값, 그 밖 → 직접 입력", () => {
    expect(modelChoiceOf({ model: null, hasLiteralInheritModel: false })).toBe("inherit");
    expect(modelChoiceOf({ model: "inherit", hasLiteralInheritModel: true })).toBe("inherit");
    expect(modelChoiceOf({ model: "sonnet", hasLiteralInheritModel: false })).toBe("sonnet");
    expect(modelChoiceOf({ model: "opus", hasLiteralInheritModel: false })).toBe("opus");
    expect(modelChoiceOf({ model: "haiku", hasLiteralInheritModel: false })).toBe("haiku");
    expect(modelChoiceOf({ model: "claude-opus-5", hasLiteralInheritModel: false })).toBe("custom");
  });

  it("[FR-010-AC5][ADR-13] 상속은 model을 쓰지 않고, 원본 `model: inherit` 줄은 보존한다", () => {
    const values = createFormValues(null);
    expect(modelRequestValue(values, false)).toBeNull();
    expect(modelRequestValue(values, true)).toBe("inherit");
    expect(modelRequestValue({ ...values, modelChoice: "opus" }, true)).toBe("opus");
    expect(modelRequestValue({ ...values, modelChoice: "custom", customModel: " claude-opus-5 " }, false)).toBe(
      "claude-opus-5",
    );
  });

  it("[FR-010-AC2] 체크박스 9종과 `기타` 쉼표 분리", () => {
    expect(TOOL_CHECKBOXES).toEqual([
      "Read",
      "Grep",
      "Glob",
      "Edit",
      "Write",
      "Bash",
      "WebFetch",
      "WebSearch",
      "Agent",
    ]);
    expect(parseOtherTools(" mcp__a , mcp__b ,, ")).toEqual(["mcp__a", "mcp__b"]);
    expect(splitTools(["Read", "mcp__a", "Bash", "mcp__b"])).toEqual({
      checkedTools: ["Read", "Bash"],
      otherTools: "mcp__a, mcp__b",
    });
    const values = { ...createFormValues(null), toolsMode: "explicit" as const, checkedTools: ["Bash", "Read"], otherTools: "mcp__a" };
    expect(selectedTools(values)).toEqual(["Read", "Bash", "mcp__a"]);
  });

  it("[FR-010-AC2] 직접 선택 0개는 저장 불가, 전체 상속은 tools를 보내지 않는다", () => {
    const empty = { ...createFormValues(null), toolsMode: "explicit" as const };
    expect(explicitToolsEmpty(empty)).toBe(true);
    const inherit = { ...createFormValues("개발부서"), toolsMode: "inherit" as const, name: "qa-01", description: "설명" };
    expect(buildCreateRequest(inherit).tools).toBeUndefined();
    expect(buildCreateRequest(inherit).toolsMode).toBe("inherit");
  });

  it("[FR-011-AC3] 수정 요청에서 소속을 비우면 역할도 null이다", () => {
    const detail = buildAgentDetail({ workflow: null, role: null, tools: ["Read"] });
    const values = detailToFormValues(detail);
    expect(values.workflow).toBeNull();
    expect(values.toolsMode).toBe("explicit");
    const request = buildUpdateRequest(values, detail, false);
    expect(request.workflow).toBeNull();
    expect(request.role).toBeNull();
    expect(request.expectedRevision).toBe(detail.revision);
    expect(request.force).toBeUndefined();
  });

  it("[FR-011-AC4] 덮어쓰기는 force: true를 붙인다", () => {
    const detail = buildAgentDetail();
    expect(buildUpdateRequest(detailToFormValues(detail), detail, true).force).toBe(true);
  });

  it("[FR-010-AC1][FR-010-E1] name 사전 검증은 규칙 위반일 때만 참이다", () => {
    expect(agentNameRuleViolated("")).toBe(false);
    expect(agentNameRuleViolated("dev-lead")).toBe(false);
    expect(agentNameRuleViolated("Dev_Lead")).toBe(true);
    expect(agentNameRuleViolated("a".repeat(65))).toBe(true);
  });

  it("[FR-010-AC4] 대상 워크플로우의 팀장이 자기 자신이면 비활성 대상이 아니다", () => {
    expect(leadTakenBy(null, "dev-lead")).toBeNull();
    expect(leadTakenBy("dev-lead", "dev-lead")).toBeNull();
    expect(leadTakenBy("dev-lead", "qa-01")).toBe("dev-lead");
    expect(leadTakenBy("dev-lead", null)).toBe("dev-lead");
  });

  it("[SCR-06] 필수값 판정: 이름·설명·소속(만들기)·도구 방식", () => {
    const base = createFormValues("개발부서");
    expect(requiredFilled(base, "create")).toBe(false);
    const filled = { ...base, name: "qa-01", description: "설명", toolsMode: "inherit" as const };
    expect(requiredFilled(filled, "create")).toBe(true);
    expect(requiredFilled({ ...filled, workflow: null }, "create")).toBe(false);
    // 수정은 소속을 비울 수 있다(FR-011-AC3).
    expect(requiredFilled({ ...filled, workflow: null, role: null }, "edit")).toBe(true);
    expect(requiredFilled({ ...filled, name: "QA" }, "create")).toBe(false);
  });

  it("[FR-011-E4][SCR-06] 오류 코드별 표시 위치", () => {
    expect(errorSlot("AGENT_BUSY")).toBe("top");
    expect(errorSlot("LEAD_EXISTS")).toBe("role");
    expect(errorSlot("IO_FAILED")).toBe("form");
    expect(errorSlot("FILE_GONE")).toBe("form");
  });

  it("[SCR-06] 만들기 모드 경로는 입력한 이름으로 만든다", () => {
    expect(agentFilePathOf("")).toBe(".claude/agents/");
    expect(agentFilePathOf(" qa-01 ")).toBe(".claude/agents/qa-01.md");
  });
});
