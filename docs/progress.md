# Progress
- Project: Jay_Studio
- Approved Versions: function v1, architecture v1
- Phase: build
- Current: T-006 (round 1)

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

## Decisions
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
- E-001 [resolved] 04-4 캐릭터 색: 문서대로(모두 대기색) vs architect 안(실제 상태 유지) — 사용자: 문서대로
- E-002 [resolved] 설계 승인(design checkpoint) — 사용자: 승인, 진행
