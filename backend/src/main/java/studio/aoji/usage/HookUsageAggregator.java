package studio.aoji.usage;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import studio.aoji.live.HookPayload;
import studio.aoji.live.SummaryBuilder;

/**
 * hook 1건 → 일별 집계 칸 계산·UPSERT (ADR-80 결정 2, FR-019-AC1·FR-024-AC2). 계산은 순수 함수
 * ({@link #entriesFor})이고, 저장({@link #record})은 호출자의 수집 트랜잭션 안에서 실행된다.
 * 프롬프트 본문·도구 입력 원문은 저장하지 않는다(FR-019-AC8) — 스킬 이름·MCP 서버 이름만 남긴다.
 */
@Component
public class HookUsageAggregator {

    private static final String MCP_PREFIX = "mcp__";

    private final UsageRepository usageRepository;

    public HookUsageAggregator(UsageRepository usageRepository) {
        this.usageRepository = usageRepository;
    }

    /**
     * 집계할 칸 목록. 사용하지 않는 이벤트(FR-003-E1)나 해당 없는 이벤트는 빈 목록.
     *
     * @param skillNames 지금 있는 스킬 폴더 이름(슬래시 판정용)
     */
    public static List<HookUsageEntry> entriesFor(HookPayload payload, Set<String> skillNames) {
        String event = payload.hookEventName();
        if (event == null) {
            return List.of();
        }
        String agent = payload.agentType() == null ? "" : payload.agentType();
        List<HookUsageEntry> entries = new ArrayList<>();
        switch (event) {
            case "SessionStart", "SubagentStart" ->
                    entries.add(new HookUsageEntry(UsageKind.SESSION_START, "", agent));
            case "UserPromptSubmit" ->
                    SummaryBuilder.slashSkill(payload, skillNames)
                            .ifPresent(name -> entries.add(new HookUsageEntry(UsageKind.SKILL_SLASH, name, agent)));
            case "PreToolUse" -> {
                String tool = payload.toolName() == null ? "" : payload.toolName();
                if ("Skill".equals(tool)) {
                    String target = SummaryBuilder.skillTarget(payload);
                    if (!"-".equals(target)) {
                        entries.add(new HookUsageEntry(UsageKind.SKILL_CALL, target, agent));
                    }
                } else if (tool.startsWith(MCP_PREFIX)) {
                    String server = mcpServer(tool);
                    if (server != null) {
                        entries.add(new HookUsageEntry(UsageKind.MCP_CALL, server, agent));
                    }
                }
            }
            default -> {}
        }
        return entries;
    }

    /** {@code mcp__<서버>__<도구>} → 서버. 서버 이름의 단일 밑줄은 유지한다. 모양이 다르면 {@code null}. */
    public static String mcpServer(String toolName) {
        if (toolName == null || !toolName.startsWith(MCP_PREFIX)) {
            return null;
        }
        String rest = toolName.substring(MCP_PREFIX.length());
        int separator = rest.indexOf("__");
        if (separator <= 0) {
            return null;
        }
        return rest.substring(0, separator);
    }

    /** 집계를 UPSERT하고 바뀐 영역을 돌려준다. 수집 트랜잭션 안에서 호출한다. */
    public Set<String> record(HookPayload payload, Instant receivedAt, Set<String> skillNames) {
        Set<String> areas = new LinkedHashSet<>();
        String bucket = UsageBucket.of(receivedAt);
        for (HookUsageEntry entry : entriesFor(payload, skillNames)) {
            usageRepository.incrementHookAgg(bucket, entry, 1);
            areas.add(entry.area());
        }
        return areas;
    }
}
