# Claude Code 파일 형식 확인 결과 (키 이름·형태만, T-R4-01)

- 확인일: 2026-10-15, Claude Code 2.1.x가 쓰는 이 PC(WSL)의 파일. 확인 도구는 `tools/fixtures/scripts/dump-keys.mjs` 하나뿐이다(키 경로와 값의 형태 `string`·`number`·`boolean`·`object`·`array`·`null`만 출력, 값·문자열·대화 본문은 출력하지 않는다. 동적 키는 `<*>`로 접는다).
- 이 문서에는 **값이 없다**. 아래 표는 키 경로와 형태, 그리고 개수(`--stats`)와 값 종류(`--classify`: 숫자 구간·문자열 패턴 이름)뿐이다.
- 실제 파일은 읽기만 했고 수정·복사하지 않았다. fixture 값은 모두 직접 지어냈다.
- 표기: `[]` = 배열 원소, `<*>` = 동적 키(경로·서버 이름·플러그인 이름·모델 id 등). 확인 근거 열: **PC** = 이 PC 파일에서 키 확인, **문서** = 공식 문서 기준(이 PC에 해당 키가 없거나 PC에서 볼 수 없는 값).

## 1. `~/.claude.json` (ADR-79·85·83)

최상위 키 약 70개 중 앱이 읽는 것만 적는다(나머지 계정·통계·캐시 키는 읽지 않는다 — NFR-15).

| 키 경로 | 형태 | 근거 | 비고 |
|---|---|---|---|
| `mcpServers` | object | 이 PC에 없음 | 이 PC에는 최상위 `mcpServers` 키가 없다. 공식 문서 기준 `mcpServers.<*>.{type,command,args[],env.<*>,url,headers.<*>}` |
| `projects` | object | PC | 하위 키 = 프로젝트 절대 경로(동적) |
| `projects.<*>.mcpServers` | object | PC | 이 PC에서는 모두 빈 객체. 서버 정의 모양은 위 `mcpServers`와 같다(문서) |
| `projects.<*>.enabledMcpjsonServers` | array(string) | PC | |
| `projects.<*>.disabledMcpjsonServers` | array(string) | PC | |
| `projects.<*>.disabledMcpServers` | array(string) | 이 PC에 없음 | 공식 문서 기준 배열. fixture는 이 모양으로 만들었다 |
| `projects.<*>.enableAllProjectMcpServers` | boolean | 이 PC에 없음 | ADR-85는 이 키를 `.claude/settings.json` 쪽에서 본다 |
| `cachedUsageUtilization` | object | PC | 아래 표 |
| `cachedUsageUtilization.accountUuid` | string | PC | 계정 식별자 — 읽지 않는다(NFR-15) |
| `cachedUsageUtilization.fetchedAtMs` | number | PC | 정수, 에포크 **밀리초** 크기(`--classify`: `>1e11`) |
| `cachedUsageUtilization.utilization` | object | PC | **한도 값은 이 객체 안에 있다**(ADR-83 가정과 다름 — 5절) |
| `cachedUsageUtilization.utilization.five_hour` | object | PC | |
| `cachedUsageUtilization.utilization.five_hour.utilization` | number | PC | 정수, 구간 `1..100`(백분율, 0~1 비율 아님) |
| `cachedUsageUtilization.utilization.five_hour.resets_at` | string | PC | ISO-8601(`--classify`: `string:iso8601`, 시간대 오프셋 포함) |
| `cachedUsageUtilization.utilization.seven_day.{utilization,resets_at}` | number, string | PC | 위와 같은 형태 |
| `cachedUsageUtilization.utilization.five_hour`·`seven_day`의 그 밖의 키 | null·number | PC | `limit_dollars`·`locked_reason`·`remaining_dollars`·`used_dollars` (읽지 않음) |
| `cachedUsageUtilization.utilization.limits` | array(object) | PC | 원소 `{group,is_active,kind,percent,resets_at,scope,severity}` (읽지 않음) |
| `cachedUsageUtilization.utilization.extra_usage` 등 | object·null | PC | 읽지 않음 |
| `oauthAccount.{emailAddress,displayName,fullName,organizationName,accountUuid,organizationUuid,…}` | string 등 | PC | 계정·이메일 — **읽지 않는다**. fixture는 `emailAddress`에 표지 문자열을 넣었다 |

## 2. `~/.claude/settings.json` (ADR-85)

| 키 경로 | 형태 | 근거 |
|---|---|---|
| `enabledPlugins` | object | PC |
| `enabledPlugins.<*>` | boolean | PC (키 모양 `<플러그인>@<마켓>`) |
| `env` | object | PC — 앱은 읽지 않는다(D-A14) |
| `env.<*>` | string | PC |
| `language`·`model`·`theme` | string | PC — 읽지 않음 |
| `enableAllProjectMcpServers`·`enabledMcpjsonServers`·`disabledMcpjsonServers` | boolean·array | 이 PC에 없음(사용자 전역 settings.json에는 없고 프로젝트 `.claude/settings.json`에 둔다 — 문서) |

## 3. `~/.claude/plugins/installed_plugins.json`과 플러그인 MCP 정의 (ADR-85)

| 키 경로 | 형태 | 근거 |
|---|---|---|
| `version` | number | PC (이 PC = 2) |
| `plugins` | object | PC — **최상위가 `plugins`로 한 번 싸여 있다** |
| `plugins.<*>` | array(object) | PC (키 = `<플러그인>@<마켓>`, 값 = 설치 기록 배열) |
| `plugins.<*>[].installPath` | string | PC — 호스트 절대 경로. 이 PC의 설치 2건 모두 `<홈>/.claude/plugins/` 아래 |
| `plugins.<*>[].{scope,version,installedAt,lastUpdated,gitCommitSha,projectPath,directoryRepositoryKey}` | string | PC |

플러그인 MCP 정의 파일(`<installPath>/.mcp.json`, 이 PC에 15개) — **두 가지 모양이 섞여 있다**:

| 모양 | 키 경로 | 근거 |
|---|---|---|
| 감싼 모양 | `mcpServers.<*>.{command,args[],type,url}` | PC (ADR-85 가정과 같음) |
| 평평한 모양 | `<서버>.{command,args[]}`, `<서버>.{type,url}`, `<서버>.headers.<*>` — 최상위 키가 곧 서버 이름 | PC (ADR-85에 없음) |

`.claude-plugin/plugin.json`에 `mcpServers` 키를 둔 플러그인은 이 PC의 47개 중 0개다.

## 4. 대화 기록 `~/.claude/projects/` (ADR-81)

폴더 모양(PC): `projects/<인코딩된 프로젝트 폴더>/<세션 id>.jsonl`(메인, 70개), `projects/<…>/<세션 id>/subagents/agent-<id>.jsonl`(136개), `agent-<id>.meta.json`(135개 — 1개는 메타가 없다). 그 밖에 `.jsonl`이 아닌 파일(`.txt` 71·`.md` 8·`.json` 2·기타 1)과 `memory` 폴더가 같은 트리에 있다. `.jsonl`은 위 두 위치에만 있다.

### 4.1 메인 기록 줄 (앞 200줄 합집합, 12개 파일) — 토큰이 있는 줄

| 키 경로 | 형태 | 비고 |
|---|---|---|
| `type` | string | 토큰 줄은 모두 assistant(`--stats`: `message.usage`가 있는 줄 2,802줄 전부) |
| `message.id` | string | 토큰 줄 100%에 있음 |
| `message.model` | string | 토큰 줄 100%. `<synthetic>` 줄이 있고 토큰이 모두 0인 줄과 같은 수(4줄) |
| `message.usage.input_tokens`·`output_tokens`·`cache_creation_input_tokens`·`cache_read_input_tokens` | number | |
| `message.usage.cache_creation.{ephemeral_5m_input_tokens,ephemeral_1h_input_tokens}` | number | 캐시 생성 세부(5분·1시간) |
| `message.usage.{service_tier,speed,inference_geo,server_tool_use.*,iterations[],output_tokens_details.*}` | 여러 형태 | 읽지 않음 |
| `requestId` | string | 토큰 줄 100% |
| `sessionId` | string | 토큰 줄 100% |
| `timestamp` | string | 토큰 줄 100% |
| `cwd` | string | 토큰 줄 100% |
| `entrypoint` | string | 토큰 줄 100% |
| `isSidechain` | boolean | 토큰 줄 100%. 메인 기록에서는 `true`인 토큰 줄이 0줄(이 표본) |
| `message.content` | array·string | 본문 — 읽지 않고 건너뛴다 |
| `agentSetting` | string | **`--agent` 세션의 에이전트 이름 키**. 토큰 줄이 아닌 별도 줄에 있고(354줄) 모두 `sessionId`가 함께 있다. 값이 이 저장소 `.claude/agents/`의 에이전트 이름과 일치하는 줄이 354줄 중 354줄 |
| `agentName` | string | 142줄, 에이전트 정의 이름과 일치하는 줄은 0줄 — 에이전트 이름이 아니다(세션 표시 이름으로 보임). 쓰지 않는다 |
| `attributionSkill` | string | 일부 줄 — 쓰지 않는다 |

중복: 같은 `message.id` + `requestId`가 여러 줄에 나온다(`--stats`, 30개 파일: 토큰 줄 2,802줄 중 중복 1,485줄). **메인 기록의 중복 줄은 usage 값이 서로 같다**(값이 다른 중복 0건).

### 4.2 서브에이전트 기록 `agent-<id>.jsonl`

| 키 경로 | 형태 | 비고 |
|---|---|---|
| 메인과 같은 토큰 줄 키 전부 | | `type`·`message.id`·`message.model`·`message.usage.*`·`requestId`·`sessionId`·`timestamp`·`cwd`·`entrypoint` 100% |
| `isSidechain` | boolean | 토큰 줄 2,750줄이 전부 `true` |
| `agentId` | string | 있음 |
| `agentName`·`agentSetting` | - | 없음(0줄) |

중복: 토큰 줄 2,750줄 중 중복 1,459줄. **중복 줄 중 usage가 다른 것이 267건이고 모두 뒤쪽 줄의 `output_tokens`가 더 크다**(스트리밍 중간값이 먼저 기록됨). 메인 기록과 서브에이전트 기록 사이에는 같은 메시지가 없다(두 기록을 합쳐도 중복 수가 각각의 합과 같다).

`agent-<id>.meta.json`(60개 표본):

| 키 경로 | 형태 |
|---|---|
| `agentType` | string |
| `description`·`model`·`requestShape`·`toolUseId` | string |
| `launchedWithDefaults`·`requestNonInteractive` | boolean |
| `spawnDepth` | number |

## 5. 상태줄 입력 (ADR-83) — 공식 문서·Claude Code 2.1.295 확인 사실

이 PC에서는 상태줄 입력을 볼 수 없다(**이 PC에 없음** — 실제 세션 연동은 H-7). 공식 문서 기준:

| 키 경로 | 형태 | 비고 |
|---|---|---|
| `subscription_type` | string | pro·max·team·enterprise 등 |
| `rate_limits.five_hour.used_percentage` | number | 백분율 |
| `rate_limits.five_hour.resets_at` | number | 에포크 **초** |
| `rate_limits.seven_day.used_percentage`·`resets_at` | number | 위와 같음 |
| `rate_limits` 전체 | object | 플랜에 따라 없을 수 있다(FR-027-E2) |
| `session_id`·`transcript_path`·`cwd`·`model.{id,display_name}`·`workspace.{current_dir,project_dir}`·`version`·`output_style.name`·`cost.*` | 여러 형태 | 앱은 보내지 않는다 |

## 6. hook 입력 중 앱이 쓰는 키 — 공식 hook 문서 기준

| 이벤트 | 키 | 형태 |
|---|---|---|
| 공통 | `session_id`·`cwd`·`hook_event_name`·`permission_mode`·`agent_type`(있을 때) | string |
| `PreToolUse`·`PostToolUse`·`PermissionRequest` | `tool_name` | string |
| 위와 같음 (`tool_name` = `Skill`) | `tool_input.skill` | string |
| 위와 같음 (`tool_name` = `mcp__<서버>__<도구>`) | `tool_input` | object |
| `UserPromptSubmit` | `prompt` | string |
| `SessionStart` | `source` | string |

## 7. ADR 가정과의 대조

| ADR | 가정 | 확인 결과 |
|---|---|---|
| ADR-79 6 | `~/.claude.json`에서 `mcpServers`·`projects[호스트경로].{mcpServers,enabledMcpjsonServers,disabledMcpjsonServers,disabledMcpServers}`·`cachedUsageUtilization`을 읽는다 | **일치(키 위치)**. 단, 이 PC에는 최상위 `mcpServers`와 `disabledMcpServers`가 없다(이 PC에 없음 → 공식 문서 기준 fixture). `projects.<*>.mcpServers`는 있고 비어 있다 |
| ADR-79 6 | `~/.claude/settings.json`에서 `enabledPlugins`만 읽는다 | **일치**. `enabledPlugins.<*>`는 boolean |
| ADR-85 1 | 플러그인 = `enabledPlugins` + `installed_plugins.json`의 `installPath` → `.mcp.json` 또는 `.claude-plugin/plugin.json`의 `mcpServers` | **부분 차이**: ① `installed_plugins.json`은 `{version, plugins}`로 한 겹 더 싸여 있고 `plugins.<플러그인>@<마켓>[]`가 배열이다 ② `.mcp.json`이 `mcpServers`로 싼 모양과 서버 이름이 최상위 키인 평평한 모양 두 가지다 ③ `plugin.json`의 `mcpServers`는 이 PC에 0건(fixture는 두 모양을 모두 담는다 — 8절). `installPath`는 이 PC에서 모두 `<홈>/.claude/plugins/` 아래라 거부 규칙에 걸리지 않는다 |
| ADR-83 6 | `cachedUsageUtilization` = `{fetchedAtMs, five_hour:{utilization,resets_at}, seven_day:{…}}` | **차이**: `five_hour`·`seven_day`가 한 겹 아래 `cachedUsageUtilization.utilization.*`에 있다. `fetchedAtMs`는 최상위에 있다(에포크 밀리초). 값 해석은 갈리지 않는다: `utilization`은 정수 백분율(1..100 구간), `resets_at`은 ISO-8601(오프셋 포함). 최상위에 `accountUuid`(계정 식별자)가 같이 있다 |
| ADR-81 가정 | 토큰 줄: `type=assistant`, `message.id`·`model`·`usage.*`, `requestId`, `sessionId`, `timestamp`, `cwd`, `entrypoint`, `isSidechain` | **일치**(토큰 줄 100%에 모두 있음) |
| ADR-81 | 서브에이전트 기록 `<세션>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json`(`agentType`) | **일치**. 메타가 없는 서브에이전트 기록이 있다(135/136) → `?` 규칙이 필요하다 |
| ADR-81 | `--agent` 세션의 이름 키는 미확인 | **확인됨**: `agentSetting`(별도 줄, `sessionId` 동반). `agentName`은 에이전트 이름이 아니다 |
| ADR-81 3 (ADR-92 정정) | 중복 키 = `message.id:requestId`. 같은 키의 줄 중 `output_tokens`가 최대인 줄의 4값으로 센다(증분 읽기에서 뒤에 더 큰 줄이 오면 `transcript_msg`의 기존 기여분을 빼고 새 값을 더한다, 순서 무관·재읽기 멱등) | **일치(ADR-92 반영)**: 메인 기록 중복은 값이 같다. **서브에이전트 기록은 중복 줄의 `output_tokens`가 뒤쪽 줄에서 더 큰 경우가 267건**이라 옛 "먼저 읽은 줄" 규칙이면 출력 토큰이 낮게 센다 — 그래서 최대 줄 규칙으로 정정했다 |
| ADR-81 4 | `<synthetic>`·토큰 0인 줄은 세지 않는다 | **일치**: 이 PC에도 두 종류가 같은 수로 있다 |
| ADR-81 | 읽는 파일 = `*.jsonl` | **일치**. 같은 트리에 `.jsonl`이 아닌 파일도 있어 확장자로 걸러야 한다 |
| ADR-83 3·4 | 상태줄 입력 `subscription_type`, `rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}` | 문서 기준(이 PC에 없음). `resets_at`은 에포크 초 숫자, 캐시의 `resets_at`은 ISO 문자열 — ADR-83 4가 둘 다 받는다 |
| ADR-85 1 | 프로젝트 MCP 활성 = `enableAllProjectMcpServers`·`enabledMcpjsonServers`·`disabledMcpjsonServers` | 키 이름은 `projects.<*>`에서 확인(PC). `enableAllProjectMcpServers`는 이 PC에 없음(문서) |

## 8. fixture가 이 형식을 따르는 방식

- `claude-home-basic/.claude.json`의 `cachedUsageUtilization`은 **이 PC에서 확인한 실제 구조**(`utilization` 아래 `five_hour`·`seven_day`)로 만들었다. ADR-83 6의 가정 모양이 아니다. ADR이 정정되면 이 부분만 고치면 된다.
- `projects` 키와 플러그인 `installPath`는 실행 때 경로가 정해지므로 자리표시 문자열 `__AOJI_FIXTURE_HOST_PATH__`(프로젝트 폴더의 호스트 절대 경로)와 `__AOJI_FIXTURE_CLAUDE_HOME__`(홈 폴더의 호스트 절대 경로)를 쓴다. E2E 하네스·통합 테스트가 임시 폴더로 복사할 때 파일 내용에서 이 두 문자열을 실제 경로로 바꾼다(T-R4-04·T-R4-11).
- 서브에이전트 기록에는 값이 다른 중복 쌍 2개를 두었다: 뒤 줄 `output_tokens`가 큰 쌍(이 PC 실제 모양)과 앞 줄이 큰 쌍(순서 무관 확인). 네 토큰 값이 줄마다 조금씩 다르다. 같은 키는 `output_tokens` 최대 줄의 4값으로 센다(ADR-81 결정 3, ADR-92). 값이 같은 중복 쌍(메인·서브에이전트 각 1개)도 남겨 두었다.
- 플러그인은 `demo-tools`(감싼 모양 `.mcp.json`)와 `flat-tools`(평평한 모양: 최상위 키가 서버 이름 2개)이고, `demo-tools`에는 `projectPath`가 fixture 호스트 경로와 다른 프로젝트 전용 설치 원소 1개가 더 있다(그 `.mcp.json`의 서버는 목록에 나오면 안 된다). 메인 기록의 `agentSetting` 줄은 이 PC 줄의 `type` 값을 확인하지 않아 `type`을 임의 이름으로 두었다(파서는 `agentSetting` 키 유무로 판정해야 한다).
