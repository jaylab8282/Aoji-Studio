# Progress
- Project: Jay_Studio
- Approved Versions: function v1, architecture v1
- Phase: build
- Current: T-016 done. architect에 ui-spec 문서 확정 6건(A-1~A-6) 요청 중 — 끝나면 T-017(05 워크플로우 추가·05-3 삭제 확인 UI) 시작.
  - A-3(비활성 버튼 배경)·A-4(03 프로젝트 칩)·A-5(19px 토큰)가 확정되면 **이미 done인 T-013·T-014 공통 컴포넌트 수정 + 01·02 확정 캐처 재대조**가 필요할 수 있다. architect의 AFFECTED TASKS를 보고 후속 태스크 생성 여부를 판단할 것
  - A-2가 기준 PNG 우선으로 뒤집히면 `lib/derive/officeSeats.ts`와 테스트 재작업 발생

## Log
- 2026-09-20 architect 완료: 설계 문서 6개(architecture, conventions, api-spec.yaml, realtime-spec, ui-spec, tasks) · 태스크 24개. 팀장 검증: final의 AC/E 152개 전부 tasks.md에 연결 확인(누락 0, 초과 0), ui-spec 화면 01~07·04-1~7 전부, architecture §8 통합 검증 전략 있음, 스택·인프라 final 그대로.
- 2026-09-20 시작. final 문서 두 개 Status: Approved / v1 확인. CLAUDE.md Automation: design_checkpoint on, max_fix_rounds 3.

## Log (cont.)
- 2026-09-20 architect ADR-17 수정 완료(계약 변경 없음) → 커밋 5bcd613 `docs: architecture design`

## Log (cont.)
- 2026-09-20 scaffolder(T-001) 완료. 팀장 직접 확인: backend build+test 7개 통과, frontend build/test 4개/lint/typecheck 통과, helper test 1개 통과, e2e 실제 컨테이너(127.0.0.1:4190) GET / 200 + check-port PASS + Playwright 1 passed, down -v 정리 확인. CLAUDE.md e2e 명령 순서에서 `E2E_FIXTURE_DIR` export 누락으로 check-port.sh 실패 → 팀장이 export 방식으로 수정 후 재확인 통과.
- 2026-09-20 T-001 PASS → 커밋 `chore: project scaffold`. 사용자 지시로 작업 보류.

## Log (cont.)
- 2026-09-21 재개. T-002 시작.
- 2026-09-21 T-002 PASS (round 1) → 커밋 `feat(T-002)`. 리뷰: docs/reviews/T-002.md. 문서 정합성 → 커밋 2ab9ae2
- 2026-09-21 T-003 PASS (round 2, fix 1회: file 필드 파일명·description 타입·teams 심볼릭 링크) → 커밋 `feat(T-003)` 204ec6d
- 2026-09-21 T-005 PASS (round 2, fix 1회: SQLite 손상 복구 구현 D-015) → 커밋 `feat(T-005)`. 남은 Minor: 테스트 죽은 설정 정리·로그 assertion(후속)
- 2026-09-21 T-006 PASS (round 1) → 커밋 `feat(T-006)`. 사용자 지시로 보류.
- 2026-09-21 재개(2차). T-007 시작 + architect ADR-10 문서 요청.
- 2026-09-21 architect ADR-10 D-016 명시 완료(계약 변경 없음, 4개 문서 충돌 없음 확인) → 커밋 `docs: ADR-10에 D-016 명시`
- 2026-09-21 T-007 PASS (round 1) → 커밋 `feat(T-007)`. 리뷰: docs/reviews/T-007.md. 실측 SSE p95 2.4ms, /api/state 12.7ms, heartbeat 15.0s. 남은 Minor: SseHub live 재조회·@Async 큐 초과 정책(후속)
- 2026-09-21 T-004 round 1 NEEDS_FIX: [Major] RegistryService.rescanNow 폴러·API 동시 호출 시 revision 역행 가능 → 같은 backend 에이전트에 수정 요청 / [Major] ADR-04 측정치 미기록 → 팀장이 architecture.md에 기록(실제 1s 간격 p95 1,016~1,025ms, 오버헤드 65~82ms)
- 2026-09-21 T-004 PASS (round 2, fix 1회: rescanNow ReentrantLock + 동시성 테스트) → 커밋 `feat(T-004)`. 리뷰: docs/reviews/T-004.md. 남은 Minor: FolderPoller Javadoc 오버로드 참조·SSE 파서 테스트 유틸 중복(후속)
- 2026-09-21 T-008 PASS (round 1) → 커밋 `feat(T-008)`. 리뷰: docs/reviews/T-008.md. WriteLock·AtomicFileWriter·WriteAccessGuard(READ_ONLY 공통)는 T-009~T-011 공유. 남은 Minor: 인프라 테스트 ID 주석·PathGuard 공용 빈(후속)
- 2026-09-21 T-009 PASS (round 1) → 커밋 `feat(T-009)` aa72c8b. 리뷰: docs/reviews/T-009.md. 이슈 없음
- 2026-09-21 T-010 backend-developer 시작 직후 사용자 지시로 보류. 개발 에이전트는 세션 한도(429)로 중간 종료 → 부분 변경 미커밋 보관(검증·리뷰 미실시).
- 2026-09-21 재개(3차). T-010 부분 변경 컴파일 통과 확인 → backend-developer로 이어서 완성(AgentUpdateTest 11개 추가, 257 tests).
- 2026-09-21 T-010 round 1 NEEDS_FIX: [Major] PUT에서 워크플로우 불변 시 role 변경이 구성 파일에 반영 안 됨(19개 ID 테스트는 전부 PASS, 계약 갭) → 같은 backend 에이전트에 수정 요청(D-019)
- 2026-09-21 T-010 PASS (round 2, fix 1회: 같은 워크플로우 role 변경 반영 + description 줄바꿈 거부) → 커밋 `feat(T-010)`. 리뷰: docs/reviews/T-010.md. 남은 Minor: role-only 롤백 실패 주입 테스트·AgentController 메서드 길이·frontmatter 주석/따옴표 테스트(후속)
- 2026-09-21 T-011 PASS (round 1) → 커밋 `feat(T-011)`. 리뷰: docs/reviews/T-011.md. 문서 불일치 1건(conventions §5 삭제 204 vs api-spec 200+body) architect 요청 진행 중
- 2026-09-21 T-012 round 1 NEEDS_FIX: [Major] tasks.md Done when vs api-spec mountPath 모순(테스트가 @TempDir로 우연히 통과) → D-020, architect 문서 정정 + backend 테스트 정정·hook 예시 서식 §7.1 맞춤
- 2026-09-21 architect 완료(계약 변경 없음): tasks.md T-012 AC4 문구, conventions §5 삭제 코드 예외 + 마운트 경로 MUST에 Settings.mountPath 예외, ADR-20 추가. architect 제안(보류): `Settings.mountPath`는 UI 미사용이라 T-013 이전에 계약 변경 절차로 제거 검토 — 재개 시 팀장이 판단
- 2026-09-21 T-012 PASS (round 2, fix 1회: AC4 테스트 정정·hook 예시 §7.1 서식) → 커밋 `feat(T-012)` c5bce54. 리뷰: docs/reviews/T-012.md. 사람 확인 H-2·H-3 대기. **백엔드 API 완료**.
- 2026-09-21 계약 변경 D-021(사용자 승인): architect api-spec Settings.mountPath 제거·ADR-20 갱신·conventions §5 복원·tasks.md 정리 → contract 리뷰 PASS(docs/reviews/contract-settings-mountPath.md) → 커밋 `docs: contract change`. T-012 재작업 backend DONE(미커밋, 미검증), 리뷰는 다음 세션 프론트 시작 전(사용자 지시).

- 2026-09-22 재개(4차). T-012 재작업(D-021 반영) 팀장 검증 `./gradlew test --rerun-tasks` 277 tests/0 fail/0 skip → reviewer Round 3 PASS → 커밋 `feat(T-012)` 재작업. T-012 done. T-013 시작.

- 2026-09-22 T-013 PASS (round 1) → 커밋 `feat(T-013)`. 리뷰: docs/reviews/T-013.md. 리뷰어 라이브 재현으로 FR-016-AC2 확인. 남은 Minor: 끊김 스크린샷은 첫 연결 실패 케이스(기록으로 갈음)·StatusDot 3px 토큰 부재 → architect 토큰 추가 요청 후 T-014에서 반영

- 2026-09-22 T-014 round 1 NEEDS_FIX: [Major] 사이드바 로고/워드마크 누락(T-013 Sidebar.tsx, 기준 PNG 대비) → 같은 frontend 에이전트에 수정 요청(사이드바 구조 전반 기준 이미지 맞춤 포함)

- 2026-09-22 T-014 PASS (round 2, fix 1회: 사이드바 로고/워드마크·메뉴 inset·수집 상태 카드) → 커밋 `feat(T-014)`. 리뷰: docs/reviews/T-014.md. 남은 Minor: ui-spec AppShell 표 로고·워드마크 표기 누락 → architect 요청(D-023)

- 2026-09-22 D-023 architect ui-spec Sidebar 행 신설·CollectorStatus 카드 표기(ADR-22, 계약 변경 없음) → 커밋 3089b26
- 2026-09-22 T-015 frontend-developer DONE(미커밋, 미검증·미리뷰). 사용자 지시로 보류.

- 2026-09-23 재개(5차). T-015 팀장 검증: `npm test` 22 files/84 tests 통과, lint·typecheck·build 통과. AC/E 20개 중 19개 테스트 ID 연결 확인, FR-006-AC6은 tasks.md가 E2E-12(T-024)로만 지정 → 갭 아님(리뷰어 동의).
- 2026-09-23 T-015 round 1 NEEDS_FIX: [Major] 층 카드 헤더 버튼 라벨 2줄 줄바꿈(Button whitespace-nowrap 부재) / [Major] TopBar 우측 요소 순서 기준 PNG와 반대 / [Major] 미니맵이 워크플로우 단위 상태를 색만으로 표시(conventions 59행 MUST·FR-006-AC5 위반) + 그리드 비율 미반영 / [Major] 층 요약 문구를 컴포넌트에서 조립(conventions 29·58행 MUST 위반) / Minor 10건 → 같은 범위 frontend-developer에 수정 요청. 리뷰: docs/reviews/T-015.md
- 2026-09-23 T-015 fix round 1 완료. 팀장 검증 `npm test` 26 files/99 tests(84→99, 감소·skip 없음)·lint·typecheck·build 통과, 캐처 1440×1020 재생성. reviewer Round 2: Round 1 이슈 14건 전부 **해소**(M3·M4는 실질 해소 확인 — workflowChip 의존 제거·순수 함수 분리). 신규 NEEDS_FIX [Major] R1 줌 컨트롤 오버레이가 video-05 책상 이름·상태 글자를 가림(m4 수정의 부작용, pb-32로 해결 불가) → ui-spec 147·148행 '고정' 해석 확정이 필요해 architect 요청 / [Minor] R2 미니맵 뷰포트 높이 계산 / R3 층 카드 테두리가 waiting 우선(#FF9A4D)이나 기준 PNG·design-tokens 39행은 running-border(#2C4A3C) / R4 줌 버튼 감싼 카드 패널이 ui-spec 요소 표에 없음 / R5 책상 간격 gap-4(71px) vs 기준 122px. 공통 컴포넌트(Button·TopBar) 01·03·07 회귀 없음 확인

- 2026-09-23 T-015 fix round 2(ADR-23~26 반영) 완료. 팀장 검증 28 files/108 tests·lint·typecheck·build 통과. reviewer Round 3: R1~R4 **해소**(줌 오버레이 가림 해결·미니맵 기준 교체·테두리 공용 함수·줌 버튼 패널 제거), R5 **부분 해소** → [Major] M1 span-1 카드 책상 열 수(기준 4열 vs 구현 B 2열·C 3열). 리뷰어 PIL 실측으로 기준 규칙 확정: 책상 열은 카드 폭을 균등 분할(span-3 9열, span-1 4열), pitch는 파생값. 개발자의 '고정 gap으로 재현 불가'는 맞지만 '그래서 ui-spec 규칙이 필요하다'는 불성립 — 원인은 `flex` 항목 폭이 이름 글자 길이를 따라간 것(architect 불필요). T-014 회귀 없음 확인
- 2026-09-23 T-015 fix round 3(마지막) 완료: 책상 컨테이너를 등폭 CSS 그리드로 교체·열 수를 span에서 파생(grid-cols-9 / grid-cols-4)·`gap-x-16` 제거·`justify-items-center`. 팀장 검증 28 files/**109 tests**·lint·typecheck·build 통과, 1440×1020 재캐처. 팀장 육안 확인으로 A 9+3, B·C·D 4열 = 기준 배치. **reviewer Round 4 미실시 — 사용자 지시로 보류.** 리뷰 없이 PASS 판정할 수 없어 T-015는 in_progress 유지·미커밋 보관

- 2026-09-23 T-015 **PASS (Round 4, fix 3회)** → 커밋 `feat(T-015)` fc18749. 리뷰: docs/reviews/T-015.md(Round 1~4). M1 해소를 리뷰어 PIL 실측으로 확인(span-3 9열·span-1 4열, pitch 균일·이름 길이 의존 소멸, A 9+3 기준 일치). `justify-items-center`도 기준 PNG가 열 중앙 정렬(여백 대칭)임을 실측해 타당 판정. 그리드 전환 회귀 없음(인원 0·검색 필터·span 경계 7명·D 2명·T-014). 테스트 109개. **남은 Minor는 전부 후속 태스크로**: m5 가로 pitch(75 vs 86, 원인 `--spacing-card` 16px vs 기준 10px — 01·03 공유 토큰이라 값 변경은 architect 판단)·m1 세로 pitch·m6 13자 이름 열 번짐 → T-024 E2E-13 / m2 미니맵 줌 반응 → T-024 E2E-12 / m4 `Claude 열기` onClick → T-021
- 2026-09-23 T-016 시작(Depends T-013·T-015 모두 done). Frontend 단독 범위.

- 2026-09-23 T-016 **PASS (round 1)** → 커밋 `feat(T-016)` db4a460. 리뷰: docs/reviews/T-016.md. 테스트 109→166개. AC 13·E 2 전부 연결. Blocker·Major 0. **D-008/ADR-17 검증 핵심**: 04-4 중 03은 전원 `대기` 표시, 같은 스냅샷 객체로 02를 렌더하면 `작업 중` 유지됨을 두 테스트가 쌍으로 증명(리뷰어 확인). 계약·보안·공통 파일 회귀 없음. Minor 5건은 전부 ui-spec 문구 공백·내부 충돌 → architect A-1~A-6 요청

## Decisions
- D-030 T-016 비활성 버튼·03 프로젝트 칩·로딩 스켈레톤·19px 토큰은 모두 T-013·T-014 공통 산출물 사안이라 **T-016 재작업 대상이 아니다**. ui-spec 문구가 없거나 내부 충돌이므로 architect 확정 후 별도 처리 — 리뷰어 의견과 같음 / T-016
- D-029 T-016의 `정의 수정`·`제거` 비활성 판정에 표시 상태(displayStatus)가 아닌 **실제 `live.status`**를 쓰는 것을 승인 — ui-spec SCR-03 해당 행 데이터 출처가 `live.agents[name].status`이고, ADR-17 고정 열거에 버튼이 없으며, 표시 상태로 활성화하면 열리자마자 서버가 AGENT_BUSY로 거부하는 팝업이 열려 FR-011-AC5·FR-012-AC6 위반. 다만 04-4에서 '상태 대기 + 사유 작업 중에는…'가 모순으로 보일 수 있어 architect A-1로 문서 명시 요청 / T-016
- D-028 기준 PNG D 카드 테두리 `#4A2C2C` vs 구현 `#5A3A3A` — `design-tokens.md:45`가 `danger-border=#5A3A3A`이므로 **구현이 옳다**. 기준 PNG가 토큰 밖 색을 쓴 목업 오차로 보고 결함으로 다루지 않음(ADR-24와 같은 판단 방식) / T-015
- D-027 책상 열 수 규칙은 architect 문서 확정 **불필요**로 판단 — 기준 PNG 실측(A 폭 1106/pitch 123/9열, B·C·D 폭 344/pitch 86.3/4열)이 '카드 폭 균등 분할'을 이미 확정 기준으로 제시한다. ui-spec 한 줄 추가는 T-016 오피스 그리드와의 일관성을 위해 권장이나 수정의 선행 조건은 아니다 / T-015
- D-026 ADR-24가 이미 done인 T-014(01 대표 카드 테두리)에 영향을 주지만 **계약 변경이 아니고**(architect `CONTRACT CHANGE: no`) 결과가 달라지는 경우가 `running>0 && waiting>0` 하나뿐이라 T-014를 todo로 되돌리지 않고 T-015 수정에 포함해 회귀만 확인(tasks.md T-014에 후속 메모 기록, Round 3 리뷰어가 회귀 없음 확인) / T-014, T-015
- D-025 로비 상태 표기 `입력 대기`는 ui-spec 140행·기준 PNG와 일치하나 conventions 104행 상태 문구 목록에 없음 → 계약·FR 의미와 무관한 문서 간 표기 불일치이므로 architect에 conventions 보완 요청(코드 변경 없음) / T-015
- D-024 기준 PNG `02-workflows.png` 층 헤더에 `삭제` 버튼·비활성 사유가 없으나 구현은 표시 — ui-spec 142행·FR-006-AC12·FR-017-AC1 근거이므로 결함 아님. 기준 PNG가 FR-017 확정 이전 산출물이라는 해석 → architect에 ui-spec 주석 보완 요청 / T-015
- D-023 ui-spec §공통 AppShell 표에 로고·워드마크(`Jay Studio`) 설명 누락은 기준 PNG에 있는 요소의 문서 표기 누락(계약·FR 무관) → architect에 문서 보완 요청, 코드 변경 없음 / T-014
- D-022 StatusDot 모서리 3px 토큰 부재는 계약·요구사항 의미와 무관한 문서 표기 누락 → architect에 ui-spec 토큰 매핑 표 `--radius-dot`(3px) 추가 요청, frontend-developer가 T-014에서 theme.css·StatusDot 반영. T-013은 임의 값 금지를 지켜 6px 토큰 사용한 상태로 PASS / T-013, T-014
- D-021 api-spec `Settings.mountPath` 제거(계약 변경, 사용자 승인) — UI 미표시·filePath는 상대 경로·절대 경로는 hostPath만이라 프론트가 컨테이너 경로를 알 이유 없음, FR-014-AC4·conventions MUST와의 예외 처리 부담 제거. 사용자 보이는 동작·FR 의미 변경 없음. 프론트 착수 전이라 영향 최소 / T-012, T-022
- D-020 api-spec `Settings.mountPath`(required, 컨테이너 경로 예: /workspace)는 계약대로 유지. FR-014-AC4는 '표시' 요건이고 ui-spec SCR-07은 hostPath만 표시하므로 위반 아님. tasks.md T-012 Done when 문구('응답에 /workspace 없음')가 api-spec과 모순 → architect가 'UI 표시 값에 컨테이너 경로 미포함'으로 정정, 테스트도 그 기준으로 정정. 계약 변경 없음 / T-012, T-022
- D-019 PUT /api/agents/{name}에서 워크플로우 불변이어도 role(member↔lead) 변경을 구성 파일에 반영하고, 자기 자신이 아닌 lead가 있으면 409 LEAD_EXISTS — api-spec AgentUpdateRequest.role 필수·PUT 409 LEAD_EXISTS '다른 팀장' 문구·ui-spec 06 역할 라디오 수정 모드 활성이 근거. 구성 파일 1회 쓰기 → 정의 파일 순서, 실패 시 원본 바이트 원복(ADR-08 소속 변경 패턴 축소형, architect 변경 불필요) / T-010, T-019
- D-018 T-009 해석 승인(리뷰어 확인): rejected `FORMAT_ERROR`는 요청 name = 형식 오류 파일 stem일 때 / `LEAD_EXISTS` 메시지는 ui-spec FR-010-AC4 문구 `이미 팀장이 있습니다 (<lead>)` 재사용(code만 계약) / `ALREADY_ASSIGNED`는 어떤 워크플로우든 소속이면 거부 / lead 판정은 registry 유효 lead(`Workflow.lead()`) 기준 — 모두 api-spec·final 문구 범위 안 / T-009, T-018
- D-017 ADR-04 측정: 실제 1초 간격 실측은 '정의 파일 추가' 1종류(100회)로 충족, 나머지 5종류는 50ms 주입 간격으로 동일 poll() 경로의 오버헤드만 측정 — 지연 = 간격(≤1s)+오버헤드(≤85ms)이므로 전 종류 1.5s 안. `jaystudio.poll-interval-ms`는 테스트 주입 전용 프로퍼티(운영 yaml·env 미노출, 기본 1000). 리뷰어 동의 / T-004
- D-016 `--agent <미정의 name>` 메인 세션(agent_type이 정의 파일에 없음)은 Live(agents/lobby/undefinedSubagents)에 표시하지 않고 이벤트 목록에만(agentLabel=agent_type, workflow=null) — FR-003-AC5 로비 정의(agent_type 없는 세션)·FR-004-AC7(정의된 에이전트)·api-spec EventRow 문구 그대로. ADR-10에 명시 완료 / T-006
- D-015 architecture §9 SQLite 손상 자동 복구는 설계 문서 범위 안이므로 축소하지 않고 T-005에서 구현: 자체 `DataSource` 빈 생성 전에 quick_check → 실패 시 `events.db(-wal/-shm)`를 `events.db.corrupt-<시각>`으로 이동 후 새로 생성. 통합 테스트 1개 추가 / T-005
- D-014 `.jaystudio/teams/*.json` 심볼릭 링크도 PathGuard로 거부(읽지 않고 형식 오류) — NFR-07 "심볼릭 링크는 따라가지 않는다"는 일반 원칙 / T-003
- D-012 라이브러리 승인: `spring-boot-starter-webmvc-test`(test scope) — Spring Boot 4.1이 MockMvc 테스트 지원을 분리한 공식 스타터, Apache-2.0, 확정 스택 안 / T-002
- D-013 이후 backend 태스크 프롬프트에 공통 주의 전달: Spring Boot 4.1 = Jackson 3(`tools.jackson.databind`), MockMvc는 `org.springframework.boot.webmvc.test.autoconfigure`, autoconfigure 패키지 재구성 / T-003~T-012
- D-009 Dockerfile backend-build 스테이지는 `eclipse-temurin:21-jdk`(Gradle 8.14가 JDK 25를 실행 JVM으로 지원하지 않음) + toolchain으로 JDK 25 컴파일, 런타임은 `eclipse-temurin:25-jre` — 확정 스택(Java 25 실행) 유지, 로컬(JDK 21+toolchain)과 동일 구조 / T-001
- D-010 Spring Boot 4.1 모듈 재구성으로 `DataSourceAutoConfiguration` 패키지가 `org.springframework.boot.jdbc.autoconfigure`로 이동 — import만 조정, 의존성 추가 없음 / T-001
- D-011 CLAUDE.md e2e 명령: `export E2E_FIXTURE_DIR=...`로 통일(각 단계에 env 전달) — 팀장이 직접 수정 / T-001
- D-008 04-4 표시 중 03 캐릭터는 표시만 모두 `대기`(FR-007-E1 문구대로, 사용자 확인). 내부 상태·01·02는 그대로. architect에 ADR-17·ui-spec·T-016 수정 요청 / T-016, T-024
- D-001 Automation 기본값 CLAUDE.md 그대로: design_checkpoint on, max_fix_rounds 3
- D-002 ADR-05 승인: NFR-04 "127.0.0.1 바인딩"은 호스트 노출(compose `127.0.0.1:` ports, 개발 서버, 도우미) 기준으로 판정. 컨테이너 안 프로세스는 네임스페이스 인터페이스 바인딩 — Docker 포트 공개 구조상 불가피, 노출 결과는 동일 / T-001, T-024
- D-003 ADR-16 승인: collect-token이 있으면 읽기 전용 마운트에서도 기동(writable=false), 없고 못 만들면 기동 실패 — NFR-05 문구 그대로 / T-002
- D-004 ADR-13 승인: model 선택지 = 상속(생략)/sonnet/opus/haiku/직접 입력. FR-010-AC3이 architect에 위임 / T-019
- D-005 ADR-10 승인: 정의 없는 서브에이전트의 부모가 로비·워크플로우 밖이면 03에 표시하지 않고 01 이벤트에만 / T-006
- D-006 FR-017-AC1 "팀장·팀원 0명"은 구성 파일 원본 기준(rawMemberCount, 깨진 참조 포함) — 문구가 "구성 파일의" 이므로 / T-008
- D-007 ADR-11 승인: 도우미는 osascript를 argv로 spawn(shell:false), 문자열 삽입 값은 고정 경로와 정규식 검증 name뿐 — FR-013-AC11 취지(셸 조합 없음) 충족 / T-020

## Escalations
- E-003 [resolved] Settings.mountPath 제거 여부(architect 제안) — 사용자: 제거
- E-001 [resolved] 04-4 캐릭터 색: 문서대로(모두 대기색) vs architect 안(실제 상태 유지) — 사용자: 문서대로
- E-002 [resolved] 설계 승인(design checkpoint) — 사용자: 승인, 진행
