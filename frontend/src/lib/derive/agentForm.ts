/**
 * 06 에이전트 만들기·수정 폼의 파생 계산 (conventions.md §3 Frontend MUST: 정렬·집계·라벨 판정은
 * `lib/derive/*` 순수 함수, ADR-15). 폼 컴포넌트는 표시만 하고 값 변환·요청 조립·비활성 판정은 여기서 한다.
 *
 * 기준: ui-spec.md SCR-06 폼 요소 표, api-spec.yaml `AgentDetail`·`AgentCreateRequest`·`AgentUpdateRequest`,
 * ADR-13(model 선택지), FR-010-AC2(tools), FR-011-AC3(소속 비우기).
 */
import type { AgentCreateRequest, AgentDetail, AgentUpdateRequest, ApiErrorCode, Role } from "../../api/types";

/** ADR-13: 드롭다운 선택지. `custom` = `직접 입력`(전체 모델 ID). */
export type ModelChoice = "inherit" | "sonnet" | "opus" | "haiku" | "custom";

/** 드롭다운에 그리는 순서(ui-spec.md SCR-06 `모델 (model)` 행). */
export const MODEL_CHOICES: readonly ModelChoice[] = ["inherit", "sonnet", "opus", "haiku", "custom"];

/** 목록에 이름이 있는 별칭(ADR-13). 그 밖의 값은 `직접 입력`에 채운다. */
const MODEL_ALIASES: readonly string[] = ["sonnet", "opus", "haiku"];

/** FR-010-AC2 체크박스 9종. 화면 배치 순서 = 저장 순서. */
export const TOOL_CHECKBOXES: readonly string[] = [
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
  "Bash",
  "WebFetch",
  "WebSearch",
  "Agent",
];

/** FR-010-AC2: `전체 상속`(frontmatter 생략) / `직접 선택`. 만들기 기본값은 미선택(null)이다. */
export type ToolsMode = "inherit" | "explicit";

export interface AgentFormValues {
  name: string;
  modelChoice: ModelChoice;
  /** `직접 입력`일 때만 쓰는 전체 모델 ID. */
  customModel: string;
  /** null = 만들기의 빈 선택 또는 수정의 `(없음)`(FR-011-AC3). */
  workflow: string | null;
  role: Role | null;
  description: string;
  /** null = 아직 고르지 않음 → `저장` 비활성 + `도구 방식을 고르세요`(FR-010-AC2). */
  toolsMode: ToolsMode | null;
  checkedTools: string[];
  /** `기타` 입력 원문(쉼표 구분). */
  otherTools: string;
  body: string;
}

/** 만들기 모드 초깃값. `?workflow`가 있으면 소속을 미리 고른다(ui-spec.md SCR-06 소속 행). */
export function createFormValues(workflowParam: string | null): AgentFormValues {
  return {
    name: "",
    modelChoice: "inherit",
    customModel: "",
    workflow: workflowParam,
    // 와이어프레임 p.7의 `필수` 표시는 이름·소속 워크플로우·설명 셋뿐이고 `역할`에는 없다.
    // 05-R 목록 표와 같은 기본값 `팀원`으로 두고, `팀장`은 FR-010-AC4 조건에서만 비활성이다.
    role: "member",
    description: "",
    toolsMode: null,
    checkedTools: [],
    otherTools: "",
    body: "",
  };
}

/** `AgentDetail.model` → 드롭다운 선택값(ADR-13). */
export function modelChoiceOf(detail: Pick<AgentDetail, "model" | "hasLiteralInheritModel">): ModelChoice {
  if (detail.hasLiteralInheritModel || detail.model === null || detail.model === "inherit") return "inherit";
  if (MODEL_ALIASES.includes(detail.model)) return detail.model as ModelChoice;
  return "custom";
}

/** 쉼표 구분 `기타` 입력 → 도구 배열(FR-010-AC2). 빈 조각과 앞뒤 공백은 버린다. */
export function parseOtherTools(raw: string): string[] {
  return raw
    .split(",")
    .map((each) => each.trim())
    .filter((each) => each.length > 0);
}

/** 도구 배열 → 체크박스 9종과 `기타` 입력으로 나눈다(목록에 없는 값은 기타에 쉼표로). */
export function splitTools(tools: string[]): { checkedTools: string[]; otherTools: string } {
  return {
    checkedTools: TOOL_CHECKBOXES.filter((tool) => tools.includes(tool)),
    otherTools: tools.filter((tool) => !TOOL_CHECKBOXES.includes(tool)).join(", "),
  };
}

/** `직접 선택`으로 저장할 도구 목록: 체크박스(화면 순서) + `기타`(입력 순서). */
export function selectedTools(values: AgentFormValues): string[] {
  const checked = TOOL_CHECKBOXES.filter((tool) => values.checkedTools.includes(tool));
  const others = parseOtherTools(values.otherTools).filter((tool) => !checked.includes(tool));
  return [...checked, ...others];
}

/** `GET /api/agents/{name}` 응답 → 폼 값(수정 모드 채우기·06-5 다시 불러오기 공용). */
export function detailToFormValues(detail: AgentDetail): AgentFormValues {
  const { checkedTools, otherTools } = splitTools(detail.tools ?? []);
  const choice = modelChoiceOf(detail);
  return {
    name: detail.name,
    modelChoice: choice,
    customModel: choice === "custom" ? (detail.model ?? "") : "",
    workflow: detail.workflow,
    role: detail.role,
    description: detail.description,
    toolsMode: detail.tools === null ? "inherit" : "explicit",
    checkedTools,
    otherTools,
    body: detail.body,
  };
}

/**
 * 저장할 `model` 값(ADR-13). `상속`은 frontmatter에 쓰지 않으므로 null이지만,
 * 원본에 `model: inherit` 줄이 있으면 그 줄을 보존하려고 `inherit`를 그대로 보낸다(FR-011-AC1 정신).
 */
export function modelRequestValue(values: AgentFormValues, hasLiteralInheritModel: boolean): string | null {
  if (values.modelChoice === "inherit") return hasLiteralInheritModel ? "inherit" : null;
  if (values.modelChoice === "custom") {
    const custom = values.customModel.trim();
    return custom === "" ? null : custom;
  }
  return values.modelChoice;
}

/** `POST /api/agents` 본문(api-spec.yaml `AgentCreateRequest`). 소속·역할은 만들기에서 필수다. */
export function buildCreateRequest(values: AgentFormValues): AgentCreateRequest {
  const toolsMode: ToolsMode = values.toolsMode ?? "inherit";
  return {
    name: values.name.trim(),
    description: values.description,
    model: modelRequestValue(values, false),
    workflow: values.workflow ?? "",
    role: values.role ?? "member",
    toolsMode,
    ...(toolsMode === "explicit" ? { tools: selectedTools(values) } : {}),
    body: values.body,
  };
}

/** `PUT /api/agents/{name}` 본문. 소속을 비우면 역할도 null이다(FR-011-AC3). */
export function buildUpdateRequest(
  values: AgentFormValues,
  detail: Pick<AgentDetail, "revision" | "hasLiteralInheritModel">,
  force: boolean,
): AgentUpdateRequest {
  const toolsMode: ToolsMode = values.toolsMode ?? "inherit";
  return {
    name: values.name.trim(),
    description: values.description,
    model: modelRequestValue(values, detail.hasLiteralInheritModel),
    workflow: values.workflow,
    role: values.workflow === null ? null : values.role,
    toolsMode,
    ...(toolsMode === "explicit" ? { tools: selectedTools(values) } : {}),
    body: values.body,
    expectedRevision: detail.revision,
    ...(force ? { force: true } : {}),
  };
}

/** api-spec.yaml `AgentCreateRequest.name` / FR-010-AC1 */
export const AGENT_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

/** 사전 검증(사용자 편의용, 서버 검증을 대신하지 않는다). 빈 값은 `저장` 비활성으로만 알린다. */
export function agentNameRuleViolated(raw: string): boolean {
  const name = raw.trim();
  return name.length > 0 && !AGENT_NAME_PATTERN.test(name);
}

/** `직접 선택`인데 고른 도구가 0개 → 저장 불가(FR-010-AC2). */
export function explicitToolsEmpty(values: AgentFormValues): boolean {
  return values.toolsMode === "explicit" && selectedTools(values).length === 0;
}

/** 필수값이 채워졌는지(ui-spec.md SCR-06 `저장` 행 "필수값 비면 비활성"). 이유 줄은 붙이지 않는다(ADR-35). */
export function requiredFilled(values: AgentFormValues, mode: "create" | "edit"): boolean {
  if (values.name.trim() === "" || agentNameRuleViolated(values.name)) return false;
  if (values.description.trim() === "") return false;
  if (mode === "create" && values.workflow === null) return false;
  if (values.toolsMode === null || explicitToolsEmpty(values)) return false;
  if (values.workflow !== null && values.role === null) return false;
  return true;
}

/**
 * FR-010-AC4: 대상 워크플로우에 이미 팀장이 있고 그게 자기 자신이 아니면 `팀장` 라디오가 비활성이다.
 * 이유 줄 문구는 `lib/text.ts`가 만든다(ADR-35 지정 지점).
 */
export function leadTakenBy(
  workflowLead: string | null,
  currentName: string | null,
): string | null {
  if (workflowLead === null) return null;
  return workflowLead === currentName ? null : workflowLead;
}

/** 저장 실패 사유를 화면 어디에 놓을지(ui-spec.md SCR-06 폼 에러 열). */
export type FormErrorSlot = "top" | "role" | "form";

export function errorSlot(code: ApiErrorCode): FormErrorSlot {
  // FR-011-E4: `작업 중에는 수정할 수 없습니다 · 대기가 되면 다시 시도하세요`는 폼 상단이다.
  if (code === "AGENT_BUSY") return "top";
  // 409 `LEAD_EXISTS`는 `역할` 라디오 옆에 붙는다.
  if (code === "LEAD_EXISTS") return "role";
  return "form";
}

/** 제목 옆 경로(ui-spec.md SCR-06 제목 행). 만들기 모드에서는 저장될 파일 경로를 이름으로 만든다. */
export const AGENTS_DIR_PATH = ".claude/agents/";

export function agentFilePathOf(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? AGENTS_DIR_PATH : `${AGENTS_DIR_PATH}${trimmed}.md`;
}
