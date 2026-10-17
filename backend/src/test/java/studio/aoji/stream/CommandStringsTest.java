package studio.aoji.stream;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 도우미 명령 문자열 (architecture.md §7.2, FR-013-AC1·AC2).
 */
class CommandStringsTest {

    private static final String HOST_PATH = "/Users/jaybee/Desktop/AojiStudio";

    @Test
    @DisplayName("[FR-013-AC1] defaultSessionCommand == 'cd \"<hostPath>\" && claude'")
    void defaultSessionCommandMatchesExactFormat() {
        assertThat(CommandStrings.defaultSessionCommand("macos", null, HOST_PATH))
                .isEqualTo("cd \"/Users/jaybee/Desktop/AojiStudio\" && claude");
    }

    @Test
    @DisplayName("[FR-013-AC2] leadSessionCommandTemplate == 'cd \"<hostPath>\" && claude --agent <팀장 name>'")
    void leadSessionCommandTemplateMatchesExactFormat() {
        assertThat(CommandStrings.leadSessionCommandTemplate("macos", null, HOST_PATH))
                .isEqualTo("cd \"/Users/jaybee/Desktop/AojiStudio\" && claude --agent <팀장 name>");
    }

    @Test
    @DisplayName("[FR-013-AC1] wsl -> 'wsl -d <배포판> --cd <경로> -- bash -lic …' claude")
    void wslDefaultSessionCommand() {
        assertThat(CommandStrings.defaultSessionCommand("wsl", "Ubuntu-24.04", "/home/jaybee/AojiStudio"))
                .isEqualTo("wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- bash -lic 'exec claude \"$@\"' claude");
    }

    @Test
    @DisplayName("[FR-013-AC1] wsl 경로에 공백이 있으면 --cd 경로에 따옴표")
    void wslPathWithSpaceIsQuoted() {
        assertThat(CommandStrings.defaultSessionCommand("wsl", "Ubuntu-24.04", "/home/jaybee/Aoji Studio"))
                .isEqualTo("wsl -d Ubuntu-24.04 --cd \"/home/jaybee/Aoji Studio\" -- bash -lic 'exec claude \"$@\"' claude");
    }

    @Test
    @DisplayName("[FR-013-AC2] 팀장 템플릿 = 기본 세션 명령 + ' --agent <팀장 name>' (macos·wsl)")
    void leadTemplateIsDefaultPlusAgentSuffix() {
        assertThat(CommandStrings.leadSessionCommandTemplate("wsl", "Ubuntu-24.04", "/home/jaybee/AojiStudio"))
                .isEqualTo(CommandStrings.defaultSessionCommand("wsl", "Ubuntu-24.04", "/home/jaybee/AojiStudio")
                        + " --agent <팀장 name>")
                .isEqualTo("wsl -d Ubuntu-24.04 --cd /home/jaybee/AojiStudio -- bash -lic 'exec claude \"$@\"' claude --agent <팀장 name>");
        assertThat(CommandStrings.leadSessionCommandTemplate("macos", null, HOST_PATH))
                .isEqualTo(CommandStrings.defaultSessionCommand("macos", null, HOST_PATH) + " --agent <팀장 name>");
    }
}
