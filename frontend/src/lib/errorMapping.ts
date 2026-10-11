/**
 * 05 팝업의 에러 코드·필드 → 화면 문구 매핑 (D-142: T-R3-16 서버 변경을 취소했으므로 서버 `message`가 아니라
 * 프론트가 `docs/ui/ui-rules.md` "final에 없는 문구" 표 글자 그대로 만든다). 순수 함수(ADR-15).
 * 서버 계약은 api-spec.yaml `POST /api/workflows`·`POST /api/workflows/{workflow}/members`가 기준이고,
 * 여기서는 응답의 `code`·`fields`·`rejected[]`만 읽는다.
 */
import type { AgentDef, ImportMemberRequestItem, ImportRejected, ImportRejectedReason } from "../api/types";
import {
  IMPORT_ASSIGNED_UNKNOWN_WORKFLOW,
  IMPORT_REJECTED_REASON_TEXT,
  IMPORT_WRITE_FAIL_MESSAGE,
  WORKFLOW_ADD_WRITE_FAIL_MESSAGE,
  WORKFLOW_NAME_DUPLICATE_MESSAGE,
  importAlreadyAssignedLine,
  importLeadMultipleMessage,
  importRejectedLine,
} from "./text";
import { workflowNameError } from "./validators";

/**
 * FR-008-E1·E2: 서버 400 `VALIDATION`의 `fields.name`을 ui-rules 문구로 바꾼다.
 * 서버는 문자·길이 위반과 이름 중복을 같은 코드로 보내므로(문구만 다르다) 입력값을 같은 규칙으로 다시 판정해 가른다:
 * 규칙 위반이면 E2, 규칙을 통과했는데 서버가 이름을 거절했으면 중복(E1)이다.
 */
export function workflowNameFieldMessage(typedName: string): string {
  return workflowNameError(typedName) ?? WORKFLOW_NAME_DUPLICATE_MESSAGE;
}

/** FR-008-E3: `POST /api/workflows` 500 `IO_FAILED` → 05-L 쓰기 실패 문구. 그 밖의 코드는 서버 `message`를 그대로 쓴다. */
export function workflowCreateErrorMessage(code: string, serverMessage: string): string {
  return code === "IO_FAILED" ? WORKFLOW_ADD_WRITE_FAIL_MESSAGE : serverMessage;
}

export interface ImportErrorInput {
  code: string;
  serverMessage: string;
  /** 요청에 실은 `members`. E1의 N(팀장으로 고른 수)을 세는 데 쓴다. */
  requested: ImportMemberRequestItem[];
}

/**
 * FR-009-E1·E3: 가져오기 요청이 거부됐을 때의 팝업 문구.
 * 400 `VALIDATION`(`fields.members`)은 팀장 2명 이상일 때 E1 문구(N = 팀장 수), 500 `IO_FAILED`는 E3 문구,
 * 그 밖(409 `LEAD_EXISTS` 등)은 서버 `message` 그대로다(ui-spec.md SCR-05-R 에러 행).
 */
export function importErrorMessage({ code, serverMessage, requested }: ImportErrorInput): string {
  if (code === "VALIDATION") {
    const leadCount = requested.filter((member) => member.role === "lead").length;
    return leadCount >= 2 ? importLeadMultipleMessage(leadCount) : serverMessage;
  }
  if (code === "IO_FAILED") return IMPORT_WRITE_FAIL_MESSAGE;
  return serverMessage;
}

/**
 * FR-009-E2: 200 응답의 `rejected[]`를 거부 줄로 바꾼다. `ALREADY_ASSIGNED`는 서버가 소속을 주지 않으므로(D-142)
 * 갱신된 스냅샷(`registry.agents`)에서 그 에이전트의 소속 워크플로우를 찾는다. 스냅샷이 아직 안 왔거나(소속 없음) 에이전트가
 * 사라졌으면 `다른 워크플로우`로 쓴다 — 줄은 스냅샷이 오면 다시 계산되므로 그때 실제 이름으로 바뀐다.
 * N은 가져온 수(`added.length`)다. 전부 거부(`added: []`)면 `0`이다(ADR-73 결정 2-1).
 */
export function importRejectionLines(
  rejected: ImportRejected[],
  addedCount: number,
  agents: AgentDef[] | null,
): string[] {
  return rejected.map((item) => {
    if (item.reason === "ALREADY_ASSIGNED") {
      const owner = agents?.find((agent) => agent.name === item.name)?.workflow ?? null;
      return importAlreadyAssignedLine(item.name, owner ?? IMPORT_ASSIGNED_UNKNOWN_WORKFLOW, addedCount);
    }
    // 계약 밖 값(enum 불일치)이 오면 문장을 지어내지 않고 이름만 보여준다(ADR-36).
    if (!(item.reason in IMPORT_REJECTED_REASON_TEXT)) return item.name;
    return importRejectedLine(item.name, item.reason as Exclude<ImportRejectedReason, "ALREADY_ASSIGNED">);
  });
}
