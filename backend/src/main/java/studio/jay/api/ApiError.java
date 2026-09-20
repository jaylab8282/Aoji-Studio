package studio.jay.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;

/**
 * 에러 응답 본문 (api-spec.yaml {@code ApiError}, conventions.md §4).
 * {@code code}는 api-spec enum 값만 쓴다. {@code message}는 사용자에게 그대로 보여줄 한국어 문장이다.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(String code, String message, Map<String, String> fields, Map<String, Object> details) {

    public ApiError(String code, String message) {
        this(code, message, null, null);
    }

    /**
     * 서블릿 필터에서 사용한다. 필터는 DispatcherServlet 이전에 실행되므로
     * {@code ApiExceptionHandler}를 거칠 수 없어 직접 JSON을 쓴다.
     */
    public static void writeJson(HttpServletResponse response, int status, ApiError error, ObjectMapper objectMapper)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        objectMapper.writeValue(response.getWriter(), error);
    }
}
