package studio.aoji.usage;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import studio.aoji.pricing.CostCalculator;
import studio.aoji.pricing.PriceTable;

/**
 * 10 토큰 사용량·추정 금액 (FR-025-AC2~AC4·AC7, FR-026-AC1·AC6, ADR-81·ADR-82). 읽기 전용이다. 대화 기록 집계
 * ({@code usage_token_agg})와 세션 정보({@code usage_session})를 기간 안에서 합쳐 날짜·모델·세션·에이전트로
 * 나눈다. 네 나눔의 합은 모두 합계와 같다(같은 행을 한 번씩만 센다). 원본 파일이 지워져도 집계는 남는다.
 */
@Service
public class CostReportService {

    private static final String UNKNOWN_AGENT_KEY = "\u0000unknown";
    private static final String MAIN_AGENT_KEY = "\u0000main";

    private final TranscriptRepository repository;
    private final TranscriptIngestService ingestService;
    private final PriceTable priceTable;
    private final CostCalculator calculator;
    private final Clock clock;

    public CostReportService(
            TranscriptRepository repository,
            TranscriptIngestService ingestService,
            PriceTable priceTable,
            CostCalculator calculator,
            Clock clock) {
        this.repository = repository;
        this.ingestService = ingestService;
        this.priceTable = priceTable;
        this.calculator = calculator;
        this.clock = clock;
    }

    /** 모델별 토큰 4값 누적. */
    private static final class Tokens {
        long input;
        long output;
        long cacheCreation;
        long cacheRead;

        void add(TranscriptRepository.AggRow row) {
            input += row.input();
            output += row.output();
            cacheCreation += row.cacheCreation();
            cacheRead += row.cacheRead();
        }

        CostReport.TokenSums sums() {
            return CostReport.TokenSums.of(input, output, cacheCreation, cacheRead);
        }
    }

    /** 한 나눔 행의 모델별 토큰. */
    private static final class Group {
        final Map<String, Tokens> byModel = new TreeMap<>();
        String project;
        String startedAt;
        String entrypoint;

        void add(TranscriptRepository.AggRow row) {
            byModel.computeIfAbsent(row.model(), k -> new Tokens()).add(row);
        }

        CostReport.TokenSums sums() {
            Tokens all = new Tokens();
            for (Tokens tokens : byModel.values()) {
                all.input += tokens.input;
                all.output += tokens.output;
                all.cacheCreation += tokens.cacheCreation;
                all.cacheRead += tokens.cacheRead;
            }
            return all.sums();
        }
    }

    public CostReport report(PeriodQuery query) {
        List<TranscriptRepository.AggRow> rows = repository.findAgg(query.fromBucket(), query.toBucket());

        Group total = new Group();
        Map<LocalDate, Group> byDate = new TreeMap<>();
        Map<String, Group> byModel = new LinkedHashMap<>();
        Map<String, Group> bySession = new LinkedHashMap<>();
        Map<String, Group> byAgent = new LinkedHashMap<>();
        Map<String, AgentIdentity> agentIdentity = new LinkedHashMap<>();
        for (TranscriptRepository.AggRow row : rows) {
            total.add(row);
            LocalDate date = query.localDate(row.bucket());
            byDate.computeIfAbsent(date, k -> new Group()).add(row);
            byModel.computeIfAbsent(row.model(), k -> new Group()).add(row);
            Group session = bySession.computeIfAbsent(row.sessionId(), k -> new Group());
            session.add(row);
            if (row.sessionKnown()) {
                session.project = row.project();
                session.startedAt = row.startedAt();
                session.entrypoint = row.entrypoint();
            }
            AgentIdentity identity = identityOf(row);
            byAgent.computeIfAbsent(identity.key(), k -> new Group()).add(row);
            agentIdentity.putIfAbsent(identity.key(), identity);
        }

        Set<String> unpriced = new HashSet<>();
        for (String model : byModel.keySet()) {
            if (priceTable.find(model).isEmpty()) {
                unpriced.add(model);
            }
        }
        LocalDate today = clock.instant().atZone(query.zone()).toLocalDate();
        LocalDate first = query.firstDate() != null ? query.firstDate() : (byDate.isEmpty() ? null : byDate.keySet().iterator().next());

        List<CostReport.DateRow> dateRows = new ArrayList<>();
        if (first != null) {
            LocalDate last = today;
            if (!byDate.isEmpty()) {
                LocalDate latest = ((TreeMap<LocalDate, Group>) byDate).lastKey();
                if (latest.isAfter(last)) {
                    last = latest;
                }
            }
            for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
                Group group = byDate.get(date);
                dateRows.add(group == null
                        ? new CostReport.DateRow(date, CostReport.TokenSums.of(0, 0, 0, 0), BigDecimal.ZERO)
                        : new CostReport.DateRow(date, group.sums(), usd(group)));
            }
        }

        List<CostReport.ModelRow> modelRows = new ArrayList<>();
        for (Map.Entry<String, Group> entry : byModel.entrySet()) {
            Group group = entry.getValue();
            Optional<PriceTable.ModelPrice> price = priceTable.find(entry.getKey());
            modelRows.add(new CostReport.ModelRow(
                    entry.getKey(), group.sums(), price.map(p -> usd(group)).orElse(null)));
        }
        modelRows.sort(Comparator.comparingLong((CostReport.ModelRow r) -> r.tokens().total())
                .reversed()
                .thenComparing(CostReport.ModelRow::model));

        List<CostReport.SessionRow> sessionRows = new ArrayList<>();
        for (Map.Entry<String, Group> entry : bySession.entrySet()) {
            Group group = entry.getValue();
            sessionRows.add(new CostReport.SessionRow(
                    entry.getKey(), group.project, group.startedAt, group.entrypoint, group.sums(), usd(group)));
        }
        sessionRows.sort(Comparator.comparingLong((CostReport.SessionRow r) -> r.tokens().total())
                .reversed()
                .thenComparing(CostReport.SessionRow::sessionId));

        List<CostReport.AgentRow> agentRows = new ArrayList<>();
        for (Map.Entry<String, Group> entry : byAgent.entrySet()) {
            AgentIdentity identity = agentIdentity.get(entry.getKey());
            Group group = entry.getValue();
            agentRows.add(new CostReport.AgentRow(identity.name(), identity.kind(), group.sums(), usd(group)));
        }
        agentRows.sort(Comparator.comparingLong((CostReport.AgentRow r) -> r.tokens().total())
                .reversed()
                .thenComparing(r -> r.agent() == null ? "" : r.agent())
                .thenComparing(CostReport.AgentRow::kind));

        CostReport.Range range = query.firstDate() != null
                ? new CostReport.Range(query.firstDate(), query.lastDate())
                : new CostReport.Range(first, today);
        return new CostReport(
                query.period(),
                range,
                ingestService.status(),
                total.sums(),
                new CostReport.Estimate(usd(total), unpriced.size()),
                dateRows,
                modelRows,
                sessionRows,
                agentRows);
    }

    /** 단가 있는 모델 금액의 합. 없으면 0. */
    private BigDecimal usd(Group group) {
        BigDecimal sum = BigDecimal.ZERO;
        for (Map.Entry<String, Tokens> entry : group.byModel.entrySet()) {
            Optional<PriceTable.ModelPrice> price = priceTable.find(entry.getKey());
            if (price.isEmpty()) {
                continue;
            }
            Tokens t = entry.getValue();
            sum = sum.add(calculator.usd(t.input, t.output, t.cacheCreation, t.cacheRead, price.get()));
        }
        return sum.signum() == 0 ? BigDecimal.ZERO : sum;
    }

    private record AgentIdentity(String key, String name, String kind) {}

    /**
     * 에이전트 나눔(FR-025-AC2): 서브에이전트 행은 {@code sub_agent}({@code ?} → 미확인), 메인 행은
     * {@code usage_session.main_agent}(NULL → 미확인, {@code ''} → 기본 세션, 그 밖 → 그 이름)로 묶는다.
     */
    private static AgentIdentity identityOf(TranscriptRepository.AggRow row) {
        String sub = row.subAgent();
        if (sub.equals(TranscriptAgentResolver.UNKNOWN_SUB_AGENT)) {
            return new AgentIdentity(UNKNOWN_AGENT_KEY, null, "unknown");
        }
        if (!sub.isEmpty()) {
            return new AgentIdentity("a:" + sub, sub, "agent");
        }
        String main = row.mainAgent();
        if (main == null) {
            return new AgentIdentity(UNKNOWN_AGENT_KEY, null, "unknown");
        }
        if (main.isEmpty()) {
            return new AgentIdentity(MAIN_AGENT_KEY, null, "main");
        }
        return new AgentIdentity("a:" + main, main, "agent");
    }
}
