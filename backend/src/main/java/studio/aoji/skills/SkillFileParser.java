package studio.aoji.skills;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * SKILL.md 파싱 (architecture.md §6.4.1): UTF-8 엄격 → 첫 줄 {@code ---}와 닫는 {@code ---} → SnakeYAML.
 * {@code name}이 있고 폴더 이름과 다르면 형식 오류, 없으면 오류가 아니다. 본문은 줄 끝을 바꾸지 않은 원문이다.
 */
@Component
public class SkillFileParser {

    private static final String DELIMITER = "---";

    public ParsedSkillFile parse(byte[] bytes, String folderName) {
        String content;
        try {
            content = StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            return ParsedSkillFile.error(SkillMessages.ERR_UTF8);
        }

        String[] lines = content.split("\n", -1);
        if (!DELIMITER.equals(lines[0].stripTrailing())) {
            return ParsedSkillFile.error(SkillMessages.ERR_FRONTMATTER);
        }
        int closing = -1;
        int bodyStart = 0;
        int offset = lines[0].length() + 1;
        for (int i = 1; i < lines.length; i++) {
            if (DELIMITER.equals(lines[i].stripTrailing())) {
                closing = i;
                bodyStart = offset + lines[i].length() + 1;
                break;
            }
            offset += lines[i].length() + 1;
        }
        if (closing == -1) {
            return ParsedSkillFile.error(SkillMessages.ERR_FRONTMATTER);
        }
        String yamlText = String.join("\n", java.util.Arrays.copyOfRange(lines, 1, closing));
        String body = bodyStart >= content.length() ? "" : content.substring(bodyStart);

        Map<?, ?> map;
        try {
            Object loaded = new Yaml(new SafeConstructor(new LoaderOptions())).load(yamlText);
            if (loaded == null) {
                map = Map.of();
            } else if (loaded instanceof Map<?, ?> m) {
                map = m;
            } else {
                return ParsedSkillFile.error(SkillMessages.ERR_FRONTMATTER);
            }
        } catch (RuntimeException e) {
            return ParsedSkillFile.error(SkillMessages.ERR_FRONTMATTER);
        }

        Object name = map.get("name");
        if (name != null && !folderName.equals(String.valueOf(name))) {
            return ParsedSkillFile.error(SkillMessages.ERR_NAME_MISMATCH);
        }
        Object description = map.get("description");
        boolean userOnly = Boolean.TRUE.equals(map.get("disable-model-invocation"));
        return new ParsedSkillFile(description == null ? "" : String.valueOf(description), userOnly, body, null);
    }
}
