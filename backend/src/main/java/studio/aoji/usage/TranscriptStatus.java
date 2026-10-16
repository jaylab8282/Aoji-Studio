package studio.aoji.usage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 대화 기록 읽기 상태 (api-spec {@code TranscriptStatus}, realtime-spec {@code usage-changed.transcripts}).
 *
 * @param connected {@code ~/.claude/projects/} 연결 여부(FR-025-E1)
 * @param state {@code not-connected} · {@code reading}(첫 읽기 중, FR-025-AC6) · {@code ready}
 * @param skippedFiles 읽지 못한 파일 수(FR-025-E2)
 */
public record TranscriptStatus(boolean connected, String state, int readFiles, int totalFiles, int skippedFiles) {

    public static final String NOT_CONNECTED = "not-connected";
    public static final String READING = "reading";
    public static final String READY = "ready";

    /** SSE {@code usage-changed}에 싣는 모양. */
    public Map<String, Object> asMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("connected", connected);
        map.put("state", state);
        map.put("readFiles", readFiles);
        map.put("totalFiles", totalFiles);
        map.put("skippedFiles", skippedFiles);
        return map;
    }
}
