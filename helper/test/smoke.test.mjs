import { test } from "node:test";
import assert from "node:assert/strict";

// 골격 검증용 샘플 테스트. 실제 열기 도우미 기능은 T-020에서 구현한다.
test("[T-001] node:test 러너가 동작한다", () => {
  assert.equal(1 + 1, 2);
});
