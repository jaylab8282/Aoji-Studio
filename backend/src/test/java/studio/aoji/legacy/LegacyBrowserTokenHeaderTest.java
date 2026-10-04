package studio.aoji.legacy;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import studio.aoji.config.BrowserTokenFilter;
import tools.jackson.databind.ObjectMapper;

/** 옛 브라우저 토큰 헤더 거부 (ADR-52). BrowserTokenFilterTest에서 옮김. */
class LegacyBrowserTokenHeaderTest {

    private BrowserTokenFilter filter;

    @BeforeEach
    void setUp() {
        filter = new BrowserTokenFilter(new ObjectMapper());
    }

    @Test
    @DisplayName("[ADR-52] X-AojiStudio-Browser-Token 통과 / X-JayStudio-Browser-Token만 → 403 UNAUTHORIZED_TOKEN")
    void legacyBrowserTokenHeaderIsNotAccepted() throws Exception {
        MockHttpServletRequest ok = new MockHttpServletRequest("POST", "/api/workflows");
        ok.addHeader("X-AojiStudio-Browser-Token", filter.token());
        RecordingFilterChain okChain = new RecordingFilterChain();
        filter.doFilter(ok, new MockHttpServletResponse(), okChain);
        assertThat(okChain.invoked).isTrue();

        MockHttpServletRequest legacy = new MockHttpServletRequest("POST", "/api/workflows");
        legacy.addHeader("X-JayStudio-Browser-Token", filter.token());
        MockHttpServletResponse response = new MockHttpServletResponse();
        RecordingFilterChain legacyChain = new RecordingFilterChain();
        filter.doFilter(legacy, response, legacyChain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("UNAUTHORIZED_TOKEN");
        assertThat(legacyChain.invoked).isFalse();
    }

    private static final class RecordingFilterChain implements FilterChain {
        boolean invoked = false;

        @Override
        public void doFilter(jakarta.servlet.ServletRequest request, jakarta.servlet.ServletResponse response) {
            invoked = true;
        }
    }
}
