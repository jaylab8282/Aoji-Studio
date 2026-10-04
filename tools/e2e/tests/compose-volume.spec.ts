// [ADR-59][D-109] compose.e2e*.yaml은 볼륨 이름을 고정하지 않는다.
// 고정하면 E2E의 `down -v`가 `-p` 접두 볼륨이 아닌 실제 볼륨을 지울 수 있다. 파일만 읽는다(page 미사용).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_DIR } from "../lib/e2e-state";

const composeFiles = readdirSync(E2E_DIR).filter((name) => /^compose\.e2e.*\.yaml$/.test(name));

test("[ADR-59][D-109] compose.e2e*.yaml 볼륨 이름 고정 없음", () => {
  expect(composeFiles.length).toBeGreaterThanOrEqual(1);
  for (const file of composeFiles) {
    const lines = readFileSync(join(E2E_DIR, file), "utf8").split("\n");
    // 운영 볼륨 이름(고정 문자열)은 어느 줄에도 없다. 주석 줄도 포함해 0건이다.
    const fixedName = lines.filter((line) => line.includes("aojistudio-data"));
    expect(fixedName, `${file}: 고정 볼륨 이름 줄`).toEqual([]);
    // 서비스·볼륨 어디에도 들여쓴 name: 키가 없다(최상위 프로젝트 name:은 들여쓰기가 없다).
    const indentedName = lines.filter((line) => /^\s+name\s*:/.test(line));
    expect(indentedName, `${file}: 들여쓴 name: 키 줄`).toEqual([]);
  }
});
