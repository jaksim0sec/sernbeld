# 세른벨드 코드 구조 및 유지보수

## 실제 게임 진입점
- `index.html`: 게임 DOM 진입점. CSS 파일들을 **기존 캐스케이드 순서대로** 불러온다.
- `styles/`: `tokens.css`, `hud.css`, `menus-and-overlays.css`, `responsive.css`, `world-map.css`
- `styles.css`: 외부/기존 링크용 호환 진입점. 위 5개를 원래 순서대로 import
- `assets/ui-icons.svg`: HTML에서 추출한 공용 SVG 심볼 스프라이트 (11종, 사용 15곳)
- `assets/kael-cutstone-v7.glb.gz`: 기존 압축 3D 메시
- `game.js`: **브라우저가 실제 실행하는 기존 단일 ES module 번들**

## JS 소스 구성 (중요)
`game.js`는 Three.js/GLTFLoader와 게임 로직이 같은 JS 모듈 스코프를 공유하는 빌드 결과다. 원본 ES 모듈 소스와 빌드 설정이 없어서, 지금 각 영역을 독립 ESM으로 바꾸면 내부 참조/초기화 순서가 달라질 위험이 크다.

보수적으로 **실행 번들은 그대로 두고**, 재조립 가능한 원본 순서별 소스 파트로 정리했다.
`src/**/*.part.js`는 **독립 import 대상이 아닌 번들 소스 조각**이다. 각각의 코드는 원본과 동일하며 경계를 기준으로 단순 연결한다.

1. `src/vendor/three-gltf.part.js`: Three.js + GLTFLoader 포함
2. `src/world/region.part.js`: 월드 설정과 초기 지형 함수
3. `src/world/terrain-patch.part.js`: 약 675KB의 인코딩된 지형 수정 데이터
4. `src/world/terrain-runtime.part.js`: 지형 수정 해석/월드 지형 계산
5. `src/render/world-render.part.js`: 월드 렌더링과 머티리얼
6. `src/gameplay/gameplay.part.js`: 나머지 월드 오브젝트, 상호작용, 캐릭터, UI, 루프 등

`node tools/build-game.mjs --check`: 소스 조각을 이어 붙인 결과가 `game.js`와 **바이트 단위로 같은지** 검증

`node tools/build-game.mjs`: 같은 순서로 번들을 재생성 (외부 의존성 없음)

이 방식은 JS 전체를 진정한 독립 모듈로 변환한 것은 아니다. 원본 모듈과 빌드 파이프라인이 복구되면 그 단계에서 실제 모듈 경계를 복원해야 한다.

## 아트/호환성 주의
- SVG 심볼을 외부 `<use>`로 참조하므로 `file://` 직접 실행보다 **HTTP 서버**가 필요하다. 기존 GLB 리소스도 마찬가지다.
- CSS 선택자, UI ID, 버튼 핸들러, 게임 로직을 임의로 수정하지 않는다.
- 최종 병합 전에 WebGL 실제 화면과 모바일 조작을 기존 main과 비교 확인한다.

## 2026-11-20: 첫 번째 점진적 기반 연결
- `src/core/game-events.js`: 한 번 확정된 행동 결과를 구독 시스템에 알림. 예외가 발생한 구독자는 다른 구독자의 처리를 막지 않음.
- `src/core/entity-registry.js`: 현재 살아 있는 주민과 생물을 식별. 지역별 해제 가능하지만 세계 저장 기능은 아직 이 레지스트리에 넣지 않음.
- `src/core/inventory.js`: 기존 `Save.data.inv`의 종류별 수량 저장을 그대로 유지. 별도 `uniqueItems`에는 개별 ID와 상태를 기록할 수 있음.
- 이전 `v:1` 저장은 그대로 불러오며, 새로운 선택 필드는 빠져 있어도 정상 동작하도록 설계.
- 고유 물건 UI·착용/거래 통합, 지역별 엔티티 실제 스트리밍은 후속 작업. 이 단계에서 기존 캐릭터와 월드의 렌더링은 변경하지 않음.
