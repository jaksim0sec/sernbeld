# SERNBELD / 세른벨드

카엘 항구 3D 오픈월드 프로토타입.

## 실행
정적 HTTP 서버에서 `index.html`을 연다. 예: `python -m http.server 8000` 또는 GitHub Pages.
`file://` 직접 실행 시 GLB 및 외부 SVG 아이콘 로딩이 브라우저 정책에 의해 차단될 수 있다.

## 오프라인 PWA
HTTPS(GitHub Pages 등) 또는 localhost에서 접속하면 `sw.js`가 오프라인 게임 파일을 저장해.
최초 접속을 온라인에서 완료하면 설치 후 네트워크가 없어도 다시 실행할 수 있어.
온라인에서는 새 버전을 캐시보다 우선하고, 파일 변경이 감지되면 **업데이트** 버튼으로 안전하게 새로고침할 수 있어.
자세한 내용과 테스트 범위는 [docs/PWA.md](docs/PWA.md)를 참고해.

## 구조
- `index.html`: 게임 DOM과 화면 진입점
- `styles/`: HUD·메뉴·지도·반응형·디자인 토큰 CSS
- `styles.css`: 기존 호환용 CSS 진입점
- `assets/ui-icons.svg`: 11종 공용 UI 아이콘, HTML에서 15번 사용
- `assets/kael-cutstone-v7.glb.gz`: 압축 3D 에셋
- `assets/models/characters/female-base-v1.mesh.json`: 여성 기본 인체 원본 스키닝 메시 (47관절)
- `src/render/materials/standard-skin.js`: 사람 캐릭터용 표준 2톤 툰 스킨 재질
- `src/entities/character/`: 여성 기본 모델 로더 및 공용 모델·스킨 레지스트리
- `src/core/`: 독립 ES 모듈로 구현한 공통 사건·활성 엔티티 식별·혼합형 아이템 보관 기반
- `src/`: 재조립 가능한 JS 번들 **소스 조각**. 독립 ES 모듈은 아님 (`src/core/`는 예외)
- `game.js`: 기존 게임을 실제로 실행하는 단일 번들 (분리 전후 유지)
- `tools/build-game.mjs`: JS 소스 재조립과 바이트 동일성 검증
- `tests/webgl-smoke.mjs`: main/리팩터링 브랜치 Chromium WebGL 비교 스크립트
- `세른벨드_게임_컨셉_종합.md`: 방향 기획 문서, 예시는 콘텐츠의 상한선이 아님

자세한 설명과 제약은 [docs/STRUCTURE.md](docs/STRUCTURE.md) 참고.

캐릭터 모델, 표준 피부 및 사용법은 [docs/CHARACTERS.md](docs/CHARACTERS.md) 참고. 등록만 했으며 게임 내 기존 NPC와 플레이어 외형은 변경하지 않았다.

## 검증
```bash
node tools/build-game.mjs --check
node --check game.js
node tests/foundation.mjs
```

브라우저 회귀 검증은 `.github/workflows/refactor-regression.yml`과 `tests/webgl-smoke.mjs`로 준비했다. 실제 결과 확인 전에는 동작이 완전히 같다고 판정하지 않는다.

## 주의
이 구조화 단계에서는 기존 대형 번들의 실행 순서와 JS 스코프를 변경하지 않는다. 원본 빌드 소스가 확보되면 본격적인 독립 ESM 모듈화로 이행한다.
