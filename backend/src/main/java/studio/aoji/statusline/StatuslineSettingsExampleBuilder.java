package studio.aoji.statusline;

import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * 07 상태줄 연동 `설정 예시 복사` 조각 (FR-014-AC6, ADR-83 결정 2, architecture.md §7.4). 시안 07처럼 바깥 {@code {}}
 * 없는 {@code "statusLine": {…}} 조각이고 사용자가 설정 파일 객체 안에 붙인다. 수집 토큰은 넣지 않는다 —
 * 스크립트가 자기 옆 {@code collect-token}을 읽는다. {@value #OWN_COMMAND_PLACEHOLDER}는 사용자가 바꾸거나
 * 지우는 자리라 글자 그대로 둔다(ADR-33 예외).
 */
@Component
public class StatuslineSettingsExampleBuilder {

    /** 사용자가 쓰던 상태줄 명령으로 바꾸는 자리. */
    public static final String OWN_COMMAND_PLACEHOLDER = "<쓰던 상태줄 명령>";

    private final ObjectMapper objectMapper;

    public StatuslineSettingsExampleBuilder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * @param hostPath 호스트 기준 프로젝트 절대 경로 — 스크립트는 {@code <hostPath>/.aojistudio/statusline.mjs}에 놓인다
     * @param publicOrigin {@code http://127.0.0.1:<port>}
     */
    public String build(String hostPath, String publicOrigin) {
        String command = "node \"" + hostPath + "/.aojistudio/statusline.mjs\" --url " + publicOrigin
                + "/hooks/statusline -- " + OWN_COMMAND_PLACEHOLDER;
        return "\"statusLine\": {\n"
                + "  \"type\": \"command\",\n"
                + "  \"command\": " + objectMapper.writeValueAsString(command) + "\n"
                + "}";
    }
}
