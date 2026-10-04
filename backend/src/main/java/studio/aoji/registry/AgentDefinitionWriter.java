package studio.aoji.registry;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import studio.aoji.files.AtomicFileWriter;

/**
 * 정의 파일(.claude/agents/&lt;name&gt;.md) 쓰기 (architecture.md §6.1, ADR-07, ADR-13, T-010/011).
 *
 * <p>신규 생성은 고정 템플릿을 새로 만든다(FR-010-AC5). 수정은 원본 텍스트를 줄 단위로 편집한다:
 * {@code name}·{@code description}·{@code tools}·{@code model} 키 줄(또는 그 키의 연속 들여쓰기
 * 블록 전체, 예 {@code description: |} 블록)만 교체·삽입·삭제하고, 그 밖의 줄(순서 포함)과 본문
 * 바이트는 그대로 둔다(FR-011-AC1). 파싱(검증)은 {@link AgentDefinitionParser}(SnakeYAML)가 맡고,
 * 이 클래스는 문자열 조작만 한다(ADR-07 "쓰기는 줄 편집").
 */
@Component
public class AgentDefinitionWriter {

    private static final Pattern TOP_LEVEL_KEY = Pattern.compile("^([A-Za-z_][A-Za-z0-9_-]*):(.*)$");
    private static final String DELIMITER = "---";

    private final AtomicFileWriter atomicFileWriter;

    public AgentDefinitionWriter(AtomicFileWriter atomicFileWriter) {
        this.atomicFileWriter = atomicFileWriter;
    }

    /** 새 정의 파일 내용(폼 필드). {@code tools == null}이면 전체 상속(줄 생략), {@code model == null}이면 지정 안 함(줄 생략). */
    public record NewAgentContent(String name, String description, List<String> tools, String model, String body) {}

    /**
     * 수정 시 덮어쓸 필드. {@code tools == null}이면 전체 상속(키 삭제), {@code model == null}이면
     * 지정 안 함이지만 {@code preserveExistingModelLine}이 true면 원본의 {@code model: inherit} 줄을
     * 그대로 둔다(ADR-13). {@code preserveExistingModelLine}은 호출자가 원본
     * {@link AgentDefinition#hasLiteralInheritModel()}과 새 model이 null인지로 미리 계산해 넘긴다.
     */
    public record FrontmatterFields(
            String name, String description, List<String> tools, String model, boolean preserveExistingModelLine) {}

    /** 새 정의 파일을 만든다(FR-010-AC5). {@code target}은 아직 존재하지 않아야 한다(호출자가 중복을 미리 검사). */
    public void createFile(Path target, NewAgentContent content) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append(DELIMITER).append('\n');
        sb.append(yamlLine("name", content.name())).append('\n');
        sb.append(yamlLine("description", content.description())).append('\n');
        if (content.tools() != null) {
            sb.append("tools: ").append(String.join(", ", content.tools())).append('\n');
        }
        if (content.model() != null) {
            sb.append(yamlLine("model", content.model())).append('\n');
        }
        sb.append(DELIMITER).append('\n');
        sb.append(content.body() == null ? "" : content.body());
        atomicFileWriter.write(target, sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 기존 정의 파일을 수정해 {@code target}에 쓴다. {@code originalContent}는 수정 전 파일의 전체
     * 원문(디코딩만 하고 줄 끝을 바꾸지 않은 문자열)이다. {@code newBody}는 폼이 보낸 본문 그대로
     * 쓴다(프론트가 GET에서 받은 본문을 그대로 되돌려보내면 바이트가 보존된다, FR-011-AC1).
     */
    public void updateFile(Path target, String originalContent, FrontmatterFields fields, String newBody)
            throws IOException {
        String newContent = buildUpdatedContent(originalContent, fields, newBody);
        atomicFileWriter.write(target, newContent.getBytes(StandardCharsets.UTF_8));
    }

    /** 테스트·호출자가 실제로 써질 문자열을 미리 확인할 때 쓴다. */
    public String buildUpdatedContent(String originalContent, FrontmatterFields fields, String newBody) {
        String[] lines = originalContent.split("\n", -1);
        int closingIndex = findClosingDelimiter(lines);

        List<String> frontmatterLines = new ArrayList<>();
        for (int i = 1; i < closingIndex; i++) {
            frontmatterLines.add(lines[i]);
        }
        boolean crlf = lines[0].endsWith("\r");

        List<String> edited = applyKeyEdits(frontmatterLines, fields, crlf);

        StringBuilder sb = new StringBuilder();
        sb.append(lines[0]).append('\n');
        for (String line : edited) {
            sb.append(line).append('\n');
        }
        sb.append(lines[closingIndex]).append('\n');
        sb.append(newBody == null ? "" : newBody);
        return sb.toString();
    }

    private static int findClosingDelimiter(String[] lines) {
        for (int i = 1; i < lines.length; i++) {
            if (DELIMITER.equals(stripCr(lines[i]))) {
                return i;
            }
        }
        throw new IllegalArgumentException("frontmatter 닫는 구분자를 찾을 수 없습니다");
    }

    /**
     * 관리 대상 키(name·description·tools·model)를 교체·삭제하고, 그 밖의 줄은 그대로 복사한다.
     * 그다음 원본에 없던 관리 대상 키(예: 원래 tools가 없던 파일에 tools를 추가)를 description
     * 다음(없으면 name 다음)에 삽입한다(ADR-07).
     */
    private static List<String> applyKeyEdits(List<String> frontmatterLines, FrontmatterFields fields, boolean crlf) {
        List<Block> blocks = splitIntoBlocks(frontmatterLines);

        List<String> output = new ArrayList<>();
        boolean nameFound = false;
        boolean descriptionFound = false;
        boolean toolsFound = false;
        boolean modelFound = false;

        for (Block block : blocks) {
            if (block.key() == null) {
                output.addAll(block.lines());
                continue;
            }
            String key = block.key();
            if (key.equalsIgnoreCase("name")) {
                nameFound = true;
                output.add(replacementLine(block, "name", fields.name()));
            } else if (key.equalsIgnoreCase("description")) {
                descriptionFound = true;
                output.add(replacementLine(block, "description", fields.description()));
            } else if (key.equalsIgnoreCase("tools")) {
                toolsFound = true;
                if (fields.tools() != null) {
                    output.add(toolsLine(block, fields.tools()));
                }
                // toolsMode inherit → 블록 전체 삭제(출력에 추가하지 않음).
            } else if (key.equalsIgnoreCase("model")) {
                modelFound = true;
                if (fields.model() != null) {
                    output.add(replacementLine(block, "model", fields.model()));
                } else if (fields.preserveExistingModelLine()) {
                    output.addAll(block.lines());
                }
                // 그 밖(모델 null이고 보존 대상 아님) → 블록 전체 삭제.
            } else {
                // 폼에 없는 필드(permissionMode·skills·hooks·disallowedTools·memory·isolation·color 등):
                // 값·순서를 그대로 보존한다(FR-011-AC1).
                output.addAll(block.lines());
            }
        }

        if (!nameFound) {
            // 유효한 정의 파일은 항상 name 키를 갖는다(호출자가 이미 검증을 통과한 파일만 넘긴다).
            throw new IllegalArgumentException("원본 frontmatter에 name 키가 없습니다");
        }

        List<String> missing = new ArrayList<>();
        if (!descriptionFound) {
            missing.add(line("description", fields.description(), crlf));
        }
        if (!toolsFound && fields.tools() != null) {
            missing.add((crlf ? "tools: " + String.join(", ", fields.tools()) + "\r" : "tools: " + String.join(", ", fields.tools())));
        }
        if (!modelFound && fields.model() != null) {
            missing.add(line("model", fields.model(), crlf));
        }

        if (!missing.isEmpty()) {
            int anchor = insertionAnchor(output);
            output.addAll(anchor, missing);
        }

        return output;
    }

    /** 새 키 삽입 위치: description 다음(없으면 name 다음, ADR-07). */
    private static int insertionAnchor(List<String> output) {
        int nameIndex = -1;
        for (int i = 0; i < output.size(); i++) {
            String stripped = stripCr(output.get(i));
            Matcher matcher = TOP_LEVEL_KEY.matcher(stripped);
            if (matcher.matches()) {
                String key = matcher.group(1);
                if (key.equalsIgnoreCase("description")) {
                    return i + 1;
                }
                if (key.equalsIgnoreCase("name")) {
                    nameIndex = i;
                }
            }
        }
        return nameIndex + 1;
    }

    private static String replacementLine(Block block, String key, String value) {
        boolean crlf = !block.lines().isEmpty() && block.lines().get(0).endsWith("\r");
        return line(key, value, crlf);
    }

    private static String toolsLine(Block block, List<String> tools) {
        boolean crlf = !block.lines().isEmpty() && block.lines().get(0).endsWith("\r");
        String content = "tools: " + String.join(", ", tools);
        return crlf ? content + "\r" : content;
    }

    private static String line(String key, String value, boolean crlf) {
        String content = key + ": " + yamlValue(value);
        return crlf ? content + "\r" : content;
    }

    private static String yamlLine(String key, String value) {
        return key + ": " + yamlValue(value);
    }

    /** 값을 그대로 써도 안전한 plain YAML 스칼라인지 확인하고, 아니면 큰따옴표로 감싼다. */
    private static String yamlValue(String value) {
        if (value == null) {
            return "";
        }
        if (needsQuoting(value)) {
            return quote(value);
        }
        return value;
    }

    private static boolean needsQuoting(String value) {
        if (value.isEmpty()) {
            return true;
        }
        if (value.contains("\n") || value.contains("\r")) {
            return true;
        }
        char first = value.charAt(0);
        if ("-?:,[]{}#&*!|>'\"%@`".indexOf(first) >= 0) {
            return true;
        }
        if (Character.isWhitespace(first) || Character.isWhitespace(value.charAt(value.length() - 1))) {
            return true;
        }
        if (value.contains(": ") || value.endsWith(":")) {
            return true;
        }
        if (value.equals("null") || value.equals("~") || value.equalsIgnoreCase("true") || value.equalsIgnoreCase("false")) {
            return true;
        }
        return false;
    }

    private static String quote(String value) {
        String escaped = value.replace("\\", "\\\\").replace("\"", "\\\"");
        return "\"" + escaped + "\"";
    }

    private static String stripCr(String line) {
        return line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
    }

    private static boolean startsWithWhitespace(String line) {
        return !line.isEmpty() && (line.charAt(0) == ' ' || line.charAt(0) == '\t');
    }

    /** 연속 줄 하나(키 줄 + 들여쓰기 연속 줄, 또는 키가 아닌 독립 줄 하나)를 나타낸다. */
    private record Block(String key, List<String> lines) {}

    private static List<Block> splitIntoBlocks(List<String> frontmatterLines) {
        List<Block> blocks = new ArrayList<>();
        int i = 0;
        int n = frontmatterLines.size();
        while (i < n) {
            String raw = frontmatterLines.get(i);
            String stripped = stripCr(raw);
            Matcher matcher = TOP_LEVEL_KEY.matcher(stripped);
            if (matcher.matches()) {
                String key = matcher.group(1);
                int j = i + 1;
                while (j < n && startsWithWhitespace(frontmatterLines.get(j))) {
                    j++;
                }
                blocks.add(new Block(key, new ArrayList<>(frontmatterLines.subList(i, j))));
                i = j;
            } else {
                blocks.add(new Block(null, List.of(raw)));
                i++;
            }
        }
        return blocks;
    }
}
