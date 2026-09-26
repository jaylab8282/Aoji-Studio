#!/usr/bin/env node
// 이벤트 재생 도구 (architecture.md §7, §8.1).
// 사용법: node replay.mjs --url <수집 주소> --token-file <collect-token 경로> [--delay-ms <ms>] <scenario.jsonl>
// 실제 hook 입력 형식의 JSON을 한 줄씩 순서대로 POST한다. 운영 기능이 아니라 개발·자동 테스트 도구다.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const DEFAULT_DELAY_MS = 50;

export function parseArguments(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      url: { type: "string" },
      "token-file": { type: "string" },
      "delay-ms": { type: "string" },
    },
    allowPositionals: true,
  });

  if (!values.url || !values["token-file"] || positionals.length !== 1) {
    throw new Error(
      "사용법: replay.mjs --url <수집 주소> --token-file <collect-token 경로> [--delay-ms <ms>] <scenario.jsonl>",
    );
  }

  let delayMs = DEFAULT_DELAY_MS;
  if (values["delay-ms"] !== undefined) {
    const raw = values["delay-ms"].trim();
    delayMs = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error("--delay-ms는 0 이상의 숫자여야 합니다");
    }
  }

  return {
    url: values.url,
    tokenFile: values["token-file"],
    scenarioPath: positionals[0],
    delayMs,
  };
}

function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 시나리오 JSONL을 한 줄씩 순서대로 수집 주소에 POST한다.
 *
 * @param {{url: string, tokenFile: string, scenarioPath: string, delayMs?: number}} args
 * @param {{fetchImpl?: typeof fetch, delayImpl?: (ms: number) => Promise<void>}} deps
 *   테스트에서 `fetchImpl`·`delayImpl`을 주입해 실제 네트워크·대기 없이 동작을 검증한다.
 * @returns {Promise<number>} 전송한 이벤트 수
 */
export async function replay(
  { url, tokenFile, scenarioPath, delayMs = DEFAULT_DELAY_MS },
  { fetchImpl = fetch, delayImpl = defaultDelay } = {},
) {
  const token = readFileSync(tokenFile, "utf8").trim();
  const lines = readFileSync(scenarioPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && delayMs > 0) {
      await delayImpl(delayMs);
    }

    const line = lines[i];
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-JayStudio-Collect-Token": token,
      },
      body: line,
    });
    if (!response.ok) {
      throw new Error(`수집 서버가 2xx가 아닌 응답을 반환했습니다: ${response.status} (줄 ${i + 1})`);
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
