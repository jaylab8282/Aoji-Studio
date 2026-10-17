package studio.aoji.stream;

import java.util.regex.Pattern;

/**
 * 실행 환경별 터미널 명령 문자열 (architecture.md §7.2, ADR-77, FR-013-AC1·AC2·AC5). 표시·복사용 문자열이며
 * 실제 실행은 도우미가 인자 배열로 한다. 위험 문자 거부는 도우미(Node) 쪽 책임이다.
 * {@link SnapshotAssembler}의 {@code Config.defaultSessionCommand}와 {@code SettingsController}의
 * {@code Settings.defaultSessionCommand}·{@code leadSessionCommandTemplate}가 모두 이 클래스로 계산한다.
 */
public final class CommandStrings {

    private static final Pattern SAFE_WSL_PATH = Pattern.compile("^/[A-Za-z0-9._/-]+$");
    /** wsl 명령 꼬리: 로그인 셸로 {@code ~/.local/bin} PATH를 읽어 claude를 실행한다(ADR-95 결정 1). */
    static final String WSL_CLAUDE_TAIL = " -- bash -lic 'exec claude \"$@\"' claude";
    private static final String LEAD_SUFFIX = " --agent <팀장 name>";

    private CommandStrings() {}

    /**
     * 기본 세션 명령(FR-013-AC1). macos {@code cd "<hostPath>" && claude}, wsl
     * {@code wsl -d <distro> --cd <hostPath> -- bash -lic 'exec claude "$@"' claude}(ADR-95). wsl 경로가 안전 문자만이 아니면 {@code --cd "<hostPath>"}.
     */
    public static String defaultSessionCommand(String hostOs, String wslDistro, String hostPath) {
        if ("wsl".equals(hostOs)) {
            String path = SAFE_WSL_PATH.matcher(hostPath).matches() ? hostPath : "\"" + hostPath + "\"";
            return "wsl -d " + wslDistro + " --cd " + path + WSL_CLAUDE_TAIL;
        }
        return "cd \"" + hostPath + "\" && claude";
    }

    /**
     * 07 표시용 팀장 명령 템플릿 = 기본 세션 명령 + {@code  --agent <팀장 name>}(FR-013-AC2·AC5).
     * {@code <팀장 name>}은 치환하지 않은 표기 그대로 둔다.
     */
    public static String leadSessionCommandTemplate(String hostOs, String wslDistro, String hostPath) {
        return defaultSessionCommand(hostOs, wslDistro, hostPath) + LEAD_SUFFIX;
    }
}
