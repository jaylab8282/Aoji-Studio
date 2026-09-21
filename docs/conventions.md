# Jay Studio — Conventions

- 기준: `architecture.md`, `api-spec.yaml`, `realtime-spec.md`, `ui-spec.md`, `docs/ui/`
- 규칙마다 `MUST`(위반 = 리뷰 FAIL) / `SHOULD`(위반 시 사유 필요)를 붙이고 이유를 한 줄 적는다.

## 1. 디렉터리 구조

- MUST 저장소 최상위는 `backend/`, `frontend/`, `helper/`, `tools/`, `docs/`, `Dockerfile`, `compose.yaml`, `.env.example`, `.gitignore`, `CLAUDE.md`, `README.md`만 둔다. 이유: final 문서의 저장소 구성.
- MUST 백엔드 패키지·프론트 폴더는 `architecture.md` §3.1을 따른다. 새 패키지·폴더가 필요하면 architecture.md에 먼저 추가한다. 이유: 리뷰가 문서와 코드를 대조한다.
- MUST 테스트 fixture는 `tools/fixtures/` 아래에만 두고, 테스트 실행 시 임시 폴더로 복사해 쓴다. 실제 `JayStudio/.claude`, `JayStudio/.jaystudio` 경로를 테스트·개발 실행에 넣지 않는다. 이유: Automation Policy 금지 사항.
- MUST `.gitignore`: `.env`, `**/node_modules`, `frontend/dist`, `backend/build`, `backend/.gradle`, `backend/src/main/resources/static/` (컨테이너 빌드 산출물), `tools/e2e/screenshots/*.png` 제외한 `tools/e2e/test-results`, `*.db*`, `*-token`. 이유: 토큰·빌드 산출물 커밋 금지.

## 2. 네이밍

| 대상 | 규칙 | 예 |
|---|---|---|
| Java 패키지 | `studio.jay.<module>` 소문자 | `studio.jay.registry` |
| Java 클래스 | PascalCase, 역할 접미사(`Controller`, `Service`, `Repository`, `Store`, `Filter`, `Job`) | `HookCollectController` |
| Java record | 불변 데이터는 `record` | `RegistrySnapshot`, `EventRow` |
| REST 경로 | 소문자 kebab, 복수 명사 | `/api/workflows/{workflow}/members` |
| JSON 필드 | camelCase (hook 입력 `snake_case`는 `HookPayload`에서만) | `agentCount` |
| TS 파일 | 컴포넌트 PascalCase `.tsx`, 그 외 camelCase `.ts` | `DeskSprite.tsx`, `featuredWorkflows.ts` |
| TS 타입 | `api-spec` 스키마 이름과 동일 | `Snapshot`, `AgentLive` |
| CSS 토큰 | `design-tokens.md` 이름을 `--color-<group>-<name>` 등으로 매핑(ui-spec §공통) | `--color-state-running` |
| 테스트 | Java `<Class>Test`, TS `<file>.test.ts(x)`, 도우미 `<file>.test.mjs`, E2E `<시나리오>.spec.ts` | `SessionStateMachineTest` |
| 상태 enum | 서버·프론트 모두 `running` / `waiting` / `idle` 문자열 | - |
| 화면 문구 | final 문서·ui-spec의 문구를 글자 그대로 | `팀장이 없습니다 · 팀장을 만들거나 가져오세요` |

- MUST 화면 문구는 `frontend/src/lib/text.ts` 한 파일에 상수로 모으고 컴포넌트는 그 상수를 쓴다. 이유: E2E·리뷰가 문구를 대조하고, 문구 변경이 한 곳에서 끝난다.

## 3. 코딩 규칙

### 공통
- MUST 미완성 코드 금지: `TODO`, `FIXME`, `XXX`, placeholder 값·문구(`lorem`, `TBD`, `[N]`, `[워크플로우 1]`, `example.com`), 미구현 stub(`throw new UnsupportedOperationException`, `return null // later`), 운영 코드 경로의 Mock·가짜 데이터. 이유: 태스크 완료 = 동작하는 코드.
- MUST 운영 코드에서 `System.out`, `console.log`로 hook 본문·`tool_input`·토큰·요약 원문을 출력하지 않는다. 이유: NFR-08.
- MUST 시각은 서버가 ISO-8601 offset 문자열로 주고, 프론트가 `lib/format/time.ts`로만 변환한다. 이유: 표기 일관성(`hh:mm:ss`, `yyyy-mm-dd hh:mm`).
- SHOULD 함수는 한 가지 일만 하고 40줄을 넘기지 않는다. 이유: 리뷰 가능성.

### Backend (Java 25, Spring Boot 4.1)
- MUST 불변 상태(`RegistrySnapshot`, `LiveState`)는 `record`와 불변 컬렉션(`List.copyOf`, `Map.copyOf`)으로 만들고 `AtomicReference`로 교체한다. 이유: 폴러·수집·API 스레드 간 경합 방지.
- MUST 모든 파일 변경 API는 `WriteLock` 안에서 실행하고, ADR-08 순서·롤백을 따른다. 이유: FR-010-AC7, FR-011-AC6, FR-012-E1.
- MUST 파일 쓰기는 `AtomicFileWriter`(같은 디렉터리 `.tmp` + `ATOMIC_MOVE`)만 쓴다. `Files.write` 직접 호출 금지(토큰 파일 생성 제외). 이유: 중간 실패 시 원본 보호.
- MUST 파일 경로는 `PathGuard.resolve(kind, name)`으로만 만든다. 사용자 입력을 `Path.of`에 직접 넣지 않는다. 심볼릭 링크가 마운트 루트 밖을 가리키면 거부. 이유: NFR-07.
- MUST hook 처리(`POST /hooks/events`)는 요청 스레드에서 검증·마스킹·INSERT·상태 전이만 하고 SSE 방송은 별도 실행기(`@Async` 단일 스레드)에서 한다. 이유: FR-003-AC3 100ms.
- MUST `SessionStateMachine.apply(state, payload)`는 순수 함수(입력 상태 + 이벤트 → 새 상태)로 만들고 시계·DB에 의존하지 않는다(시각은 인자로). 이유: FR-004-AC2 전이표를 단위 테스트로 1:1 검증.
- MUST 예외는 `ApiExceptionHandler`가 `ApiError`로 변환한다. 컨트롤러에서 `ResponseEntity`로 에러 본문을 직접 만들지 않는다. 이유: 에러 형식 통일.
- MUST 로그 레벨 기본 `INFO`, DevTools·Actuator 의존성 금지, `server.error.include-stacktrace=never`. 이유: 디버그 기본 꺼짐.
- SHOULD 외부 라이브러리는 ADR-19 목록 안에서 쓴다. 추가하려면 ADR에 먼저 적는다.
- Spring Boot 4.1 구현 주의 (T-001·T-002에서 확인된 사실):
  - MUST JSON은 Jackson 3 — 패키지 `tools.jackson.databind.*`(`ObjectMapper`, `JsonNode`), 어노테이션은 `com.fasterxml.jackson.annotation.*`만 유지. `com.fasterxml.jackson.databind.*` import 금지. 이유: Spring Boot 4는 Jackson 3를 기본으로 쓰며 2.x 클래스는 자동 구성에 연결되지 않는다.
  - MUST MockMvc 테스트는 `spring-boot-starter-webmvc-test` 의존성 + `org.springframework.boot.webmvc.test.autoconfigure.*`(`@WebMvcTest`, `@AutoConfigureMockMvc`)를 쓴다. `spring-boot-starter-test`의 옛 `org.springframework.boot.test.autoconfigure.web.servlet.*` 경로는 없다.
  - MUST 자동 구성 클래스는 재구성된 패키지로 참조한다(예: `org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration`, `org.springframework.boot.webmvc.autoconfigure.*`). `org.springframework.boot.autoconfigure.<module>.*` 옛 경로를 `@ImportAutoConfiguration`·`exclude`에 쓰지 않는다. 이유: 컴파일은 되어도 제외·임포트가 무시되어 테스트 컨텍스트가 어긋난다.

### Frontend (React 19.3, TS 5, Vite 8, Tailwind 4.3)
- MUST `tsconfig` `strict: true`, `noUncheckedIndexedAccess: true`. `any` 금지(`unknown` 후 좁히기). 이유: 계약 불일치를 타입체크로 잡는다.
- MUST API 호출은 `api/client.ts`의 `apiGet/apiPost/apiPut/apiDelete`만 쓴다(토큰·Origin·에러 변환 포함). 컴포넌트에서 `fetch` 직접 호출 금지. 도우미 호출은 `api/helper.ts`만. 이유: 인증 규칙 한 곳.
- MUST SSE는 `api/stream.ts` 하나만 열고(`connectionStore`), 컴포넌트는 스토어만 구독한다. 이유: realtime-spec §5.
- MUST 파생 계산(정렬·집계·검색·라벨)은 `lib/derive/*.ts` 순수 함수로 두고 Vitest 테스트를 붙인다. 컴포넌트 안에서 정렬·집계 로직을 쓰지 않는다. 이유: ADR-15, AC 검증.
- MUST 상태 표시는 항상 `StatusDot` + 상태 글자(`작업 중`/`권한·입력 대기`/`대기`) 조합인 `StatusLabel` 컴포넌트를 쓴다. 색만 있는 상태 표시 금지. 이유: ui-rules 1, NFR-12.
- MUST 버튼은 `components/ui/Button`의 `variant`(`primary`|`terminal`|`secondary`|`add`|`danger`)와 `disabledReason` prop으로만 만든다. `disabledReason`이 있으면 옆에 이유 한 줄을 렌더링한다. 누르면 아무 일도 없는 활성 버튼 금지. 이유: ui-rules 2.
- MUST 픽셀 캐릭터는 인라인 SVG(`shape-rendering: crispEdges`)로 `pixel-sprites.md` 좌표를 그대로 쓴다. 이미지 파일·CSS 애니메이션 금지. 상태 색 전환은 `transition: fill 200ms`만. 이유: UI 기준.
- SHOULD 컴포넌트 파일은 200줄을 넘기지 않는다.

### Helper (Node 24)
- MUST 외부 npm 의존 없음. `import` 대상은 `node:` 내장 모듈만. 이유: 확정 스택.
- MUST `child_process.spawn`은 `shell: false`, 인자 배열. `exec`·`execSync`·템플릿 문자열 셸 명령 금지. 이유: FR-013-AC11.
- MUST 실행 함수(`openTerminal`)는 주입 가능하게 만들고, 단위 테스트는 가짜 함수로 인자 배열을 검증한다. 이유: 자동 구간에서 실제 터미널을 열지 않는다.
- MUST `--dry-run`은 명시 플래그일 때만 동작하고 plist 템플릿에 넣지 않는다. 이유: 디버그 기본 꺼짐.

## 4. 에러 처리

- MUST 서버 에러 본문은 `ApiError { code, message, fields?, details? }`. `code`는 api-spec enum만. `message`는 사용자에게 그대로 보여줄 한국어 문장. 이유: 프론트가 message를 가공 없이 표시.
- MUST 프론트는 `ApiError.fields`가 있으면 해당 폼 필드 아래에, 없으면 팝업·카드의 에러 영역에 `message`를 표시한다. 알 수 없는 오류(네트워크 등)는 `서버에 연결할 수 없습니다 · 다시 시도하세요`. 이유: 화면별 상태 표의 "필드별 사유", "팝업 안에 사유".
- MUST 403 `UNAUTHORIZED_TOKEN`은 `client.ts`가 토큰 재발급 후 1회만 자동 재시도한다. 그 밖의 자동 재시도 금지. 이유: 중복 쓰기 방지.
- MUST hook 수집의 거부(FR-003-E1)는 2xx로 응답하고 서버 로그에 `hook rejected: reason=<코드> event=<hook_event_name|->`만 남긴다. 이유: NFR-03, NFR-08.
- MUST 파일 작업 실패는 `IO_FAILED`로 통일하고 `message`에 무엇을 하다 실패했고 원복했는지 적는다(예: `정의 파일 쓰기 실패 · 구성 파일은 변경하지 않았습니다`). 이유: FR-008-E3, FR-010-E3, FR-012-E1.

## 5. API 요청·응답 형식

- MUST 요청·응답은 `application/json; charset=utf-8`. 성공 응답 코드: 조회 200, 생성 201, 삭제는 api-spec의 해당 엔드포인트에 응답 본문이 정의되어 있으면 그 코드·본문(예: `DELETE /api/agents/{name}` → 200 + `{trashPath, removedFromWorkflow}`), 없으면 204, 부분 성공 200 + `rejected`. 이유: api-spec이 엔드포인트별 계약의 기준.
- MUST 변경 요청 헤더 `X-JayStudio-Browser-Token`, 수집 헤더 `X-JayStudio-Collect-Token`, 도우미 헤더 `X-JayStudio-Helper-Token`. 이유: 토큰 이름 통일.
- MUST 경로 변수 `name`은 `^[a-z0-9-]{1,64}$`, `workflow`는 decode 후 워크플로우 이름 규칙으로 서버가 검증한다. 이유: NFR-07.
- MUST API 응답에 컨테이너 마운트 절대 경로(`JAYSTUDIO_MOUNT_PATH` 값, 예 `/workspace/...`)를 넣지 않는다. `filePath`는 마운트 루트 기준 상대 경로, `hostPath`·명령 문자열은 맥북 절대 경로. 이유: FR-014-AC4, ADR-20(D-021).
- SHOULD 응답 필드 추가는 하위 호환(추가만)으로 하고 api-spec을 먼저 고친다(architect).

## 6. 보안 규칙 (기본값)

- MUST 필수 설정(`JAYSTUDIO_HOST_PATH`, `JAYSTUDIO_PUBLIC_PORT`)이 없거나 빈 문자열이면 기동 실패(예외 메시지에 변수 이름). 빈 값·예시 값(`/path/to`, `changeme`)으로 대체하지 않는다. 이유: NFR-05, FR-014-E1.
- MUST `collect-token`을 읽거나 만들 수 없으면 기동 실패. 토큰이 비어 있으면(0바이트) 기동 실패. 이유: NFR-05 "인증 없이 동작하는 기본값 없음".
- MUST 바인딩·노출: compose `ports`는 `127.0.0.1:` 접두 필수. dev Spring `server.address=127.0.0.1`, Vite `server.host='127.0.0.1'`, 도우미 `listen(port,'127.0.0.1')`. `0.0.0.0` 문자열이 설정 파일·코드에 나오면 FAIL. 이유: NFR-04(컨테이너 안 바인딩은 ADR-05).
- MUST 컨테이너는 `USER 1000`, `docker.sock`·`JayStudio` 밖 경로 마운트 금지, `privileged` 금지. 이유: NFR-06.
- MUST Origin 규칙(architecture §5)은 `/api/**`·`/api/stream`에 필터로 적용하고 컨트롤러별로 예외를 두지 않는다. 허용 Origin 기본값은 `http://127.0.0.1:<PUBLIC_PORT>` 하나. `localhost`는 허용하지 않는다. 이유: 요청 출처 검사.
- MUST 디버그 모드 기본 꺼짐: Spring `debug=false`, DevTools 없음, Vite dev 서버는 컨테이너에 포함하지 않음, 도우미 `--dry-run` 기본 꺼짐. 이유: NFR-05.
- MUST 브라우저 토큰은 메모리에만 둔다(localStorage·sessionStorage·cookie·URL 히스토리 금지. SSE 쿼리는 예외이며 `history.replaceState`로 URL에 남기지 않는다). 이유: ADR-01.
- MUST 마스킹은 `Masker.mask()` 하나로 저장 직전에 하고, 마스킹 전 문자열을 필드·로그·응답에 담지 않는다. `tool_input` 전체를 저장·로깅하지 않는다. 이유: FR-015.
- MUST 서버는 `.claude/settings.json`을 읽기만 한다. 쓰기 코드 경로가 있으면 FAIL. 이유: FR-014-AC1.

## 7. UI 구현 규칙

- MUST 색·글꼴·간격·모서리는 `styles/theme.css`의 `@theme` 토큰(ui-spec §공통 매핑)으로만 쓴다. Tailwind 임의값(`bg-[#161D2C]`, `text-[13px]`)과 인라인 색상 금지. 예외: 픽셀 캐릭터의 부위 색(`pixel-sprites.md` 공통 색)은 `components/pixel/palette.ts` 상수. 이유: UI 기준 단일화.
- MUST API를 호출하거나 스냅샷을 기다리는 모든 화면·팝업은 로딩(스켈레톤)·에러 상태를 갖는다. 숫자 자리에 `0`을 먼저 보여주지 않는다. 이유: FR-005-AC9, ui-rules 5.
- MUST 04-3 배너는 `App` 레이아웃에서 한 번만 렌더링하고 모든 라우트 위에 나온다. 이유: FR-016-AC1.
- MUST 01·02·03의 요소 구성·순서는 `docs/ui/screens/*.png`, 04~07은 와이어프레임 구성을 따르고 ui-spec의 요소 표에 없는 요소를 추가하지 않는다. 이유: 요소 누락·추가 모두 결함.
- MUST 상태 글자 문구: `작업 중`, `권한·입력 대기`(캐릭터 아래 짧은 표기는 `권한 대기`), `대기`. 워크플로우 칩: `실행 중 N명` / `권한 대기 N명` / `모두 대기`. 이유: ui-rules 1.
- MUST 아이콘만 있는 버튼(`+`, `−`, `‹`, 검색)은 `aria-label`. 클릭 영역 최소 34px. 이유: NFR-12.
- MUST 애니메이션 금지. 상태 색 전환 `transition` 200ms 이하만. 이유: UI 기준.
- MUST 12자 초과 name은 `ellipsis.ts`로 말줄임하고 `title` 속성으로 전체 name을 준다. 이유: FR-006-AC4.
- SHOULD 글꼴은 `IBM Plex Sans KR`·`IBM Plex Mono`를 `frontend/public/fonts/`에 self-host(오픈 폰트 라이선스, 외부 요청 없음). 이유: 외부 접속 없이 동작.

## 8. 테스트 기준

- MUST 테스트 이름 또는 설명에 검증하는 ID를 넣는다. 형식: `[FR-004-AC2] PreToolUse AskUserQuestion → waiting`, `[FR-013-E3] invalid lead name → 400`. 여러 ID면 나열. 이유: tasks.md Done when 추적.
- MUST 단위 테스트 위치·도구: Backend JUnit 5(`backend/src/test/java`), Frontend Vitest(`frontend/src/**/*.test.ts(x)`), Helper `node:test`(`helper/test/`), E2E Playwright(`tools/e2e/tests/`).
- MUST 파일 시스템을 쓰는 백엔드 테스트는 `@TempDir`로 fixture를 복사해 쓴다. 절대 경로 하드코딩 금지.
- MUST `SessionStateMachineTest`는 FR-004-AC2 표의 모든 행(13행)과 FR-004-AC3·AC4·E1을 각각 별도 테스트로 갖는다.
- MUST `MaskerTest`는 FR-015-AC1의 키워드 10종과 접두 4종(`sk-`, `ghp_`, `xox[abp]-`, `AKIA`)을 각각 검증한다.
- MUST 프론트 컴포넌트 테스트는 스토어에 fixture 스냅샷을 넣고 렌더링해 문구·비활성·이유를 검증한다. `fetch`·`EventSource`는 테스트에서만 대체한다.
- MUST E2E는 실제 컨테이너(`tools/e2e/compose.e2e.yaml`)와 dry-run 도우미로 실행하고, Server·Frontend를 목킹하지 않는다. `page.route`로 `/api/**`를 가로채지 않는다. 이유: Integration Verification.
- MUST E2E-13 스크린샷은 뷰포트 1440×(1140|1020|880)로 `tools/e2e/screenshots/01-home.png` 등에 저장한다. 이유: 리뷰 대조.
- MUST 성능 테스트: FR-001-AC3(변경→SSE p95 < 1.5s, 100회), FR-003-AC3(수집 응답 p95 < 100ms, 1000회), NFR-02 목록 API(에이전트 100·워크플로우 30 fixture에서 `GET /api/state` < 1s)는 통합 테스트로 측정하고 결과 수치를 테스트 로그에 남긴다.
- SHOULD 커버리지 수치 목표는 두지 않는다. AC·E ID 연결이 기준이다.
