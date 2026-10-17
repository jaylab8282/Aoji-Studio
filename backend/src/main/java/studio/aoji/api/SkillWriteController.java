package studio.aoji.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.aoji.files.PathGuard;
import studio.aoji.files.WriteLock;
import studio.aoji.registry.RegistryService;
import studio.aoji.skills.SkillEntry;
import studio.aoji.skills.SkillMessages;
import studio.aoji.skills.SkillScanner;
import studio.aoji.skills.SkillTrashService;
import studio.aoji.skills.SkillWriter;
import studio.aoji.stream.SseHub;

/**
 * 스킬 만들기·수정·삭제 (api-spec {@code POST/PUT/DELETE /api/skills[/{skill}]}, FR-020·FR-022, ADR-84).
 * 모든 쓰기는 {@link WriteLock} 안에서 하고 끝나면 {@code rescanNow}로 registry를 갱신해 SSE로 방송한다.
 * DB 쓰기는 없다(D-160의 {@code EventRepository.locked()} 대상 아님).
 */
@RestController
@RequestMapping("/api/skills")
public class SkillWriteController {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9-]{1,64}$");

    private final SkillScanner skillScanner;
    private final SkillWriter skillWriter;
    private final SkillTrashService skillTrashService;
    private final RegistryService registryService;
    private final WriteLock writeLock;
    private final WriteAccessGuard writeAccessGuard;
    private final SseHub sseHub;
    private final PathGuard pathGuard;
    private final Clock clock;

    public SkillWriteController(
            SkillScanner skillScanner,
            SkillWriter skillWriter,
            SkillTrashService skillTrashService,
            RegistryService registryService,
            WriteLock writeLock,
            WriteAccessGuard writeAccessGuard,
            SseHub sseHub,
            PathGuard pathGuard,
            Clock clock) {
        this.skillScanner = skillScanner;
        this.skillWriter = skillWriter;
        this.skillTrashService = skillTrashService;
        this.registryService = registryService;
        this.writeLock = writeLock;
        this.writeAccessGuard = writeAccessGuard;
        this.sseHub = sseHub;
        this.pathGuard = pathGuard;
        this.clock = clock;
    }

    @PostMapping
    public ResponseEntity<SkillDetail> create(@RequestBody(required = false) SkillCreateRequest request) {
        writeAccessGuard.assertWritable();
        if (request == null) {
            throw ApiException.validation("name", SkillMessages.NAME_RULE);
        }
        String name = request.name();
        String description = request.description();
        Map<String, String> fields = new LinkedHashMap<>();
        if (name == null || !NAME_PATTERN.matcher(name).matches()) {
            fields.put("name", SkillMessages.NAME_RULE);
        }
        if (description == null || description.isBlank()) {
            fields.put("description", SkillMessages.REQUIRED);
        } else if (description.indexOf('\n') >= 0 || description.indexOf('\r') >= 0) {
            fields.put("description", SkillMessages.NO_LINE_BREAK);
        }
        if (!fields.isEmpty()) {
            throw ApiException.validation(fields);
        }
        boolean userOnly = Boolean.TRUE.equals(request.userOnly());
        String body = request.body() == null ? "" : request.body();

        SkillDetail detail = writeLock.runLocked(() -> {
            Path skillsDir = pathGuard.resolve(".claude", "skills");
            Path folder = pathGuard.resolve(".claude", "skills", name);
            if (Files.exists(folder, LinkOption.NOFOLLOW_LINKS)) {
                throw ApiException.validation("name", SkillMessages.NAME_EXISTS);
            }
            try {
                skillWriter.create(skillsDir, name, SkillWriter.buildNewContent(name, description, userOnly, body));
            } catch (IOException | RuntimeException e) {
                throw ApiException.ioFailed(SkillMessages.CREATE_FAILED);
            }
            rescanAndBroadcast();
            return detailOf(name, SkillMessages.CREATE_FAILED);
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(detail);
    }

    @PutMapping("/{skill}")
    public ResponseEntity<SkillDetail> update(
            @PathVariable("skill") String skill, @RequestBody(required = false) SkillUpdateRequest request) {
        writeAccessGuard.assertWritable();
        // api-spec SkillUpdateRequest: description·body 필수. (POST의 body는 선택이라 기본 "")
        Map<String, String> fields = new LinkedHashMap<>();
        String description = request == null ? null : request.description();
        if (description == null || description.isBlank()) {
            fields.put("description", SkillMessages.REQUIRED);
        } else if (description.indexOf('\n') >= 0 || description.indexOf('\r') >= 0) {
            fields.put("description", SkillMessages.NO_LINE_BREAK);
        }
        if (request == null || request.body() == null) {
            fields.put("body", SkillMessages.REQUIRED);
        }
        if (!fields.isEmpty()) {
            throw ApiException.validation(fields);
        }
        boolean userOnly = Boolean.TRUE.equals(request.userOnly());
        boolean force = Boolean.TRUE.equals(request.force());
        String body = request.body();
        if (!NAME_PATTERN.matcher(skill).matches()) {
            throw ApiException.skillNotFound();
        }

        SkillDetail detail = writeLock.runLocked(() -> {
            SkillEntry entry = skillScanner.find(pathGuard.mountRoot(), skill).orElseThrow(ApiException::skillNotFound);
            if (entry.formatError() != null) {
                throw ApiException.skillUneditable();
            }
            if (entry.imported()) {
                throw ApiException.skillImported();
            }
            if (!force && !entry.revision().equals(request.expectedRevision())) {
                throw ApiException.revisionConflict(
                        entry.revision(),
                        Instant.ofEpochMilli(entry.mtimeMillis()).atZone(clock.getZone()).toOffsetDateTime());
            }

            Path file = pathGuard.resolve(".claude", "skills", skill, "SKILL.md");
            pathGuard.assertNotSymlink(file);
            String original;
            try {
                original = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            } catch (NoSuchFileException e) {
                throw ApiException.fileGone();
            } catch (IOException e) {
                throw ApiException.ioFailed(SkillMessages.UPDATE_FAILED);
            }
            try {
                String updated = skillWriter.buildUpdatedContent(
                        original, entry.description(), entry.userOnly(), description, userOnly, body);
                skillWriter.write(file, updated);
            } catch (IOException | RuntimeException e) {
                throw ApiException.ioFailed(SkillMessages.UPDATE_FAILED);
            }
            rescanAndBroadcast();
            return detailOf(skill, SkillMessages.UPDATE_FAILED);
        });
        return ResponseEntity.ok(detail);
    }

    @DeleteMapping("/{skill}")
    public ResponseEntity<SkillRemoveResult> delete(@PathVariable("skill") String skill) {
        writeAccessGuard.assertWritable();
        if (!NAME_PATTERN.matcher(skill).matches()) {
            throw ApiException.skillNotFound();
        }
        SkillRemoveResult result = writeLock.runLocked(() -> {
            skillScanner.find(pathGuard.mountRoot(), skill).orElseThrow(ApiException::skillNotFound);
            Path folder = pathGuard.resolve(".claude", "skills", skill);
            String trashPath;
            try {
                trashPath = skillTrashService.move(pathGuard, folder, skill);
            } catch (IOException | RuntimeException e) {
                throw ApiException.ioFailed(SkillMessages.TRASH_FAILED);
            }
            rescanAndBroadcast();
            return new SkillRemoveResult(trashPath);
        });
        return ResponseEntity.ok(result);
    }

    private void rescanAndBroadcast() {
        registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot));
    }

    private SkillDetail detailOf(String name, String failureMessage) {
        SkillEntry entry = skillScanner.find(pathGuard.mountRoot(), name).orElseThrow(() -> ApiException.ioFailed(failureMessage));
        return new SkillDetail(
                entry.name(),
                entry.description(),
                entry.userOnly(),
                entry.body(),
                entry.filePath(),
                entry.revision(),
                Instant.ofEpochMilli(entry.mtimeMillis()).atZone(clock.getZone()).toOffsetDateTime(),
                entry.imported());
    }

    /** api-spec {@code SkillCreateRequest}. */
    public record SkillCreateRequest(String name, String description, Boolean userOnly, String body) {}

    /** api-spec {@code SkillUpdateRequest}. */
    public record SkillUpdateRequest(
            String description, Boolean userOnly, String body, String expectedRevision, Boolean force) {}

    /** DELETE 응답. */
    public record SkillRemoveResult(String trashPath) {}
}
