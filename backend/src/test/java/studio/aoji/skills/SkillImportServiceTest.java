package studio.aoji.skills;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.spy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import studio.aoji.files.AtomicFileWriter;
import studio.aoji.files.PathGuard;
import studio.aoji.files.WriteLock;
import studio.aoji.support.ZipBuilder;

/** {@link SkillImportService} (T-R4-10, FR-021-AC1~AC6·E1~E5). 모든 zip은 임시 폴더에 만든다. */
class SkillImportServiceTest {

    @TempDir
    Path tmp;

    Path mount;
    Path data;
    Path importRoot;
    MutableClock clock;
    SkillWriter skillWriter;
    AtomicFileWriter atomicFileWriter;
    SkillImportService service;

    private static final String SKILL_MD = "---\nname: palette\ndescription: 색 고르기\n---\n본문\n";

    @BeforeEach
    void setUp() throws IOException {
        mount = Files.createDirectory(tmp.resolve("mount"));
        data = Files.createDirectory(tmp.resolve("data"));
        importRoot = data.resolve("skill-import");
        clock = new MutableClock(Instant.parse("2026-10-16T01:00:00Z"));
        atomicFileWriter = spy(new AtomicFileWriter());
        skillWriter = spy(new SkillWriter(atomicFileWriter));
        service = newService();
    }

    private SkillImportService newService() {
        return new SkillImportService(
                importRoot, new PathGuard(mount), skillWriter, atomicFileWriter, new SkillFileParser(), new WriteLock(), clock);
    }

    private Path zipPath(String name) {
        return tmp.resolve(name + ".zip");
    }

    private SkillImportPreview preview(Path zip) throws IOException {
        try (InputStream in = Files.newInputStream(zip)) {
            return service.preview(Files.size(zip), in);
        }
    }

    private SkillImportException rejection(Path zip) {
        try (InputStream in = Files.newInputStream(zip)) {
            long size = Files.size(zip);
            return org.junit.jupiter.api.Assertions.assertThrows(SkillImportException.class, () -> service.preview(size, in));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private Path skillsDir() {
        return mount.resolve(".claude").resolve("skills");
    }

    private List<String> importRootEntries() throws IOException {
        if (!Files.exists(importRoot)) {
            return List.of();
        }
        try (Stream<Path> s = Files.walk(importRoot)) {
            return s.filter(p -> !p.equals(importRoot)).map(p -> importRoot.relativize(p).toString()).toList();
        }
    }

    private List<String> mountEntries() throws IOException {
        try (Stream<Path> s = Files.walk(mount)) {
            return s.filter(p -> !p.equals(mount)).map(p -> mount.relativize(p).toString()).toList();
        }
    }

    // ------------------------------------------------------------------ AC1

    @Test
    @DisplayName("[FR-021-AC1] 구조 ① 맨 위 SKILL.md: 이름 = frontmatter name, 설명·파일 목록")
    void structureOneUsesFrontmatterName() throws Exception {
        Path zip = zipPath("one");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD).file("notes/readme.txt", "읽어 보세요");
        }

        SkillImportPreview preview = preview(zip);

        assertThat(preview.name()).isEqualTo("palette");
        assertThat(preview.description()).isEqualTo("색 고르기");
        assertThat(preview.files()).extracting(SkillImportPreview.FileInfo::path).containsExactly("SKILL.md", "notes/readme.txt");
        assertThat(preview.fileCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("[FR-021-AC1] 구조 ② 맨 위 폴더 하나: frontmatter name이 우선, 없으면 폴더 이름, 파일 목록은 폴더를 뺀 경로")
    void structureTwoUsesFrontmatterNameOrFolderName() throws Exception {
        Path withName = zipPath("two-named");
        try (ZipBuilder b = ZipBuilder.at(withName)) {
            b.file("wrapper/SKILL.md", SKILL_MD).file("wrapper/ref/a.md", "a");
        }
        SkillImportPreview named = preview(withName);
        assertThat(named.name()).isEqualTo("palette");
        assertThat(named.files()).extracting(SkillImportPreview.FileInfo::path).containsExactly("SKILL.md", "ref/a.md");

        Path withoutName = zipPath("two-unnamed");
        try (ZipBuilder b = ZipBuilder.at(withoutName)) {
            b.file("folder-name/SKILL.md", "---\ndescription: 이름 없음\n---\n본문").file("folder-name/x.md", "x");
        }
        SkillImportPreview unnamed = preview(withoutName);
        assertThat(unnamed.name()).isEqualTo("folder-name");
        assertThat(unnamed.description()).isEqualTo("이름 없음");
    }

    @Test
    @DisplayName("[FR-021-AC1][FR-021-E3] 이름 규칙 위반(대문자·65자·① 구조에 name 없음) → NAME_INVALID, 푼 것 0")
    void invalidNameIsRejected() throws Exception {
        Path upper = zipPath("upper");
        try (ZipBuilder b = ZipBuilder.at(upper)) {
            b.file("Bad_Name/SKILL.md", "---\ndescription: d\n---\n");
        }
        SkillImportException e = rejection(upper);
        assertThat(e.reason()).isEqualTo(SkillImportRejectReason.NAME_INVALID);
        assertThat(e.name()).isEqualTo("Bad_Name");
        assertThat(SkillMessages.importRejected(e.reason(), e.entry(), e.name()))
                .isEqualTo("스킬 이름 Bad_Name · 소문자·숫자·하이픈만, 1~64자");

        Path longName = zipPath("long");
        try (ZipBuilder b = ZipBuilder.at(longName)) {
            b.file("SKILL.md", "---\nname: " + "a".repeat(65) + "\n---\n");
        }
        assertThat(rejection(longName).reason()).isEqualTo(SkillImportRejectReason.NAME_INVALID);

        Path noName = zipPath("no-name");
        try (ZipBuilder b = ZipBuilder.at(noName)) {
            b.file("SKILL.md", "---\ndescription: d\n---\n");
        }
        assertThat(rejection(noName).reason()).isEqualTo(SkillImportRejectReason.NAME_INVALID);
        assertThat(importRootEntries()).isEmpty();
    }

    // ------------------------------------------------------------------ AC2

    @Test
    @DisplayName("[FR-021-AC2] 10MB 초과: 알려 준 크기 초과·실제 스트림 초과 모두 TOO_LARGE, 아무것도 안 남김")
    void zipOverTenMegabytesIsRejected() throws Exception {
        SkillImportException declared = org.junit.jupiter.api.Assertions.assertThrows(
                SkillImportException.class,
                () -> service.preview(SkillImportService.MAX_ZIP_BYTES + 1, new ByteArrayInputStream(new byte[0])));
        assertThat(declared.reason()).isEqualTo(SkillImportRejectReason.TOO_LARGE);

        // 알려 준 크기를 속여도 읽는 바이트로 막는다.
        InputStream endless = new InputStream() {
            long left = SkillImportService.MAX_ZIP_BYTES + 5;

            @Override
            public int read() {
                return left-- > 0 ? 'P' : -1;
            }

            @Override
            public int read(byte[] b, int off, int len) {
                if (left <= 0) {
                    return -1;
                }
                int n = (int) Math.min(len, left);
                java.util.Arrays.fill(b, off, off + n, (byte) 'P');
                left -= n;
                return n;
            }
        };
        SkillImportException actual =
                org.junit.jupiter.api.Assertions.assertThrows(SkillImportException.class, () -> service.preview(1, endless));
        assertThat(actual.reason()).isEqualTo(SkillImportRejectReason.TOO_LARGE);
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-AC2] 파일 501개 → TOO_MANY_FILES, 500개는 통과")
    void fileCountLimit() throws Exception {
        Path ok = zipPath("five-hundred");
        try (ZipBuilder b = ZipBuilder.at(ok)) {
            b.file("SKILL.md", SKILL_MD);
            for (int i = 1; i < 500; i++) {
                b.file("f/" + i + ".txt", "x");
            }
        }
        assertThat(preview(ok).fileCount()).isEqualTo(500);

        Path over = zipPath("five-hundred-one");
        try (ZipBuilder b = ZipBuilder.at(over)) {
            b.file("SKILL.md", SKILL_MD);
            for (int i = 1; i <= 500; i++) {
                b.file("f/" + i + ".txt", "x");
            }
        }
        SkillImportException e = rejection(over);
        assertThat(e.reason()).isEqualTo(SkillImportRejectReason.TOO_MANY_FILES);
        assertThat(SkillMessages.importRejected(e.reason(), null, null)).isEqualTo("파일이 500개를 넘습니다");
    }

    @Test
    @DisplayName("[FR-021-AC2] 압축 폭탄(풀면 60MB) → UNPACKED_TOO_LARGE, 디스크에는 50MB까지만 쓰고 멈춘 뒤 모두 지움")
    void zipBombStopsAtFiftyMegabytes() throws Exception {
        Path zip = zipPath("bomb");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("bomb/SKILL.md", SKILL_MD).zeros("bomb/big.bin", 60L * 1024 * 1024);
        }
        assertThat(Files.size(zip)).isLessThan(SkillImportService.MAX_ZIP_BYTES);
        AtomicLong written = new AtomicLong();
        service.extractionObserver = written::set;

        SkillImportException e = rejection(zip);

        assertThat(e.reason()).isEqualTo(SkillImportRejectReason.UNPACKED_TOO_LARGE);
        assertThat(e.entry()).isEqualTo("bomb/big.bin");
        assertThat(written.get()).isLessThanOrEqualTo(SkillImportService.MAX_UNPACKED_BYTES);
        assertThat(written.get()).isGreaterThan(SkillImportService.MAX_UNPACKED_BYTES - 128 * 1024);
        assertThat(importRootEntries()).isEmpty();
        assertThat(SkillMessages.importRejected(e.reason(), e.entry(), null)).isEqualTo("풀었을 때 50MB를 넘습니다");
    }

    // ------------------------------------------------------------------ AC3

    @Test
    @DisplayName("[FR-021-AC3][FR-021-E2] 절대 경로·경로 이탈·심볼릭 링크 항목 하나 → 전체 거부, details.entry, /data·마운트에 남은 것 0")
    void dangerousEntryRejectsEverything() throws Exception {
        record Case(String entry, SkillImportRejectReason reason, String message) {}
        List<Case> cases = List.of(
                new Case("/abs/evil.txt", SkillImportRejectReason.ABSOLUTE_PATH, "가져올 수 없는 항목이 있습니다 · /abs/evil.txt · 절대 경로"),
                new Case("C:\\x\\evil.txt", SkillImportRejectReason.ABSOLUTE_PATH, "가져올 수 없는 항목이 있습니다 · C:\\x\\evil.txt · 절대 경로"),
                new Case("\\\\server\\share", SkillImportRejectReason.ABSOLUTE_PATH, "가져올 수 없는 항목이 있습니다 · \\\\server\\share · 절대 경로"),
                new Case("../../etc/passwd", SkillImportRejectReason.PATH_TRAVERSAL, "가져올 수 없는 항목이 있습니다 · ../../etc/passwd · 경로 이탈"),
                new Case("scripts/../../etc", SkillImportRejectReason.PATH_TRAVERSAL, "가져올 수 없는 항목이 있습니다 · scripts/../../etc · 경로 이탈"),
                new Case("scripts\\..\\..\\etc", SkillImportRejectReason.PATH_TRAVERSAL, "가져올 수 없는 항목이 있습니다 · scripts\\..\\..\\etc · 경로 이탈"),
                new Case("link-to-etc", SkillImportRejectReason.SYMLINK, "가져올 수 없는 항목이 있습니다 · link-to-etc · 심볼릭 링크"));
        for (Case c : cases) {
            Path zip = zipPath("danger");
            Files.deleteIfExists(zip);
            try (ZipBuilder b = ZipBuilder.at(zip)) {
                b.file("SKILL.md", SKILL_MD).file("ok.txt", "정상");
                if (c.reason() == SkillImportRejectReason.SYMLINK) {
                    b.symlink(c.entry(), "/etc");
                } else {
                    b.file(c.entry(), "나쁨");
                }
            }

            SkillImportException e = rejection(zip);

            assertThat(e.reason()).as(c.entry()).isEqualTo(c.reason());
            assertThat(e.entry()).as(c.entry()).isEqualTo(c.entry());
            assertThat(SkillMessages.importRejected(e.reason(), e.entry(), null)).isEqualTo(c.message());
            assertThat(importRootEntries()).as(c.entry()).isEmpty();
            assertThat(mountEntries()).as(c.entry()).isEmpty();
        }
    }

    @Test
    @DisplayName("[FR-021-AC3] 루트 안에 머무는 ../ 는 접어서 정리한다(a/../b → b), 심볼릭 링크 폴더 항목도 거부")
    void insideDotDotIsNormalizedAndDirectorySymlinkRejected() throws Exception {
        assertThat(SkillImportService.normalize("a/../b.txt")).isEqualTo("b.txt");
        assertThat(SkillImportService.normalize("./a//b/")).isEqualTo("a/b");

        Path zip = zipPath("dirlink");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD).symlink("refs/", "/");
        }
        assertThat(rejection(zip).reason()).isEqualTo(SkillImportRejectReason.SYMLINK);
        assertThat(importRootEntries()).isEmpty();
    }

    // ------------------------------------------------------------------ AC4

    @Test
    @DisplayName("[FR-021-AC4] 스크립트(확장자·#!)·실행 비트·scriptCount·경로 오름차순·크기")
    void scriptAndExecutableMarks() throws Exception {
        Path zip = zipPath("scripts");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("palette/SKILL.md", SKILL_MD)
                    .file("palette/scripts/run.SH", "echo hi")
                    .file("palette/tools/noext", "#!/usr/bin/env node\nconsole.log(1)")
                    .file("palette/bin/tool", "ELF", 0755)
                    .file("palette/data.txt", "그냥 글");
        }

        SkillImportPreview preview = preview(zip);

        assertThat(preview.files()).extracting(SkillImportPreview.FileInfo::path)
                .containsExactly("SKILL.md", "bin/tool", "data.txt", "scripts/run.SH", "tools/noext");
        java.util.Map<String, SkillImportPreview.FileInfo> byPath = new java.util.HashMap<>();
        preview.files().forEach(f -> byPath.put(f.path(), f));
        assertThat(byPath.get("scripts/run.SH").script()).isTrue();
        assertThat(byPath.get("scripts/run.SH").executable()).isFalse();
        assertThat(byPath.get("tools/noext").script()).isTrue();
        assertThat(byPath.get("bin/tool").script()).isFalse();
        assertThat(byPath.get("bin/tool").executable()).isTrue();
        assertThat(byPath.get("data.txt").script()).isFalse();
        assertThat(byPath.get("data.txt").executable()).isFalse();
        assertThat(byPath.get("data.txt").size()).isEqualTo("그냥 글".getBytes(StandardCharsets.UTF_8).length);
        assertThat(preview.scriptCount()).isEqualTo(2);
        assertThat(preview.unpackedBytes()).isEqualTo(preview.files().stream().mapToLong(SkillImportPreview.FileInfo::size).sum());
        assertThat(preview.hasSourceMd()).isFalse();
    }

    @Test
    @DisplayName("[FR-021-AC4] 미리보기는 마운트에 아무것도 쓰지 않고 expiresAt = 지금 + 30분")
    void previewWritesOnlyToDataVolume() throws Exception {
        Path zip = zipPath("plain");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }

        SkillImportPreview preview = preview(zip);

        assertThat(mountEntries()).isEmpty();
        assertThat(preview.expiresAt().toInstant()).isEqualTo(clock.instant().plus(Duration.ofMinutes(30)));
        assertThat(Files.isDirectory(importRoot.resolve(preview.uploadId()).resolve("files"))).isTrue();
    }

    // ------------------------------------------------------------------ AC5

    @Test
    @DisplayName("[FR-021-AC5] SOURCE.md 네 줄(출처·커밋·버전·라이선스·가져온 날짜), 파일은 그대로 복사, 실행 비트 유지")
    void sourceRecordHasFourLines() throws Exception {
        Path zip = zipPath("src");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD).file("scripts/run.sh", "#!/bin/sh\necho", 0755);
        }
        SkillImportPreview preview = preview(zip);

        String name = service.importUpload(preview.uploadId(), "https://github.com/acme/palette", "v1.2.0", "MIT");

        assertThat(name).isEqualTo("palette");
        Path folder = skillsDir().resolve("palette");
        assertThat(Files.readString(folder.resolve("SOURCE.md")))
                .isEqualTo("출처: https://github.com/acme/palette\n커밋·버전: v1.2.0\n라이선스: MIT\n가져온 날짜: 2026-10-16\n");
        assertThat(Files.readString(folder.resolve("SKILL.md"))).isEqualTo(SKILL_MD);
        Set<PosixFilePermission> perms = Files.getPosixFilePermissions(folder.resolve("scripts/run.sh"));
        assertThat(perms).contains(PosixFilePermission.OWNER_EXECUTE);
        assertThat(Files.getPosixFilePermissions(folder.resolve("SKILL.md"))).doesNotContain(PosixFilePermission.OWNER_EXECUTE);
        // 임시 폴더·업로드 폴더가 남지 않는다.
        assertThat(mountEntries().stream().filter(p -> p.contains(".tmp"))).isEmpty();
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-AC5] 버전 비면 '-', 값 안 줄바꿈은 공백으로 접어 항상 네 줄")
    void sourceRecordStaysFourLines() throws Exception {
        Path zip = zipPath("src-oneline");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }
        SkillImportPreview preview = preview(zip);

        service.importUpload(preview.uploadId(), "첫 줄\n둘째 줄\r\n셋째", "  ", "MIT\nGPL");

        String source = Files.readString(skillsDir().resolve("palette").resolve("SOURCE.md"));
        assertThat(source.split("\n")).containsExactly("출처: 첫 줄 둘째 줄 셋째", "커밋·버전: -", "라이선스: MIT GPL", "가져온 날짜: 2026-10-16");
    }

    @Test
    @DisplayName("[FR-021-AC5] zip 안에 SOURCE.md가 있으면 그 내용 뒤에 덧붙임(앞 내용 바이트 보존), hasSourceMd=true")
    void existingSourceMdIsAppendedTo() throws Exception {
        Path zip = zipPath("src-existing");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD).file("SOURCE.md", "원래 출처: 다른 저장소\n원래 라이선스: Apache-2.0");
        }
        SkillImportPreview preview = preview(zip);
        assertThat(preview.hasSourceMd()).isTrue();

        service.importUpload(preview.uploadId(), "https://example.org/skill", null, "MIT");

        assertThat(Files.readString(skillsDir().resolve("palette").resolve("SOURCE.md")))
                .isEqualTo("원래 출처: 다른 저장소\n원래 라이선스: Apache-2.0\n\n"
                        + "출처: https://example.org/skill\n커밋·버전: -\n라이선스: MIT\n가져온 날짜: 2026-10-16\n");
    }

    // ------------------------------------------------------------------ AC6, E5

    @Test
    @DisplayName("[FR-021-AC6] 이름 바꾸기(이동) 중 실패 주입 → 마운트에 아무것도 없음(임시 폴더·만든 skills 폴더·업로드 폴더)")
    void moveFailureLeavesNothingInMount() throws Exception {
        Path zip = zipPath("move-fail");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD).file("a/b.txt", "b");
        }
        SkillImportPreview preview = preview(zip);
        doThrow(new IOException("주입된 실패")).when(skillWriter).moveIntoPlace(any(), any());

        SkillImportException e = org.junit.jupiter.api.Assertions.assertThrows(
                SkillImportException.class, () -> service.importUpload(preview.uploadId(), "src", null, "MIT"));

        assertThat(e.kind()).isEqualTo(SkillImportException.Kind.IO_FAILED);
        assertThat(mountEntries()).isEmpty();
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E5] SOURCE.md 쓰기 실패 → IO_FAILED, 이미 있던 skills 폴더의 다른 스킬은 그대로, 임시 폴더 0")
    void sourceWriteFailureLeavesNothingNew() throws Exception {
        Files.createDirectories(skillsDir().resolve("existing"));
        Files.writeString(skillsDir().resolve("existing").resolve("SKILL.md"), "---\nname: existing\n---\n");
        Path zip = zipPath("write-fail");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }
        SkillImportPreview preview = preview(zip);
        doThrow(new IOException("주입된 실패")).when(atomicFileWriter).write(any(), any());

        SkillImportException e = org.junit.jupiter.api.Assertions.assertThrows(
                SkillImportException.class, () -> service.importUpload(preview.uploadId(), "src", null, "MIT"));

        assertThat(e.kind()).isEqualTo(SkillImportException.Kind.IO_FAILED);
        assertThat(e.getMessage()).doesNotContain("주입된 실패");
        try (Stream<Path> s = Files.list(skillsDir())) {
            assertThat(s.map(p -> p.getFileName().toString()).toList()).containsExactly("existing");
        }
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E5] 미리보기 중 쓰기 실패(데이터 볼륨) → IO_FAILED, 푼 것 0")
    void previewWriteFailureLeavesNothing() throws Exception {
        Path zip = zipPath("preview-write-fail");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }
        doThrow(new IOException("주입된 실패")).when(atomicFileWriter).write(any(), any());

        SkillImportException e = org.junit.jupiter.api.Assertions.assertThrows(SkillImportException.class, () -> preview(zip));

        assertThat(e.kind()).isEqualTo(SkillImportException.Kind.IO_FAILED);
        assertThat(importRootEntries()).isEmpty();
        assertThat(mountEntries()).isEmpty();
    }

    // ------------------------------------------------------------------ E1

    @Test
    @DisplayName("[FR-021-E1] zip 아님(텍스트·빈 파일)→ NOT_ZIP, 잘림·CRC 불일치 → CORRUPT, 문구 동일")
    void notZipOrCorrupt() throws Exception {
        Path text = zipPath("text");
        Files.writeString(text, "이건 zip이 아닙니다");
        assertThat(rejection(text).reason()).isEqualTo(SkillImportRejectReason.NOT_ZIP);

        Path empty = zipPath("empty");
        Files.write(empty, new byte[0]);
        assertThat(rejection(empty).reason()).isEqualTo(SkillImportRejectReason.NOT_ZIP);

        Path good = zipPath("good");
        try (ZipBuilder b = ZipBuilder.at(good)) {
            b.file("SKILL.md", SKILL_MD).file("a.txt", "x".repeat(2000));
        }
        byte[] bytes = Files.readAllBytes(good);
        Path truncated = zipPath("truncated");
        Files.write(truncated, java.util.Arrays.copyOf(bytes, bytes.length - 40));
        SkillImportException cut = rejection(truncated);
        assertThat(cut.reason()).isEqualTo(SkillImportRejectReason.CORRUPT);
        assertThat(SkillMessages.importRejected(cut.reason(), null, null)).isEqualTo("zip 파일이 아니거나 손상되었습니다");

        Path stored = zipPath("stored");
        try (ZipBuilder b = ZipBuilder.at(stored)) {
            b.file("SKILL.md", SKILL_MD).stored("data.txt", "ABCDEFGHIJ");
        }
        byte[] storedBytes = Files.readAllBytes(stored);
        int at = indexOf(storedBytes, "ABCDEFGHIJ".getBytes(StandardCharsets.UTF_8));
        storedBytes[at] = 'Z';
        Path crc = zipPath("crc");
        Files.write(crc, storedBytes);
        assertThat(rejection(crc).reason()).isEqualTo(SkillImportRejectReason.CORRUPT);
        assertThat(importRootEntries()).isEmpty();
    }

    @Test
    @DisplayName("[FR-021-E1] SKILL.md가 맨 위·맨 위 폴더 하나 안에 없으면 NO_SKILL_MD (여러 최상위 폴더·깊은 위치·빈 zip)")
    void noSkillMd() throws Exception {
        Path other = zipPath("no-skill");
        try (ZipBuilder b = ZipBuilder.at(other)) {
            b.file("readme.md", "r");
        }
        SkillImportException e = rejection(other);
        assertThat(e.reason()).isEqualTo(SkillImportRejectReason.NO_SKILL_MD);
        assertThat(SkillMessages.importRejected(e.reason(), null, null)).isEqualTo("맨 위나 맨 위 폴더 하나 안에 SKILL.md가 없습니다");

        Path two = zipPath("two-top");
        try (ZipBuilder b = ZipBuilder.at(two)) {
            b.file("a/SKILL.md", SKILL_MD).file("b/x.md", "x");
        }
        assertThat(rejection(two).reason()).isEqualTo(SkillImportRejectReason.NO_SKILL_MD);

        Path deep = zipPath("deep");
        try (ZipBuilder b = ZipBuilder.at(deep)) {
            b.file("a/b/SKILL.md", SKILL_MD);
        }
        assertThat(rejection(deep).reason()).isEqualTo(SkillImportRejectReason.NO_SKILL_MD);

        Path none = zipPath("none");
        try (ZipBuilder b = ZipBuilder.at(none)) {
            // 항목 없는 zip
        }
        assertThat(rejection(none).reason()).isEqualTo(SkillImportRejectReason.NO_SKILL_MD);
        assertThat(importRootEntries()).isEmpty();
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i <= haystack.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return i;
        }
        throw new IllegalStateException("not found");
    }

    // ------------------------------------------------------------------ E3

    @Test
    @DisplayName("[FR-021-E3] 이름 중복: 미리보기 때(기존 폴더) NAME_EXISTS, 가져오기 때(그사이 생김) NAME_EXISTS, 기존 폴더 불변")
    void nameExistsAtPreviewAndAtImport() throws Exception {
        Path zip = zipPath("dup");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }
        SkillImportPreview preview = preview(zip);

        Files.createDirectories(skillsDir().resolve("palette"));
        Files.writeString(skillsDir().resolve("palette").resolve("SKILL.md"), "기존");
        SkillImportException atImport = org.junit.jupiter.api.Assertions.assertThrows(
                SkillImportException.class, () -> service.importUpload(preview.uploadId(), "src", null, "MIT"));
        assertThat(atImport.reason()).isEqualTo(SkillImportRejectReason.NAME_EXISTS);
        assertThat(SkillMessages.importRejected(atImport.reason(), null, atImport.name()))
                .isEqualTo("스킬 이름 palette · 이미 있는 이름입니다");
        assertThat(Files.readString(skillsDir().resolve("palette").resolve("SKILL.md"))).isEqualTo("기존");
        assertThat(importRootEntries()).isEmpty();

        SkillImportException atPreview = rejection(zip);
        assertThat(atPreview.reason()).isEqualTo(SkillImportRejectReason.NAME_EXISTS);
        assertThat(Files.readString(skillsDir().resolve("palette").resolve("SKILL.md"))).isEqualTo("기존");
        assertThat(mountEntries().stream().filter(p -> p.contains(".tmp"))).isEmpty();
    }

    // ------------------------------------------------------------------ 만료·정리

    @Test
    @DisplayName("[FR-021-E5] 30분 지난 uploadId → UPLOAD_NOT_FOUND(폴더도 지움), 29분은 유효, UUID 아닌 id는 없는 것")
    void expiredOrUnknownUploadIsNotFound() throws Exception {
        Path zip = zipPath("expire");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }
        SkillImportPreview fresh = preview(zip);
        clock.advance(Duration.ofMinutes(29));
        assertThat(service.importUpload(fresh.uploadId(), "src", null, "MIT")).isEqualTo("palette");

        Path zip2 = zipPath("expire2");
        try (ZipBuilder b = ZipBuilder.at(zip2)) {
            b.file("SKILL.md", "---\nname: other-one\n---\n");
        }
        SkillImportPreview old = preview(zip2);
        clock.advance(Duration.ofMinutes(30));
        SkillImportException e = org.junit.jupiter.api.Assertions.assertThrows(
                SkillImportException.class, () -> service.importUpload(old.uploadId(), "src", null, "MIT"));
        assertThat(e.kind()).isEqualTo(SkillImportException.Kind.UPLOAD_NOT_FOUND);
        assertThat(Files.exists(importRoot.resolve(old.uploadId()))).isFalse();
        assertThat(Files.exists(skillsDir().resolve("other-one"))).isFalse();

        for (String bad : new String[] {null, "", "../x", "not-a-uuid", "00000000-0000-0000-0000-000000000000"}) {
            SkillImportException notFound = org.junit.jupiter.api.Assertions.assertThrows(
                    SkillImportException.class, () -> service.importUpload(bad, "src", null, "MIT"));
            assertThat(notFound.kind()).as(String.valueOf(bad)).isEqualTo(SkillImportException.Kind.UPLOAD_NOT_FOUND);
        }
    }

    @Test
    @DisplayName("[FR-021-E5] 정리 작업: 30분 지난 업로드 폴더만 지운다(기동 때·10분마다 같은 호출), 최근 것은 남김")
    void cleanupJobDeletesOnlyExpired() throws Exception {
        Path zip = zipPath("cleanup");
        try (ZipBuilder b = ZipBuilder.at(zip)) {
            b.file("SKILL.md", SKILL_MD);
        }
        SkillImportPreview old = preview(zip);
        clock.advance(Duration.ofMinutes(20));
        Path zip2 = zipPath("cleanup2");
        try (ZipBuilder b = ZipBuilder.at(zip2)) {
            b.file("SKILL.md", "---\nname: newer\n---\n");
        }
        SkillImportPreview newer = preview(zip2);
        clock.advance(Duration.ofMinutes(11));
        SkillImportCleanupJob job = new SkillImportCleanupJob(service);

        assertThat(job.run()).isEqualTo(1);

        assertThat(Files.exists(importRoot.resolve(old.uploadId()))).isFalse();
        assertThat(Files.isDirectory(importRoot.resolve(newer.uploadId()))).isTrue();
        assertThat(job.run()).isZero();
        // 폴더가 아직 없는 경우(첫 기동)에도 실패하지 않는다.
        Files.walk(importRoot).sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        assertThat(job.run()).isZero();
    }

    /** 테스트가 시각을 앞으로 돌리는 시계. */
    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
