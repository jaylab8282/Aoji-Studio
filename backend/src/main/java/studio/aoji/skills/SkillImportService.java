package studio.aoji.skills;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongConsumer;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.CRC32;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import studio.aoji.config.AppProperties;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.files.PathGuard;
import studio.aoji.files.WriteLock;

/**
 * 스킬 zip 가져오기 2단계 (ADR-84 결정 6, FR-021).
 *
 * <p>{@link #preview}는 데이터 볼륨 {@code <data>/skill-import/<uploadId>/files/}에 풀며 검사한다 — 마운트에는
 * 아무것도 쓰지 않는다. 거부 사유가 하나라도 있으면 푼 것을 모두 지운다(FR-021-AC3). {@link #importUpload}는
 * 마운트 안 {@code .claude/skills/.import-<uploadId>.tmp/}로 복사해 {@code SOURCE.md}를 쓰고 폴더째 이름을
 * 바꾼다. 어느 단계든 실패하면 임시 폴더를 지운다(FR-021-AC6). 모든 쓰기 호출은 호출자가 {@code WriteLock}
 * 안에서 부른다({@link #deleteExpired}는 스스로 잡는다).
 */
@Component
public class SkillImportService {

    private static final Logger log = LoggerFactory.getLogger(SkillImportService.class);

    public static final long MAX_ZIP_BYTES = 10L * 1024 * 1024;
    public static final int MAX_FILES = 500;
    public static final long MAX_UNPACKED_BYTES = 50L * 1024 * 1024;
    /** 디렉터리 항목까지 포함한 항목 수 상한(디렉터리만 수만 개인 zip 방어). */
    static final int MAX_ENTRIES = 2 * MAX_FILES;

    static final Duration VALIDITY = Duration.ofMinutes(30);
    static final String IMPORT_DIR = "skill-import";

    private static final String SKILL_FILE_NAME = "SKILL.md";
    private static final String SOURCE_FILE_NAME = "SOURCE.md";
    private static final String NAME_FILE = "name";
    private static final String FILES_DIR = "files";
    private static final String UPLOAD_FILE = "upload.zip";
    private static final int CHUNK = 64 * 1024;
    private static final int EXEC_BITS = 0111;

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9-]{1,64}$");
    private static final Pattern DRIVE_LETTER = Pattern.compile("^[A-Za-z]:");
    private static final Set<String> SCRIPT_EXTENSIONS =
            Set.of("sh", "bash", "zsh", "py", "js", "mjs", "cjs", "ts", "rb", "pl", "php", "ps1", "bat", "cmd", "exe");

    private final Path importRoot;
    private final PathGuard pathGuard;
    private final SkillWriter skillWriter;
    private final AtomicFileWriter atomicFileWriter;
    private final SkillFileParser parser;
    private final WriteLock writeLock;
    private final Clock clock;

    /** 테스트가 푸는 중 누적 바이트를 관찰한다(압축 폭탄이 50MB에서 멈추는지, FR-021-AC2). */
    volatile LongConsumer extractionObserver = total -> {};

    @Autowired
    public SkillImportService(
            AppProperties appProperties,
            PathGuard pathGuard,
            SkillWriter skillWriter,
            AtomicFileWriter atomicFileWriter,
            SkillFileParser parser,
            WriteLock writeLock,
            Clock clock) {
        this(Path.of(appProperties.getDataPath()).resolve(IMPORT_DIR), pathGuard, skillWriter, atomicFileWriter, parser, writeLock, clock);
    }

    SkillImportService(
            Path importRoot,
            PathGuard pathGuard,
            SkillWriter skillWriter,
            AtomicFileWriter atomicFileWriter,
            SkillFileParser parser,
            WriteLock writeLock,
            Clock clock) {
        this.importRoot = importRoot;
        this.pathGuard = pathGuard;
        this.skillWriter = skillWriter;
        this.atomicFileWriter = atomicFileWriter;
        this.parser = parser;
        this.writeLock = writeLock;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ 미리보기

    /**
     * zip을 받아 데이터 볼륨에 풀고 검사한다.
     *
     * @param declaredSize multipart가 알려 준 크기(바이트). 한도를 넘으면 읽지 않고 거부한다.
     * @throws SkillImportException 거부({@code REJECTED}) 또는 쓰기 실패({@code IO_FAILED}). 실패하면 푼 것은 모두 지운다.
     */
    public SkillImportPreview preview(long declaredSize, InputStream zipStream) {
        if (declaredSize > MAX_ZIP_BYTES) {
            throw SkillImportException.rejected(SkillImportRejectReason.TOO_LARGE, null, null);
        }
        String uploadId = UUID.randomUUID().toString();
        Path uploadDir = importRoot.resolve(uploadId);
        try {
            Files.createDirectories(importRoot);
            Files.createDirectory(uploadDir);
            Path zipFile = uploadDir.resolve(UPLOAD_FILE);
            saveUpload(zipStream, zipFile);
            Path filesRoot = uploadDir.resolve(FILES_DIR);
            Files.createDirectory(filesRoot);

            Inspection inspection = inspect(zipFile, filesRoot);
            Files.delete(zipFile);
            atomicFileWriter.write(uploadDir.resolve(NAME_FILE), inspection.name().getBytes(StandardCharsets.UTF_8));

            // 업로드 시각 = 폴더 mtime. 이 폴더 안 직계 변경을 모두 끝낸 뒤 마지막에 기록한다.
            Instant now = clock.instant();
            Files.setLastModifiedTime(uploadDir, FileTime.from(now));
            return new SkillImportPreview(
                    uploadId,
                    OffsetDateTime.ofInstant(now.plus(VALIDITY), clock.getZone()),
                    inspection.name(),
                    inspection.description(),
                    inspection.files(),
                    inspection.files().size(),
                    inspection.unpackedBytes(),
                    (int) inspection.files().stream().filter(SkillImportPreview.FileInfo::script).count(),
                    inspection.hasSourceMd());
        } catch (SkillImportException e) {
            SkillWriter.deleteQuietly(uploadDir);
            throw e;
        } catch (IOException | RuntimeException e) {
            log.warn("skill import preview failed: {}", e.getClass().getSimpleName());
            SkillWriter.deleteQuietly(uploadDir);
            throw SkillImportException.ioFailed();
        }
    }

    private static void saveUpload(InputStream in, Path target) throws IOException {
        long total = 0;
        byte[] buffer = new byte[CHUNK];
        try (OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            int n;
            while ((n = in.read(buffer)) >= 0) {
                total += n;
                if (total > MAX_ZIP_BYTES) {
                    throw SkillImportException.rejected(SkillImportRejectReason.TOO_LARGE, null, null);
                }
                out.write(buffer, 0, n);
            }
        }
        if (total == 0) {
            throw SkillImportException.rejected(SkillImportRejectReason.NOT_ZIP, null, null);
        }
    }

    private record Inspection(
            String name, String description, List<SkillImportPreview.FileInfo> files, long unpackedBytes, boolean hasSourceMd) {}

    /** 정리된 zip 항목: 정규화한 경로와 원래 항목. */
    private record Item(String rel, ZipArchiveEntry entry) {}

    private Inspection inspect(Path zipFile, Path filesRoot) throws IOException {
        requireZipSignature(zipFile);
        try (ZipFile zip = openZip(zipFile)) {
            List<ZipArchiveEntry> entries = Collections.list(zip.getEntries());
            List<Item> items = screen(entries);
            List<Item> files = items.stream().filter(i -> !i.entry().isDirectory()).toList();
            String prefix = detectRoot(files);
            String folderName = prefix.isEmpty() ? null : prefix.substring(0, prefix.length() - 1);

            long unpacked = extract(zip, files, prefix, filesRoot);

            byte[] skillBytes = Files.readAllBytes(filesRoot.resolve(SKILL_FILE_NAME));
            SkillFileParser.FrontmatterMeta meta = parser.readMeta(skillBytes);
            String name = meta.name() != null ? meta.name() : folderName;
            if (name == null || !NAME_PATTERN.matcher(name).matches()) {
                throw SkillImportException.rejected(SkillImportRejectReason.NAME_INVALID, null, name == null ? "" : name);
            }
            if (Files.exists(pathGuard.resolve(".claude", "skills", name), LinkOption.NOFOLLOW_LINKS)) {
                throw SkillImportException.rejected(SkillImportRejectReason.NAME_EXISTS, null, name);
            }

            List<SkillImportPreview.FileInfo> infos = describe(files, prefix, filesRoot);
            boolean hasSource = infos.stream().anyMatch(f -> f.path().equals(SOURCE_FILE_NAME));
            return new Inspection(name, meta.description() == null ? "" : meta.description(), infos, unpacked, hasSource);
        }
    }

    private static void requireZipSignature(Path zipFile) throws IOException {
        byte[] head = new byte[4];
        int read;
        try (InputStream in = Files.newInputStream(zipFile)) {
            read = in.readNBytes(head, 0, 4);
        }
        boolean local = read == 4 && head[0] == 'P' && head[1] == 'K' && head[2] == 3 && head[3] == 4;
        boolean emptyArchive = read == 4 && head[0] == 'P' && head[1] == 'K' && head[2] == 5 && head[3] == 6;
        if (!local && !emptyArchive) {
            throw SkillImportException.rejected(SkillImportRejectReason.NOT_ZIP, null, null);
        }
    }

    private static ZipFile openZip(Path zipFile) {
        try {
            return ZipFile.builder().setPath(zipFile).get();
        } catch (IOException | RuntimeException e) {
            throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
        }
    }

    /** 항목 수·위험 경로·심볼릭 링크를 풀기 전에 모두 검사한다(FR-021-AC2·AC3). */
    private static List<Item> screen(List<ZipArchiveEntry> entries) {
        if (entries.size() > MAX_ENTRIES) {
            throw SkillImportException.rejected(SkillImportRejectReason.TOO_MANY_FILES, null, null);
        }
        long fileCount = entries.stream().filter(e -> !e.isDirectory()).count();
        if (fileCount > MAX_FILES) {
            throw SkillImportException.rejected(SkillImportRejectReason.TOO_MANY_FILES, null, null);
        }
        List<Item> items = new ArrayList<>(entries.size());
        Set<String> seenFiles = new HashSet<>();
        for (ZipArchiveEntry entry : entries) {
            String raw = entry.getName();
            if (entry.isUnixSymlink()) {
                throw SkillImportException.rejected(SkillImportRejectReason.SYMLINK, raw, null);
            }
            String rel = normalize(raw);
            if (rel.isEmpty()) {
                if (entry.isDirectory()) {
                    continue;
                }
                throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
            }
            if (!entry.isDirectory() && !seenFiles.add(rel)) {
                throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
            }
            items.add(new Item(rel, entry));
        }
        // 파일 경로가 다른 항목의 상위 폴더가 되면 풀 수 없다.
        for (Item item : items) {
            int slash = item.rel().indexOf('/');
            while (slash > 0) {
                if (seenFiles.contains(item.rel().substring(0, slash))) {
                    throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
                }
                slash = item.rel().indexOf('/', slash + 1);
            }
        }
        return items;
    }

    /**
     * 항목 이름을 {@code /} 구분 상대 경로로 정리한다. 절대 경로(시작 {@code /}·{@code \}·드라이브 문자)와 루트 밖을
     * 가리키는 {@code ..}는 거부한다. 루트 안에 머무는 {@code ..}는 접어 정리한다.
     */
    static String normalize(String raw) {
        String s = raw.replace('\\', '/');
        if (s.startsWith("/") || DRIVE_LETTER.matcher(s).find()) {
            throw SkillImportException.rejected(SkillImportRejectReason.ABSOLUTE_PATH, raw, null);
        }
        List<String> parts = new ArrayList<>();
        for (String segment : s.split("/")) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                if (parts.isEmpty()) {
                    throw SkillImportException.rejected(SkillImportRejectReason.PATH_TRAVERSAL, raw, null);
                }
                parts.remove(parts.size() - 1);
            } else {
                parts.add(segment);
            }
        }
        return String.join("/", parts);
    }

    /** 구조 ① 맨 위 {@code SKILL.md}(접두어 "") ② 맨 위 폴더 하나 + 그 안 {@code SKILL.md}(접두어 "<폴더>/") (FR-021-AC1). */
    private static String detectRoot(List<Item> files) {
        if (files.stream().anyMatch(f -> f.rel().equals(SKILL_FILE_NAME))) {
            return "";
        }
        Set<String> tops = new HashSet<>();
        for (Item file : files) {
            int slash = file.rel().indexOf('/');
            if (slash < 0) {
                throw SkillImportException.rejected(SkillImportRejectReason.NO_SKILL_MD, null, null);
            }
            tops.add(file.rel().substring(0, slash));
        }
        if (tops.size() != 1) {
            throw SkillImportException.rejected(SkillImportRejectReason.NO_SKILL_MD, null, null);
        }
        String prefix = tops.iterator().next() + "/";
        if (files.stream().noneMatch(f -> f.rel().equals(prefix + SKILL_FILE_NAME))) {
            throw SkillImportException.rejected(SkillImportRejectReason.NO_SKILL_MD, null, null);
        }
        return prefix;
    }

    /** 푸는 중에 바이트를 세어 50MB를 넘기려는 청크는 쓰지 않고 멈춘다(FR-021-AC2). */
    private long extract(ZipFile zip, List<Item> files, String prefix, Path filesRoot) throws IOException {
        long total = 0;
        byte[] buffer = new byte[CHUNK];
        for (Item item : files.stream().sorted(Comparator.comparing(Item::rel)).toList()) {
            ZipArchiveEntry entry = item.entry();
            String out = item.rel().substring(prefix.length());
            Path target = filesRoot.resolve(out).normalize();
            if (!target.startsWith(filesRoot) || target.equals(filesRoot)) {
                throw SkillImportException.rejected(SkillImportRejectReason.PATH_TRAVERSAL, entry.getName(), null);
            }
            if (!zip.canReadEntryData(entry)) {
                throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
            }
            Files.createDirectories(target.getParent());
            CRC32 crc = new CRC32();
            try (InputStream in = openEntry(zip, entry);
                    OutputStream sink = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                while (true) {
                    int n = readChunk(in, buffer);
                    if (n < 0) {
                        break;
                    }
                    if (total + n > MAX_UNPACKED_BYTES) {
                        throw SkillImportException.rejected(SkillImportRejectReason.UNPACKED_TOO_LARGE, entry.getName(), null);
                    }
                    sink.write(buffer, 0, n);
                    crc.update(buffer, 0, n);
                    total += n;
                    extractionObserver.accept(total);
                }
            }
            if (entry.getCrc() != -1 && entry.getCrc() != crc.getValue()) {
                throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
            }
            boolean executable = (entry.getUnixMode() & EXEC_BITS) != 0;
            setPermissions(target, executable);
        }
        return total;
    }

    private static InputStream openEntry(ZipFile zip, ZipArchiveEntry entry) {
        try {
            InputStream in = zip.getInputStream(entry);
            if (in == null) {
                throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
            }
            return in;
        } catch (IOException | RuntimeException e) {
            if (e instanceof SkillImportException sie) {
                throw sie;
            }
            throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
        }
    }

    /** 압축 해제 읽기 오류는 zip 손상이다(쓰기 오류와 구분). */
    private static int readChunk(InputStream in, byte[] buffer) {
        try {
            return in.read(buffer);
        } catch (IOException | RuntimeException e) {
            throw SkillImportException.rejected(SkillImportRejectReason.CORRUPT, null, null);
        }
    }

    private static void setPermissions(Path file, boolean executable) {
        try {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString(executable ? "rwxr-xr-x" : "rw-r--r--"));
        } catch (IOException | UnsupportedOperationException e) {
            // POSIX 권한을 모르는 파일 시스템이면 실행 비트는 복사 때 잃는다 - 미리보기 표시와 무관하다.
        }
    }

    private List<SkillImportPreview.FileInfo> describe(List<Item> files, String prefix, Path filesRoot) throws IOException {
        List<SkillImportPreview.FileInfo> infos = new ArrayList<>(files.size());
        for (Item item : files) {
            String rel = item.rel().substring(prefix.length());
            Path path = filesRoot.resolve(rel);
            long size = Files.size(path);
            boolean script = hasScriptExtension(rel) || startsWithShebang(path);
            boolean executable = (item.entry().getUnixMode() & EXEC_BITS) != 0;
            infos.add(new SkillImportPreview.FileInfo(rel, size, script, executable));
        }
        infos.sort(Comparator.comparing(SkillImportPreview.FileInfo::path));
        return List.copyOf(infos);
    }

    private static boolean hasScriptExtension(String rel) {
        String fileName = rel.substring(rel.lastIndexOf('/') + 1);
        int dot = fileName.lastIndexOf('.');
        return dot >= 0 && SCRIPT_EXTENSIONS.contains(fileName.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private static boolean startsWithShebang(Path file) throws IOException {
        byte[] head = new byte[2];
        try (InputStream in = Files.newInputStream(file)) {
            return in.readNBytes(head, 0, 2) == 2 && head[0] == '#' && head[1] == '!';
        }
    }

    // ------------------------------------------------------------------ 가져오기

    /**
     * 미리 본 zip을 스킬로 저장한다. 반환값은 스킬 이름이다. 호출자는 {@code WriteLock} 안에서 부르고, 끝나면
     * 재스캔한다. 실패하면 마운트 안 임시 폴더와 업로드 폴더를 모두 지운다(FR-021-AC6·E5).
     *
     * @throws SkillImportException {@code UPLOAD_NOT_FOUND}(없음·30분 경과)·{@code REJECTED}(이름 중복 NAME_EXISTS)·{@code IO_FAILED}
     */
    public String importUpload(String uploadId, String source, String version, String license) {
        Path uploadDir = locateUpload(uploadId);
        String name;
        try {
            name = new String(Files.readAllBytes(uploadDir.resolve(NAME_FILE)), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw SkillImportException.uploadNotFound();
        }
        if (!NAME_PATTERN.matcher(name).matches()) {
            throw SkillImportException.uploadNotFound();
        }
        Path skillsDir = pathGuard.resolve(".claude", "skills");
        Path target = pathGuard.resolve(".claude", "skills", name);
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
            // 거부이므로 올린 것을 남기지 않는다(FR-021-E3).
            SkillWriter.deleteQuietly(uploadDir);
            throw SkillImportException.rejected(SkillImportRejectReason.NAME_EXISTS, null, name);
        }

        Path tmpDir = pathGuard.resolve(".claude", "skills", ".import-" + uploadId + ".tmp");
        Path firstMissing = firstMissingDir(skillsDir);
        try {
            if (pathGuard.isSymlinkEscapingMount(skillsDir)) {
                throw new IOException("skills 폴더가 마운트 밖을 가리킵니다");
            }
            Files.createDirectories(skillsDir);
            copyTree(uploadDir.resolve(FILES_DIR), tmpDir);
            writeSourceRecord(tmpDir.resolve(SOURCE_FILE_NAME), source, version, license);
            skillWriter.moveIntoPlace(tmpDir, target);
        } catch (IOException | RuntimeException e) {
            log.warn("skill import failed: {}", e.getClass().getSimpleName());
            SkillWriter.deleteQuietly(tmpDir);
            removeCreatedDirs(skillsDir, firstMissing);
            SkillWriter.deleteQuietly(uploadDir);
            throw SkillImportException.ioFailed();
        }
        SkillWriter.deleteQuietly(uploadDir);
        return name;
    }

    /** {@code dir}에서 위로 올라가며 처음 없는 폴더(이 호출이 만들 가장 위 폴더). 모두 있으면 null. */
    private static Path firstMissingDir(Path dir) {
        Path missing = null;
        for (Path p = dir; p != null && !Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS); p = p.getParent()) {
            missing = p;
        }
        return missing;
    }

    /** 실패 때 이 호출이 만든 빈 폴더({@code skillsDir}부터 {@code firstMissing}까지)를 되돌린다. 비어 있지 않으면 남긴다. */
    private static void removeCreatedDirs(Path skillsDir, Path firstMissing) {
        if (firstMissing == null) {
            return;
        }
        for (Path p = skillsDir; p != null && p.startsWith(firstMissing); p = p.getParent()) {
            try {
                Files.deleteIfExists(p);
            } catch (IOException e) {
                return;
            }
        }
    }

    /** 업로드 폴더를 찾는다. 형식이 UUID가 아니거나 없거나 30분이 지났으면 없는 것으로 본다(지난 것은 지운다). */
    private Path locateUpload(String uploadId) {
        UUID parsed;
        try {
            parsed = UUID.fromString(uploadId == null ? "" : uploadId);
        } catch (IllegalArgumentException e) {
            throw SkillImportException.uploadNotFound();
        }
        if (!parsed.toString().equals(uploadId)) {
            throw SkillImportException.uploadNotFound();
        }
        Path uploadDir = importRoot.resolve(uploadId);
        if (!Files.isDirectory(uploadDir, LinkOption.NOFOLLOW_LINKS)) {
            throw SkillImportException.uploadNotFound();
        }
        if (isExpired(uploadDir, clock.instant())) {
            SkillWriter.deleteQuietly(uploadDir);
            throw SkillImportException.uploadNotFound();
        }
        return uploadDir;
    }

    private static boolean isExpired(Path uploadDir, Instant now) {
        try {
            Instant uploadedAt = Files.getLastModifiedTime(uploadDir, LinkOption.NOFOLLOW_LINKS).toInstant();
            return !now.isBefore(uploadedAt.plus(VALIDITY));
        } catch (IOException e) {
            return true;
        }
    }

    /** 푼 트리를 임시 폴더로 복사한다. 링크 등 일반 파일·폴더가 아닌 항목이 있으면 실패한다. */
    private static void copyTree(Path source, Path target) throws IOException {
        Files.createDirectory(target);
        List<Path> paths;
        try (Stream<Path> walk = Files.walk(source)) {
            paths = walk.sorted().toList();
        }
        for (Path path : paths) {
            Path dest = target.resolve(source.relativize(path).toString());
            if (path.equals(source)) {
                continue;
            }
            if (Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) {
                Files.createDirectories(dest);
            } else if (Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
                Files.copy(path, dest);
                try {
                    Files.setPosixFilePermissions(dest, Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS));
                } catch (UnsupportedOperationException e) {
                    // POSIX 권한을 모르는 파일 시스템은 기본 권한 그대로.
                }
            } else {
                throw new IOException("일반 파일이 아닌 항목이 있습니다");
            }
        }
    }

    /** {@code SOURCE.md}: 출처·커밋·버전·라이선스·가져온 날짜 네 줄. 이미 있으면 그 내용 뒤에 덧붙인다(FR-021-AC5). */
    private void writeSourceRecord(Path sourceFile, String source, String version, String license) throws IOException {
        String record = "출처: " + oneLine(source) + "\n"
                + "커밋·버전: " + (version == null || version.isBlank() ? "-" : oneLine(version)) + "\n"
                + "라이선스: " + oneLine(license) + "\n"
                + "가져온 날짜: " + LocalDate.now(clock) + "\n";
        byte[] recordBytes = record.getBytes(StandardCharsets.UTF_8);
        byte[] content = recordBytes;
        if (Files.isRegularFile(sourceFile, LinkOption.NOFOLLOW_LINKS)) {
            byte[] existing = Files.readAllBytes(sourceFile);
            byte[] separator = existing.length == 0 || existing[existing.length - 1] == '\n' ? new byte[] {'\n'} : new byte[] {'\n', '\n'};
            content = new byte[existing.length + separator.length + recordBytes.length];
            System.arraycopy(existing, 0, content, 0, existing.length);
            System.arraycopy(separator, 0, content, existing.length, separator.length);
            System.arraycopy(recordBytes, 0, content, existing.length + separator.length, recordBytes.length);
        }
        atomicFileWriter.write(sourceFile, content);
    }

    /** 줄바꿈을 공백으로 접어 기록이 항상 네 줄이 되게 한다. */
    private static String oneLine(String value) {
        return value.strip().replaceAll("\\s*[\\r\\n]+\\s*", " ");
    }

    // ------------------------------------------------------------------ 정리

    /** 30분이 지난 업로드 폴더를 지운다(기동 때와 10분마다, ADR-84). 지운 개수를 돌려준다. */
    public int deleteExpired() {
        return writeLock.runLocked(() -> {
            if (!Files.isDirectory(importRoot, LinkOption.NOFOLLOW_LINKS)) {
                return 0;
            }
            Instant now = clock.instant();
            int deleted = 0;
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(importRoot)) {
                for (Path dir : stream) {
                    if (isExpired(dir, now)) {
                        SkillWriter.deleteQuietly(dir);
                        deleted++;
                    }
                }
            } catch (IOException e) {
                log.warn("skill import cleanup failed: {}", e.getClass().getSimpleName());
            }
            return deleted;
        });
    }
}
