package studio.jay.stream;

/**
 * 도우미가 여는 터미널 명령 문자열 (architecture.md §7.2, FR-013-AC1·AC2). {@code hostPath}는
 * 그대로 따옴표 안에 넣는다 — 위험 문자(`"`, `` ` ``, `$`, `\`, 개행) 거부는 도우미(Node) 쪽 책임이다
 * (architecture.md §7.2). {@link SnapshotAssembler}의 {@code Config.defaultSessionCommand}와
 * {@code SettingsController}의 {@code Settings.defaultSessionCommand}·{@code leadSessionCommandTemplate}가
 * 모두 이 클래스로 계산해 같은 형식을 보장한다.
 */
public final class CommandStrings {

    private CommandStrings() {}

    /** {@code cd "<hostPath>" && claude} (FR-013-AC1). */
    public static String defaultSessionCommand(String hostPath) {
        return "cd \"" + hostPath + "\" && claude";
    }

    /**
     * {@code cd "<hostPath>" && claude --agent <팀장 name>} — 07 표시용 템플릿이다(FR-013-AC2·AC5).
     * {@code <팀장 name>}은 실제 이름으로 치환하지 않은 표기 그대로 둔다(api-spec {@code Settings.leadSessionCommandTemplate}).
     */
    public static String leadSessionCommandTemplate(String hostPath) {
        return "cd \"" + hostPath + "\" && claude --agent <팀장 name>";
    }
}
