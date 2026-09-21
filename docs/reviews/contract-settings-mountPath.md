# Contract Review — Settings.mountPath 제거 (D-021) — scope: contract

## 2026-09-21 — PASS
- 검증: `git diff docs/`, `git log -p docs/conventions.md`(5bcd613 원문 대조), `grep -rn mountPath docs/api-spec.yaml docs/realtime-spec.md docs/ui-spec.md backend/src frontend/src tools`.
- 계약 정합성: api-spec Settings required·properties 17개 대응, 문서 전체 mountPath 참조 0건. `Config`(Snapshot.config)에는 원래 없음 → T-007 영향 없음.
- 사용자 보이는 동작·FR 의미: FR-014-AC4는 hostPath로 충족, ui-spec SCR-07 데이터 출처 불변. 에스컬레이션 불필요(E-003 사용자 승인).
- 영향 태스크: 코드 참조는 T-012 소관 파일(Settings·SettingsController·테스트)뿐. frontend/tools 0건. tasks.md 추적표 FR-014-AC4 → T-012·T-022와 일치.
- conventions §5 복원 문구는 D-020 이전 원문과 의미 동일(한정어·예외 제거). hostPath example은 기존 문서 관례 재사용, 민감 정보 아님.

## Issues
없음
