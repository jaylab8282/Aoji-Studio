package studio.aoji.support;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * T-R4-01 {@code claude-home-basic}을 임시 폴더로 복사하고 자리표시자를 채운다
 * ({@code __AOJI_FIXTURE_HOST_PATH__} → 프로젝트 호스트 경로, {@code __AOJI_FIXTURE_CLAUDE_HOME__} → 홈 호스트 경로).
 * 실제 {@code ~/.claude}·{@code ~/.claude.json}은 쓰지 않는다.
 */
public final class ClaudeHomeFixture {

    public static final String HOME_HOST = "/home/fixture";
    public static final String ACCOUNT_MARKER = "AOJI-MARKER-EMAIL-55d0";
    public static final String ENV_MARKER = "AOJI-MARKER-ENV-91c2";
    public static final String CREDENTIAL_MARKER = "AOJI-MARKER-CRED-2e9a";

    private ClaudeHomeFixture() {}

    public static void copyBasic(Path target, String hostPath) throws IOException {
        FixtureFiles.copyInto("claude-home-basic", target);
        for (String relative : List.of(".claude.json", ".claude/plugins/installed_plugins.json")) {
            Path file = target.resolve(relative);
            String text = Files.readString(file, StandardCharsets.UTF_8)
                    .replace("__AOJI_FIXTURE_HOST_PATH__", hostPath)
                    .replace("__AOJI_FIXTURE_CLAUDE_HOME__", HOME_HOST);
            Files.writeString(file, text, StandardCharsets.UTF_8);
        }
    }
}
