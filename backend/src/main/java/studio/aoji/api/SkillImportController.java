package studio.aoji.api;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import studio.aoji.files.PathGuard;
import studio.aoji.files.WriteLock;
import studio.aoji.live.LiveStateService;
import studio.aoji.registry.RegistryService;
import studio.aoji.skills.SkillEntry;
import studio.aoji.skills.SkillImportException;
import studio.aoji.skills.SkillImportPreview;
import studio.aoji.skills.SkillImportRejectReason;
import studio.aoji.skills.SkillImportService;
import studio.aoji.skills.SkillMessages;
import studio.aoji.skills.SkillScanner;
import studio.aoji.stream.SseHub;

/**
 * 스킬 zip 가져오기 (api-spec {@code POST /api/skills/import/preview}·{@code POST /api/skills/import},
 * FR-021, ADR-84 결정 6). 미리보기는 마운트에 아무것도 쓰지 않는다. 가져오기는 {@link WriteLock} 안에서 하고 끝나면
 * {@code rescanNow}로 registry를 갱신해 SSE로 방송한다. DB 쓰기는 없다.
 */
@RestController
@RequestMapping("/api/skills/import")
public class SkillImportController {

    private final SkillImportService skillImportService;
    private final SkillScanner skillScanner;
    private final RegistryService registryService;
    private final WriteLock writeLock;
    private final WriteAccessGuard writeAccessGuard;
    private final SseHub sseHub;
    private final LiveStateService liveStateService;
    private final PathGuard pathGuard;
    private final Clock clock;

    public SkillImportController(
            SkillImportService skillImportService,
            SkillScanner skillScanner,
            RegistryService registryService,
            WriteLock writeLock,
            WriteAccessGuard writeAccessGuard,
            SseHub sseHub,
            LiveStateService liveStateService,
            PathGuard pathGuard,
            Clock clock) {
        this.skillImportService = skillImportService;
        this.skillScanner = skillScanner;
        this.registryService = registryService;
        this.writeLock = writeLock;
        this.writeAccessGuard = writeAccessGuard;
        this.sseHub = sseHub;
        this.liveStateService = liveStateService;
        this.pathGuard = pathGuard;
        this.clock = clock;
    }

    @PostMapping(path = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SkillImportPreview preview(@RequestParam(value = "file", required = false) MultipartFile file) {
        writeAccessGuard.assertWritable();
        if (file == null || file.isEmpty()) {
            throw ApiException.importRejected(SkillImportRejectReason.NOT_ZIP, null, null);
        }
        try (InputStream in = file.getInputStream()) {
            return skillImportService.preview(file.getSize(), in);
        } catch (SkillImportException e) {
            throw toApi(e);
        } catch (IOException e) {
            throw ApiException.ioFailed(SkillMessages.IMPORT_FAILED);
        }
    }

    @PostMapping
    public ResponseEntity<SkillDetail> importSkill(@RequestBody(required = false) SkillImportRequest request) {
        writeAccessGuard.assertWritable();
        Map<String, String> fields = new LinkedHashMap<>();
        if (request == null || request.source() == null || request.source().isBlank()) {
            fields.put("source", SkillMessages.REQUIRED);
        }
        if (request == null || request.license() == null || request.license().isBlank()) {
            fields.put("license", SkillMessages.REQUIRED);
        }
        if (!fields.isEmpty()) {
            throw ApiException.validation(fields);
        }

        SkillDetail detail = writeLock.runLocked(() -> {
            String name;
            try {
                name = skillImportService.importUpload(
                        request.uploadId(), request.source(), request.version(), request.license());
            } catch (SkillImportException e) {
                throw toApi(e);
            }
            registryService.rescanNow(snapshot -> sseHub.broadcast(snapshot, liveStateService.live()));
            return detailOf(name);
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(detail);
    }

    private SkillDetail detailOf(String name) {
        SkillEntry entry = skillScanner
                .find(pathGuard.mountRoot(), name)
                .orElseThrow(() -> ApiException.ioFailed(SkillMessages.IMPORT_FAILED));
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

    private static ApiException toApi(SkillImportException e) {
        return switch (e.kind()) {
            case REJECTED -> ApiException.importRejected(e.reason(), e.entry(), e.name());
            case UPLOAD_NOT_FOUND -> ApiException.uploadNotFound();
            case IO_FAILED -> ApiException.ioFailed(SkillMessages.IMPORT_FAILED);
        };
    }

    /** api-spec {@code SkillImportRequest}. */
    public record SkillImportRequest(String uploadId, String source, String version, String license) {}
}
