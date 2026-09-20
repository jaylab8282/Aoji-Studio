# Progress
- Project: Jay_Studio
- Approved Versions: function v1, architecture v1
- Phase: scaffold
- Current: architect ADR-17 수정 + scaffolder(T-001) 병렬 실행 중

## Log
- 2026-09-20 architect 완료: 설계 문서 6개(architecture, conventions, api-spec.yaml, realtime-spec, ui-spec, tasks) · 태스크 24개. 팀장 검증: final의 AC/E 152개 전부 tasks.md에 연결 확인(누락 0, 초과 0), ui-spec 화면 01~07·04-1~7 전부, architecture §8 통합 검증 전략 있음, 스택·인프라 final 그대로.
- 2026-09-20 시작. final 문서 두 개 Status: Approved / v1 확인. CLAUDE.md Automation: design_checkpoint on, max_fix_rounds 3.

## Decisions
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
