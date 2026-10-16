package studio.aoji.globalcfg;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import studio.aoji.config.AppProperties;

/**
 * 전역 Claude 설정 4개 항목의 연결 판정 (ADR-79 결정 3, FR-014 Output, FR-023-E2, NFR-15·NFR-07).
 * 홈이 비었으면(env {@code AOJISTUDIO_CLAUDE_HOME_HOST}) 4개 모두 {@code 연결 안 됨}이고, 아니면 항목마다
 * ① 컨테이너 경로가 있다 ② 파일 항목은 일반 파일·폴더 항목은 폴더다(링크는 따라가지 않는다)
 * ③ 대역 표지({@code {"aojistudioStandIn": true}} 파일 / {@code .aojistudio-stand-in} 파일)가 아니다.
 * {@code .credentials.json}을 포함한 {@code ~/.claude/}의 다른 파일은 다루지 않는다.
 */
@Component
public class GlobalClaudeMounts {

    static final String STAND_IN_FILE_NAME = ".aojistudio-stand-in";
    private static final String STAND_IN_KEY = "aojistudioStandIn";
    private static final long STAND_IN_MAX_BYTES = 1024;

    /** 항목 하나의 연결 상태. */
    public record ItemStatus(GlobalClaudeItem item, boolean connected) {}

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    public GlobalClaudeMounts(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
    }

    /** 컨테이너 안 마운트 루트({@code /claude-home}). */
    public Path mountRoot() {
        return Path.of(appProperties.getClaudeHomeMount());
    }

    /** 홈 경로({@code AOJISTUDIO_CLAUDE_HOME_HOST})가 설정되었다. */
    public boolean homeConfigured() {
        String host = appProperties.getClaudeHomeHost();
        return host != null && !host.isBlank();
    }

    /** 항목의 컨테이너 경로. */
    public Path path(GlobalClaudeItem item) {
        Path root = mountRoot();
        return switch (item) {
            case CLAUDE_JSON -> root.resolve(".claude.json");
            case SETTINGS -> root.resolve(".claude").resolve("settings.json");
            case PLUGINS -> root.resolve(".claude").resolve("plugins");
            case PROJECTS -> root.resolve(".claude").resolve("projects");
        };
    }

    public boolean connected(GlobalClaudeItem item) {
        if (!homeConfigured()) {
            return false;
        }
        Path target = path(item);
        if (!noLinkBetween(mountRoot(), target)) {
            return false;
        }
        BasicFileAttributes attrs = attributes(target);
        if (attrs == null || attrs.isSymbolicLink()) {
            return false;
        }
        if (item.folder()) {
            return attrs.isDirectory() && !Files.exists(target.resolve(STAND_IN_FILE_NAME), LinkOption.NOFOLLOW_LINKS);
        }
        return attrs.isRegularFile() && !isStandInFile(target, attrs.size());
    }

    /** 4개 항목, enum 순서. */
    public List<ItemStatus> statuses() {
        List<ItemStatus> result = new ArrayList<>();
        for (GlobalClaudeItem item : GlobalClaudeItem.values()) {
            result.add(new ItemStatus(item, connected(item)));
        }
        return result;
    }

    /**
     * {@code root} 아래에서 {@code target}까지 가는 경로 요소(마지막 포함)에 심볼릭 링크가 없다. {@code root}
     * 자체는 검사하지 않는다(마운트 루트).
     */
    public static boolean noLinkBetween(Path root, Path target) {
        Path relative;
        try {
            relative = root.relativize(target);
        } catch (IllegalArgumentException e) {
            return false;
        }
        Path current = root;
        for (Path part : relative) {
            current = current.resolve(part);
            if (Files.isSymbolicLink(current)) {
                return false;
            }
        }
        return true;
    }

    private boolean isStandInFile(Path file, long size) {
        if (size > STAND_IN_MAX_BYTES) {
            return false;
        }
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
            JsonNode root = objectMapper.readTree(in);
            return root != null && root.isObject() && root.path(STAND_IN_KEY).asBoolean(false);
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }

    private static BasicFileAttributes attributes(Path path) {
        try {
            return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        } catch (IOException e) {
            return null;
        }
    }
}
