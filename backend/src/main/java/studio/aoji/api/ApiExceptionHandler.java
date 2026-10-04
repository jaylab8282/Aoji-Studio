package studio.aoji.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 컨트롤러 예외를 {@link ApiError} 형식으로 통일한다(conventions.md §4).
 * 내부 에러 상세·스택 트레이스는 응답에 담지 않는다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(ex.error());
    }
}
