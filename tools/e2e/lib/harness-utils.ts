// E2E 하네스 공용 대기·프로세스 유틸 (architecture.md §8.1).
// 고정 대기(sleep)로 상태를 가정하지 않고 항상 관찰 가능한 조건을 폴링한다.
import { execFileSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createConnection } from "node:net";

export function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

/**
 * 하네스용 HTTP GET. 포트 값과 무관하게 전송 계층을 `node:http` 하나로 고정한다.
 *
 * 이유: 전역 `fetch`(undici)는 WHATWG Fetch "bad port"(blocked ports) 목록의 포트를 연결 시도조차
 * 하지 않고 즉시 거부한다(`fetch failed` / `cause: bad port`). 서버가 정상이어도 Node 도구만 실패하는
 * 이 함정 때문에 conventions.md §8 MUST(`docs/conventions.md:136`, ADR-45)가 자동 검증용 공개 포트에
 * bad port 값(특히 `4190` sieve)을 쓰지 못하게 했고, E2E 공개 포트는 `4185`로 확정됐다.
 * 현재 쓰는 포트(4185·4191·4192)는 모두 목록에 없지만, 전송 계층을 `node:http`로 고정해 두면
 * 포트가 다시 바뀌어도 하네스의 대기·헬스 체크가 같은 방식으로 동작한다.
 */
export function httpGet(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 5000,
): Promise<{ status: number; body: string }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const clientRequest = httpRequest(url, { method: "GET", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolveRequest({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    clientRequest.setTimeout(timeoutMs, () => clientRequest.destroy(new Error("요청 시간 초과")));
    clientRequest.on("error", rejectRequest);
    clientRequest.end();
  });
}

/**
 * 주어진 주소가 200을 줄 때까지 폴링한다. 시간 초과면 마지막 실패 이유를 담아 던진다.
 */
export async function waitForHttpOk(
  url: string,
  options: { timeoutMs: number; label: string; headers?: Record<string, string> },
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  let lastReason = "시도 없음";
  while (Date.now() < deadline) {
    try {
      const response = await httpGet(url, options.headers ?? {});
      if (response.status === 200) {
        return;
      }
      lastReason = `상태 코드 ${response.status}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(
    `${options.label} 대기 ${options.timeoutMs}ms 초과 — 주소 ${url}, 마지막 실패: ${lastReason}`,
  );
}

/** 127.0.0.1의 포트가 연결을 받는지 한 번 확인한다. */
export function isPortOpen(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (open: boolean) => {
      socket.destroy();
      resolvePort(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** 포트가 닫힐 때까지 기다린다. 끝까지 열려 있으면 false. */
export async function waitForPortClosed(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) {
      return true;
    }
    await delay(250);
  }
  return !(await isPortOpen(port));
}

/**
 * 127.0.0.1의 포트를 LISTEN 중인 프로세스 pid 목록.
 * 듣는 프로세스가 없으면 빈 배열, `lsof`로 확인할 수 없으면 `null`(호출자가 구분해 다룬다).
 */
export function listPortListeners(port: number): number[] | null {
  try {
    const stdout = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return stdout
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (error) {
    // lsof는 조건에 맞는 항목이 없으면 exit 1을 낸다. 그 밖의 실패는 확인 불가로 본다.
    return (error as { status?: number }).status === 1 ? [] : null;
  }
}

/** 진단 메시지용 프로세스 명령줄. 알 수 없으면 `null`. */
export function describeProcess(pid: number): string | null {
  try {
    const stdout = execFileSync("ps", ["-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return stdout.trim() === "" ? null : stdout.trim();
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 프로세스 그룹(detached로 띄운 자식)을 SIGTERM → SIGKILL 순서로 끝낸다.
 * 이미 없는 프로세스는 조용히 넘어간다.
 */
export async function killProcessTree(pid: number, timeoutMs = 5000): Promise<void> {
  if (!isProcessAlive(pid)) {
    return;
  }
  signal(pid, "SIGTERM");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await delay(100);
  }
  signal(pid, "SIGKILL");
  while (isProcessAlive(pid)) {
    await delay(100);
  }
}

function signal(pid: number, name: "SIGTERM" | "SIGKILL"): void {
  try {
    // detached로 띄웠으므로 그룹 전체에 보낸다. 실패하면 프로세스 하나에만 보낸다.
    process.kill(-pid, name);
  } catch {
    try {
      process.kill(pid, name);
    } catch {
      // 이미 종료됨.
    }
  }
}
