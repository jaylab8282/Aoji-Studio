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
        Loaded loaded = load(bytes);
        if (loaded.error() != null) {
            return ParsedSkillFile.error(loaded.error());
        }
        Object name = loaded.map().get("name");
        if (name != null && !folderName.equals(String.valueOf(name))) {
            return ParsedSkillFile.error(SkillMessages.ERR_NAME_MISMATCH);
        }
        Object description = loaded.map().get("description");
        boolean userOnly = Boolean.TRUE.equals(loaded.map().get("disable-model-invocation"));
        return new ParsedSkillFile(description == null ? "" : String.valueOf(description), userOnly, loaded.body(), null);
    }

    /**
     * 가져오기 미리보기용: 폴더 이름과 비교하지 않고 frontmatter {@code name}·{@code description}만 읽는다.
     * 형식 오류면 둘 다 {@code null}이다.
     */
    public FrontmatterMeta readMeta(byte[] bytes) {
        Loaded loaded = load(bytes);
        if (loaded.error() != null) {
            return new FrontmatterMeta(null, null);
        }
        Object name = loaded.map().get("name");
        Object description = loaded.map().get("description");
        return new FrontmatterMeta(
                name == null ? null : String.valueOf(name), description == null ? null : String.valueOf(description));
    }

    /** frontmatter {@code name}·{@code description}(없으면 null). */
    public record FrontmatterMeta(String name, String description) {}

    private record Loaded(Map<?, ?> map, String body, String error) {
        static Loaded error(String message) {
            return new Loaded(Map.of(), "", message);
        }
    }

    private Loaded load(byte[] bytes) {
        String content;
        try {
            content = StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            return Loaded.error(SkillMessages.ERR_UTF8);
        }

        String[] lines = content.split("\n", -1);
        if (!DELIMITER.equals(lines[0].stripTrailing())) {
            return Loaded.error(SkillMessages.ERR_FRONTMATTER);
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
            return Loaded.error(SkillMessages.ERR_FRONTMATTER);
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
                return Loaded.error(SkillMessages.ERR_FRONTMATTER);
            }
        } catch (RuntimeException e) {
            return Loaded.error(SkillMessages.ERR_FRONTMATTER);
        }
        return new Loaded(map, body, null);
    }
}
