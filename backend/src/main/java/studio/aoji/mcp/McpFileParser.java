package studio.aoji.mcp;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

/**
 * MCP 정의 파일({@code .mcp.json}, 플러그인 {@code .mcp.json}·{@code plugin.json}) 읽기 (ADR-85 결정 1, T-FIX-15).
 * 스트리밍으로 읽고 서버 정의는 읽는 즉시 가린 {@link McpServerDef}로 바꾼다. 파일 링크는 따라가지 않는다(NFR-07).
 */
@Component
public class McpFileParser {

    /** 읽는 모양. */
    public enum Shape {
        /** 최상위 {@code mcpServers}만(프로젝트 {@code .mcp.json}, {@code plugin.json}). */
        WRAPPED_ONLY,
        /** 감싼 모양 + 평평한 모양(플러그인 {@code .mcp.json}, T-FIX-15). */
        WRAPPED_OR_FLAT
    }

    /**
     * @param present 일반 파일이 있었다
     * @param parseError JSON 파싱 실패(이때 {@code servers}는 비어 있다)
     * @param line 파싱 실패 줄 번호(알 수 없으면 null)
     */
    public record Result(boolean present, List<McpServerDef> servers, boolean parseError, Integer line) {

        public Result {
            servers = List.copyOf(servers);
        }

        static Result absent() {
            return new Result(false, List.of(), false, null);
        }

        static Result ok(List<McpServerDef> servers) {
            return new Result(true, servers, false, null);
        }

        static Result error(Integer line) {
            return new Result(true, List.of(), true, line);
        }
    }

    private final ObjectMapper objectMapper;
    private final McpMasker masker;

    public McpFileParser(ObjectMapper objectMapper, McpMasker masker) {
        this.objectMapper = objectMapper;
        this.masker = masker;
    }

    public Result read(Path file, Shape shape) {
        try (InputStream in = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS);
                JsonParser parser = objectMapper.createParser(in)) {
            return parse(parser, shape);
        } catch (NoSuchFileException e) {
            return Result.absent();
        } catch (JacksonException e) {
            return Result.error(e.getLocation() == null ? null : e.getLocation().getLineNr());
        } catch (IOException e) {
            // 링크·폴더·읽기 불가는 없는 파일로 본다(링크 대상은 따라가지 않는다).
            return Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) ? Result.error(null) : Result.absent();
        }
    }

    private Result parse(JsonParser parser, Shape shape) {
        JsonToken first = parser.nextToken();
        if (first != JsonToken.START_OBJECT) {
            return Result.error(parser.currentLocation().getLineNr());
        }
        List<McpServerDef> wrapped = new ArrayList<>();
        List<McpServerDef> flat = new ArrayList<>();
        boolean sawWrapped = false;
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String key = parser.currentName();
            JsonToken value = parser.nextToken();
            if (value != JsonToken.START_OBJECT) {
                parser.skipChildren();
                continue;
            }
            if (key.equals("mcpServers")) {
                sawWrapped = true;
                readServerMap(parser, wrapped);
            } else if (shape == Shape.WRAPPED_OR_FLAT) {
                Map<?, ?> raw = parser.readValueAs(Map.class);
                if (McpServerDef.looksLikeServer(raw)) {
                    flat.add(McpServerDef.from(key, raw, masker));
                }
            } else {
                parser.skipChildren();
            }
        }
        if (parser.currentToken() != JsonToken.END_OBJECT) {
            return Result.error(parser.currentLocation().getLineNr());
        }
        return Result.ok(sawWrapped ? wrapped : flat);
    }

    /** 파서는 {@code mcpServers} 객체의 {@code START_OBJECT}에 있어야 한다. 객체 값만 서버로 읽고 {@code END_OBJECT}에서 멈춘다. */
    public void readServerMap(JsonParser parser, List<McpServerDef> into) {
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String name = parser.currentName();
            if (parser.nextToken() == JsonToken.START_OBJECT) {
                Map<?, ?> raw = parser.readValueAs(Map.class);
                into.add(McpServerDef.from(name, raw, masker));
            } else {
                parser.skipChildren();
            }
        }
    }
}
