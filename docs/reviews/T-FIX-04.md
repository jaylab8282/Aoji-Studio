# T-FIX-04 리뷰 — **VERDICT: PASS**

- SCOPE: task (도우미 견고성 · 설치 스크립트 안전장치 — T-020 리뷰 Minor 5건)
- 일자: 2026-09-28 · Blocker 0 · Major 0 · **Minor 3** · Suggestion 1
- 비고: 앞선 리뷰어가 두 번 연속 멈춰(각 600초 무응답, 판정 유실) **범위를 좁힌 새 리뷰어**가 판정했다. E2E·Docker·Playwright는 실행하지 않고 팀장 검증 결과(9배치 99개 PASS)를 인용했다. 팀장이 리뷰어 보고를 이 파일에 옮겨 적었다.

## 검증
`cd helper && npm test` → **38 pass / 0 fail**(1.98s) · `bash -n` ×2 OK. 우회 시도·뮤테이션은 스크래치 폴더에서 **가짜 `launchctl`·가짜 `HOME`·가짜 `JAYSTUDIO_LAUNCH_AGENTS_DIR`**로만 실행(실제 설치 0).

## 항목별 결론
1. **`--label` 보안 — 통과.** 검증이 모든 위험 동작보다 앞이다: `install.sh:88` 검사 < `PLIST_PATH` 조립(:110) < plist 생성(:114) < `mkdir -p`(:136) < `launchctl`(:142). `uninstall.sh:39` 검사 < `launchctl`(:52) < `rm -f`(:56). **우회 시도 14종 전부 차단** — `../victim`, `a/../victim`, `a b`, `-rf`, 빈 문자열, 65자, `$'a\nb'`, `héllo`/`한글`, `.hidden`, `*`, `victim.plist#`, `$(id)`, `` `id` ``, `;id` → 전부 exit 1 + **희생 파일 보존** + 가짜 launchctl 호출 0건 + LaunchAgents 폴더 미생성. 정상 label(`com.jaystudio.helper`·`com.example.helper-2`·`Helper_1`)은 계속 동작
2. **계약 불변(본문 초과) — 통과.** `jaystudio-helper.mjs:385`가 **400 `INVALID_BODY`**를 쓰고 `api-spec.yaml:469`의 `/open` 400 목록에 그 코드가 있다. api-spec 전체에 **413 없음**, 새 status·code·문구 신설 0. 변경은 `destroy()` 제거 + 잔여 데이터 흘려보내기뿐
3. **E2E-09 계약 — 통과.** `git diff helper/`에 `parseOpenRequest`·`buildCommand`·403 `UNAUTHORIZED_TOKEN`·`DRY-RUN <command>` 출력·`parseArgs` 변경 **0줄**. `helper/lib/*.mjs`·`launchd/*.plist.template` **미변경**
4. **README 설치 절차 — 통과.** 문서의 명령·기대 출력이 코드와 **문자열 일치**: uninstall `--dry-run` 3줄 / install `--dry-run` stderr **6줄**(실측 6) / 성공 출력 4줄 = `install.sh:157-164` / `/health` 본문 `{"ok":true,"version":"1"}` = `:346`+`HELPER_VERSION='1'` / Origin 없으면 403 `FORBIDDEN_ORIGIN` = `:344` / 토큰 `-rw-------`·hex 64 = `chmodSync(0o600)`+`TOKEN_BYTES` / 실패 출력 5줄·예시 로그 문구 = `lib/cors.mjs:38`. **인용 화면 문구 7개 전부 `ui-spec.md`+`lib/text.ts`에 존재 → 신설 문구 0건**. **H-3은 §0→§3→§4→§5로 끝까지 수행 가능**
5. **600 복구 — 통과.** `enforceTokenFileMode`(:194-210)가 chmod 후 **재-stat으로 확인**하고 실패 시 던져 기동을 막는다(fail-closed). stderr 한 줄은 `jaystudio-helper: 도우미 토큰 파일 권한을 600으로 고쳤습니다`뿐 — **토큰 값·경로 상세 없음**(NFR-08). 신규 생성은 `flag:'wx'`라 심링크 덮어쓰기 불가. 테스트가 `notices[0].includes(token) === false`를 단언
6. **뮤테이션 — 재현됨.** `uninstall.sh` 사본에서 label 검증 **한 줄만** 제거하니 `--label '../mutvictim'`이 exit 0으로 **LaunchAgents 폴더 밖의 `mutvictim.plist`를 실제 삭제**. 그 가드가 load-bearing이고 `install.test.mjs:174`가 지킨다

## 추적
NFR-05 → `[NFR-05] install.sh는 bootstrap 후 /health 무응답이면 등록을 해제하고 실패한다` / `… /health가 응답하면 설치 완료로 끝난다` / `기존 토큰 mode 644 → 600 복구` · 경로 보안 → `[보안] 잘못된 label → 아무것도 지우지 않고 실패`(BAD_LABELS 10종 × dry-run 유무) · FR-013-E3 → `[FR-013-E3] 본문 초과 → 400`. 전부 실제 단언 보유, sleep·실행 순서 의존·skip/only 없음, 1회 통과.

## ISSUES
- **[Minor 1] Helper** `install.sh:138-150` — 기동 확인이 **포트만** 본다. 다른 인자로 이미 돌던 도우미가 같은 포트를 점유하면 신규 서비스가 기동 실패해도 `/health`가 `"ok":true`를 돌려 `설치 완료`로 끝날 수 있다. → bootstrap 전 선점 확인 또는 실패 안내에 포트 충돌 언급. **후속 태스크로 충분**
- **[Minor 2] README §5** — H-3이 요구하는 **03 `팀장 호출 · 터미널 열기`가 단계로 없다**(02·07만). → **팀장이 리뷰 직후 직접 수정 완료**(누를 버튼 3개를 번호 목록으로 명시)
- **[Minor 3] 기록만** — `git status`에 `docs/progress.md`·`docs/tasks.md`·`screenshots/*.png` 4장도 잡힌다(팀장의 장부·E2E 실행 산출물). 코드 결함 아님

## SUGGESTION
`readBody`가 상한 초과 후 잔여 바이트를 계속 읽어 초대형 본문에서 소켓이 오래 열린다. 상한의 몇 배(예: 1MB)를 넘으면 그때 끊는 2차 상한을 둘 수 있다(계약 영향 없음).

## NEEDS CONFIRMATION
실제 `launchctl bootstrap`·실 설치·Terminal.app 자동화 권한 대화상자·실제 `~/Library/LaunchAgents` 동작은 **지시대로 수행하지 않았다** → **H-3의 사람 확인 몫**. E2E 99개·Docker·Playwright 미실행(팀장 결과 인용).

## 정리
스크래치 `jaystudio-rev.*` 0건 · `$TMPDIR/jaystudio-*` 0건 · `pgrep -fl jaystudio-helper` 없음 · `lsof -nP -iTCP:4181` LISTEN 없음 · `~/Library/LaunchAgents`에 jaystudio plist 없음 · 실제 `.jaystudio/` 미변경 · `jay_studio-jaystudio-1` 미접촉. 원본 `uninstall.sh` md5 전후 동일(`e42b7161…`).
