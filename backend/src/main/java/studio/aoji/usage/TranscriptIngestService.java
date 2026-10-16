package studio.aoji.usage;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.io.InputStream;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import studio.aoji.events.EventRepository;
import studio.aoji.globalcfg.GlobalClaudeItem;
import studio.aoji.globalcfg.GlobalClaudeMounts;

/**
 * 대화 기록({@code ~/.claude/projects/**}{@code /*.jsonl}) 증분 읽기 (FR-025, ADR-81, NFR-09·NFR-14·NFR-16).
 *
 * <ul>
 *   <li>읽기 스레드는 하나(낮은 우선순위)이고 첫 연결 때 목록 전체를, 이후 {@code transcript-poll-ms}(기본 5초)마다
 *       목록을 다시 보고 늘어난 부분만 읽는다. 서브에이전트 기록을 먼저, 메인 기록을 나중에 읽는다.
 *   <li>파일별 {@code offset}은 마지막 {@code \n} 뒤까지만 올린다. 크기가 줄었거나 파일 키가 바뀌면 처음부터
 *       다시 읽는다 — 중복은 {@code transcript_msg}가 막는다(같은 키는 {@code output_tokens} 최대 줄의 4값만
 *       센다. 더 큰 줄이 오면 저장된 위치 행에서 빼고 새 위치 행에 더한다. 순서 무관·재읽기 멱등).
 *   <li>쓰기는 파일 하나(또는 1,000줄)마다 한 트랜잭션이고 {@code EventRepository#locked} 잠금을 먼저 잡는다(D-160).
 *       배치 사이에 잠금을 놓아 hook 수집·다른 요청이 끼어든다.
 *   <li>심볼릭 링크는 목록에 넣지도 열지도 않는다. 로그는 {@code projects} 기준 상대 경로와 사유만 남긴다.
 * </ul>
 */
@Service
public class TranscriptIngestService {

    static final int BATCH_LINES = 1000;
    static final int READ_BUFFER_BYTES = 64 * 1024;
    /** 한 줄이 이보다 길면 읽지 않고 건너뛴 줄(깨진 줄)로 센다. */
    static final long MAX_LINE_BYTES = 64L * 1024 * 1024;
    static final long RESOLVE_INTERVAL_MILLIS = 60_000;
    private static final int MAIN_DEPTH = 2;
    private static final int SUB_DEPTH = 4;
    private static final Logger log = LoggerFactory.getLogger(TranscriptIngestService.class);

    /** 읽는 파일 하나. */
    record Candidate(String relativePath, Path path, boolean sub, String sessionFallback, Path metaFile) {}

    /** 이 서비스가 시작한 뒤 센 줄 수(진단·테스트용, 대화 내용 없음). */
    public record Stats(long noKey, long synthetic, long allZero, long duplicate, long unusableTimestamp) {}

    private final GlobalClaudeMounts mounts;
    private final TranscriptLineParser parser;
    private final TranscriptRepository repository;
    private final TranscriptAgentResolver resolver;
    private final EventRepository eventRepository;
    private final TransactionTemplate transactionTemplate;
    private final UsageChangedNotifier notifier;
    private final Clock clock;
    private final long pollMillis;
    private final boolean autoStart;

    private final AtomicLong noKeyLines = new AtomicLong();
    private final AtomicLong syntheticLines = new AtomicLong();
    private final AtomicLong allZeroLines = new AtomicLong();
    private final AtomicLong duplicateLines = new AtomicLong();
    private final AtomicLong badTimestampLines = new AtomicLong();

    private ScheduledExecutorService scheduler;
    private volatile String state = TranscriptStatus.READING;
    private volatile int readFiles;
    private volatile int totalFiles;
    private volatile Integer skippedFiles;
    private volatile boolean firstPassDone;
    private TranscriptStatus lastPublished;
    private Instant lastResolveAt;

    public TranscriptIngestService(
            GlobalClaudeMounts mounts,
            TranscriptLineParser parser,
            TranscriptRepository repository,
            TranscriptAgentResolver resolver,
            EventRepository eventRepository,
            PlatformTransactionManager transactionManager,
            UsageChangedNotifier notifier,
            Clock clock,
            @Value("${aojistudio.transcript-poll-ms:5000}") long pollMillis,
            @Value("${aojistudio.transcript-auto-start:true}") boolean autoStart) {
        this.mounts = mounts;
        this.parser = parser;
        this.repository = repository;
        this.resolver = resolver;
        this.eventRepository = eventRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.notifier = notifier;
        this.clock = clock;
        this.pollMillis = pollMillis;
        this.autoStart = autoStart;
        notifier.setTranscriptsSupplier(() -> status().asMap());
    }

    @PostConstruct
    void start() {
        if (!autoStart) {
            return;
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "transcript-ingest");
            thread.setDaemon(true);
            thread.setPriority(Thread.MIN_PRIORITY);
            return thread;
        });
        scheduler.scheduleWithFixedDelay(this::runSafely, 500, pollMillis, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void shutdown() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    private void runSafely() {
        try {
            ingestOnce();
        } catch (RuntimeException e) {
            log.warn("transcript ingest failed: reason={}", e.getClass().getSimpleName());
        }
    }

    public Stats stats() {
        return new Stats(
                noKeyLines.get(), syntheticLines.get(), allZeroLines.get(), duplicateLines.get(), badTimestampLines.get());
    }

    /** 지금 읽기 상태. 연결 여부는 호출 시점의 마운트 상태다. */
    public TranscriptStatus status() {
        boolean connected = mounts.connected(GlobalClaudeItem.PROJECTS);
        Integer cached = skippedFiles;
        if (cached == null) {
            cached = (int) repository.countFailedFiles();
            skippedFiles = cached;
        }
        int skipped = cached;
        if (!connected) {
            return new TranscriptStatus(false, TranscriptStatus.NOT_CONNECTED, 0, 0, skipped);
        }
        return new TranscriptStatus(true, state, readFiles, totalFiles, skipped);
    }

    /**
     * 목록을 다시 보고 늘어난 부분을 읽는다. 스케줄러가 부르고, 테스트가 직접 부를 수도 있다(한 번에 하나만 돈다).
     * 연결 안 됨이면 읽지 않는다(FR-025-E1).
     */
    public synchronized TranscriptStatus ingestOnce() {
        if (!mounts.connected(GlobalClaudeItem.PROJECTS)) {
            state = TranscriptStatus.NOT_CONNECTED;
            readFiles = 0;
            totalFiles = 0;
            firstPassDone = false;
            publishIfChanged();
            return status();
        }
        if (TranscriptStatus.NOT_CONNECTED.equals(state)) {
            state = TranscriptStatus.READING;
        }
        resolveUnknownIfDue();

        Path root = mounts.path(GlobalClaudeItem.PROJECTS);
        List<Candidate> files;
        try {
            files = list(root);
        } catch (IOException e) {
            log.warn("transcript scan failed: reason=io-error");
            return status();
        }
        if (!firstPassDone) {
            state = TranscriptStatus.READING;
        }
        totalFiles = files.size();
        readFiles = 0;
        publishIfChanged();

        boolean changed = false;
        for (Candidate candidate : files) {
            if (Thread.currentThread().isInterrupted()) {
                return status();
            }
            try {
                changed |= readFile(candidate);
            } catch (IOException e) {
                markIoFailed(candidate);
            }
            readFiles++;
            if (!firstPassDone) {
                publishIfChanged();
            }
        }
        skippedFiles = (int) repository.countFailedAmong(files.stream().map(Candidate::relativePath).toList());
        firstPassDone = true;
        state = TranscriptStatus.READY;
        readFiles = totalFiles;
        if (changed) {
            notifier.markChanged(UsageArea.COST);
        }
        publishIfChanged();
        return status();
    }

    /** 방송할 상태가 지난번과 다르면 {@code usage-changed}({@code cost})를 요청한다. */
    private void publishIfChanged() {
        TranscriptStatus now = status();
        if (!now.equals(lastPublished)) {
            lastPublished = now;
            notifier.markChanged(UsageArea.COST);
        }
    }

    private void resolveUnknownIfDue() {
        Instant now = clock.instant();
        if (lastResolveAt != null && now.isBefore(lastResolveAt.plusMillis(RESOLVE_INTERVAL_MILLIS))) {
            return;
        }
        lastResolveAt = now;
        if (resolver.resolveUnknownSessions() > 0) {
            notifier.markChanged(UsageArea.COST);
        }
    }

    /** NULL(미확인) 세션의 에이전트를 hook {@code SessionStart}로 다시 판정한다(주기와 무관하게 지금 한 번). */
    public synchronized int resolveUnknownNow() {
        lastResolveAt = clock.instant();
        int count = resolver.resolveUnknownSessions();
        if (count > 0) {
            notifier.markChanged(UsageArea.COST);
        }
        return count;
    }

    // ---- 목록 ---------------------------------------------------------------------------------------------------

    /** {@code projects} 아래 읽을 {@code .jsonl}. 링크는 따라가지 않는다. 서브에이전트 기록이 앞이다. */
    List<Candidate> list(Path root) throws IOException {
        List<Candidate> found = new ArrayList<>();
        Files.walkFileTree(root, EnumSet.noneOf(java.nio.file.FileVisitOption.class), SUB_DEPTH, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (!attrs.isRegularFile() || attrs.isSymbolicLink()) {
                    return FileVisitResult.CONTINUE;
                }
                String name = file.getFileName().toString();
                if (!name.endsWith(".jsonl")) {
                    return FileVisitResult.CONTINUE;
                }
                Path relative = root.relativize(file);
                int depth = relative.getNameCount();
                String rel = relative.toString().replace('\\', '/');
                if (depth == MAIN_DEPTH) {
                    found.add(new Candidate(rel, file, false, name.substring(0, name.length() - ".jsonl".length()), null));
                } else if (depth == SUB_DEPTH
                        && relative.getName(2).toString().equals("subagents")
                        && name.startsWith("agent-")) {
                    String base = name.substring(0, name.length() - ".jsonl".length());
                    found.add(new Candidate(
                            rel,
                            file,
                            true,
                            relative.getName(1).toString(),
                            file.resolveSibling(base + ".meta.json")));
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                return FileVisitResult.CONTINUE;
            }
        });
        found.sort(Comparator.comparing((Candidate c) -> !c.sub()).thenComparing(Candidate::relativePath));
        return found;
    }

    // ---- 파일 하나 ----------------------------------------------------------------------------------------------------

    /** @return 집계가 바뀌었다 */
    private boolean readFile(Candidate candidate) throws IOException {
        BasicFileAttributes attrs;
        try {
            attrs = Files.readAttributes(candidate.path(), BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        } catch (NoSuchFileException e) {
            return false;
        }
        if (!attrs.isRegularFile()) {
            return false;
        }
        String fileKey = fileKey(attrs);
        long size = attrs.size();
        String mtime = attrs.lastModifiedTime().toInstant().toString();
        Optional<TranscriptRepository.FileRow> previous = repository.findFile(candidate.relativePath());

        long start = 0;
        boolean failed = false;
        if (previous.isPresent()) {
            TranscriptRepository.FileRow row = previous.get();
            if (Objects.equals(row.fileKey(), fileKey) && size >= row.offset()) {
                if (size == row.size()) {
                    return false;
                }
                start = row.offset();
                failed = row.failed();
            }
        }

        String subAgent = candidate.sub() ? resolver.subAgentType(candidate.metaFile()) : "";
        FileContext context = new FileContext(candidate, subAgent, fileKey, size, mtime);
        boolean changed = false;
        List<TranscriptLine> batch = new ArrayList<>();
        long consumed = start;
        long position = start;
        LineBuffer line = new LineBuffer();
        byte[] buffer = new byte[READ_BUFFER_BYTES];

        try (FileChannel channel = FileChannel.open(candidate.path(), StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            channel.position(start);
            InputStream in = Channels.newInputStream(channel);
            int read;
            while ((read = in.read(buffer)) > 0) {
                int from = 0;
                for (int i = 0; i < read; i++) {
                    if (buffer[i] != '\n') {
                        continue;
                    }
                    line.append(buffer, from, i - from);
                    from = i + 1;
                    consumed = position + i + 1;
                    TranscriptLine parsed = line.overflowed() ? TranscriptLine.ERROR : parser.parse(line.bytes(), line.length());
                    line.reset();
                    if (parsed.error() && !failed) {
                        failed = true;
                        log.warn("transcript skipped: path={} reason=parse-error", candidate.relativePath());
                    }
                    if (!parsed.error()) {
                        batch.add(parsed);
                    }
                    if (batch.size() >= BATCH_LINES) {
                        changed |= commit(context, batch, consumed, failed);
                        batch = new ArrayList<>();
                        LockSupport.parkNanos(1_000_000);
                    }
                }
                line.append(buffer, from, read - from);
                position += read;
            }
        }
        changed |= commit(context, batch, consumed, failed);
        return changed;
    }

    private static String fileKey(BasicFileAttributes attrs) {
        Object key = attrs.fileKey();
        return key != null ? key.toString() : "created:" + attrs.creationTime().toInstant();
    }

    /** 열기·읽기 실패: 그 파일을 건너뛴 파일로 센다(처음 한 번만 로그). */
    private void markIoFailed(Candidate candidate) {
        Optional<TranscriptRepository.FileRow> previous = repository.findFile(candidate.relativePath());
        boolean alreadyFailed = previous.map(TranscriptRepository.FileRow::failed).orElse(false);
        long size = 0;
        try {
            size = Files.size(candidate.path());
        } catch (IOException ignored) {
            // 크기를 모르면 0으로 둔다 — 다음에 크기가 바뀌면 다시 시도한다.
        }
        TranscriptRepository.FileRow row = previous
                .map(r -> new TranscriptRepository.FileRow(r.path(), r.fileKey(), r.size(), r.offset(), r.mtime(), true))
                .orElse(new TranscriptRepository.FileRow(candidate.relativePath(), null, size, 0, null, true));
        eventRepository.locked(() -> transactionTemplate.execute(status -> {
            repository.upsertFile(row);
            return null;
        }));
        if (!alreadyFailed) {
            log.warn("transcript skipped: path={} reason=io-error", candidate.relativePath());
        }
    }

    private record FileContext(Candidate candidate, String subAgent, String fileKey, long size, String mtime) {}

    // ---- 쓰기(한 트랜잭션) ---------------------------------------------------------------------------------------------

    private boolean commit(FileContext context, List<TranscriptLine> lines, long offset, boolean failed) {
        Boolean changed = eventRepository.locked(() -> transactionTemplate.execute(status -> {
            boolean result = apply(context, lines);
            repository.upsertFile(new TranscriptRepository.FileRow(
                    context.candidate().relativePath(), context.fileKey(), context.size(), offset, context.mtime(), failed));
            return result;
        }));
        return Boolean.TRUE.equals(changed);
    }

    private static final class SessionAcc {
        String project;
        String entrypoint;
        String startedAt;
        Instant startedInstant;
        String agentSetting;
    }

    private boolean apply(FileContext context, List<TranscriptLine> lines) {
        boolean changed = false;
        Map<String, SessionAcc> sessions = new LinkedHashMap<>();
        for (TranscriptLine line : lines) {
            String sessionId = line.hasSession() ? line.sessionId() : context.candidate().sessionFallback();
            SessionAcc acc = sessions.computeIfAbsent(sessionId, key -> new SessionAcc());
            if (acc.project == null && line.cwd() != null) {
                acc.project = line.cwd();
            }
            if (acc.entrypoint == null && line.entrypoint() != null) {
                acc.entrypoint = line.entrypoint();
            }
            Instant at = parseInstant(line.timestamp());
            if (at != null && (acc.startedInstant == null || at.isBefore(acc.startedInstant))) {
                acc.startedInstant = at;
                acc.startedAt = line.timestamp();
            }
            if (line.agentSetting() != null && !line.agentSetting().isBlank()) {
                acc.agentSetting = line.agentSetting();
            }
            if (line.usage() != null) {
                changed |= applyUsage(context, sessionId, at, line);
            }
        }
        for (Map.Entry<String, SessionAcc> entry : sessions.entrySet()) {
            changed |= upsertSession(entry.getKey(), entry.getValue());
        }
        return changed;
    }

    private boolean applyUsage(FileContext context, String sessionId, Instant at, TranscriptLine line) {
        TranscriptLine.Usage usage = line.usage();
        String key = usage.messageKey();
        if (key == null || usage.model() == null || usage.model().isEmpty()) {
            noKeyLines.incrementAndGet();
            return false;
        }
        if ("<synthetic>".equals(usage.model())) {
            syntheticLines.incrementAndGet();
            return false;
        }
        if (usage.ignorable()) {
            allZeroLines.incrementAndGet();
            return false;
        }
        if (at == null) {
            badTimestampLines.incrementAndGet();
            return false;
        }
        String subAgent = context.candidate().sub()
                ? context.subAgent()
                : (line.sidechain() ? TranscriptAgentResolver.UNKNOWN_SUB_AGENT : "");
        TranscriptRepository.MsgRow incoming = new TranscriptRepository.MsgRow(
                UsageBucket.of(at),
                sessionId,
                subAgent,
                usage.model(),
                usage.input(),
                usage.output(),
                usage.cacheCreation(),
                usage.cacheRead());
        Optional<TranscriptRepository.MsgRow> stored = repository.findMsg(key);
        if (stored.isEmpty()) {
            repository.upsertMsg(key, incoming);
            repository.addAgg(incoming, 1);
            return true;
        }
        duplicateLines.incrementAndGet();
        TranscriptRepository.MsgRow current = stored.get();
        if (!usage.largerThan(current.output(), current.sum())) {
            return false;
        }
        // 더 큰 줄: 저장된 위치 행에서 저장된 값을 빼고, 새 줄의 위치 행에 새 값을 더한 뒤 교체한다(ADR-81 결정 3).
        repository.addAgg(current, -1);
        repository.addAgg(incoming, 1);
        repository.upsertMsg(key, incoming);
        return true;
    }

    /** @return 세션의 에이전트 판정이 바뀌었다(집계의 에이전트 나눔이 달라진다) */
    private boolean upsertSession(String sessionId, SessionAcc acc) {
        Optional<TranscriptRepository.SessionRow> existing = repository.findSession(sessionId);
        if (existing.isEmpty()) {
            String mainAgent = acc.agentSetting != null
                    ? acc.agentSetting
                    : resolver.fromSessionStart(sessionId).orElse(null);
            repository.insertSession(new TranscriptRepository.SessionRow(
                    sessionId, acc.project, acc.startedAt, acc.entrypoint, mainAgent));
            return mainAgent != null;
        }
        TranscriptRepository.SessionRow row = existing.get();
        String project = row.project() != null ? row.project() : acc.project;
        String entrypoint = row.entrypoint() != null ? row.entrypoint() : acc.entrypoint;
        String startedAt = earlier(row.startedAt(), acc.startedAt);
        if (!Objects.equals(project, row.project())
                || !Objects.equals(entrypoint, row.entrypoint())
                || !Objects.equals(startedAt, row.startedAt())) {
            repository.updateSessionMeta(sessionId, project, startedAt, entrypoint);
        }
        if (acc.agentSetting != null && !acc.agentSetting.equals(row.mainAgent())) {
            repository.setMainAgent(sessionId, acc.agentSetting);
            return true;
        }
        return false;
    }

    private static String earlier(String a, String b) {
        if (a == null) {
            return b;
        }
        if (b == null) {
            return a;
        }
        Instant first = parseInstant(a);
        Instant second = parseInstant(b);
        if (first == null) {
            return b;
        }
        if (second == null) {
            return a;
        }
        return second.isBefore(first) ? b : a;
    }

    static Instant parseInstant(String text) {
        if (text == null) {
            return null;
        }
        try {
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** 줄 하나를 모으는 버퍼. 상한을 넘으면 더 모으지 않고 넘쳤다고만 기억한다. */
    private static final class LineBuffer {
        private byte[] data = new byte[8192];
        private int length;
        private boolean overflow;

        void append(byte[] source, int from, int count) {
            if (count <= 0 || overflow) {
                return;
            }
            if (length + count > MAX_LINE_BYTES) {
                overflow = true;
                length = 0;
                data = new byte[8192];
                return;
            }
            if (length + count > data.length) {
                data = java.util.Arrays.copyOf(data, (int) Math.min(MAX_LINE_BYTES, Math.max((long) data.length * 2, length + count)));
            }
            System.arraycopy(source, from, data, length, count);
            length += count;
        }

        byte[] bytes() {
            return data;
        }

        int length() {
            return length;
        }

        boolean overflowed() {
            return overflow;
        }

        void reset() {
            length = 0;
            overflow = false;
            if (data.length > (1 << 20)) {
                data = new byte[8192];
            }
        }
    }
}
