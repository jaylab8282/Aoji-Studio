package studio.aoji.skills;

import java.time.OffsetDateTime;
import java.util.List;

/** api-spec {@code SkillImportPreview}. */
public record SkillImportPreview(
        String uploadId,
        OffsetDateTime expiresAt,
        String name,
        String description,
        List<FileInfo> files,
        int fileCount,
        long unpackedBytes,
        int scriptCount,
        boolean hasSourceMd) {

    /** 미리보기 파일 한 줄. */
    public record FileInfo(String path, long size, boolean script, boolean executable) {}
}
