package studio.aoji.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import studio.aoji.skills.SkillImportRejectReason;

/**
 * 컨트롤러 예외를 {@link ApiError} 형식으로 통일한다(conventions.md §4).
 * 내부 에러 상세·스택 트레이스는 응답에 담지 않는다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /** multipart 한도(10MB) 초과 — 요청 본문을 파일로 받기 전에 서블릿이 끊는다(FR-021-AC2). */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return handleApiException(ApiException.importRejected(SkillImportRejectReason.TOO_LARGE, null, null));
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(ex.error());
    }
}
