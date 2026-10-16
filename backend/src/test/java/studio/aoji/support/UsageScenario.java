package studio.aoji.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** T-R4-01 {@code tools/replay/scenarios/usage.jsonl} 38건을 수집 API로 그대로 POST한다. */
public final class UsageScenario {

    private UsageScenario() {}

    public static void replay(MockMvc mockMvc, Path mountRoot) throws Exception {
        String token = Files.readString(mountRoot.resolve(".aojistudio").resolve("collect-token"), StandardCharsets.UTF_8)
                .strip();
        for (String line : lines()) {
            mockMvc.perform(post("/hooks/events")
                            .contentType(MediaType.APPLICATION_JSON)
                            .header("X-AojiStudio-Collect-Token", token)
                            .content(line))
                    .andExpect(status().isNoContent());
        }
    }

    private static java.util.List<String> lines() throws IOException {
        return Files.readAllLines(Path.of("..", "tools", "replay", "scenarios", "usage.jsonl")).stream()
                .filter(l -> !l.isBlank())
                .toList();
    }
}
