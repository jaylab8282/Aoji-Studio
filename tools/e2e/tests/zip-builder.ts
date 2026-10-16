// E2E-18b가 스킬 zip을 임시 폴더에 직접 만들 때 쓰는 최소 zip 작성기 (외부 의존성 없음).
// spec 파일이 아니므로 Playwright가 테스트로 수집하지 않는다(testMatch `*.spec.ts`).
//
// 일반 `zip` 도구로는 만들기 어려운 항목(`..` 경로, 절대 경로, 심볼릭 링크, 실행 비트)을 그대로 쓸 수 있게
// 항목 이름과 유닉스 모드를 호출한 쪽이 정한다. 파일 이름은 UTF-8(general purpose bit 11)로 적는다.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** zip 안의 항목 이름 그대로(검증하지 않는다 — 위험 경로도 쓸 수 있다). 폴더는 `/`로 끝낸다. */
  name: string;
  /** 내용. 심볼릭 링크 항목이면 링크 대상 경로 문자열. */
  data?: Buffer | string;
  /** 유닉스 파일 모드(예: 0o644, 0o755, 심볼릭 링크는 0o120777). 기본 0o100644, 폴더는 0o040755. */
  mode?: number;
  /** true면 압축하지 않고 그대로 담는다(크기 초과 시험용으로 큰 파일을 만들 때). */
  store?: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** zip 파일 내용을 만든다. */
export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = entry.name.endsWith("/");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "", "utf8");
    const name = Buffer.from(entry.name, "utf8");
    const mode = entry.mode ?? (isDir ? 0o040755 : 0o100644);
    const method = entry.store || isDir || raw.length === 0 ? 0 : 8;
    const payload = method === 8 ? deflateRawSync(raw) : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 풀기에 필요한 버전
    local.writeUInt16LE(0x0800, 6); // UTF-8 이름
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // 시각
    local.writeUInt16LE(0x21, 12); // 날짜 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // 만든 쪽 = 유닉스
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((mode << 16) >>> 0, 38); // external attrs = 유닉스 모드
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

/** zip을 만들어 `path`에 쓴다(상위 폴더가 없으면 만든다). */
export function writeZip(path: string, entries: readonly ZipEntry[]): Buffer {
  const content = buildZip(entries);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return content;
}
