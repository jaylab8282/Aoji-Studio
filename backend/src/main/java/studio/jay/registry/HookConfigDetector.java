package studio.jay.registry;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code .claude/settings.json}에 수집 주소를 쓰는 {@code http} hook이 있는지 판정한다
 * (architecture.md §7.1, FR-014-AC3). 서버는 이 파일을 읽기만 한다(conventions.md §6).
 */
@Component
public class HookConfigDetector {

    private final ObjectMapper objectMapper;

    public HookConfigDetector(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * {@code settingsJsonFile}이 없거나 JSON 파싱에 실패하면 false.
     * {@code hooks.<이벤트>[].hooks[]} 중 {@code type == "http"}이고 {@code url == collectUrl}인
     * 항목이 하나 이상이면 true.
     */
    public boolean isConfigured(Path settingsJsonFile, String collectUrl) {
        if (!Files.isRegularFile(settingsJsonFile)) {
            return false;
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(Files.readString(settingsJsonFile, StandardCharsets.UTF_8));
        } catch (JacksonException | IOException e) {
            return false;
        }

        if (root == null || !root.isObject()) {
            return false;
        }
        JsonNode hooks = root.get("hooks");
        if (hooks == null || !hooks.isObject()) {
            return false;
        }

        for (JsonNode eventEntries : hooks) {
            if (!eventEntries.isArray()) {
                continue;
            }
            for (JsonNode matcherGroup : eventEntries) {
                JsonNode hookList = matcherGroup.get("hooks");
                if (hookList == null || !hookList.isArray()) {
                    continue;
                }
                for (JsonNode hook : hookList) {
                    JsonNode type = hook.get("type");
                    JsonNode url = hook.get("url");
                    if (type != null
                            && type.isString()
                            && "http".equals(type.asString())
                            && url != null
                            && url.isString()
                            && collectUrl.equals(url.asString())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
