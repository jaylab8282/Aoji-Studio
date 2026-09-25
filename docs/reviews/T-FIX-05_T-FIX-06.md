# 리뷰 — T-FIX-05 (Backend 403 안내 문구) · T-FIX-06 (Frontend 진입 주소 정규화)

- 날짜: 2026-09-25
- Scope: task (두 태스크 동시 검토, 하나의 ADR-41 확정을 나눠 구현)
- **판정: T-FIX-05 PASS · T-FIX-06 PASS** (Blocker 0 / 태스크 범위 Major 0)

## 실행한 검증
| 명령 | 결과 |
|---|---|
| `./gradlew test --tests OriginFilterTest --tests OriginFilterDevProfileTest --tests SnapshotAssemblerTest` | OriginFilterTest 7/0/0 skip 0, DevProfile 1/0/0, SnapshotAssembler 2/0/0 |
| `npm test` | 54 files / 303 tests 통과, 실패·skip 0 (팀장 수치와 일치) |
| `npm run lint` / `typecheck` / `build` | 전부 통과 (119 modules) |
| dev 백엔드 실기동 + curl 실측 | 아래 1·3·7 |
| 뮤테이션 probe 6건 | 아래 5 |

`@Disabled`/`it.skip`/`describe.skip`/`.only(` 저장소 전체 **0건**. diff 삭제 라인은 의도적 교체 12줄뿐, 삭제된 파일 0 — 테스트 삭제·skip으로 통과시킨 흔적 없음.

## 핵심 판정 7건 (실측)

1. **허용 목록 안 넓어짐** — 운영: `http://localhost:4180`·`http://[::1]:4180` 모두 403. dev 실기동 curl: `localhost:8080`→403, `[::1]:8080`→403, `127.0.0.1:5173`→200, `127.0.0.1:9999`→403, Origin 없음+`Sec-Fetch-Site: same-origin`→200. `compose.yaml`·`.env.example`·`compose.e2e.yaml`에 `localhost`·`::1` 0건.
2. **T-002 기존 테스트 무손상** — `OriginFilterTest.java` diff가 **순수 추가**, 삭제 라인 0. 4건 원문 그대로 존재. `OriginFilterDevProfileTest`는 diff에 없음(미수정).
3. **403 본문 자리표시 잔존 없음** — 실기동 응답 원문·바이트덤프: `{"code":"FORBIDDEN_ORIGIN","message":"허용되지 않은 출처입니다 · http://127.0.0.1:8080 주소로 다시 접속하세요"}`. `<`·`>`·`%s`·`publicOrigin` 0건, UTF-8 정상. ADR-33 (a) 충족.
4. **포트 안 바뀜** — `URL.hostname` 대입만. 4190(E2E 포트)·포트 없는 주소·대문자 호스트까지 테스트가 덮음. 재투입 시 `null` → 루프 불가.
5. **정적 단언 3종이 진짜 위반을 잡음 (probe 6건 직접 재현)**

| probe | 심은 것 | 결과 |
|---|---|---|
| A | 다른 파일에 `window.location.replace(url)` | 단언 #2 FAIL |
| B | 다른 파일에서 `redirectToCanonical` 호출 | 단언 #2 FAIL |
| C1 | `startStream()`을 가드 블록 **밖**으로 | 단언 #1 FAIL |
| C2 | 가드를 render **뒤**로 | 단언 #1 FAIL |
| D | `"0.0.0.0"` 문자열 주입 | 단언 #3 FAIL |
| E | 오탐 제거 로직이 진짜 위반을 가리는지 | 잡힘(테스트 파일 미제외) |

백엔드 정적 단언도 probe 확인: `application.yaml`에 `# ... localhost` 주석 한 줄 추가 → 단언 FAILED. 원복 후 `shasum` 일치.

6. **가드가 리다이렉트 시 SSE·API 안 엶** — `startStream` 호출처는 `main.tsx` 한 곳(가드 안). `src` 전체에 모듈 로드 시점 네트워크 호출 0건, 라우트 `loader` 0건. **프로덕션 번들 원문**에서도 가드가 부트스트랩 앞에 남아 있음.
7. **계약값 무변경** — `AppProperties.publicOrigin()` 식이 이전과 문자 단위 동일. `SnapshotAssemblerTest`가 `publicOrigin == "http://127.0.0.1:4180"` 단언 통과. 실기동 `/api/state`·`/api/settings` 값 동일.

## 개발자 자기보고 5건 판정
- **(B1) 사실 · Minor(backend)** — `ApiException.forbiddenOrigin()` 호출처 0건, 옛 문구 보유. **지금은 계약 위반 아님**(403 생성 경로는 `OriginFilter` 하나뿐). 쓰이는 순간 conventions §4 MUST를 깨고 막는 테스트가 없으므로 **문구 수정이 아니라 팩터리 삭제** 권고.
- **(B2) 계약 위반 아님 · Minor(frontend)** — `client.test.ts:62`는 "다른 403은 재시도 안 함" stub이고 단언은 `code`·`postCalls`뿐. 오도 소지가 있어 확정 문구로 교체 권고.
- **(B3) 구현은 문서대로 · 이 태스크 이슈 아님** — `<publicOrigin>` = `Config.publicOrigin` 정의대로. dev에서 안내가 어긋나는 것은 아래 Major가 원인.
- **(B4) 의도된 가드** — 단언 문구가 tasks.md Done when과 축자 일치, probe로 발화 확인.
- **(B5) 우회 타당** — ADR-33 검사기는 "문자열 리터럴만 본다"를 스스로 테스트로 선언한 설계. 정규식은 그 설계 안의 정상 표현이고 동작 동치.

## ISSUES

### [Major · 범위 밖 선행 결함 — 두 태스크 판정에 미반영] dev 프로필 허용 Origin이 문서보다 좁다
- 위치: `backend/src/main/resources/application-dev.yaml:10-11`, `config/OriginFilter.java:47-57`(값이 있으면 기본값을 **대체**)
- 근거: `architecture.md:160` "dev 프로필에서 `http://127.0.0.1:5173`을 **더한 둘뿐이다**", `architecture.md:125` "**추가**", `conventions.md:97` 동일. 실측: dev 기동 후 `Origin: http://127.0.0.1:8080` → **403**(허용되어야 하는데 거부)
- 영향: dev에서 8080 직접 접속 시 GET은 되고 POST만 403 — **ADR-41이 없애려던 바로 그 함정**이 dev에 남고, 새 안내 문구가 "지금 있는 주소로 다시 접속하라"는 막다른 안내가 된다
- 성격: scaffold 커밋(9f156d2)부터 존재한 선행 결함, 이번 diff와 무관. fail-closed(더 좁음) 방향이라 **보안 위험 없음**, 운영 이미지는 dev 프로필 미사용(compose·Dockerfile에 프로필 설정 0건) → **사용자 영향 없음**
- 수정 방향: `application-dev.yaml`을 `http://127.0.0.1:${JAYSTUDIO_PUBLIC_PORT},http://127.0.0.1:5173`으로 바꾸거나(문서대로), 문서를 "dev는 5173으로 대체"로 고친다
- 담당: **architect**(결정) → backend(반영) → **A-16**으로 분리

### [Minor] `ApiException.forbiddenOrigin()` 죽은 코드 + 옛 문구 (B1) — backend → T-FIX-07
### [Minor] 403 픽스처 문구가 확정 문구와 다름 (B2) — `client.test.ts:62`, frontend → T-FIX-07
### [Minor] 정적 단언 #2의 테스트 파일 제외가 남기는 사각 — `staticRules.test.ts:88-95`, frontend(후속) → T-FIX-07

## SUGGESTIONS
- 단언 #1은 **순서만** 본다. 가드 앞에 새 API 호출을 넣는 변경은 못 잡는다 → "가드 이전 텍스트에 호출 없음" 단언 추가 권고
- ADR-33 검사기가 코드 문자열 리터럴까지 잡는 한계 → 검사 범위 축소 후속 검토(다음 사람이 같은 우회를 재발명한다)

## NEEDS CONFIRMATION
- **E2E-15(실브라우저 리다이렉트 + 이후 POST 성공)는 미검증** — tasks.md가 T-024 범위로 명시. 실브라우저의 `localhost` IPv4/IPv6 해석 거동은 T-024에서 확인 필요
- 기준 이미지 재촬영 안 함 — UI 요소·문구·스타일 diff 0, ui-spec §공통이 "화면 변화는 주소창뿐"으로 명시
- 도우미 403 함정 해소는 실브라우저 정규화 동작으로 완성 → T-021·T-024에서 확인

## 자원 사용·정리
- 띄운 프로세스: bootRun 셸 PID 15143, Spring JVM PID 15161, Gradle 데몬(2회)
- 정리: `kill` 후 `./gradlew --stop` 2회 → `pgrep -fl "GradleDaemon|bootRun|JayStudioApplication|http.server"` **0건**, `lsof -ti :8080 :4180 :4199` **0건**
- 부하 테스트·벤치마크·`yes` 류 **미실행**. 대기는 결정론적 폴링만
- probe 파일 5개 생성 후 전부 삭제, `main.tsx`·`application.yaml` `shasum` 원복 확인. 리뷰 전후 `git status --porcelain` 완전 동일. 코드 미수정
