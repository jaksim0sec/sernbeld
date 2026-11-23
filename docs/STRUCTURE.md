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

## 2026-11-20: 고유 아이템 저장 보강
- `makeUnique`, `promote`, `updateUnique`, `removeUnique`는 상세 데이터 변경 직후 저장을 요청한다. 기존 일반 스택은 종전 게임 처리에서 묶어서 저장한다.
- `getUnique`와 `uniqueEntries` 등에서 반환하는 상세 데이터는 복사본이다. 변경할 때는 `updateUnique(id, patch)`를 이용해야 한다.
- 무기·기념품의 개별 인스턴스 상세 데이터 저장을 위한 기반이며, 아직 인벤토리 UI·장착·거래를 완전히 통합한 것은 아니다.

## 2026-11-20: 지역별 활성화·해제 / 변경 상태 저장 (첫 실제 연결)
- `src/core/region-lifecycle.js`: 지역 `mount / suspend / resume / unmount`와 개체 등록 관리. 정지 시 개체를 레지스트리에서 빼고 표시를 숨기며 재개 시 다시 등록한다.
- 현재 `sernbeld` 지역의 주민 및 야생동물을 이 경로에 연결했다. 비활성화된 지역은 주민·생물 갱신, 대화, 충돌, 공격 대상 판정을 중단한다.
- 주민의 대화 순서와 야생동물의 체력·사망·재생성 시간만 저장한다. 원래 값과 다른 내용만 `Save.data.regionEntities`에 기록한다. 매 프레임의 이동, 애니메이션, 지형 메시를 저장하지 않는다.
- 기존 `sernbeld.save.v1`의 저장 형식은 유지한다. 저장 시 활성 지역의 차이를 반영하고, 다음 로드 시 복원한다.
- **제약:** 기존 게임에는 아직 진짜 지역 이동·오브젝트 메모리 해제 연동이 없다. `unmount`는 등록된 개체의 참조만 내려놓으며 호출자가 실제 3D 리소스를 정리해야 한다. 다른 지역 자동 스트리밍을 구현한 것으로 간주하지 않는다.
- 테스트: `tests/region-lifecycle.mjs`(지역 간 독립·저장·복원), Chromium WebGL 개발 훅 순환, 모바일·PWA 회귀 테스트.

## 2026-11-20: 기존 야생동물 콘텐츠 제거
- 솜털양·갈기들개, 서식지, 동물 메시·AI·전투 타격 처리를 제거했다.
- 관련 의뢰의 신규 생성과 과거 세이브에서 남은 불가능한 동물 의뢰, 동물 개체 상태 기록을 제거한다.
- 과거 보유한 양털·가죽 등 재료 아이템과 개별 아이템 기록은 그대로 보존한다.
- 새로 만든 공통 엔티티·지역 생명주기·아이템·이벤트 모듈은 변경하지 않았으며 주민의 지역 관리와 저장 복원은 유지한다.

## 2026-11-21: Beta 1 자유 시작과 커스텀 기술 기반

- 새 저장의 인트로·대기 목표는 길드 가입과 빚, 숙박을 필수로 강요하지 않는다. 기존 길드 의뢰/여관은 선택형 기능으로 보존한다.
- `Save.data.v`는 여전히 1이며 새 저장에는 선택형 `customSkills: []`, `mastery`, `vitals` 필드를 둔다. 이전 저장에는 기본값이 채워진다.
- `src/core/skill-engine.js`: `validateSkill(config,actor)`, `compileSkill(config,actor)`로 물리 찌르기 조합의 검증·자원 비용·타격 시간을 계산한다. **자원을 차감하거나 메시를 생성하지 않는다.**
- `src/core/skill-library.js`: `createSkillLibrary(Save,GameEvents)`의 `list/get/put/remove`로 사용자 기술을 저장·재로드한다. 알 수 없는 미래 버전 기술은 보존하되 지금 편집하지 않는다. `skill.saved`/`skill.removed`는 저장 이후 발생한다.
- `src/core/skill-runner.js`: `createSkillRunner({spend,onStep,onComplete})`로 한 번만 자원을 소비하고 타격 스텝을 프레임 누락이나 취소 상황에서도 중복 발행하지 않는다. **아직 실제 `Combat` 및 3D 타격 판정에는 연결하지 않았다.**
- 게임 내 로드 경로: `gameplay.part.js` → `game.js`에 스킬 엔진 및 라이브러리 import. 개발 훅 `window.__dev.skills`에서 계산·저장 API를 확인할 수 있다. 런타임에서 가져오는 스킬 엔진·라이브러리 2개 모듈은 PWA 셸 캐시에 추가했다. 아직 `Combat`에 연결되지 않은 실행기(`skill-runner.js`)는 사전 캐시 대상이 아니다.
- 테스트: `tests/skill-engine.mjs`, `tests/skill-library.mjs`, `tests/skill-runner.mjs`, `tests/custom-skills-browser.mjs` 및 기존 모바일·오프라인 회귀.
- **미완성:** 실시간 3D 찌르기 충돌·공격 애니메이션 연결, 스킬 편집 UI, 마법진/마법어, 숙련도 실제 성장, 직업·NPC·사건 콘텐츠. 데이터를 만들었다는 이유로 베타가 플레이 가능해졌다고 주장하지 않는다.

## 2026-11-22: 카엘 항구 접근로와 NPC 경로
- `SERNBELD.kaelRoads`에 기존 항만·부두·시장·작업장·수도원·북문을 연결하는 경로 요구사항을 등록한다. 기존 시설과 지역 데이터는 보존한다.
- `buildKaelRoads`는 충돌체 등록 후 `NavGrid`에서 이동 가능한 경로를 계산한다. 기존 `Geo`에 마모된 석재 패턴으로 포장한다. 장애물·급경사 구간에 포장은 추가하지 않는다.
- 수도원 측면 탑과 상층 계단 사이 단절은 상층 석재 보행로 `buildUpperPromenade`로 연결한다. 아래 계단은 통과할 수 있도록 다른 높이로 분리한다.
- `Townsfolk.nav`는 도시 렌더 구축 시 생성한 격자를 재사용하며, 경로 탐색과 직선화는 같은 단차·장애물 검사를 적용한다. NPC 경사 한도는 2m 간격당 1.65m다.
- `tests/kael-roads.mjs`는 모바일 에뮬레이션 Chromium에서 11개 경로의 연결, 지형 높이, 렌더링, NPC 통행을 검사한다. 실제 기기 프레임 타임은 별도 측정이 필요하다.

## 2026-11-23: 캐릭터 성능·1인칭 팔 재작성
- `tools/optimize-characters.mjs`: 외부 패키지 없이 QEM 하프엣지 콜랩스로 `studio-v1.lod.json.gz`를 만든다. 원본 정점 버퍼(얼굴 편집, 스킨 가중치)는 그대로 두고 삼각형 목록만 3단계로 줄인다. 남 189k → 45k/12.7k/4.8k, 여 152k → 33.5k/9.5k/2.9k(몸·머리 기준). 파트 경계는 잠가서 틈이 생기지 않는다.
- 게임은 사이드카가 있으면 LOD 3단계(14m / 38m / 그 이상)를 쓰고, 없으면 기존 클러스터 LOD로 동작한다. 그림자는 12m 안의 주민만 드리운다. 캐릭터 생성기(`studio.html`)는 원본 풀메시를 그대로 쓴다.
- `studio-model.js`: 정점 조립을 타입드 배열로 바꾸고 LOD0에서 실제로 참조되는 정점만 GPU에 올린다(남캐 96.7k → 32.6k 정점).
- 1인칭: 실제 캐릭터 몸을 카메라에 고정하고 팔만 그린다. 손가락 본 피벗에서 계산한 그립 프레임으로 무기를 쥐고(칼날은 엄지 쪽, 날·도끼날은 주먹 앞쪽), 팔꿈치 폴과 전완 비틀림 분배가 있는 IK로 팔을 맞춘다. 무기가 없는 팔은 공격할 때만 보인다.
- 이동: 걷기 2.6 m/s, 달리기 5 m/s. 보폭이 속도에 비례해 다리·카메라 흔들림 박자가 사람 걸음과 맞는다.
- 렌더: 프레임이 길어지면 픽셀 비율을 0.125씩 낮추고 여유가 생기면 되돌린다(최소 1.0).
- `game.js`에서 쓰이지 않던 옛 마네킹 데이터(약 220KB, 로드 시 디코딩)를 제거했다. 오프라인 캐시에서 게임이 쓰지 않는 `female-base-v1.mesh.json`을 뺐다.
