package studio.aoji.live;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * api-spec {@code LobbyEntry} (02 로비, FR-003-AC5·FR-004-AC7).
 *
 * @param label session: {@code [세션 N]} / agent: name
 */
public record LobbyEntry(Kind kind, String label, Status status, String sessionId, ToolRef currentTool) {

    public enum Kind {
        /** agent_type 없는 메인 세션(FR-003-AC5). */
        @JsonProperty("session")
        SESSION,
        /** 워크플로우 밖 에이전트(FR-004-AC7). */
        @JsonProperty("agent")
        AGENT
    }
}
