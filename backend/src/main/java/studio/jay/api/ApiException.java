package studio.jay.api;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * 컨트롤러에서 던지는 예외. {@code ApiExceptionHandler}가 {@link ApiError}로 변환한다.
 * 컨트롤러는 {@code ResponseEntity}로 에러 본문을 직접 만들지 않는다(conventions.md §3 Backend).
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final ApiError error;

    private ApiException(HttpStatus status, ApiError error) {
        super(error.message());
        this.status = status;
        this.error = error;
    }

    public static ApiException forbiddenOrigin() {
        return new ApiException(HttpStatus.FORBIDDEN, new ApiError("FORBIDDEN_ORIGIN", "허용되지 않은 출처입니다"));
    }

    public static ApiException unauthorizedToken() {
        return new ApiException(
                HttpStatus.FORBIDDEN,
                new ApiError("UNAUTHORIZED_TOKEN", "브라우저 토큰이 올바르지 않습니다 · 새로고침 후 다시 시도하세요"));
    }

    public static ApiException ioFailed(String message) {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, new ApiError("IO_FAILED", message));
    }

    /** 마운트가 읽기 전용(architecture.md §9, FR-001-E2)이면 변경 API가 공통으로 던진다. */
    public static ApiException readOnly() {
        return new ApiException(HttpStatus.FORBIDDEN, new ApiError("READ_ONLY", "쓰기 권한이 없습니다"));
    }

    /** {@code fields.<field>}에 같은 사유를 실어 보낸다(conventions.md §4, api-spec {@code ApiError}). */
    public static ApiException validation(String field, String message) {
        return new ApiException(
                HttpStatus.BAD_REQUEST, new ApiError("VALIDATION", message, Map.of(field, message), null));
    }

    public static ApiException workflowNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, new ApiError("WORKFLOW_NOT_FOUND", "워크플로우를 찾을 수 없습니다"));
    }

    /** FR-017-E1. message 문구는 api-spec에 고정되어 있다. */
    public static ApiException workflowNotEmpty() {
        return new ApiException(
                HttpStatus.CONFLICT, new ApiError("WORKFLOW_NOT_EMPTY", "팀원이 있어 삭제할 수 없습니다"));
    }

    /**
     * FR-009-AC4·FR-010-AC4 서버 판정 — 대상 워크플로우에 팀장이 이미 있는데 요청에 {@code lead}
     * 역할이 포함됨. 문구는 ui-spec.md 277행의 팀장 비활성 이유와 같은 형태를 쓴다.
     */
    public static ApiException leadExists(String currentLead) {
        return new ApiException(
                HttpStatus.CONFLICT, new ApiError("LEAD_EXISTS", "이미 팀장이 있습니다 (" + currentLead + ")"));
    }

    public static ApiException agentNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, new ApiError("AGENT_NOT_FOUND", "에이전트를 찾을 수 없습니다"));
    }

    /** FR-011-E3·FR-002-AC3 — 형식 오류 파일은 웹에서 편집할 수 없다. {@code fields.file}에 파일명. */
    public static ApiException uneditable(String file, String message) {
        return new ApiException(HttpStatus.CONFLICT, new ApiError("UNEDITABLE", message, Map.of("file", file), null));
    }

    /** FR-011-E1 — 저장 처리 시점에 정의 파일이 이미 없음. ui-spec SCR-06 문구 그대로. */
    public static ApiException fileGone() {
        return new ApiException(HttpStatus.CONFLICT, new ApiError("FILE_GONE", "저장 중 파일이 사라졌습니다"));
    }

    /** FR-011-E4 — 상태가 running/waiting. api-spec 문구 그대로. */
    public static ApiException agentBusy() {
        return new ApiException(
                HttpStatus.CONFLICT,
                new ApiError("AGENT_BUSY", "작업 중에는 수정할 수 없습니다 · 대기가 되면 다시 시도하세요"));
    }

    /** FR-011-AC4 — {@code expectedRevision} 불일치. {@code details.currentRevision}·{@code details.modifiedAt}. */
    public static ApiException revisionConflict(String currentRevision, OffsetDateTime modifiedAt) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("currentRevision", currentRevision);
        details.put("modifiedAt", modifiedAt.toString());
        return new ApiException(
                HttpStatus.CONFLICT,
                new ApiError("REVISION_CONFLICT", "파일이 다른 곳에서 수정되었습니다", null, details));
    }

    public HttpStatus status() {
        return status;
    }

    public ApiError error() {
        return error;
    }
}
