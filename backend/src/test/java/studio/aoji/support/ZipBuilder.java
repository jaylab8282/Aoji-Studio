package studio.aoji.support;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import org.apache.commons.compress.archivers.zip.UnixStat;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream;

/** 테스트용 zip 생성기. 항상 임시 폴더에 만든다(바이너리를 커밋하지 않는다). 항목 이름은 검증 없이 그대로 쓴다. */
public final class ZipBuilder implements AutoCloseable {

    private final ZipArchiveOutputStream zip;

    private ZipBuilder(Path file) throws IOException {
        this.zip = new ZipArchiveOutputStream(file);
    }

    public static ZipBuilder at(Path file) throws IOException {
        return new ZipBuilder(file);
    }

    /** 일반 파일(권한 0644). */
    public ZipBuilder file(String name, String content) throws IOException {
        return file(name, content.getBytes(StandardCharsets.UTF_8), UnixStat.FILE_FLAG | 0644, ZipEntry.DEFLATED);
    }

    /** 유닉스 모드를 지정한 파일(예: {@code 0755}). */
    public ZipBuilder file(String name, String content, int permissions) throws IOException {
        return file(name, content.getBytes(StandardCharsets.UTF_8), UnixStat.FILE_FLAG | permissions, ZipEntry.DEFLATED);
    }

    /** 압축 없이 저장한 파일(CRC 변조 테스트용). */
    public ZipBuilder stored(String name, String content) throws IOException {
        return file(name, content.getBytes(StandardCharsets.UTF_8), UnixStat.FILE_FLAG | 0644, ZipEntry.STORED);
    }

    public ZipBuilder dir(String name) throws IOException {
        ZipArchiveEntry entry = new ZipArchiveEntry(name.endsWith("/") ? name : name + "/");
        entry.setUnixMode(UnixStat.DIR_FLAG | 0755);
        zip.putArchiveEntry(entry);
        zip.closeArchiveEntry();
        return this;
    }

    /** 심볼릭 링크 항목(유닉스 모드 {@code S_IFLNK}, 내용 = 링크 대상). */
    public ZipBuilder symlink(String name, String target) throws IOException {
        return file(name, target.getBytes(StandardCharsets.UTF_8), UnixStat.LINK_FLAG | 0777, ZipEntry.DEFLATED);
    }

    /** {@code size}바이트 0으로 채운 파일. 압축되어 zip 파일은 작다(압축 폭탄 재현용). */
    public ZipBuilder zeros(String name, long size) throws IOException {
        ZipArchiveEntry entry = new ZipArchiveEntry(name);
        entry.setUnixMode(UnixStat.FILE_FLAG | 0644);
        entry.setMethod(ZipEntry.DEFLATED);
        zip.putArchiveEntry(entry);
        byte[] chunk = new byte[64 * 1024];
        long left = size;
        while (left > 0) {
            int n = (int) Math.min(chunk.length, left);
            ((OutputStream) zip).write(chunk, 0, n);
            left -= n;
        }
        zip.closeArchiveEntry();
        return this;
    }

    private ZipBuilder file(String name, byte[] content, int mode, int method) throws IOException {
        // 유닉스 플랫폼으로 만든 뒤 이름을 넣어야 역슬래시가 '/'로 바뀌지 않는다(Windows 경로 항목 재현).
        ZipArchiveEntry entry = new ZipArchiveEntry("placeholder") {
            {
                setUnixMode(mode);
                setName(name);
            }
        };
        entry.setMethod(method);
        if (method == ZipEntry.STORED) {
            java.util.zip.CRC32 crc = new java.util.zip.CRC32();
            crc.update(content);
            entry.setSize(content.length);
            entry.setCompressedSize(content.length);
            entry.setCrc(crc.getValue());
        }
        zip.putArchiveEntry(entry);
        zip.write(content);
        zip.closeArchiveEntry();
        return this;
    }

    /** zip을 닫고 만든 파일 경로를 읽을 수 있게 마무리한다. */
    @Override
    public void close() throws IOException {
        zip.finish();
        zip.close();
    }

    /** 닫고 바이트를 읽는다. */
    public static byte[] bytesOf(Path file) throws IOException {
        return Files.readAllBytes(file);
    }
}
