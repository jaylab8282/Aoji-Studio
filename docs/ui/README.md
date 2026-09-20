# Jay Studio UI 기준 (docs/ui)

- 확정일: 2026-09-18
- 이 폴더가 UI의 기준이다. 시안 링크나 캔버스가 아니라 이 파일들을 개발·리뷰 기준으로 쓴다.
- 확정 범위: 시각 디자인은 다크 관제실 톤. 화면별 확정 이미지는 01·02·03 세 화면이다.
- 나머지 화면(04 상태 화면, 05·06 팝업, 07 설정)은 와이어프레임(`docs/JayStudio_Front_Wireframe.pdf`)의 구성·요소·흐름을 그대로 쓰고, 색·글꼴·간격만 `design-tokens.md`와 `ui-rules.md`를 적용한다.

| 파일 | 용도 | 누가 쓰나 |
|---|---|---|
| `screens/01-home.png` | 홈 확정 화면 (1440×1140) | frontend-developer 구현, reviewer 대조 |
| `screens/02-workflows.png` | 워크플로우 층 뷰 확정 화면 (1440×1020) | 〃 |
| `screens/03-workflow-detail.png` | 워크플로우 상세(픽셀 오피스) 확정 화면 (1440×880) | 〃 |
| `design-tokens.md` | 색·글꼴·간격·모서리 값 | architect가 코드 설정으로 옮김 |
| `ui-rules.md` | 상태 표시, 비활성, 빈·로딩·에러·연결 끊김, 공통 규칙 | architect가 `ui-spec.md`로 옮김, reviewer 판정 기준 |
| `pixel-sprites.md` | 픽셀 캐릭터 격자·색·상태별 표현 | frontend-developer 구현 기준 |
| `screen-flow.md` | 화면 이동 | architect·reviewer |

기준 이미지와 구현 화면을 대조할 때 요소 누락, 배치 차이, 흐름 불일치는 결함이다. 1~2px 간격 차이는 결함이 아니다.
