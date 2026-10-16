package studio.aoji.pricing;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.annotation.JsonSerialize;

/**
 * 앱 내장 단가표 (FR-026-AC1·AC3·AC4·AC6, ADR-82). 리소스 {@code pricing/claude-prices.json}을 기동 때 한 번
 * 읽고 바꾸지 않는다. 파일로 저장·편집하는 경로가 없고 {@code GET /api/pricing}만 값을 준다. 읽을 수 없거나
 * 형태가 틀리면 기동을 실패시킨다(단가 없이 조용히 시작하지 않는다).
 */
@Component
public class PriceTable {

    static final String RESOURCE = "pricing/claude-prices.json";
    private static final Pattern DATE_SUFFIX = Pattern.compile("-\\d{8}$");

    /** 모델 하나의 단가(USD / 1M 토큰). api-spec {@code PriceTable.models[]}. */
    public record ModelPrice(
            String model,
            @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal input,
            @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal output,
            @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal cacheWrite,
            @JsonSerialize(using = PlainDecimalSerializer.class) BigDecimal cacheRead) {}

    private final String source;
    private final String sourceUrl;
    private final String checkedAt;
    private final String unit;
    private final List<ModelPrice> models;
    private final Map<String, ModelPrice> byModel = new HashMap<>();

    public PriceTable(ObjectMapper objectMapper) {
        JsonNode root;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            root = objectMapper.readTree(in);
        } catch (IOException | RuntimeException e) {
            throw new IllegalStateException("단가표 리소스를 읽을 수 없습니다: " + RESOURCE);
        }
        source = text(root, "source");
        sourceUrl = text(root, "sourceUrl");
        checkedAt = text(root, "checkedAt");
        unit = text(root, "unit");
        JsonNode array = root.get("models");
        if (array == null || !array.isArray() || array.isEmpty()) {
            throw new IllegalStateException("단가표에 models가 없습니다: " + RESOURCE);
        }
        List<ModelPrice> parsed = new ArrayList<>();
        for (JsonNode node : array) {
            ModelPrice price = new ModelPrice(
                    text(node, "model"),
                    number(node, "input"),
                    number(node, "output"),
                    number(node, "cacheWrite"),
                    number(node, "cacheRead"));
            if (byModel.putIfAbsent(price.model(), price) != null) {
                throw new IllegalStateException("단가표에 같은 모델이 두 번 있습니다: " + price.model());
            }
            parsed.add(price);
        }
        parsed.sort(Comparator.comparing(ModelPrice::model));
        models = List.copyOf(parsed);
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw new IllegalStateException("단가표 값이 틀립니다: " + key);
        }
        return value.asString();
    }

    private static BigDecimal number(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || !value.isNumber() || value.decimalValue().signum() < 0) {
            throw new IllegalStateException("단가표 값이 틀립니다: " + key);
        }
        return value.decimalValue();
    }

    public String source() {
        return source;
    }

    public String sourceUrl() {
        return sourceUrl;
    }

    public String checkedAt() {
        return checkedAt;
    }

    public String unit() {
        return unit;
    }

    /** 모델 이름 오름차순. */
    public List<ModelPrice> models() {
        return models;
    }

    /**
     * 기록의 {@code message.model}에 대응하는 단가. 그대로 찾고, 없으면 끝의 {@code -YYYYMMDD}를 뗀 이름으로
     * 찾는다. 그래도 없으면 비어 있다({@code 단가 없음}, FR-026-AC6).
     */
    public Optional<ModelPrice> find(String model) {
        if (model == null) {
            return Optional.empty();
        }
        ModelPrice exact = byModel.get(model);
        if (exact != null) {
            return Optional.of(exact);
        }
        String base = DATE_SUFFIX.matcher(model).replaceFirst("");
        return Optional.ofNullable(byModel.get(base));
    }

    /** {@code GET /api/pricing} 응답. */
    public View view() {
        return new View(source, sourceUrl, checkedAt, unit, models);
    }

    /** api-spec {@code PriceTable}. */
    public record View(String source, String sourceUrl, String checkedAt, String unit, List<ModelPrice> models) {}
}
