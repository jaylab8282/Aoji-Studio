package studio.aoji.pricing;

import java.math.BigDecimal;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueSerializer;

/** {@link BigDecimal}을 지수 표기 없는 JSON 숫자로 쓴다(예: {@code 1E-8} 대신 {@code 0.00000001}). */
public final class PlainDecimalSerializer extends ValueSerializer<BigDecimal> {

    @Override
    public void serialize(BigDecimal value, JsonGenerator gen, SerializationContext context) throws JacksonException {
        gen.writeNumber(value.toPlainString());
    }
}
