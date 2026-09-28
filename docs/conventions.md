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
| 화면 문구 | final 문서·ui-spec의 문구를 글자 그대로. 단 `[...]`·`<...>` 표기는 아래 MUST(ADR-33)를 적용한 뒤의 형태가 "그대로"의 기준이다 | `팀장이 없습니다 · 팀장을 만들거나 가져오세요` |

- MUST 화면 문구는 `frontend/src/lib/text.ts` 한 파일에 상수로 모으고 컴포넌트는 그 상수를 쓴다. 이유: E2E·리뷰가 문구를 대조하고, 문구 변경이 한 곳에서 끝난다.
- MUST 화면 문구 상수·JSX 문자열에 `[`·`]`로 감싼 자리표시 표기를 남기지 않는다. ui-spec·와이어프레임 문구의 `[...]`·`<...>`는 문서 표기이며, 렌더 형태는 ui-spec §공통 "화면 문구의 `[...]`·`<...>` 표기"(ADR-33)의 세 갈래 — **(a) 데이터 출처 값으로 치환 / (b) 입력 요소 placeholder면 괄호 벗긴 설명 문구 / (c) 정적이면 괄호만 벗긴 텍스트** — 로만 정한다. 판정 순서는 (a)→(b)→(c)이고, 괄호 안 낱말을 바꾸거나 문장을 다시 쓰지 않는다. 유일한 예외는 서버가 준 값 자체에 괄호가 들어 있는 경우(`settings.leadSessionCommandTemplate`의 `<팀장 name>`, FR-013-AC2)이며 이는 (a)의 결과다. 이유: 같은 표기를 구현자마다 다르게 읽어 화면 문구가 갈리는 일을 없앤다(T-017 Minor 1), §2 "문구 그대로"와 §3 "placeholder 문구 금지"의 충돌 제거.
- MUST 치환값 바로 뒤에 붙는 조사는 ui-spec이 적은 **병기 표기**(`을(를)`, `이(가)`, `은(는)`, `와(과)`, `(으)로`)를 글자 그대로 쓴다. 받침을 판정해 조사를 고르는 보정 함수·분기를 만들지 않는다(`lib/format/*`·컴포넌트 어디에도 두지 않는다). ui-spec에 없는 조사 결합 문구가 필요하면 구현에서 만들지 말고 architect에 확정을 요청한다. 이유: `name`은 `^[a-z0-9-]{1,64}$`라 한글이 아닌 값이 정상 입력이고 받침 판정 규칙이 확정 문서에 없다. FR-006-AC11이 이미 `<name>이(가)`로 확정되어 있어 보정 코드를 두면 한 화면군에 두 방식이 공존한다(ADR-39).

## 3. 코딩 규칙

### 공통
- MUST 미완성 코드 금지: `TODO`, `FIXME`, `XXX`, placeholder 값·문구(`lorem`, `TBD`, `[N]`, `[이름]`, `[한 줄 설명]`, `[워크플로우 1]`, `example.com` — 화면에 렌더되는 문자열의 대괄호 자리표시는 정적 설명줄이어도 여기에 포함된다, ADR-33. 서버가 준 값에 들어 있는 괄호는 제외), 미구현 stub(`throw new UnsupportedOperationException`, `return null // later`), 운영 코드 경로의 Mock·가짜 데이터. 이유: 태스크 완료 = 동작하는 코드.
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
- MUST 진입 주소 정규화(ADR-41)는 `lib/origin.ts`의 `canonicalHref(href)`·`redirectToCanonical(loc)` + `main.tsx`의 첫 렌더 전 호출 한 곳에서만 한다. 판정 대상은 `location.hostname`이 `localhost`·`[::1]`인 경우뿐이고 스킴·포트·경로·쿼리·해시는 바꾸지 않는다. 컴포넌트·라우터·`api/client.ts`에서 주소를 다시 판정하거나 `publicOrigin`과 비교해 이동시키지 않는다. 이유: 확정 진입 주소(`127.0.0.1:<포트>`) 강제를 한 지점에 두고 리다이렉트 루프·잘못된 포트 이동을 막는다.
- MUST 파생 계산(정렬·집계·검색·라벨)은 `lib/derive/*.ts` 순수 함수로 두고 Vitest 테스트를 붙인다. 컴포넌트 안에서 정렬·집계 로직을 쓰지 않는다. 이유: ADR-15, AC 검증.
- MUST 상태 표시는 항상 `StatusDot` + 상태 글자(`작업 중`/`권한·입력 대기`/`대기`) 조합인 `StatusLabel` 컴포넌트를 쓴다. 색만 있는 상태 표시 금지. 이유: ui-rules 1, NFR-12.
- MUST 버튼은 `components/ui/Button`의 `variant`(`primary`|`terminal`|`secondary`|`add`|`danger`)와 `disabledReason` prop으로만 만든다. `disabledReason`이 있으면 옆에 이유 한 줄을 렌더링한다. **누르면 아무 일도 없는 활성 버튼 금지 — 예외 없다**(같은 범주의 두 사례를 ADR-42는 "그 화면에서 미표시", ADR-44는 "값이 오기 전 비활성"으로 해결했고 어느 쪽도 예외를 만들지 않았다. 아래 "값이 오기 전 비활성" MUST와 §7의 대응 MUST를 함께 본다). 이유: ui-rules 2.
- MUST 버튼이 눌렸을 때 쓸 값(스냅샷 `config`, 자체 API 응답, 사전 확인 결과)이 아직 없으면 그 버튼을 `disabled`로 둔다. 값이 없는 동안 활성으로 두고 클릭 핸들러·훅에서 조용히 `return`하지 않는다(예: `useHelperOpen.open`이 `helperUrl === null`이면 아무 일도 하지 않으므로, 호출하는 버튼 쪽이 `config === null`일 때 `disabled`여야 한다). 이유 줄은 붙이지 않는다 — 원인이 같은 화면의 스켈레톤·`확인 중…`으로 보이므로 ADR-35 지정 기준에 해당하지 않고, 문구 신설은 §2 MUST 위반이다(ui-spec §공통 "값이 오기 전 버튼 상태", ADR-44).
- MUST `disabledReason`에는 **ui-spec §공통 "비활성 버튼의 이유 줄" 목록이 그 지점에 지정한 문구만** 넣는다. 목록에 이유가 없는 비활성(입력 미완, 이름 불일치, 요청 진행 중 등)은 이유 줄 없이 비활성 모양(ADR-29)만 쓰고, 문구를 새로 지어내지 않는다. 목록에 없는 새 비활성 지점이 필요하면 구현에서 문구를 만들지 말고 architect에 확정을 요청한다. 이유: ui-rules 2의 "옆에 이유 한 줄"은 이유가 필요한 경우의 표현을 적은 것이고, 문구 신설은 §2 MUST(문구 그대로) 위반이다(ADR-35).
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
- MUST 403 `FORBIDDEN_ORIGIN`의 `message`는 서버가 `허용되지 않은 출처입니다 · <publicOrigin> 주소로 다시 접속하세요`로 만든다(`<publicOrigin>`은 서버가 치환한 완성 문장). 프론트는 다른 에러와 똑같이 `message`를 그대로 표시하고 403 전용 분기·재시도·문구를 만들지 않는다. 이 문구는 확정 문서에 없던 신설 문구이며 **2026-09-25 사용자 승인**을 받았다(E-006, ADR-41, T-FIX-05). 이유: 안내는 `message` 한 곳에만 두고(§4 MUST "가공 없이 표시"), FR-008 오류 매핑에 403이 없어 생긴 공백을 메운다.
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
- MUST Origin 규칙(architecture §5)은 `/api/**`·`/api/stream`에 필터로 적용하고 컨트롤러별로 예외를 두지 않는다. 허용 Origin은 **어느 프로필에서도 한 개**다 — 기본값 `http://127.0.0.1:<PUBLIC_PORT>`, dev 프로필은 이 값을 `http://127.0.0.1:5173`으로 **대체**한다(추가가 아니다 → dev에서 `Origin: http://127.0.0.1:8080`은 403이 맞다. dev의 8080은 SPA를 제공하지 않아 그 Origin을 만드는 페이지가 없다, ADR-47). `localhost`·`[::1]` 표기는 허용 목록에 넣지 않고, 대신 프론트가 진입 주소를 `127.0.0.1`로 정규화한다(ADR-41, §3 Frontend MUST). 도우미 `--allowed-origins`도 같다(기본값 `http://127.0.0.1:4180`, FR-013-AC7). 이유: 허용 목록은 틀리면 그대로 보안 구멍이 되므로 확정 진입 주소 하나만 둔다.
- MUST 디버그 모드 기본 꺼짐: Spring `debug=false`, DevTools 없음, Vite dev 서버는 컨테이너에 포함하지 않음, 도우미 `--dry-run` 기본 꺼짐. 이유: NFR-05.
- MUST 브라우저 토큰은 메모리에만 둔다(localStorage·sessionStorage·cookie·URL 히스토리 금지. SSE 쿼리는 예외이며 `history.replaceState`로 URL에 남기지 않는다). 이유: ADR-01.
- MUST 마스킹은 `Masker.mask()` 하나로 저장 직전에 하고, 마스킹 전 문자열을 필드·로그·응답에 담지 않는다. `tool_input` 전체를 저장·로깅하지 않는다. 이유: FR-015.
- MUST 서버는 `.claude/settings.json`을 읽기만 한다. 쓰기 코드 경로가 있으면 FAIL. 이유: FR-014-AC1.

## 7. UI 구현 규칙

- MUST 색·글꼴·간격·모서리는 `styles/theme.css`의 `@theme` 토큰(ui-spec §공통 매핑)으로만 쓴다. Tailwind 임의값(`bg-[#161D2C]`, `text-[13px]`)과 인라인 색상 금지. 예외: 픽셀 캐릭터의 부위 색(`pixel-sprites.md` 공통 색)은 `components/pixel/palette.ts` 상수. 이유: UI 기준 단일화.
- MUST API를 호출하거나 스냅샷을 기다리는 모든 화면·팝업은 로딩(스켈레톤)·에러 상태를 갖는다. 숫자 자리에 `0`을 먼저 보여주지 않는다. 이유: FR-005-AC9, ui-rules 5.
- MUST 04-3 배너는 `App` 레이아웃에서 한 번만 렌더링하고 모든 라우트 위에 나온다. 이유: FR-016-AC1.
- MUST 01·02·03의 요소 구성·순서는 `docs/ui/screens/*.png`, 04~07은 와이어프레임 구성을 따르고 ui-spec의 요소 표에 없는 요소를 추가하지 않는다. 기준 PNG·와이어프레임과 어긋나도 되는 항목은 ui-spec SCR-01·SCR-02·SCR-03의 "기준 PNG와의 확정된 차이", SCR-05-R의 "와이어프레임 p.6 오른쪽과의 확정된 차이", SCR-07의 "와이어프레임 p.4와의 확정된 차이" 목록에 적힌 것뿐이고(ADR-25, ADR-28, ADR-37, ADR-40, ADR-42, ADR-43, ADR-46), 그 밖은 누락·추가·배치 차이 모두 결함이다. 목록에 없는 새 차이를 발견하면 구현을 바꾸지 말고 architect에 확정을 요청한다. 이유: 기준을 코드에 맞추는 역전을 막는다.
- MUST 상태 글자 문구: `작업 중`, `권한·입력 대기`(캐릭터·책상 아래 짧은 표기는 `권한 대기`, **02 로비 항목의 짧은 표기는 `입력 대기`** — ui-spec SCR-02 로비 행·02 기준 PNG, ADR-26), `대기`. 워크플로우 칩: `실행 중 N명` / `권한 대기 N명` / `모두 대기`. 이 네 표기 밖의 상태 문구를 새로 만들지 않는다. 이유: ui-rules 1.
- MUST 화면 아래에 "고정"하는 보조 컨트롤(02 줌 버튼·미니맵)은 스크롤 영역 밖 전용 영역에 두고 콘텐츠 위에 겹치지 않게 한다. 스크롤되는 콘텐츠 위에 `position: fixed`·`sticky`로 덮는 배치 금지. 예외는 **자체 스크롤 컨테이너 안의 표 머리 행**(01 실시간 이벤트 표 `<thead>` `sticky top-0`, ADR-46 C) 하나이며, 그것은 같은 표의 일부라 다른 요소를 가리지 않는다. 이유: FR-006-AC10, `docs/ui/README.md`(요소 가림은 결함), ui-spec SCR-02 레이아웃 항(ADR-23).
- MUST 워크플로우 카드·층 카드 테두리 색은 `lib/derive/workflowCardBorder.ts` 하나로 정한다(01·02 공용). 컴포넌트에서 칩 variant로 테두리를 정하지 않는다. 이유: ADR-24, 화면 간 표현 불일치 방지.
- MUST 비활성 버튼은 variant의 채움 배경과 강조 테두리 색을 지우고 점선 테두리(`border/dashed`) + `text/faint` 글자만 남긴다(이유 줄은 ADR-35가 지정한 지점에만 옆에 붙는다). variant 배경 위에 점선·faint만 덧칠하지 않는다. 이유: ui-rules 2 표의 `비활성`은 variant를 대체하는 표현이고, 배경을 남기면 비활성 버튼이 활성처럼 보여 "눌러도 아무 일이 없는 활성 버튼 금지"(ui-rules 2) 의도가 깨진다(ADR-29).
- MUST 프로젝트 칩(`● 프로젝트 · <hostPath>`)은 01·02에서만 그린다. `TopBar`는 라우트를 직접 읽지 않고 화면이 넘긴 설정으로 칩 표시 여부를 정한다. 이유: ui-spec §공통 `TopBar`·SCR-03 요소 표·기준 PNG 03(ADR-30), 공통 컴포넌트가 라우트를 알면 화면 규칙이 셸로 샌다.
- MUST 04-5(`AgentsDirMissing`)의 `설정 열기` 버튼은 01·02에서만 그리고 07에서는 그리지 않는다. 표시 여부는 화면이 넘기는 prop으로 정하고, 공용 컴포넌트가 `useLocation`·`window.location`·라우트 경로를 읽어 스스로 판정하지 않는다. 07에서 이 버튼을 비활성으로 두거나 이유 줄 문구를 새로 만들지 않는다. 이유: 07이 이 버튼의 도착지 자신이라 활성으로 두면 "눌러도 아무 일이 없는 활성 버튼 금지"(ui-rules 2)에 걸리고, 비활성으로 두면 확정 문서에 없는 문구 신설이 된다(ui-spec SCR-04-5·SCR-07, ADR-42).
- MUST 07 본문 카드 열 폭은 `max-w-3xl`(768px)이다. 새 폭 토큰(`--width-*`)이나 임의값(`max-w-[819px]`)을 쓰지 않는다. 이유: 와이어프레임 실측 819px은 `docs/ui/design-tokens.md`에 없는 값이라 토큰 신설이 되고(그 개정은 architect 권한 밖), 폭은 Tailwind 기본 스케일에서 고른다(ui-spec SCR-07 레이아웃·확정된 차이, ADR-43).
- MUST 첫 스냅샷 전 로딩은 `AppShell` 공통 스켈레톤 하나로 처리하고 화면마다 별도 스켈레톤을 만들지 않는다. 예외는 ui-spec §공통 상태 표현 `로딩` 행의 자체 스켈레톤 목록(`TopBar` 칩, `CollectorStatus`, 자체 API 호출 요소)뿐이다. 이유: 01·02·03이 같은 로딩 화면을 갖고 중복 구현을 없앤다(ADR-32).
- MUST `AppShell` 공통 스켈레톤 **밖**(= `ready` 게이트 밖)에 그리는 요소가 스냅샷 값을 쓰면 자체 로딩 표현을 갖는다: 표시 요소는 자체 스켈레톤, **버튼은 비활성**(이유 줄 없음). 현재 대상은 `TopBar` 프로젝트 칩(스켈레톤)·`CollectorStatus`(스켈레톤)·02 `Claude 열기 · 기본 세션`(비활성) 셋이고, 게이트 밖 컨트롤 중 스냅샷 값을 쓰지 않는 것(사이드바 탭, 04-3 `지금 재연결`)은 로딩 중에도 활성이다. 게이트 밖에 스냅샷 의존 요소를 새로 추가하면 구현이 표현을 정하지 말고 architect에 확정을 요청한다. 이유: 게이트 밖 요소는 공통 스켈레톤이 덮지 않아 "로딩 중 활성이지만 눌러도 아무 일이 없는 버튼"이 생긴다(ui-spec §공통 "값이 오기 전 버튼 상태"·SCR-02, ADR-44).
- MUST 04-4(수집 중단) 표시 고정(`displayStatus`)은 ui-spec SCR-04-4의 "고정 대상" 목록에만 적용하고, 버튼 비활성·사용 가능 판정과 헤더 칩에는 실제 `live.agents[name].status`를 쓴다. 이유: 표시 규칙(FR-007-E1)과 동작 가드(FR-011-AC5·FR-012-AC6)를 섞으면 서버가 409 `AGENT_BUSY`로 거부할 팝업이 열린다(ADR-27).
- MUST 아이콘만 있는 버튼(`+`, `−`, `‹`, 검색)은 `aria-label`. 클릭 영역 최소 34px. 이유: NFR-12.
- MUST 애니메이션 금지. 상태 색 전환 `transition` 200ms 이하만. 이유: UI 기준.
- MUST 표시 지속 시간·자동 닫힘 지연 값은 ui-spec이 명시한 값만 쓰고, design token이 아니라 해당 컴포넌트의 이름 있는 코드 상수로 둔다(예: 05-3 FR-017-E1 안내 `NOT_EMPTY_NOTICE_MS = 3000`, `CopyButton` 복사됨 1.5초, 02 저장 후 안내 줄 8초). ui-spec에 값이 없는 새 지연을 구현이 정하지 않는다. 이유: 사용자가 읽어야 하는 문구의 노출 시간이 리뷰 가능한 문서 값이어야 한다(ADR-34).
- MUST 팝업 폭은 공통 `Dialog`의 `size`(`md` 기본 | `lg`)로만 정하고, 어느 화면이 어느 폭인지는 ui-spec §공통 `Dialog` 행을 따른다. 팝업 컴포넌트에서 `max-w-*`를 직접 지정하거나 임의값(`max-w-[766px]`)을 쓰지 않는다. 두 단계 밖의 폭이 필요하면 구현이 정하지 말고 architect에 확정을 요청한다. 이유: `Dialog`는 05·06 전 팝업이 공유하므로 폭이 화면마다 흩어지면 회귀·대조 기준이 사라진다(ADR-40).
- MUST 12자 초과 name은 `ellipsis.ts`로 말줄임하고 `title` 속성으로 전체 name을 준다. 이유: FR-006-AC4.
- MUST hover·`:focus-visible` 표현은 **공용 컴포넌트에서만** 구현한다(`components/ui/Button.tsx`, `components/common/Sidebar.tsx`, `components/ui/Select|SearchInput|TextInput|TextArea`). 화면 파일에 개별 hover 클래스를 흩뿌리지 않으며, 예외는 둘뿐이다 — ① **화면 전용 클릭 영역 3곳**(01 대표 카드, 02 책상 칸, 03 오피스 칸)은 그 화면 컴포넌트에 두고 값은 ui-spec §공통 "마우스 hover·키보드 `:focus-visible` 표현" 표에 있는 것만 쓴다 ② **부류 ④ 텍스트·브레드크럼 링크**(표현이 밑줄뿐이라 값이 흩어질 여지가 없다)는 그 링크가 있는 화면 파일에 둔다(01 `전체 보기 →` = `screens/home/FeaturedWorkflows.tsx`, 03 브레드크럼 = `screens/workflow-detail/Breadcrumb.tsx`). **05-R 목록 행은 예외가 아니다 — 행에 hover를 주지 않는다**(ADR-49 1). 이유: 같은 규칙이 20개 화면 파일에 복제되면 회귀·리뷰 기준이 사라진다(ADR-46 A, ADR-49, ADR-24·ADR-29와 같은 이유).
- MUST hover·focus에 **새 색 값을 만들지 않는다**: 임의값(`hover:bg-[#1F2A3C]`)·인라인 색상·새 토큰 금지. 쓸 수 있는 표현은 세 가지뿐이다 — ① 배경 토큰 교체(`hover:bg-selected`, 선택 표시가 `bg/selected`인 요소는 `hover:bg-soft`) ② 상태 색 채움 variant(`primary`·`terminal`·`danger`)의 `brightness-110` ③ 텍스트·브레드크럼 링크의 밑줄. **한 요소가 배경 교체와 `brightness-110` 둘에 해당하면(예: 04-7 점선 카드의 `primary` 버튼) `brightness-110`이 우선한다 — `Button` variant가 상태 색 채움이면 화면 파일에 hover 배경을 덧붙이지 않는다**(ui-spec §공통 표 ①·③, ADR-49 4). `hover:bg-soft`는 표면이 `bg/chrome`인 곳(사이드바)에서만 쓴다(`bg/card`·`bg/soft` 표면에서는 채널당 +1~2로 보이지 않는다 — ADR-49 7). `:focus-visible`에는 hover와 같은 표현을 쓰고 `outline-none`·`focus:outline-none`으로 브라우저 기본 outline을 지우지 않는다(focus ring 색·굵기 토큰이 없다). 이유: `docs/ui/design-tokens.md`에 hover 단계·focus ring 토큰이 없고 토큰 신설은 architect 권한 밖이다(ADR-46 A, ADR-31·ADR-43 선례).
- MUST 비활성 버튼(`disabled`·`disabledReason`)과 선택된 항목(사이드 탭 선택, 05-R 선택 행, 03 선택 칸), 클릭 동작이 없는 요소(01 이벤트 표 행·KPI 카드·칩·배지·배너·02 로비 항목·03 작은 캐릭터·`빈 자리`, **05-R 목록 행**(`<tr>`에 클릭 동작 없음 — 클릭 대상은 체크박스·역할 드롭다운), **04-6 `정상 파일은 수정 팝업에서 편집 →`**(요소 표 클릭 동작 열이 `없음(안내)`))에는 hover·focus 표현을 주지 않는다. **요소를 hover 대상으로 만들려고 없던 클릭 동작을 신설하지 않는다** — 전수 목록과 이 MUST가 어긋나면 목록을 좁힌다(ADR-49 1·2). 이유: 눌리지 않는 것에 피드백을 주면 거짓 정보이고, hover 피드백은 "클릭할 수 있다"는 신호라 없는 동작을 기대하게 만든다(`docs/ui/ui-rules.md` 2, ADR-46 A).
- MUST hover·focus의 색 전환은 `transition-colors duration-200`만 쓰고 `brightness`·밑줄에는 전환을 두지 않는다. **이 클래스는 `components/ui/Button.tsx` 한 곳에만 둔다 — 사이드 탭·입력·드롭다운·화면 전용 클릭 영역은 전환 없이 즉시 바뀐다**(ADR-49 8). 이유: 위 "애니메이션 금지, 상태 색 전환 200ms 이하만" MUST의 한도 안에 두고, 전환 클래스가 7개 파일로 복제되는 것을 막는다(위 "공용 컴포넌트에서만"과 같은 이유). `Button`은 variant·비활성·hover·focus로 색 상태가 여럿이라 전환의 이득이 가장 크다(ADR-46 A, ADR-49 8).
- MUST 01 대표 워크플로우 카드의 활동 줄(`최근 활동 · <요약>` 등)은 CSS 한 줄 clamp(`truncate` + 부모 `min-w-0`)로 자르고 `title` 속성으로 전체를 준다. 글자 수 상수로 문자열을 잘라 DOM 텍스트를 바꾸지 않는다. **`title`에 넣는 값은 화면에 보이는 것과 같은 문자열(서버가 이미 마스킹한 `lastEvent.title`·`summary`로 만든 활동 줄)이어야 하고, 마스킹 전 원문을 가져오는 경로를 만들지 않는다.** 이유: 문자열을 자르면 FR-005-AC3·AC8을 검증하는 기존 단위·E2E 단언이 깨지고 새 글자 수 값을 확정해야 한다. 원문을 툴팁에 넣으면 `docs/ui/ui-rules.md:52`·FR-015-AC2 위반이다(ADR-46 B).
- MUST 01 실시간 이벤트 표는 `h-96`(384px) 고정 높이 자체 스크롤 컨테이너(`overflow-y-auto`) 안에 두고 `<thead>`를 `sticky top-0` + `bg-card`로 고정한다. 스크롤 컨테이너는 `tabIndex={0}` + `role="region"` + `aria-labelledby`(기존 카드 제목 `실시간 이벤트`)를 갖는다. 높이에 새 토큰·임의값을 쓰지 않고, `recentEvents` 50개를 페이지네이션·가상 스크롤·행 수 축소로 줄이지 않는다. `aria-label`에 새 문구를 만들지 않는다. 이유: FR-005-AC6("최신순 최근 50개만 보인다. 전체 로그 화면은 없다")을 유지하면서 화면 길이를 줄인다(ADR-46 C, ADR-43의 임의값 금지).
- MUST 02 미니맵 뷰포트 테두리를 다시 재는 방아쇠는 ui-spec SCR-02 "재측정 시점(전수)"의 다섯 가지(마운트 / 층 스크롤 영역 `scroll` / `window` `resize` / `registry.workflows` 변경 / `zoom` 변경)뿐이다. 검색·층 선택 필터 상태와 `live.lobby`를 의존성에 넣지 않고, `ResizeObserver`·`MutationObserver`를 새로 도입하지 않는다. 이유: 미니맵 블록이 **필터 이전** `registry.workflows`를 그리므로 테두리만 필터 기준으로 다시 재면 블록과 테두리가 서로 다른 기준을 가리켜 더 틀린 그림이 되고, jsdom에 `ResizeObserver`가 없어 단위 테스트로 고정할 수 없다(ADR-48 A, T-FIX-10).
- MUST 02 책상 pitch(칸 간격)를 기준 PNG에 맞추려고 `--spacing-card` 등 공유 간격 토큰 값을 바꾸지 않는다. 실측 차이는 ui-spec SCR-02 "확정된 차이" 목록에 적힌 그대로 확정이다. 이유: 가로는 기준보다 작고 세로는 큰 반대 방향이라 어떤 단일 간격 값도 기준을 동시에 만족시키지 못하고, 이 토큰은 01·03과 공유되어 값을 바꾸면 세 화면의 기준 PNG 대조가 동시에 깨진다(ADR-48 C, ADR-43과 같은 이유).
- SHOULD 글꼴은 `IBM Plex Sans KR`·`IBM Plex Mono`를 `frontend/public/fonts/`에 self-host(오픈 폰트 라이선스, 외부 요청 없음). 이유: 외부 접속 없이 동작.

## 8. 테스트 기준

- MUST 테스트 이름 또는 설명에 검증하는 ID를 넣는다. 형식: `[FR-004-AC2] PreToolUse AskUserQuestion → waiting`, `[FR-013-E3] invalid lead name → 400`. 여러 ID면 나열. 이유: tasks.md Done when 추적.
- MUST 단위 테스트 위치·도구: Backend JUnit 5(`backend/src/test/java`), Frontend Vitest(`frontend/src/**/*.test.ts(x)`), Helper `node:test`(`helper/test/`), E2E Playwright(`tools/e2e/tests/`).
- MUST 파일 시스템을 쓰는 백엔드 테스트는 `@TempDir`로 fixture를 복사해 쓴다. 절대 경로 하드코딩 금지.
- MUST `SessionStateMachineTest`는 FR-004-AC2 표의 모든 행(13행)과 FR-004-AC3·AC4·E1을 각각 별도 테스트로 갖는다.
- MUST `MaskerTest`는 FR-015-AC1의 키워드 10종과 접두 4종(`sk-`, `ghp_`, `xox[abp]-`, `AKIA`)을 각각 검증한다.
- MUST 프론트 컴포넌트 테스트는 스토어에 fixture 스냅샷을 넣고 렌더링해 문구·비활성·이유를 검증한다. `fetch`·`EventSource`는 테스트에서만 대체한다.
- MUST E2E는 실제 컨테이너(`tools/e2e/compose.e2e.yaml`)와 dry-run 도우미로 실행하고, Server·Frontend를 목킹하지 않는다. `page.route`로 `/api/**`를 가로채지 않는다. 이유: Integration Verification.
- MUST 자동 검증용으로 호스트에 공개하는 포트(E2E 공개 포트 `4185`, dry-run 도우미 `4191`, 다른 Origin 서버 `4192`)는 **WHATWG Fetch "bad port"(blocked ports) 목록에 있는 값을 쓰지 않는다**. 특히 `4190`(sieve)은 쓰지 않는다. 새 포트를 추가하면 그 목록에 없는지 확인하고 architecture §8.1에 적는다. 이유: Node 전역 `fetch`(undici)는 bad port를 **연결 시도 없이** 즉시 거부하므로(`fetch failed / cause: bad port`) `tools/replay/replay.mjs`·하네스 같은 Node 도구가 서버가 정상인데도 절대 성공하지 못한다(ADR-45).
- MUST E2E-13 스크린샷은 **뷰포트 clip 한 가지 방식**으로 찍어 `1440×(1140|1020|880)`(기준 이미지와 같은 픽셀 크기)로 `tools/e2e/screenshots/01-home.png` 등에 저장한다. 02·03은 기본 뷰포트 1440×1024, **01은 캡처 직전 뷰포트 높이를 기준 프레임 높이로 바꿔(1440×1140) 찍고 되돌린다**. `fullPage` 캡처와 "문서 높이 ≥ 프레임 높이" 단언은 쓰지 않는다. 이유: 01 실시간 이벤트 표가 고정 높이라 문서 높이가 콘텐츠에 따라 1140px 아래로 내려갈 수 있고, `AppShell`의 `min-h-screen`이 뷰포트 높이만큼은 보장해 산출물 크기가 콘텐츠와 무관해진다(ADR-46 C. 기존 문구 "뷰포트 1440×(1140|1020|880)"은 실제 설정과 어긋났다 — T-024 Minor 8).
- MUST 01 실시간 이벤트 표의 행·각주 단언은 `toBeVisible()`(레이아웃 상자 기준)로 하고 `toBeInViewport`·스크롤 위치에 의존하는 단언을 쓰지 않는다. 이유: 표가 자체 스크롤 컨테이너 안이라 아래쪽 행은 캡처·뷰포트 밖이지만 DOM에는 있어야 한다(FR-005-AC6, ADR-46 C).
- MUST 성능 테스트: FR-001-AC3(변경→SSE p95 < 1.5s, 100회), FR-003-AC3(수집 응답 p95 < 100ms, 1000회), NFR-02 목록 API(에이전트 100·워크플로우 30 fixture에서 `GET /api/state` < 1s)는 통합 테스트로 측정하고 결과 수치를 테스트 로그에 남긴다.
- SHOULD 커버리지 수치 목표는 두지 않는다. AC·E ID 연결이 기준이다.
