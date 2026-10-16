package studio.aoji.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;

class PriceTableTest {

    /** ADR-82 결정 2의 표 (input, output, cacheWrite, cacheRead). */
    private static final Map<String, String[]> ADR_82 = new LinkedHashMap<>();

    static {
        ADR_82.put("claude-fable-5-1", new String[] {"10", "50", "12.50", "0.25"});
        ADR_82.put("claude-fable-5", new String[] {"10", "50", "12.50", "1"});
        ADR_82.put("claude-opus-5-5", new String[] {"4", "20", "5", "0.20"});
        ADR_82.put("claude-opus-5", new String[] {"5", "25", "6.25", "0.50"});
        ADR_82.put("claude-opus-4-8", new String[] {"5", "25", "6.25", "0.50"});
        ADR_82.put("claude-opus-4-7", new String[] {"5", "25", "6.25", "0.50"});
        ADR_82.put("claude-opus-4-6", new String[] {"5", "25", "6.25", "0.50"});
        ADR_82.put("claude-opus-4-5", new String[] {"5", "25", "6.25", "0.50"});
        ADR_82.put("claude-opus-4-1", new String[] {"15", "75", "18.75", "1.50"});
        ADR_82.put("claude-opus-4", new String[] {"15", "75", "18.75", "1.50"});
        ADR_82.put("claude-sonnet-5-5", new String[] {"2", "10", "2.50", "0.10"});
        ADR_82.put("claude-sonnet-5", new String[] {"2", "10", "2.50", "0.20"});
        ADR_82.put("claude-sonnet-4-6", new String[] {"3", "15", "3.75", "0.30"});
        ADR_82.put("claude-sonnet-4-5", new String[] {"3", "15", "3.75", "0.30"});
        ADR_82.put("claude-sonnet-4", new String[] {"3", "15", "3.75", "0.30"});
        ADR_82.put("claude-haiku-5-5", new String[] {"0.10", "0.50", "0.125", "0.01"});
        ADR_82.put("claude-haiku-4-5", new String[] {"1", "5", "1.25", "0.10"});
        ADR_82.put("claude-3-5-haiku", new String[] {"0.80", "4", "1", "0.08"});
    }

    private final PriceTable table = new PriceTable(JsonMapper.builder().build());

    @Test
    @DisplayName("[FR-026-AC3] 리소스 = ADR-82 표(18개 모델·4개 단가), 모델 이름 오름차순")
    void resourceMatchesAdr82Table() {
        assertThat(table.models()).hasSize(ADR_82.size());
        assertThat(table.models()).extracting(PriceTable.ModelPrice::model).isSorted();
        for (Map.Entry<String, String[]> entry : ADR_82.entrySet()) {
            PriceTable.ModelPrice price = table.find(entry.getKey()).orElseThrow();
            String[] v = entry.getValue();
            assertThat(price.input()).as(entry.getKey()).isEqualByComparingTo(new BigDecimal(v[0]));
            assertThat(price.output()).as(entry.getKey()).isEqualByComparingTo(new BigDecimal(v[1]));
            assertThat(price.cacheWrite()).as(entry.getKey()).isEqualByComparingTo(new BigDecimal(v[2]));
            assertThat(price.cacheRead()).as(entry.getKey()).isEqualByComparingTo(new BigDecimal(v[3]));
        }
    }

    @Test
    @DisplayName("[FR-026-AC3] 출처·확인 날짜·단위가 ADR-82와 같다")
    void headerFields() {
        assertThat(table.source()).isEqualTo("Anthropic 가격표");
        assertThat(table.sourceUrl()).isEqualTo("https://platform.claude.com/docs/en/about-claude/pricing");
        assertThat(table.checkedAt()).isEqualTo("2026-10-15");
        assertThat(table.unit()).isEqualTo("USD / 1M tokens");
        assertThat(table.view().models()).isEqualTo(table.models());
    }

    private static final String FORBIDDEN = "leg" + "acy";

    @Test
    @DisplayName("[FR-026-AC3] 리소스에 옛 표기 낱말이 없다")
    void resourceHasNoOldWord() throws IOException {
        try (InputStream in = new ClassPathResource(PriceTable.RESOURCE).getInputStream()) {
            String text = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(text.toLowerCase()).doesNotContain(FORBIDDEN);
        }
    }

    @Test
    @DisplayName("[FR-026-AC6] 모델 ID 끝의 -YYYYMMDD를 떼어 찾고, 없는 모델·null은 비어 있다")
    void dateSuffixMapping() {
        assertThat(table.find("claude-sonnet-4-5-20250929")).map(PriceTable.ModelPrice::model).contains("claude-sonnet-4-5");
        assertThat(table.find("claude-opus-4-1-20250805")).map(PriceTable.ModelPrice::model).contains("claude-opus-4-1");
        assertThat(table.find("claude-sonnet-4")).map(PriceTable.ModelPrice::model).contains("claude-sonnet-4");
        assertThat(table.find("claude-future-9")).isEmpty();
        assertThat(table.find("claude-sonnet-4-5-2025")).isEmpty();
        assertThat(table.find(null)).isEmpty();
    }

    @Test
    @DisplayName("[FR-026-AC3] 단가 값은 지수 표기 없이 JSON 숫자로 직렬화된다")
    void pricesSerializeAsPlainNumbers() throws Exception {
        String json = JsonMapper.builder().build().writeValueAsString(table.view());

        assertThat(json).contains("\"cacheRead\":0.01");
        assertThat(json).doesNotContainPattern("\\d[eE][+-]?\\d");
        assertThat(List.of(json)).allMatch(j -> j.contains("\"unit\":\"USD / 1M tokens\""));
    }
}
