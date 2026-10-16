package studio.aoji.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * MCP 서버 정의 한 건 — 가린 결과만 담는다(ADR-85 결정 3). 원래 {@code env}·{@code headers} 값과 URL 쿼리 값은
 * 이 객체를 만들 때 버려지고, 메모리·응답·로그 어디에도 남지 않는다.
 *
 * @param name 정의 이름(설정 파일의 키)
 * @param transport {@code type} 값. 없으면 {@code command}가 있을 때 {@code stdio}, 그 밖은 null
 * @param command {@code command} + {@code args}를 공백으로 이은 것(FR-015 패턴 가림). stdio가 아니면 null
 * @param url URL(쿼리 값 전부 가림, 경로는 FR-015 패턴). 없으면 null
 * @param settings {@code env}·{@code headers}의 키 이름과 가린 값
 */
public record McpServerDef(String name, String transport, String command, String url, List<Setting> settings) {

    public McpServerDef {
        settings = List.copyOf(settings);
    }

    /** api-spec {@code McpServer.maskedSettings[]}. */
    public record Setting(String group, String key, String value) {}

    /**
     * 서버 정의 객체({@code {type, command, args, env, url, headers}})를 가려서 옮긴다. 읽는 키는 이 여섯 개뿐이다.
     */
    public static McpServerDef from(String name, Map<?, ?> raw, McpMasker masker) {
        String type = raw.get("type") instanceof String s && !s.isBlank() ? s.strip() : null;
        String command = null;
        if (raw.get("command") instanceof String c && !c.isBlank()) {
            StringBuilder joined = new StringBuilder(c.strip());
            if (raw.get("args") instanceof List<?> args) {
                for (Object arg : args) {
                    if (arg != null) {
                        joined.append(' ').append(arg);
                    }
                }
            }
            command = masker.maskText(joined.toString());
        }
        String url = raw.get("url") instanceof String u && !u.isBlank() ? masker.maskUrl(u.strip()) : null;
        List<Setting> settings = new ArrayList<>();
        addSettings(settings, "env", raw.get("env"), masker);
        addSettings(settings, "headers", raw.get("headers"), masker);
        String transport = type != null ? type : (command != null ? "stdio" : null);
        return new McpServerDef(name, transport, command, url, settings);
    }

    private static void addSettings(List<Setting> into, String group, Object value, McpMasker masker) {
        if (value instanceof Map<?, ?> map) {
            for (Object key : map.keySet()) {
                if (key != null) {
                    into.add(new Setting(group, String.valueOf(key), McpMasker.MASK));
                }
            }
        }
    }

    /** 평평한 모양의 최상위 값이 서버 정의인가: {@code command}·{@code url}·{@code type} 중 하나를 가진 객체(ADR-85). */
    public static boolean looksLikeServer(Object value) {
        return value instanceof Map<?, ?> map
                && (map.containsKey("command") || map.containsKey("url") || map.containsKey("type"));
    }
}
