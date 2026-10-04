import { describe, expect, it } from "vitest";
import { actionLabel } from "./actionLabel";
import type { ToolRef } from "../../api/types";

function tool(name: string): ToolRef {
  return { name, target: "backend/src/main/java/studio/aoji/api/AgentController.java" };
}

describe("actionLabel", () => {
  it("[FR-007-AC2] Edit/Write/NotebookEdit → '타이핑 · X', Read/Grep/Glob → '읽기 · X', waiting → '권한 요청' 주황, idle → '대기' 회색, Bash → 'Bash' + running 색", () => {
    expect(actionLabel("running", tool("Edit"))).toEqual({ label: "타이핑 · Edit", tone: "running" });
    expect(actionLabel("running", tool("Write"))).toEqual({ label: "타이핑 · Write", tone: "running" });
    expect(actionLabel("running", tool("NotebookEdit"))).toEqual({ label: "타이핑 · NotebookEdit", tone: "running" });

    expect(actionLabel("running", tool("Read"))).toEqual({ label: "읽기 · Read", tone: "running" });
    expect(actionLabel("running", tool("Grep"))).toEqual({ label: "읽기 · Grep", tone: "running" });
    expect(actionLabel("running", tool("Glob"))).toEqual({ label: "읽기 · Glob", tone: "running" });

    expect(actionLabel("waiting", tool("Edit"))).toEqual({ label: "권한 요청", tone: "waiting" });
    expect(actionLabel("idle", null)).toEqual({ label: "대기", tone: "idle" });

    expect(actionLabel("running", tool("Bash"))).toEqual({ label: "Bash", tone: "running" });
    expect(actionLabel("running", tool("WebFetch"))).toEqual({ label: "WebFetch", tone: "running" });
  });

  it("[FR-007-AC2] running인데 currentTool null → '작업 중'", () => {
    expect(actionLabel("running", null)).toEqual({ label: "작업 중", tone: "running" });
  });

  it("[FR-007-AC2] idle이면 도구가 남아 있어도 '대기'", () => {
    expect(actionLabel("idle", tool("Edit"))).toEqual({ label: "대기", tone: "idle" });
  });
});
