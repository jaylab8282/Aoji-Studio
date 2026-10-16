import { describe, expect, it } from "vitest";
import { barRatio, deleteDisabled, deriveSkillRows, maxTotal, rowMarkerWf } from "./skillRows";
import { percentText } from "./usageFormat";
import { periodWindowText } from "./periodRange";
import { buildSkillRow } from "../../test/fixtures/skills";

const usage = (total: number) => ({ call: total, slash: 0, preload: 0, total });

describe("skillRows·usageFormat·periodRange", () => {
  it("[FR-019-AC2] % 는 소수 첫째 자리(반올림), null이면 표기하지 않는다(기록 없음)", () => {
    expect(percentText(19.6078)).toBe("19.6");
    expect(percentText(52.63157894736842)).toBe("52.6");
    expect(percentText(0)).toBe("0.0");
    expect(percentText(100)).toBe("100.0");
    expect(percentText(null)).toBeNull();
  });

  it("[FR-019-AC2] 막대 길이 = 이 스킬 total / 가장 많이 쓴 스킬 total, 모두 0이면 0", () => {
    const skills = [buildSkillRow("a", { usage: usage(10) }), buildSkillRow("b", { usage: usage(4) }), buildSkillRow("c")];
    expect(maxTotal(skills)).toBe(10);
    expect(deriveSkillRows(skills).map((view) => view.barRatio)).toEqual([1, 0.4, 0]);
    expect(barRatio(0, 0)).toBe(0);
    expect(deriveSkillRows([buildSkillRow("x")])[0]?.barRatio).toBe(0);
  });

  it("[FR-018-AC1] 서버가 준 이름순을 그대로 쓴다", () => {
    const views = deriveSkillRows([buildSkillRow("a"), buildSkillRow("b"), buildSkillRow("c")]);
    expect(views.map((view) => view.row.name)).toEqual(["a", "b", "c"]);
  });

  it("[FR-020-E2][FR-022-AC4] 삭제 비활성은 writable=false 하나뿐이다(가져온·형식 오류 스킬도 삭제 가능)", () => {
    expect(deleteDisabled(false)).toBe(true);
    expect(deleteDisabled(true)).toBe(false);
  });

  it("[FR-018-AC5] 행 표식: 형식 오류 08-9 > 가져온 08-10 > 사용자 전용 08-11", () => {
    expect(rowMarkerWf(buildSkillRow("a", { formatError: "x", imported: true, userOnly: true }))).toBe("08-9");
    expect(rowMarkerWf(buildSkillRow("a", { imported: true, userOnly: true }))).toBe("08-10");
    expect(rowMarkerWf(buildSkillRow("a", { userOnly: true }))).toBe("08-11");
    expect(rowMarkerWf(buildSkillRow("a"))).toBeUndefined();
  });

  it("[FR-019-AC4] 기간 표기: 최근 7일·최근 30일·전체", () => {
    expect([periodWindowText("7d"), periodWindowText("30d"), periodWindowText("all")]).toEqual([
      "최근 7일",
      "최근 30일",
      "전체",
    ]);
  });
});
