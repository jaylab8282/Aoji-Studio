// launchd plist 생성 단위 테스트 (FR-013-AC7, NFR-05)
// 실제 등록(launchctl)·~/Library/LaunchAgents 쓰기는 하지 않는다. 문자열 생성만 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HELPER_LABEL,
  buildProgramArguments,
  escapeXml,
  parsePlistArgs,
  renderPlist,
} from '../lib/plist.mjs';

const OPTIONS = Object.freeze({
  nodePath: '/opt/homebrew/bin/node',
  scriptPath: '/Users/jaybee/Desktop/AojiStudio/Aoji-Studio/helper/aojistudio-helper.mjs',
  projectDir: '/Users/jaybee/Desktop/AojiStudio',
  allowedOrigins: 'http://127.0.0.1:4180',
  port: 4181,
  tokenFile: '/Users/jaybee/Desktop/AojiStudio/.aojistudio/helper-token',
  logFile: '/Users/jaybee/Library/Logs/com.aojistudio.helper.log',
});

/** plist의 ProgramArguments 배열을 순서대로 읽는다. */
function readProgramArguments(plist) {
  const block = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  assert.ok(block, 'ProgramArguments 배열이 없습니다');
  return [...block[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) => match[1]);
}

test("[FR-013-AC7][NFR-05] 생성 plist에 ProgramArguments(node, 스크립트, --project-dir, --allowed-origins, --port 4181, --token-file), RunAtLoad true, KeepAlive true, '--dry-run' 없음", () => {
  const plist = renderPlist(OPTIONS);

  assert.deepEqual(readProgramArguments(plist), [
    '/opt/homebrew/bin/node',
    '/Users/jaybee/Desktop/AojiStudio/Aoji-Studio/helper/aojistudio-helper.mjs',
    '--project-dir',
    '/Users/jaybee/Desktop/AojiStudio',
    '--allowed-origins',
    'http://127.0.0.1:4180',
    '--port',
    '4181',
    '--token-file',
    '/Users/jaybee/Desktop/AojiStudio/.aojistudio/helper-token',
  ]);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.equal(plist.includes('--dry-run'), false);
  assert.match(plist, /<key>Label<\/key>\s*<string>com\.aojistudio\.helper<\/string>/);
  assert.equal(HELPER_LABEL, 'com.aojistudio.helper');
  assert.ok(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.equal(plist.includes('{{'), false);
});

test("[NFR-05] plist ProgramArguments에 --dry-run을 넣으면 생성에 실패한다", () => {
  assert.throws(
    () => renderPlist({ ...OPTIONS, allowedOrigins: '--dry-run' }),
    /--dry-run/,
  );
  assert.equal(buildProgramArguments(OPTIONS).includes('--dry-run'), false);
});

test("[NFR-05] plist 인자가 비었거나 포트가 아니면 생성에 실패한다", () => {
  for (const key of ['nodePath', 'scriptPath', 'projectDir', 'allowedOrigins', 'tokenFile']) {
    assert.throws(() => renderPlist({ ...OPTIONS, [key]: '' }), new RegExp(key), key);
  }
  assert.throws(() => renderPlist({ ...OPTIONS, logFile: '' }), /logFile/);
  for (const port of ['', 'abc', '0', '70000', -1]) {
    assert.throws(() => renderPlist({ ...OPTIONS, port }), /port/, String(port));
  }
});

test("[FR-013-AC7] plist 값은 XML로 이스케이프한다", () => {
  assert.equal(escapeXml('a&b<c>d'), 'a&amp;b&lt;c&gt;d');
  const plist = renderPlist({ ...OPTIONS, projectDir: '/Users/a&b' });
  assert.ok(plist.includes('<string>/Users/a&amp;b</string>'));
  assert.equal(plist.includes('<string>/Users/a&b</string>'), false);
});

test("[FR-013-AC7] install.sh가 넘기는 CLI 인자를 그대로 읽는다", () => {
  assert.deepEqual(
    parsePlistArgs([
      '--label',
      'com.aojistudio.helper',
      '--node',
      '/opt/homebrew/bin/node',
      '--script',
      '/x/aojistudio-helper.mjs',
      '--project-dir',
      '/x',
      '--allowed-origins',
      'http://127.0.0.1:4180',
      '--port',
      '4181',
      '--token-file',
      '/x/.aojistudio/helper-token',
      '--log-file',
      '/x/helper.log',
    ]),
    {
      label: 'com.aojistudio.helper',
      nodePath: '/opt/homebrew/bin/node',
      scriptPath: '/x/aojistudio-helper.mjs',
      projectDir: '/x',
      allowedOrigins: 'http://127.0.0.1:4180',
      port: '4181',
      tokenFile: '/x/.aojistudio/helper-token',
      logFile: '/x/helper.log',
    },
  );
  assert.throws(() => parsePlistArgs(['--unknown', 'x']), /알 수 없는 인자/);
  assert.throws(() => parsePlistArgs(['--port']), /값이 필요/);
});

test("[ADR-57] 기본 Label은 com.aojistudio.helper, 스크립트 경로는 aojistudio-helper.mjs, --dry-run 미포함", () => {
  assert.equal(HELPER_LABEL, 'com.aojistudio.helper');
  const plist = renderPlist(OPTIONS);
  assert.match(plist, /<key>Label<\/key>\s*<string>com\.aojistudio\.helper<\/string>/);
  const scriptPath = readProgramArguments(plist)[1];
  assert.ok(scriptPath.endsWith('/aojistudio-helper.mjs'), scriptPath);
  assert.equal(plist.includes('--dry-run'), false);
  assert.equal(plist.includes('{{'), false);
});
