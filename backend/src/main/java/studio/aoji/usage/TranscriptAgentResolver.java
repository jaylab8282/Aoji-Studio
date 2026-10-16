package studio.aoji.usage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import studio.aoji.events.EventRepository;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

/**
 * 대화 기록의 에이전트 판정 (FR-025-AC2, ADR-81 결정 4·5). 서브에이전트 기록은 메타
 * {@code agent-<id>.meta.json}의 {@code agentType}(메타가 없거나 못 읽으면 {@code ?} = 미확인), 메인 기록은
 * {@code agentSetting} 줄 → hook {@code SessionStart} → 미확인(NULL) 순서다. {@code agentName}은 에이전트
 * 이름이 아니라 쓰지 않는다.
 */
@Component
public class TranscriptAgentResolver {

    /** 미확인 서브에이전트의 {@code sub_agent} 값. */
    public static final String UNKNOWN_SUB_AGENT = "?";

    private static final long META_MAX_BYTES = 1L << 20;

    private final TranscriptRepository repository;
    private final EventRepository eventRepository;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;

    public TranscriptAgentResolver(
            TranscriptRepository repository,
            EventRepository eventRepository,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper) {
        this.repository = repository;
        this.eventRepository = eventRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.objectMapper = objectMapper;
    }

    /** 서브에이전트 메타의 {@code agentType}. 메타 없음·읽기 실패·키 없음·빈 값은 {@code ?}. */
    public String subAgentType(Path metaFile) {
        try {
            if (!Files.isRegularFile(metaFile, LinkOption.NOFOLLOW_LINKS) || Files.size(metaFile) > META_MAX_BYTES) {
                return UNKNOWN_SUB_AGENT;
            }
            try (InputStream in = Files.newInputStream(metaFile, LinkOption.NOFOLLOW_LINKS);
                    JsonParser parser = objectMapper.createParser(in)) {
                if (parser.nextToken() != JsonToken.START_OBJECT) {
                    return UNKNOWN_SUB_AGENT;
                }
                String agentType = null;
                while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
                    String key = parser.currentName();
                    JsonToken value = parser.nextToken();
                    if (key.equals("agentType") && value == JsonToken.VALUE_STRING) {
                        agentType = parser.getString();
                    } else {
                        parser.skipChildren();
                    }
                }
                return agentType == null || agentType.isBlank() ? UNKNOWN_SUB_AGENT : agentType;
            }
        } catch (IOException | RuntimeException e) {
            return UNKNOWN_SUB_AGENT;
        }
    }

    /** hook {@code SessionStart}에서 본 세션의 에이전트({@code ""} = 기본 세션). 수집 트랜잭션 안에서 호출한다. */
    public Optional<String> fromSessionStart(String sessionId) {
        return repository.findSessionStartAgent(sessionId);
    }

    /**
     * {@code main_agent}가 NULL인 세션을 hook {@code SessionStart}로 다시 판정한다(ADR-81 결정 5, 60초마다).
     *
     * @return 값이 정해진 세션 수
     */
    public int resolveUnknownSessions() {
        Integer resolved = eventRepository.locked(() -> transactionTemplate.execute(status -> {
            int count = 0;
            for (String sessionId : repository.findSessionsWithoutMainAgent()) {
                Optional<String> agent = repository.findSessionStartAgent(sessionId);
                if (agent.isPresent()) {
                    repository.setMainAgent(sessionId, agent.get());
                    count++;
                }
            }
            return count;
        }));
        return resolved == null ? 0 : resolved;
    }
}
