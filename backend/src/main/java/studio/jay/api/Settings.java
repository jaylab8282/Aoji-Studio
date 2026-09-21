package studio.jay.api;

/**
 * api-spec {@code Settings} — {@code GET /api/settings} 응답(07 화면, FR-014). {@code hostPath}만
 * 맥북 절대 경로이고, 그 밖에는 마운트 절대 경로를 담지 않는다(conventions.md §5, FR-014-AC4).
 *
 * @param hostPath 맥북 절대 경로({@code JAYSTUDIO_HOST_PATH}, FR-014-AC4)
 * @param mountPath 컨테이너 안 마운트 경로({@code JAYSTUDIO_MOUNT_PATH})
 * @param agentCount 정상 정의 파일 수. {@code agentsDirMissing}이면 null
 * @param skillCount {@code .claude/skills/*&#47;SKILL.md} 폴더 수
 * @param writable 마운트 쓰기 가능 여부
 * @param formatErrorCount 형식 오류 정의·구성 파일 수
 * @param agentsDirMissing {@code .claude/agents/} 없음
 * @param terminalApp {@code "macOS 기본 터미널"}(const)
 * @param defaultSessionCommand {@code cd "<hostPath>" && claude}(FR-013-AC1)
 * @param leadSessionCommandTemplate {@code cd "<hostPath>" && claude --agent <팀장 name>}(FR-013-AC2·AC5)
 * @param helperUrl 브라우저가 호출할 도우미 주소(ADR-12)
 * @param collectUrl {@code <publicOrigin>/hooks/events}
 * @param hookConfigured hook 설정 여부(FR-014-AC3)
 * @param hookSettingsExample 수집 토큰을 넣은 hook 설정 예시 JSON 문자열(FR-014-AC2)
 * @param teamsPath {@code ".jaystudio/teams/*.json"}(const)
 * @param trashPath {@code ".jaystudio/trash/"}(const)
 * @param retentionDays 이벤트 보존일(const 30)
 * @param allowedHttpHookUrlsNote {@code allowedHttpHookUrls} 안내 문구
 */
public record Settings(
        String hostPath,
        String mountPath,
        Integer agentCount,
        int skillCount,
        boolean writable,
        int formatErrorCount,
        boolean agentsDirMissing,
        String terminalApp,
        String defaultSessionCommand,
        String leadSessionCommandTemplate,
        String helperUrl,
        String collectUrl,
        boolean hookConfigured,
        String hookSettingsExample,
        String teamsPath,
        String trashPath,
        int retentionDays,
        String allowedHttpHookUrlsNote) {}
