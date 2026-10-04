package studio.aoji.files;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Component;

/**
 * 정의 파일(이름 변경 시 옛 파일) 삭제를 별도 협력자로 분리한다(ADR-08, FR-011-AC6).
 *
 * <p>운영 코드는 이 클래스가 {@link Files#delete(Path)}를 그대로 호출하는 얇은 래퍼일 뿐이다.
 * 존재 이유는 테스트에서다: "옛 파일 삭제만 실패"는 디렉터리 권한(chmod)으로 재현할 수 없다(같은
 * 디렉터리에 새 파일을 먼저 써야 하는데, 디렉터리 쓰기를 막으면 그 단계부터 실패한다). 이 클래스를
 * {@code @MockitoBean}으로 교체해 삭제 단계만 실패를 주입한다(conventions.md 미완성 코드 금지와
 * 무관 — 운영 코드에는 테스트 전용 분기가 없다).
 */
@Component
public class DefinitionFileDeleter {

    public void delete(Path file) throws IOException {
        Files.delete(file);
    }
}
