# SERNBELD / 세른벨드

카엘 항구 3D 오픈월드 프로토타입.

## 실행

정적 HTTP 서버에서 `index.html`을 연다. 예: `python -m http.server 8000` 또는 GitHub Pages.

파일을 직접 `file://`로 열 경우, 3D 메시 리소스의 `fetch`가 브라우저 정책상 제한될 수 있다.

## 구조

- `index.html`: 화면 마크업, 시작점
- `styles.css`: HUD / 메뉴 스타일
- `game.js`: 기존 Three.js 포함 번들 및 게임 로직. 기존 로직 보존을 위해 이 단계에서는 내부를 임의 분해하지 않음
- `assets/kael-cutstone-v7.glb.gz`: 기존 HTML에 내장된 압축 3D 메시
- `세른벨드_게임_컨셉_종합.md`: 방향 기획 문서. 예시는 콘텐츠의 상한선이 아님

향후 소스 모듈이 확보되면 번들 내부를 직접 쪼개기보다 빌드 파이프라인에서 모듈화한다.
