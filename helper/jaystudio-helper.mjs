#!/usr/bin/env node
// v1.0.x 호환 shim (ADR-57 1): 옛 launchd plist가 이 이름으로 실행해도 새 도우미 코드로 돈다.
// 경고 1줄 후 aojistudio-helper의 main을 같은 인자로 실행한다. v1.1.0에서 이 파일을 지운다.

import { runCli } from './aojistudio-helper.mjs';
import { helperScriptWarning } from './lib/legacy.mjs';

process.stderr.write(`aojistudio-helper: ${helperScriptWarning()}\n`);
await runCli(process.argv.slice(2));
