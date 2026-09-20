package studio.jay.api;

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

    public HttpStatus status() {
        return status;
    }

    public ApiError error() {
        return error;
    }
}
