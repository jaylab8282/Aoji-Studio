package studio.aoji.support;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** SSE 응답 본문을 프레임(event·id·data)으로 읽는 테스트 공용 도구. */
public final class SseFrames {

    private SseFrames() {}

    public record SseFrame(String type, long id, String data) {}

    /** 데몬 스레드가 본문을 읽어 프레임 큐에 쌓는다. 본문을 닫으면 읽기가 끝난다. */
    public static BlockingQueue<SseFrame> readAsync(InputStream body, String threadName) {
        BlockingQueue<SseFrame> frames = new LinkedBlockingQueue<>();
        Thread reader = new Thread(
                () -> {
                    try (BufferedReader in = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                        String type = null;
                        Long id = null;
                        String data = null;
                        String line;
                        while ((line = in.readLine()) != null) {
                            if (line.isEmpty()) {
                                if (type != null) {
                                    frames.add(new SseFrame(type, id == null ? -1 : id, data));
                                }
                                type = null;
                                id = null;
                                data = null;
                            } else if (line.startsWith("event:")) {
                                type = line.substring("event:".length()).trim();
                            } else if (line.startsWith("id:")) {
                                id = Long.parseLong(line.substring("id:".length()).trim());
                            } else if (line.startsWith("data:")) {
                                data = line.substring("data:".length()).trim();
                            }
                        }
                    } catch (IOException ignored) {
                        // 연결 종료(테스트가 스트림을 닫음) — 정상 종료로 취급한다.
                    }
                },
                threadName);
        reader.setDaemon(true);
        reader.start();
        return frames;
    }

    /** 해당 type의 첫 프레임을 돌려준다. 시간 안에 없으면 AssertionError. */
    public static SseFrame pollUntilType(BlockingQueue<SseFrame> frames, String type, long timeoutMillis)
            throws InterruptedException {
        long deadline = System.nanoTime() + timeoutMillis * 1_000_000L;
        while (System.nanoTime() < deadline) {
            long remainingMillis = (deadline - System.nanoTime()) / 1_000_000L;
            if (remainingMillis <= 0) {
                break;
            }
            SseFrame frame = frames.poll(remainingMillis, TimeUnit.MILLISECONDS);
            if (frame == null) {
                break;
            }
            if (type.equals(frame.type())) {
                return frame;
            }
        }
        throw new AssertionError("timed out waiting for frame type=" + type);
    }
}
