#!/usr/bin/env node
// 이벤트 재생 도구 (architecture.md §7, §8.1).
// 사용법: node replay.mjs --url <수집 주소> --token-file <collect-token 경로> <scenario.jsonl>
// 실제 hook 입력 형식의 JSON을 한 줄씩 순서대로 POST한다. 운영 기능이 아니라 개발·자동 테스트 도구다.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export function parseArguments(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      url: { type: "string" },
      "token-file": { type: "string" },
    },
    allowPositionals: true,
  });

  if (!values.url || !values["token-file"] || positionals.length !== 1) {
    throw new Error(
      "사용법: replay.mjs --url <수집 주소> --token-file <collect-token 경로> <scenario.jsonl>",
    );
  }

  return {
    url: values.url,
    tokenFile: values["token-file"],
    scenarioPath: positionals[0],
  };
}

export async function replay({ url, tokenFile, scenarioPath }, fetchImpl = fetch) {
  const token = readFileSync(tokenFile, "utf8").trim();
  const lines = readFileSync(scenarioPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-JayStudio-Collect-Token": token,
      },
      body: line,
    });
    if (response.status !== 204) {
      throw new Error(`수집 서버가 204가 아닌 응답을 반환했습니다: ${response.status}`);
    }
  }

  return lines.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const count = await replay(args);
    console.log(`재생 완료: ${count}건 전송`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
