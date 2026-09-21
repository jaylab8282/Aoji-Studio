package studio.jay.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 워크플로우 이름 검증 (api-spec {@code POST /api/workflows}, FR-008-AC2, architecture.md §6.2).
 */
class WorkflowNameValidatorTest {

    @Test
    @DisplayName("[FR-008-AC2] 허용 문자(한글·영문·숫자·공백·하이픈·언더스코어) → 유효")
    void allowedCharactersAreValid() {
        assertThat(WorkflowNameValidator.isValidFormat("개발 부서-1_A")).isTrue();
    }

    @Test
    @DisplayName("[FR-008-AC2] 불허 문자(슬래시) → 무효")
    void disallowedCharacterIsInvalid() {
        assertThat(WorkflowNameValidator.isValidFormat("개발/부서")).isFalse();
    }

    @Test
    @DisplayName("[FR-008-AC2] 40자 → 유효, 41자 거부")
    void lengthBoundaryIsForty() {
        String fortyChars = "a".repeat(40);
        String fortyOneChars = "a".repeat(41);

        assertThat(WorkflowNameValidator.isValidFormat(fortyChars)).isTrue();
        assertThat(WorkflowNameValidator.isValidFormat(fortyOneChars)).isFalse();
    }

    @Test
    @DisplayName("[FR-008-AC2] 빈 문자열(공백만) → 무효")
    void blankNameIsInvalid() {
        assertThat(WorkflowNameValidator.isValidFormat("")).isFalse();
    }

    @Test
    @DisplayName("[FR-008-AC2] 앞뒤 공백은 normalize에서 제거된다")
    void normalizeTrimsSurroundingWhitespace() {
        assertThat(WorkflowNameValidator.normalize("  개발부서  ")).isEqualTo("개발부서");
        assertThat(WorkflowNameValidator.normalize(null)).isEqualTo("");
    }

    @Test
    @DisplayName("[FR-008-AC2] 파일명 = <이름>.json")
    void fileNameIsNamePlusJsonSuffix() {
        assertThat(WorkflowNameValidator.fileName("개발부서")).isEqualTo("개발부서.json");
    }

    @Test
    @DisplayName("[FR-008-AC1] 중복 판정은 대소문자를 무시한다")
    void duplicateCheckIsCaseInsensitive() {
        assertThat(WorkflowNameValidator.isDuplicate("dev", List.of("Dev"))).isTrue();
        assertThat(WorkflowNameValidator.isDuplicate("qa", List.of("Dev"))).isFalse();
    }
}
