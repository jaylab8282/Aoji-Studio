package studio.jay.registry;

import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code .claude/settings.json}에 그대로 붙여 넣을 hook 설정 예시 JSON 문자열을 만든다
 * (architecture.md §7.1, FR-014-AC2, FR-003-AC8·AC9). {@link HookConfigDetector}가 판정하는
 * 형태({@code hooks.<이벤트>[].hooks[]}, {@code type == "http"}, {@code url == collectUrl})와
 * 반드시 일치해야 한다 — 이 클래스가 만든 예시를 그대로 써도 {@code hookConfigured}가 {@code true}가 된다.
 *
 * <p>출력은 Jackson 기본 프리티 프린터({@code "key" : value}, 배열·객체 다중 줄 전개)를 쓰지 않고
 * architecture.md §7.1 예시와 같은 줄 구성(이벤트 하나당 한 줄, 콜론 뒤 공백만, 들여쓰기 2칸)으로
 * 직접 문자열을 조립한다(D-020 리뷰 반영). {@code collectUrl}·{@code collectToken}은
 * {@link ObjectMapper#writeValueAsString(Object)}로 이스케이프해 JSON 문자열로 안전하게 끼워 넣는다.
 */
@Component
public class HookSettingsExampleBuilder {

    /** FR-003-AC9의 12개 이벤트, 등록 순서 그대로(architecture.md §7.1). */
    static final List<String> EVENTS = List.of(
            "SessionStart",
            "SessionEnd",
            "UserPromptSubmit",
            "Stop",
            "PreToolUse",
            "PostToolUse",
            "PostToolUseFailure",
            "PermissionRequest",
            "PermissionDenied",
            "Notification",
            "SubagentStart",
            "SubagentStop");

    private static final String HEADER_NAME = "X-JayStudio-Collect-Token";

    private final ObjectMapper objectMapper;

    public HookSettingsExampleBuilder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * {@code collectUrl}·{@code collectToken}을 넣은 hook 설정 예시를 만든다. 12개 이벤트 각각
     * {@code type: "http"}, {@code url: collectUrl}, {@code headers.X-JayStudio-Collect-Token: collectToken},
     * {@code timeout: 3}인 항목 하나씩을 등록한다(FR-003-AC8). 결과는 architecture.md §7.1과 같은 줄
     * 구성 · 들여쓰기 2칸의 JSON 문자열이다.
     */
    public String build(String collectUrl, String collectToken) {
        String urlJson = objectMapper.writeValueAsString(collectUrl);
        String tokenJson = objectMapper.writeValueAsString(collectToken);

        String hookEntry = "[{ \"hooks\": [{ \"type\": \"http\", \"url\": " + urlJson + ", \"headers\": { \""
                + HEADER_NAME + "\": " + tokenJson + " }, \"timeout\": 3 }] }]";

        StringBuilder json = new StringBuilder();
        json.append("{\n");
        json.append("  \"hooks\": {\n");
        for (int i = 0; i < EVENTS.size(); i++) {
            json.append("    \"").append(EVENTS.get(i)).append("\": ").append(hookEntry);
            json.append(i < EVENTS.size() - 1 ? ",\n" : "\n");
        }
        json.append("  }\n");
        json.append("}");
        return json.toString();
    }
}
