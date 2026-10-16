package studio.aoji.skills;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;
import studio.aoji.files.AtomicFileWriter;

/**
 * SKILL.md 쓰기 (architecture.md §6.4.1, ADR-84 결정 1·4). 만들기는 고정 템플릿을 임시 폴더에 쓰고 폴더째
 * 이름을 바꾼다. 수정은 원본을 줄 단위로 편집해 폼 키({@code description}·{@code disable-model-invocation})
 * 줄만 바꾸고 그 밖의 frontmatter 줄과 본문 바이트는 그대로 둔다. {@code name}은 수정에서 건드리지 않는다.
 */
@Component
public class SkillWriter {

    private static final Pattern TOP_LEVEL_KEY = Pattern.compile("^([A-Za-z_][A-Za-z0-9_-]*):(.*)$");
    private static final String DELIMITER = "---";
    private static final String SKILL_FILE_NAME = "SKILL.md";
    private static final String DISABLE_KEY = "disable-model-invocation";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AtomicFileWriter atomicFileWriter;

    public SkillWriter(AtomicFileWriter atomicFileWriter) {
        this.atomicFileWriter = atomicFileWriter;
    }

    /** 새 SKILL.md 전체 내용: frontmatter {@code name}, {@code description}, (userOnly면) 사용자 전용 줄 + 본문 (FR-020-AC2). */
    public static String buildNewContent(String name, String description, boolean userOnly, String body) {
        StringBuilder sb = new StringBuilder();
        sb.append(DELIMITER).append('\n');
        sb.append("name: ").append(name).append('\n');
        sb.append("description: ").append(yamlValue(description)).append('\n');
        if (userOnly) {
            sb.append(DISABLE_KEY).append(": true\n");
        }
        sb.append(DELIMITER).append('\n');
        sb.append(body == null ? "" : body);
        return sb.toString();
    }

    /**
     * {@code skillsDir/<name>/SKILL.md}를 만든다. 임시 폴더 {@code .<name>.<난수>.tmp}에 쓴 뒤 폴더째
     * {@code ATOMIC_MOVE}한다. 실패하면 임시 폴더와 (이 호출이 만든) skills 폴더를 지우고 예외를 던진다.
     */
    public void create(Path skillsDir, String name, String content) throws IOException {
        boolean createdSkillsDir = !Files.isDirectory(skillsDir);
        Path tmpDir = skillsDir.resolve("." + name + "." + randomSuffix() + ".tmp");
        try {
            Files.createDirectories(skillsDir);
            Files.createDirectory(tmpDir);
            atomicFileWriter.write(tmpDir.resolve(SKILL_FILE_NAME), content.getBytes(StandardCharsets.UTF_8));
            moveIntoPlace(tmpDir, skillsDir.resolve(name));
        } catch (IOException | RuntimeException e) {
            deleteQuietly(tmpDir);
            if (createdSkillsDir) {
                try {
                    Files.deleteIfExists(skillsDir);
                } catch (IOException ignored) {
                    // 비어 있지 않으면 남겨 둔다 - 되돌리기는 최선 노력이다.
                }
            }
            throw e;
        }
    }

    /** 임시 폴더를 폴더째 {@code ATOMIC_MOVE}로 최종 이름에 옮긴다(만들기·가져오기 공용, 한 번에 나타난다). */
    public void moveIntoPlace(Path tmpDir, Path target) throws IOException {
        Files.move(tmpDir, target, StandardCopyOption.ATOMIC_MOVE);
    }

    /**
     * 수정된 SKILL.md 내용을 만든다. {@code original}은 줄 끝을 바꾸지 않은 원문이다. 원본 값과 같은 폼 값은
     * 줄을 그대로 둔다(블록 스칼라·따옴표·주석 보존).
     */
    public String buildUpdatedContent(
            String original, String oldDescription, boolean oldUserOnly, String description, boolean userOnly, String newBody) {
        String[] lines = original.split("\n", -1);
        int closing = -1;
        for (int i = 1; i < lines.length; i++) {
            if (DELIMITER.equals(lines[i].stripTrailing())) {
                closing = i;
                break;
            }
        }
        if (closing == -1 || !DELIMITER.equals(lines[0].stripTrailing())) {
            throw new IllegalArgumentException("frontmatter 구분자를 찾을 수 없습니다");
        }
        boolean crlf = lines[0].endsWith("\r");
        String eol = crlf ? "\r" : "";

        List<Block> blocks = splitIntoBlocks(List.of(lines).subList(1, closing));
        List<String> out = new ArrayList<>();
        boolean descriptionFound = false;
        boolean disableFound = false;
        int descriptionEnd = -1;
        int nameEnd = -1;
        for (Block block : blocks) {
            String key = block.key();
            if ("description".equals(key)) {
                descriptionFound = true;
                if (description.equals(oldDescription)) {
                    out.addAll(block.lines());
                } else {
                    out.add("description: " + yamlValue(description) + eol);
                }
                descriptionEnd = out.size();
            } else if (DISABLE_KEY.equals(key)) {
                disableFound = true;
                if (userOnly) {
                    out.addAll(oldUserOnly ? block.lines() : List.of(DISABLE_KEY + ": true" + eol));
                } else if (!oldUserOnly) {
                    // 원본이 true가 아닌 값(예 false)이면 그대로 둔다 (ADR-84 결정 1).
                    out.addAll(block.lines());
                }
                // 원본이 true이고 체크를 끄면 줄 전체를 지운다.
            } else {
                out.addAll(block.lines());
                if ("name".equals(key)) {
                    nameEnd = out.size();
                }
            }
        }
        if (!descriptionFound) {
            int at = nameEnd >= 0 ? nameEnd : 0;
            out.add(at, "description: " + yamlValue(description) + eol);
            descriptionEnd = at + 1;
        }
        if (userOnly && !disableFound) {
            out.add(descriptionEnd, DISABLE_KEY + ": true" + eol);
        }

        StringBuilder sb = new StringBuilder();
        sb.append(lines[0]).append('\n');
        for (String line : out) {
            sb.append(line).append('\n');
        }
        sb.append(lines[closing]);
        boolean closingWasLast = closing == lines.length - 1;
        String body = newBody == null ? "" : newBody;
        if (!(closingWasLast && body.isEmpty())) {
            sb.append('\n');
        }
        sb.append(body);
        return sb.toString();
    }

    /** 수정 내용을 원자적으로 쓴다. */
    public void write(Path skillFile, String content) throws IOException {
        atomicFileWriter.write(skillFile, content.getBytes(StandardCharsets.UTF_8));
    }

    private static String randomSuffix() {
        byte[] bytes = new byte[8];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    static void deleteQuietly(Path dir) {
        if (!Files.exists(dir, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            for (Path p : (Iterable<Path>) walk.sorted(Comparator.reverseOrder())::iterator) {
                Files.deleteIfExists(p);
            }
        } catch (IOException ignored) {
            // 최선 노력.
        }
    }

    /** 값을 그대로 써도 안전한 plain YAML 스칼라가 아니면 큰따옴표로 감싼다. */
    private static String yamlValue(String value) {
        return needsQuoting(value) ? quote(value) : value;
    }

    private static boolean needsQuoting(String value) {
        if (value.isEmpty()) {
            return true;
        }
        char first = value.charAt(0);
        if ("-?:,[]{}#&*!|>'\"%@`".indexOf(first) >= 0) {
            return true;
        }
        if (Character.isWhitespace(first) || Character.isWhitespace(value.charAt(value.length() - 1))) {
            return true;
        }
        if (value.contains(": ") || value.contains(" #") || value.endsWith(":")) {
            return true;
        }
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        return lower.equals("null") || lower.equals("~") || lower.equals("true") || lower.equals("false")
                || lower.equals("yes") || lower.equals("no") || lower.equals("on") || lower.equals("off")
                || value.matches("[-+]?[0-9][0-9_.,:eE+-]*");
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private record Block(String key, List<String> lines) {}

    private static List<Block> splitIntoBlocks(List<String> frontmatterLines) {
        List<Block> blocks = new ArrayList<>();
        int i = 0;
        int n = frontmatterLines.size();
        while (i < n) {
            String raw = frontmatterLines.get(i);
            String stripped = raw.endsWith("\r") ? raw.substring(0, raw.length() - 1) : raw;
            Matcher matcher = TOP_LEVEL_KEY.matcher(stripped);
            if (matcher.matches()) {
                int j = i + 1;
                while (j < n && !frontmatterLines.get(j).isEmpty()
                        && (frontmatterLines.get(j).charAt(0) == ' ' || frontmatterLines.get(j).charAt(0) == '\t')) {
                    j++;
                }
                blocks.add(new Block(matcher.group(1), new ArrayList<>(frontmatterLines.subList(i, j))));
                i = j;
            } else {
                blocks.add(new Block(null, List.of(raw)));
                i++;
            }
        }
        return blocks;
    }
}
