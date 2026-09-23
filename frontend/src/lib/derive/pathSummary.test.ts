import { describe, expect, it } from "vitest";
import { pathSummary } from "./pathSummary";

const HOST_PATH = "/Users/jaybee/Desktop/JayStudio";

describe("pathSummary", () => {
  it("[FR-007-AC5] hostPath 접두를 잘라 요약한다", () => {
    expect(pathSummary(`${HOST_PATH}/Jay_Studio/backend`, HOST_PATH)).toBe("Jay_Studio/backend");
  });

  it("[FR-007-AC5] hostPath 자체면 마지막 폴더 이름", () => {
    expect(pathSummary(HOST_PATH, HOST_PATH)).toBe("JayStudio");
  });

  it("[FR-007-AC5] 접두가 아니면 원본 그대로", () => {
    expect(pathSummary("/tmp/other", HOST_PATH)).toBe("/tmp/other");
  });
});
