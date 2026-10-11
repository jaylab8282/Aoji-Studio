import { describe, expect, it } from "vitest";
import { importErrorMessage, importRejectionLines, workflowCreateErrorMessage, workflowNameFieldMessage } from "./errorMapping";

// D-142: 서버 계약은 그대로이고 화면 문구는 ui-rules "final에 없는 문구" 표 글자로 프론트가 만든다.
describe("errorMapping", () => {
  it("[FR-008-E1][FR-008-E2] fields.name → 입력값이 규칙을 어기면 E2, 규칙을 지켰는데 서버가 거절하면 E1(중복)", () => {
    expect(workflowNameFieldMessage("개발/부서")).toBe(
      "이름은 1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만 쓸 수 있습니다.",
    );
    expect(workflowNameFieldMessage("x".repeat(41))).toBe(
      "이름은 1~40자, 한글·영문·숫자·공백·하이픈·언더스코어만 쓸 수 있습니다.",
    );
    expect(workflowNameFieldMessage("개발부서")).toBe(
      "같은 이름의 워크플로우가 이미 있습니다. 다른 이름을 입력하세요. (대소문자는 구분하지 않습니다)",
    );
  });

  it("[FR-008-E3] IO_FAILED만 ui-rules E3 글자(<사유> 고정), 그 밖은 서버 message", () => {
    expect(workflowCreateErrorMessage("IO_FAILED", "무시")).toBe(
      "구성 파일을 만들지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 폴더 쓰기 권한을 확인한 뒤 다시 만드세요.",
    );
    expect(workflowCreateErrorMessage("INTERNAL", "서버 문구")).toBe("서버 문구");
  });

  it("[FR-009-E1] VALIDATION에서 팀장 2명 이상을 보냈으면 N = 팀장 수, 1명이면 서버 message", () => {
    const requested = [
      { name: "a", role: "lead" as const },
      { name: "b", role: "lead" as const },
      { name: "c", role: "member" as const },
    ];
    expect(importErrorMessage({ code: "VALIDATION", serverMessage: "서버", requested })).toBe(
      "팀장은 워크플로우당 1명입니다. 팀장으로 고른 2명 중 1명만 남기세요.",
    );
    expect(importErrorMessage({ code: "VALIDATION", serverMessage: "서버", requested: requested.slice(1) })).toBe("서버");
  });

  it("[FR-009-E3] IO_FAILED → ui-rules E3 글자, 409 LEAD_EXISTS 등은 서버 message", () => {
    expect(importErrorMessage({ code: "IO_FAILED", serverMessage: "무시", requested: [] })).toBe(
      "구성 파일을 바꾸지 못했습니다. 파일을 쓰는 중 오류가 났습니다. 아무것도 바뀌지 않았으니 다시 시도하세요.",
    );
    expect(importErrorMessage({ code: "LEAD_EXISTS", serverMessage: "이미 팀장이 있습니다", requested: [] })).toBe(
      "이미 팀장이 있습니다",
    );
  });

  it("[FR-009-E2] rejected → 소속은 스냅샷 agents에서 찾고 못 찾으면 `다른 워크플로우`, N은 가져온 수", () => {
    const agents = [
      { name: "a", description: "", filePath: "", workflow: "개발부서", role: "member" as const, duplicateWorkflows: [] },
    ];
    expect(importRejectionLines([{ name: "a", reason: "ALREADY_ASSIGNED" }], 2, agents)).toEqual([
      "a은(는) 그사이 개발부서에 들어가 가져오지 않았습니다. 나머지 2명은 가져왔습니다.",
    ]);
    expect(importRejectionLines([{ name: "a", reason: "ALREADY_ASSIGNED" }], 0, null)).toEqual([
      "a은(는) 그사이 다른 워크플로우에 들어가 가져오지 않았습니다. 나머지 0명은 가져왔습니다.",
    ]);
    expect(importRejectionLines([{ name: "z", reason: "NOT_FOUND" }], 1, agents)).toEqual([
      "z: 정의 파일이 없습니다 · 목록을 확인하세요",
    ]);
  });
});
