# 월드 지형·물체 판정 및 등록 표준화 평가

- 기준 main: `486a1879ecf9002735a0f65c84ad2867c5cb131c` (2026-11-26).
- [현행 물리 구조](PHYSICS_ENGINE_BASELINE.md), [실무 조사](MOTION_ENGINEERING_RESEARCH.md), [MOTION-11261538/T1](../tasks/active/MOTION-11261538.md)의 선행 조사.
- 사용자 원칙: 창조의 대상은 게임 콘텐츠 자체다. 기본 3D 동작까지 독자 발명할 필요가 없다. 기존 게임/엔진의 검증된 기법이나 라이브러리를 세른벨드에 적합하게 응용한다. 신규 엔진 채택 여부는 실측 및 별도 합의 사항이다.
- 정적 소스 조사. 개별 인스턴스 총수, 물리/렌더 불일치율, 실기기 성능 및 영상 증상의 인과관계는 미측정.

## 1. 종합 평가

**공유된 좁은 판정 알고리즘은 있으나, 물리 월드 구성·등록·정책·생명주기는 부분 표준화 상태다.** 기본 box/cyl은 자동 등록되기도 하지만 생성 경로가 여럿이고, 복합물/GLB/특수 지형은 생성자가 별도의 코드를 작성해야 한다. 서로 다른 기하에 맞는 표현(높이 필드/primitive/compound/mesh)은 정상적인 분화다. 같은 기하의 규칙이 장소·생성 경로·질의자별로 달라지는 것, 별도 등록 누락을 사후 수정하는 것은 표준화 결여다. 모든 렌더 메시를 자동 고체로 만들거나 예외가 전혀 없는 단일 형상으로 통일하는 것을 목표로 하지 않는다.

평가 기준: A=데이터 등록만으로 범용 처리 및 검증, B=공용 처리 있으나 별도 제작/정책 필요, C=특수 코드 또는 연결 누락 위험 큼. 아래 등급은 소스 근거 기반 정성 평가로 실제 통과율 아님.

| 영역 | 평가 | 근거 |
| --- | --- | --- |
| 정적 primitive 좁은 판정 | A- | addBox/addCyl, 32m spatial hash, playerContact 공용. 다만 actor profile 및 수직 처리 매개변수화 부족 |
| 기본 생성/배치 | B | box/cyl, box2, G.box/G.cyl 등 여러 경로 및 기본 정책 차이 |
| 복합 건축/GLB | C | 지붕·계단·교량 전용 등록 및 수동 치수/형상 관리 |
| 지형/물 경계 | B- | 공통 높이 필드 있으나 sample/playerTerrain/groundAt, 계단/roof/물 별도 규칙 |
| 정책 및 소비자 일치 | C | walk, climbable, mantleOnly, stance의 각 질의별 의미 및 ray/roof 차이 |
| 물체 ID/생명주기 | C | 정적 grid/all/roofGrid에 일반 ID·region 소유·개별 제거/재배치 API 없음(조사 경로 기준) |
| 제작 메타데이터 | B | DELIVERABLES 카탈로그 충돌 정책 명시, 그러나 런타임 등록 데이터와 별개 |
| 자동 등록·누락 검증 | C | 기존 실제 카엘 시나리오 회귀 있으나 신규 자산의 전체 등록 누락 검사 없음(조사 범위) |

## 2. 실제 등록 경로 지도

[gameplay.part.js](../../src/gameplay/gameplay.part.js) 기준. 정적 문자열 조사에서 addBox 15개, addCyl 18개, addRoof 4개, box2 26개 호출 표현(정의 제외; 루프/래퍼로 반복 실행되므로 인스턴스 개수 아님). 추가로 box/cyl 등의 래퍼 호출과 G.* 표시 전용 생성 경로가 다수. 이 수치는 커버리지나 결함 수가 아니다.

| 대상 | 실제 구현 | 표준화 판단 |
| --- | --- | --- |
| 일반 box/cyl L64~82 | 메시 생성 후 collide=true면 addBox/addCyl; box 기본 walk=true, climbable=true, cyl은 max(r0,r1) | 자동 동시 등록의 유용한 선례. 원통 테이퍼 차이 |
| 카엘 Geo L378~464, box2 L579~581 | Geo의 box/cyl/quad/cone/roof는 배치 메시 생성. box2는 G.box + addBox, 기본 walk=false | 유사한 box 생성인데 기본 walk 반대. G.box 직호출은 물리 등록 보장 없음 |
| 집 L876~927 | 벽·현관·굴뚝·발코니·난간 등을 직접 addBox, roofSupport/addRoof(차양 shed 포함) | 복합 표현 자체 정상, 등록 치수/정책 재입력 및 누락 위험 |
| 계단 L805~845 | STAIRS에서 tread/측면/난간 생성, fascia .04m box 별도 등록, 난간 box2; playerTerrain의 exact tread, groundAt의 연속 ramp | 원본 정의를 공유하는 좋은 선례. 질의 해석과 특수 지형 연결 분리 필요 |
| 지붕/차양 L585~588,919 | roofSupport/coneSupport/addRoof, 별도 roofGrid; footprint/overhang/thickness | 특수 형상은 합리적. 별도 query 정책과 등록 관계를 표준화 |
| 풍차·탑 L1151~1154 등 | 여러 높이의 원통 proxy와 facet 보정, climbable opt-in | compound collider 데이터로 표현할 수 있는 유형별 설정 |
| 다리 L1182~1198,1325~1378 | registerCutstoneBridgeCollision(Lm): deck/rail/pier의 치수와 배치 수동 설정, createCutstoneBridge: 별도 fallback/GLB 렌더 | 핵심 사례. 새 GLB를 로드하는 것만으로 collision 등록되지 않음. 시각 LOD와 물리 분리 자체는 보존 |
| 나무 L2305 | trees 데이터에서 trunk용 cylinder 일괄 등록 | 좋은 유형 규칙. 렌더 LOD와 무관한 proxy |
| 바위 L2589 | s>.8만 cylinder, mantleOnly, lipInset 등 유형 규칙 | 정상적인 콘텐츠 policy 예시. shape/정책 표준 데이터에 옮길 후보 |
| 테스트 공간 L6731~6820 | 자체 solid wrapper + 수동 더미 cylinder, slope/stair/water 함수 override | 실제 Player solver 재사용하나 월드 생성 계약은 별도. 본게임과 동일한 registration 경로를 목표로 |
| 지형 L546~584 terrain-runtime 및 world-render L907~1089 | World.H bilinear/triangle, stair/ramp, roof height max, waterLevel | 동일 자료의 해석 규격 및 표면 ID를 정립해야 함 |

G.box에 등록이 없다는 이유만으로 모든 G.box 사용을 결함으로 판정하지 않는다. 예: 창문 장식, 꽃상자, 표면 세부는 의도적으로 충돌을 생략할 수 있다. 의도와 실제 등록 결과가 명시되지 않거나 서로 다른 경우를 결함 후보로 본다.

## 3. 정책과 관리의 불일치

[world-render.part.js](../../src/render/world-render.part.js) L850~1216:
- addBox/addCyl의 walk 기본값은 true. box2 기본 walk=false. playerFloor는 walk=false라도 top을 지지; groundAt은 walk=true만, spawn도 walk=true box 후보. playerContacts는 walk에 상관없이 차단한다. climbable은 traversalSolid에서 box 기본 허용/cyl 명시 허용. walk를 단순히 보행 가능 여부로 해석할 수 없다.
- playerTerrain(삼각형/실제 계단/roof)과 groundAt(연속 계단/bilinear/보행 proxy) 차이는 의도된 최적화일 수 있지만 동일한 월드 표면 식별/정책과 대응 관계가 없다. heightfield는 낮은 표면 위의 복수 층을 일반 표현하지 못해 bridge/roof/overhang이 별도 처리된다.
- 일반 worldRay는 OBB/cyl 및 playerTerrain을 검사하고 footprint 밖 roof slab과 동적 주민은 같은 질의 집합으로 처리하지 않는다. floor/ceiling/traversal/IK/camera/NPC 정책 차이가 있는 것이 문제이지 모든 질의에서 모든 collider를 무조건 쓰라는 뜻이 아니다.
- static insert는 grid/all/roofGrid에 참조 저장. 지역 entity-registry의 remove/suspend와 독립. 조사한 등록 모듈에는 공용 stable ID, region ownership, transform update/removal API가 없다. 신규 지역/재배치의 실제 결과는 검증 필요.
- [DELIVERABLES](../contracts/DELIVERABLES.md)의 asset/building collision=decorative/walkable/blocking/mixed 및 units/pivot은 카탈로그 검증 대상. [existing.json](../catalog/existing.json)의 world.kael-cutstone은 mixed이나 실제 등록은 전용 함수. 카탈로그가 물리 등록을 수행하거나 실제 매핑을 보증하지 않는다.

과거 카엘 planter/balcony/lookout의 고체 누락 수정과 계단 fascia/경계 수정은 [지식 색인](INDEX.md)과 tests/player-physics.mjs, tests/world-playability.mjs에 기록되어 있다. 이는 신규 물체마다 등록·표시 일치 검증의 필요성을 보여 준다. 현재 모든 건물이 잘못되었다는 증거는 아니다.

## 4. 실무 비교와 적용 방향

- Godot 공식 [3D collision shapes](https://docs.godotengine.org/en/stable/tutorials/physics/collision_shapes_3d.html), [import node suffixes 4.3](https://docs.godotengine.org/en/4.3/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html): 제작 단계에서 단순화된 collision mesh/primitive 또는 이름 규약으로 static/convex collision 데이터를 import. 세른벨드는 GLB의 collision marker 또는 sidecar manifest를 파싱하는 공용 importer를 고려(형식 선택은 이후).
- Unity 공식 [Character Controller](https://docs.unity.cn/6000.2/Documentation/Manual/class-CharacterController.html): collider와 controller의 slope/step/skin을 분리, 캐릭터 이동 문제를 공통 설정 및 알고리즘으로 해결. 세른벨드의 profile과 표면 정책도 분리한다.
- Rapier 공식 [JS Character Controller](https://rapier.rs/docs/user_guides/javascript/character_controller/): 범용 collider 기반 이동, auto-step/snap-to-ground 및 접촉 결과 조회. 기존 solver에 기법을 적용할 수도 있고 별도 실험에서 라이브러리를 비교할 수도 있다. 실제 모바일 PWA 성능/용량/정확도/기존 특수 동작은 미검증.

외부 문서는 엔진이 제공하는 일반 기법의 근거이며 특정 상용 RPG 내부 구현을 확인한 것이 아니다. 기존 알고리즘 유지/일부 교체/라이브러리 도입을 독립적으로 비교하되 이번 조사는 도입 결정이나 새 엔진 작성 승인이 아니다.

## 5. 목표 등록 계약 (제안, 아직 확정 아님)

```text
콘텐츠 정의 + 시각 asset + 물리 shape data
  → 공용 world instance 등록(고유 ID, region, transform, policy)
  → shape adapter(primitive/compound/heightfield/static mesh/water volume)
  → 공간 검색 및 일관된 질의(filter, point, normal, surfaceId)
  → 캐릭터/AI 경로/IK/카메라의 목적별 소비
  → 지역 활성/비활성 및 제거, debug overlay, 자동 검사
```

- 물리 형상은 렌더 메시와 분리 가능. static primitive/compound 우선, 필요한 불규칙한 정적 형상만 단순화 mesh/heightfield. 수역은 volume/경계. 모든 렌더 triangle을 collider로 변환하지 않는다.
- 정책은 support/block/climb/trigger/one-way/카메라 질의 대상 등 독립적으로 선언한다. actor 크기, step, slope, skin 등은 controller profile의 책임. 콘텐츠마다 알고리즘을 작성하지 않으며 일반 shape adapter를 추가해야 하는 경우와 asset 데이터만 조정하는 경우를 구분.
- 신규 물체에 explicit decorative 또는 유효 collider spec이 없으면 개발 검증에서 보고/실패. 물리/표시 transform을 같은 배치 입력에서 파생. object ID, surface ID, owner region 및 spawn/despawn 관리. 변경 사항은 기존 저장/LOD/asset pipeline과 호환.
- 질의 소비자의 filter는 다를 수 있으나 동일 collider 원본을 참조하고 의도된 차이를 계약에 기록. NPC navigation은 공용 표면에서 파생, 먼 주민은 검증된 논리 경로 유지.

## 6. T1의 먼저 검증할 내용

1. 월드 실제 생성 중 registration 기록(등록 위치/shape/transform/policy/owner)과 명시된 물체 의도를 연결. box/집/계단/교량/나무/바위/lab 대표 시편의 렌더-물리 overlay 및 지지/차단/등반/카메라 비교. 등록 없음과 의도적 decorative를 구분.
2. 같은 물체를 회전·크기 변경·복제·지역 이동 시 새 전용 코드 없이 동일한 물리 규칙으로 작동하는지 비교. 일반 박스, 계단, 복합 건축, GLB, 경사, 수역 대표 세트. 기존 카엘 회귀 보존.
3. 실제 지형/shape에서 어떤 표면/normal/contact를 각 질의가 반환하는지 재현 기록. 현재 등록 방식의 누락, 중복, 잘못된 policy, 변환 오차의 건수 산정. 정확한 모수는 계측 후 제시.
4. 동일 fixture와 입력으로 현행 solver 및 검증된 대안(예: Rapier JS controller)을 격리 비교할지 T1에서 판단. 성능·PWA 다운로드·접촉 정확도·경사/계단·기존 제스처 유지 비용을 비교. 전면 교체는 별도 합의.
5. 공용 등록 규격과 최소 어댑터가 확정되면 기존 특수 생성 코드를 데이터로 점진 이관. 각 단계에서 과거 카엘 누락 사례를 회귀로 활용한다.

문서 조사만 완료. 전체 저장소 테스트·실기기·collision instance 전수 계측과 외부 엔진 비교 실행은 NOT RUN. 기존 작업 점유·단계·게임 코드는 수정하지 않는다.
