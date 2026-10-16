package studio.aoji.usage;

import org.springframework.stereotype.Component;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

/**
 * 대화 기록(JSONL) 한 줄 파서 (ADR-81 결정 4, FR-025-AC5·E2, NFR-14). Jackson 스트리밍({@link JsonParser})으로
 * 필요한 키만 읽고 {@code message.content}를 포함한 나머지는 모두 {@code skipChildren()}한다 — 본문 문자열
 * 객체를 만들지 않는다. 읽는 키: {@code type}, {@code sessionId}, {@code timestamp}, {@code cwd},
 * {@code entrypoint}, {@code isSidechain}, {@code requestId}, {@code agentSetting}, {@code message.id},
 * {@code message.model}, {@code message.usage.{input,output,cache_creation_input,cache_read_input}_tokens}.
 * 깨진 줄은 {@link TranscriptLine#ERROR}로 돌려주고 예외 메시지(줄 내용 조각이 들어 있을 수 있다)는 버린다.
 */
@Component
public class TranscriptLineParser {

    private final ObjectMapper objectMapper;

    public TranscriptLineParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** {@code buffer[0, length)}가 한 줄이다. 공백뿐인 줄은 빈 결과(오류 아님). */
    public TranscriptLine parse(byte[] buffer, int length) {
        if (isBlank(buffer, length)) {
            return new TranscriptLine(false, null, null, null, null, false, null, null);
        }
        try (JsonParser parser = objectMapper.createParser(buffer, 0, length)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                return TranscriptLine.ERROR;
            }
            return readLine(parser);
        } catch (RuntimeException e) {
            // 예외 메시지에는 줄 내용 조각이 들어갈 수 있어 어디에도 남기지 않는다(NFR-14).
            return TranscriptLine.ERROR;
        }
    }

    private static boolean isBlank(byte[] buffer, int length) {
        for (int i = 0; i < length; i++) {
            byte b = buffer[i];
            if (b != ' ' && b != '\t' && b != '\r') {
                return false;
            }
        }
        return true;
    }

    private TranscriptLine readLine(JsonParser parser) {
        String type = null;
        String sessionId = null;
        String timestamp = null;
        String cwd = null;
        String entrypoint = null;
        String requestId = null;
        String agentSetting = null;
        boolean sidechain = false;
        Message message = null;
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String key = parser.currentName();
            JsonToken value = parser.nextToken();
            switch (key) {
                case "type" -> type = string(parser, value);
                case "sessionId" -> sessionId = string(parser, value);
                case "timestamp" -> timestamp = string(parser, value);
                case "cwd" -> cwd = string(parser, value);
                case "entrypoint" -> entrypoint = string(parser, value);
                case "requestId" -> requestId = string(parser, value);
                case "agentSetting" -> agentSetting = string(parser, value);
                case "isSidechain" -> sidechain = value == JsonToken.VALUE_TRUE;
                case "message" -> {
                    if (value == JsonToken.START_OBJECT) {
                        message = readMessage(parser);
                    } else {
                        parser.skipChildren();
                    }
                }
                default -> parser.skipChildren();
            }
        }
        if (parser.currentToken() != JsonToken.END_OBJECT) {
            return TranscriptLine.ERROR;
        }
        TranscriptLine.Usage usage = null;
        if ("assistant".equals(type) && message != null && message.hasUsage) {
            usage = new TranscriptLine.Usage(
                    message.id,
                    requestId,
                    message.model,
                    message.input,
                    message.output,
                    message.cacheCreation,
                    message.cacheRead);
        }
        return new TranscriptLine(false, sessionId, timestamp, cwd, entrypoint, sidechain, agentSetting, usage);
    }

    private static String string(JsonParser parser, JsonToken token) {
        if (token == JsonToken.VALUE_STRING) {
            return parser.getString();
        }
        parser.skipChildren();
        return null;
    }

    private static final class Message {
        String id;
        String model;
        boolean hasUsage;
        long input;
        long output;
        long cacheCreation;
        long cacheRead;
    }

    private Message readMessage(JsonParser parser) {
        Message message = new Message();
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String key = parser.currentName();
            JsonToken value = parser.nextToken();
            switch (key) {
                case "id" -> message.id = string(parser, value);
                case "model" -> message.model = string(parser, value);
                case "usage" -> {
                    if (value == JsonToken.START_OBJECT) {
                        message.hasUsage = true;
                        readUsage(parser, message);
                    } else {
                        parser.skipChildren();
                    }
                }
                default -> parser.skipChildren(); // content 등 본문
            }
        }
        return message;
    }

    private static void readUsage(JsonParser parser, Message message) {
        while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
            String key = parser.currentName();
            JsonToken value = parser.nextToken();
            if (!value.isNumeric()) {
                parser.skipChildren();
                continue;
            }
            long number = Math.max(0, parser.getLongValue());
            switch (key) {
                case "input_tokens" -> message.input = number;
                case "output_tokens" -> message.output = number;
                case "cache_creation_input_tokens" -> message.cacheCreation = number;
                case "cache_read_input_tokens" -> message.cacheRead = number;
                default -> {}
            }
        }
    }
}
