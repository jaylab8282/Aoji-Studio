package studio.aoji.registry;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** {@code model} frontmatter 값 검증 (ADR-13, FR-010-AC3). */
class ModelValidatorTest {

    @Test
    void nullIsAllowedAsInherit() {
        // [FR-010-AC3] null(상속) 허용
        assertThat(ModelValidator.isValid(null)).isTrue();
    }

    @Test
    void aliasesAreAllowed() {
        // [FR-010-AC3] sonnet·opus·haiku 허용
        assertThat(ModelValidator.isValid("sonnet")).isTrue();
        assertThat(ModelValidator.isValid("opus")).isTrue();
        assertThat(ModelValidator.isValid("haiku")).isTrue();
    }

    @Test
    void fullModelIdIsAllowed() {
        // [FR-010-AC3] claude-opus-5 허용
        assertThat(ModelValidator.isValid("claude-opus-5")).isTrue();
    }

    @Test
    void invalidValueIsRejected() {
        // [FR-010-AC3] 'GPT 4' 거부(대문자·공백)
        assertThat(ModelValidator.isValid("GPT 4")).isFalse();
    }

    @Test
    void tooLongValueIsRejected() {
        // 근거: ADR-13 `^[a-z0-9.-]{1,64}$` 65자 초과 거부. ID 미지정 — 경계값 보강.
        assertThat(ModelValidator.isValid("a".repeat(65))).isFalse();
    }
}
