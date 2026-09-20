package studio.jay.config;

import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Set;
import studio.jay.api.ApiError;

/**
 * 브라우저 토큰 발급·검사 (architecture.md §5, ADR-01).
 * 서버 기동 시 메모리에 32바이트 난수(hex 64자)를 만들고 서버 수명 동안 유지한다.
 * 변경 메서드(POST/PUT/DELETE/PATCH)와 {@code GET /api/stream}(쿼리 {@code token})에만
 * 토큰 검사를 적용한다. 그 밖의 GET 요청은 이 필터를 통과한다(개별 엔드포인트가 필요하면
 * 직접 검사한다 — 예: {@code GET /api/helper/token}, api-spec `security: browserToken`).
 */
public class BrowserTokenFilter implements Filter {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "DELETE", "PATCH");

    private final String token;
    private final ObjectMapper objectMapper;

    public BrowserTokenFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        this.token = HexFormat.of().formatHex(bytes);
    }

    /** 서버 수명 동안 유지되는 브라우저 토큰. {@code GET /api/auth/browser-token}이 돌려준다. */
    public String token() {
        return token;
    }

    /** 상수 시간 비교로 브라우저 토큰 값을 검사한다. */
    public boolean matches(String candidate) {
        if (candidate == null) {
            return false;
        }
        return MessageDigest.isEqual(
                token.getBytes(StandardCharsets.UTF_8), candidate.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        String method = request.getMethod().toUpperCase();
        String path = request.getRequestURI();

        boolean isStreamEndpoint = "GET".equals(method) && "/api/stream".equals(path);
        boolean isMutating = MUTATING_METHODS.contains(method);

        if (isStreamEndpoint) {
            if (!matches(request.getParameter("token"))) {
                writeUnauthorized(response);
                return;
            }
        } else if (isMutating) {
            if (!matches(request.getHeader("X-JayStudio-Browser-Token"))) {
                writeUnauthorized(response);
                return;
            }
        }
        chain.doFilter(servletRequest, servletResponse);
    }

    private void writeUnauthorized(HttpServletResponse response) throws IOException {
        ApiError.writeJson(
                response,
                HttpServletResponse.SC_FORBIDDEN,
                new ApiError("UNAUTHORIZED_TOKEN", "브라우저 토큰이 올바르지 않습니다 · 새로고침 후 다시 시도하세요"),
                objectMapper);
    }
}
