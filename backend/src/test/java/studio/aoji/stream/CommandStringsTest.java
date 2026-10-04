package studio.aoji.stream;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 도우미 명령 문자열 (architecture.md §7.2, FR-013-AC1·AC2).
 */
class CommandStringsTest {

    private static final String HOST_PATH = "/Users/jaybee/Desktop/JayStudio";

    @Test
    @DisplayName("[FR-013-AC1] defaultSessionCommand == 'cd \"<hostPath>\" && claude'")
    void defaultSessionCommandMatchesExactFormat() {
        assertThat(CommandStrings.defaultSessionCommand(HOST_PATH))
                .isEqualTo("cd \"/Users/jaybee/Desktop/JayStudio\" && claude");
    }

    @Test
    @DisplayName("[FR-013-AC2] leadSessionCommandTemplate == 'cd \"<hostPath>\" && claude --agent <팀장 name>'")
    void leadSessionCommandTemplateMatchesExactFormat() {
        assertThat(CommandStrings.leadSessionCommandTemplate(HOST_PATH))
                .isEqualTo("cd \"/Users/jaybee/Desktop/JayStudio\" && claude --agent <팀장 name>");
    }
}
