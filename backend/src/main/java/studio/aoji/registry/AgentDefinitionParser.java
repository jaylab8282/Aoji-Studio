package studio.aoji.registry;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.YAMLException;

/**
 * 정의 파일(.claude/agents/&lt;name&gt;.md) 파싱과 형식 검증 (architecture.md §6.1, FR-002-AC1~AC4).
 * frontmatter 파싱은 SnakeYAML을 쓰고, 편집(쓰기)은 이 클래스가 아니라 줄 단위 편집기(ADR-07,
 * T-010/011)가 맡는다.
 */
@Component
public class AgentDefinitionParser {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9-]+$");
    private static final String DELIMITER = "---";

    /**
     * 파일 하나를 파싱한다. 판정 순서(architecture.md §6.1):
     * UTF-8 엄격 디코딩 → frontmatter 구분자 → YAML 파싱 → name 존재 → name 형식.
     * 다른 파일과의 name 중복은 {@link #resolveDuplicates(List)}에서 처리한다.
     */
    public ParsedAgentFile parse(Path file, String relativeFilePath, String fileName) {
        String content;
        try {
            content = decodeStrict(file);
        } catch (IOException e) {
            return ParsedAgentFile.error(relativeFilePath, fileName, "UTF-8 인코딩 오류");
        }

        String[] lines = content.split("\n", -1);
        if (lines.length == 0 || !DELIMITER.equals(lines[0].stripTrailing())) {
            return ParsedAgentFile.error(relativeFilePath, fileName, "frontmatter 형식 오류");
        }
        int closingIndex = -1;
        for (int i = 1; i < lines.length; i++) {
            if (DELIMITER.equals(lines[i].stripTrailing())) {
                closingIndex = i;
                break;
            }
        }
        if (closingIndex == -1) {
            return ParsedAgentFile.error(relativeFilePath, fileName, "frontmatter 형식 오류");
        }

        String frontmatterText = String.join("\n", Arrays.copyOfRange(lines, 1, closingIndex));
        String body = closingIndex + 1 < lines.length
                ? String.join("\n", Arrays.copyOfRange(lines, closingIndex + 1, lines.length))
                : "";

        Map<String, Object> frontmatter;
        try {
            Object loaded = new Yaml().load(frontmatterText);
            if (loaded == null) {
                frontmatter = Map.of();
            } else if (loaded instanceof Map<?, ?> rawMap) {
                frontmatter = toStringKeyedMap(rawMap);
            } else {
                return ParsedAgentFile.error(relativeFilePath, fileName, "frontmatter 형식 오류");
            }
        } catch (YAMLException e) {
            return ParsedAgentFile.error(relativeFilePath, fileName, "frontmatter 형식 오류");
        }

        Object nameValue = frontmatter.get("name");
        if (!(nameValue instanceof String name) || name.isBlank()) {
            return ParsedAgentFile.error(relativeFilePath, fileName, "name 누락");
        }
        if (!NAME_PATTERN.matcher(name).matches()) {
            return ParsedAgentFile.error(relativeFilePath, fileName, "name 형식 위반");
        }

        String description = frontmatter.get("description") instanceof String s ? s : "";

        boolean hasModelKey = frontmatter.containsKey("model");
        String model = frontmatter.get("model") instanceof String s ? s : null;
        boolean hasLiteralInheritModel = hasModelKey && "inherit".equals(model);

        List<String> tools = normalizeTools(frontmatter.get("tools"));

        AgentDefinition definition =
                new AgentDefinition(name, description, tools, model, hasLiteralInheritModel, body);
        return ParsedAgentFile.ok(relativeFilePath, fileName, definition);
    }

    /**
     * 같은 name을 쓰는 파일이 둘 이상이면 관련 파일 모두 형식 오류로 바꾼다
     * (architecture.md §6.1 "다른 파일과 같은 name → 두 파일 모두", FR-002-AC1·AC2).
     * 이미 형식 오류인 파일은 그대로 둔다.
     */
    public static List<ParsedAgentFile> resolveDuplicates(List<ParsedAgentFile> parsedFiles) {
        Map<String, List<ParsedAgentFile>> validByName = parsedFiles.stream()
                .filter(ParsedAgentFile::isValid)
                .collect(Collectors.groupingBy(
                        p -> p.definition().name(), LinkedHashMap::new, Collectors.toList()));

        List<ParsedAgentFile> result = new ArrayList<>(parsedFiles.size());
        for (ParsedAgentFile parsed : parsedFiles) {
            if (!parsed.isValid()) {
                result.add(parsed);
                continue;
            }
            List<ParsedAgentFile> group = validByName.get(parsed.definition().name());
            if (group.size() <= 1) {
                result.add(parsed);
                continue;
            }
            String others = group.stream()
                    .map(ParsedAgentFile::relativeFilePath)
                    .filter(path -> !path.equals(parsed.relativeFilePath()))
                    .sorted()
                    .collect(Collectors.joining(", "));
            result.add(ParsedAgentFile.error(
                    parsed.relativeFilePath(), parsed.fileName(), "name 중복 (" + others + ")"));
        }
        return result;
    }

    private static List<String> normalizeTools(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof String s) {
            return Arrays.stream(s.split(","))
                    .map(String::trim)
                    .filter(v -> !v.isEmpty())
                    .toList();
        }
        if (raw instanceof List<?> list) {
            return list.stream()
                    .map(String::valueOf)
                    .map(String::trim)
                    .filter(v -> !v.isEmpty())
                    .toList();
        }
        return null;
    }

    private static String decodeStrict(Path file) throws IOException {
        byte[] bytes = Files.readAllBytes(file);
        CharsetDecoder decoder = StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try {
            return decoder.decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            throw new IOException("UTF-8 디코딩 실패", e);
        }
    }

    private static Map<String, Object> toStringKeyedMap(Map<?, ?> rawMap) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            if (entry.getKey() != null) {
                result.put(String.valueOf(entry.getKey()), entry.getValue());
            }
        }
        return result;
    }
}
