# 공용 월드 표면·경계 개편 실행 명세

- 기준 main: `031a8d5f3ffdcf18576fe4613b89f8b6d75531d9` (2026-11-26). [현행 엔진 지도](PHYSICS_ENGINE_BASELINE.md), [등록 평가](WORLD_COLLISION_AUDIT.md), [모션 데이터 명세](MOTION_ENGINEERING_RESEARCH.md), [MOTION-11261538/T1](../tasks/active/MOTION-11261538.md)의 상세 실행 명세.
- 사용자 요구: 기본 3D 기술은 검증된 기존 기술을 활용하되 외부 사례를 절대 규칙으로 삼지 않는다. 세른벨드는 경사, 미끄러짐, 벽등반, 공중 잡기, 수영이 핵심이다. 물체 등록·경계·판정이 콘텐츠별 알고리즘에 의존하지 않게 한다.
- 상태: 설계/문헌 조사 완료, 구현 미착수. 이하 API 및 신규 수치는 구현 제안. 기존값과 측정값을 구분한다. T1 내 순차 체크포인트이며 별도 T를 추가하지 않는다. 실제 행동 개선은 기존 T3~T6에서 완성하되 T1에서 기존 행동이 퇴화하지 않도록 확인한다.

## 1. 실무 근거와 선택

| 자료 (2026-11-26 확인) | 관찰 | 채택 후보 / 채택하지 않는 것 |
| --- | --- | --- |
| R1 [Rapier JS character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/) | shape cast 기반 이동 보정, slope climb/slide 각도 별도, autostep과 snap | 범용 운동학 이동/접촉, 각도·단차·하강 유지 분리. 샘플 각도나 자동 step 기본값을 복제하지 않음. |
| R2 [Rapier colliders](https://rapier.rs/docs/user_guides/javascript/colliders/), [TriMeshFlags](https://rapier.rs/javascript3d/enums/TriMeshFlags.html) | primitive/heightfield/trimesh, 그룹 필터, 내부 에지 ghost collision 개선 옵션 | 형상별 adapter, 경계 seam 실험. 사용 버전의 실제 API 검증; flag만으로 모든 모서리 문제 해결 가정 금지. |
| R3 [Godot CharacterBody3D 4.6](https://docs.godotengine.org/en/4.6/classes/class_characterbody3d.html) | floor_max_angle, floor_snap_length, floor_stop_on_slope, 속도에 따른 snap 해제 | 지면 접촉 유지와 점프/낙하 분리. 45° 기본값이나 정지 시 모든 경사 고정은 미채택. |
| R4 [Godot shape 선택](https://docs.godotengine.org/en/latest/tutorials/physics/collision_shapes_3d.html), [import suffix](https://docs.godotengine.org/en/latest/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html) | 단순 물리 형상, 별도 collision mesh, 임포트 규격 | 기존 GLB와 procedural 동일 manifest 기반. full visual mesh 충돌 강제 금지. |
| R5 [Unreal walkable slope](https://dev.epicgames.com/documentation/en-us/unreal-engine/walkable-slope-in-unreal-engine) | 물체별 경사 제한 override | 실제 기하의 normal은 변경하지 않고 지정 재질/표면 정책이 보행 한계를 제한. 수직면을 걷기 바닥으로 만드는 임의 override는 금지. |
| R6 [Unreal movement component](https://dev.epicgames.com/documentation/en-us/unreal-engine/character-movement-component?application_version=4.27) | walk/fall/swim/custom의 별도 운동 및 tick 내 mode 전환 | 공용 접촉 + 행동별 운동, 남은 tick 시간 인계. 네트워크 구조 전체 복제 불필요. |
| R7 [Unreal Physics Volume](https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-volume-actor-in-unreal-engine) | water volume, 겹침 우선순위, fluid friction | 수역 범위/표면/바닥/매질 정책을 분리, 유체 시뮬레이션 강제 금지. |
| R8 [Jolt CharacterVirtual](https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Physics/Character/CharacterVirtual.h), [settings](https://jrouwe.github.io/JoltPhysicsDocs/5.7.0/class_character_virtual_settings.html) | 급경사 진입 속도 제한, stairs, 재질에 따른 속도·경사, internal edge 제거 | 법선/접촉 연속성, 경사 상승 제한과 하강 가속 구분. JS 도입 후보로 확정하지 않음. |
| R9 [Recast rcConfig](https://recastnav.com/structrcConfig.html) | walkableSlopeAngle, walkableClimb, agent radius 및 정밀도 비용 | 현재 NavGrid를 공용 표면에서 파생. 새 navmesh 엔진 도입은 별도 필요성 입증 후. |
| R10 [Ubisoft GDC 2016 Fitting the World](https://gdcvault.com/play/1023316/Fitting-the-World-A-Biomechanical) | 공개 발표 초록: Assassin's Creed에서 reactive foot IK의 지연/튐 개선을 위해 predictive 접근 | 공용 접촉·예측 위치를 T2 이후 표시에서 소비. 전체 발표/독점 구현 확인 아님. |

공식 기술 문서와 공개 발표를 참고했다. 상용 게임의 내부 알고리즘/기본 수치를 추정하지 않는다. R2의 일부 문서는 검색 결과 및 공개 API 설명으로 확인했으며 실제 JS 버전 동작은 시험하지 않았다.

## 2. 반드시 통합할 것과 허용할 예외

| 범주 | 통합해야 하는 책임 | 허용하는 차이 |
| --- | --- | --- |
| 등록·생명주기 | 고유 instanceId/surfaceId, region, local/world transform, 활성/제거, 검증 | 지형 tile, 건물 compound, 수역 volume, 주민 proxy의 shape 차이 |
| 형상 | 같은 shape는 같은 질의 adapter를 사용, 같은 월드 표면 원본 | box/cylinder/heightfield/roof analytical/static mesh, 필요시 convex; render LOD 별도 |
| 접촉 | 실제 점, 정규화된 기하 normal, contact normal, 거리/깊이, feature ID, filter, 명확한 no-hit | mesh 내부 seam normal 안정화, 진짜 모서리의 복수 법선, 물은 overlap |
| 정책 | support/block/climb/mantle/one-way/nav/camera를 명시적 의미로 구분 | 재질별 마찰/경사 제한, 장식, 암벽·기둥 등반, rounded rock mantle-only, 처마/발판 |
| controller | 같은 profile과 접촉에 같은 결과, 이동 의도/상태/접촉 인계 | 걷기/slide/fall/climb/swim 각각의 가속·중력·구속 방식, NPC 능력 차이 |
| AI/표시 | 동일 원본 surface ID와 policy, 권위 root는 단일 | NPC 먼 거리 논리 경로/낮은 pose rate, 발 IK 실제 tread, 시각 smoothing |
| 예외 관리 | 데이터 정책과 재현 fixture·근거·적용 범위·재검토 조건 | 새로운 형상 adapter가 꼭 필요할 때만 코드 추가(장소 ID 특수 if 금지) |

금지: '카엘의 특정 좌표면 이동 보정', 특정 mesh 이름으로 solver 분기, 캐릭터 종류마다 복제된 collision solver, 시각 LOD에 따른 물리 경계 교체, 같은 축/normal을 질의마다 다르게 정의, 경사 차이를 없애기 위한 전역 평균, 수영 상태를 고체 판정의 구멍으로 구현. legacy bridge 및 stair adapter는 migration 동안 허용하되 같은 contract 뒤에 숨기고 후속 대체 조건을 기록한다.

예외의 우선순위: (1) shape 표현 (2) material/policy preset (3) actor ability/profile (4) mode-specific 운동 (5) 검증된 새 범용 adapter. 개별 콘텐츠의 실행 코드로만 해결 가능하면 최소 재현과 일반화 실패 이유를 먼저 기록. 예외는 데이터면 영속 가능, 임시 legacy path이면 제거 gate 필수.

## 3. 데이터 계약과 API (구현 가능한 초안)

신규 모듈 후보 `src/core/world-collision.js` 하나(등록/검증/질의 facade). 기존 *.part.js의 shape math와 spatial hash를 처음에는 adapter로 전달. backend 추가 시에만 별도 모듈. 현재 game.js의 번들 연결 방식 존중. 모든 좌표 m/Y-up, radians, fixed tick seconds. 정적 metadata는 불변, 결과는 호출자 소유 또는 명시한 scratch lifetime.

```js
// 구현 인터페이스 예시, 실제 런타임 코드 아님
const instance = {
  id: "lab:ledge:waist", regionId: "lab",
  transform: { position:[8,0,13], yaw:0, scale:[1,1,1] },
  physics: "solid", // solid | volume | decorative
  shapes:[{
    id:"main", type:"box", center:[0,.425,0], half:[2,.425,2],
    policy:"stone-solid"
  }]
};
const profile = {
  id:"adult-legacy", radius:.35, height:1.72, eyeHeight:1.5,
  stepHeight:.48, skin:.002, walkMax:50*Math.PI/180,
  slideEnter:50*Math.PI/180, slideExit:50*Math.PI/180,
  abilities:{walk:true,climb:true,swim:true}
};
// contact = {
//   instanceId, shapeId, surfaceId, featureId, point:[x,y,z],
//   geometricNormal:[x,y,z], contactNormal:[x,y,z],
//   separation, toi, policyId, revision
// }
```

profile legacy 값은 실측 이전 호환용. slideEnter/Exit의 동일 각도는 기준값 표현이며 hysteresis는 실험 후 결정. 서로 다른 surfaceID는 같은 feature가 아니며 한 collider의 여러 face는 별도 ID. 지형 ID는 region/tile/cell/triangle 또는 안정적인 patch/feature 키. triangle index는 topology revision과 함께 사용; 타일/geometry 변경 시 revision으로 anchor 무효화. entityId는 기존 레지스트리 ID와 연결. 이름에서 ID를 추측하거나 등록 순서/LOD 인덱스로 영속 ID를 만들지 않는다.

필드 검증: finite/positive 치수, finite pose, yaw-only 기존 box의 지원 범위를 명시; 임의 pitch/roll이나 nonuniform cylinder scaling은 정확한 adapter 없으면 거부, 조용히 무시하지 않음. shape local transform을 instance transform에서 한 번 계산하고 렌더와 동일 입력을 참조. compound는 child shape 배열. ground/wall 구분은 물체 전체 이름이 아닌 접촉 feature와 실제 normal 기반. 전역 규칙을 바꾸지 않도록 face별 policy override도 명시적으로 허용.

정책 preset 예시:
- stone-solid: block=true/support=true, climb=face(기하·도달 판단), mantle=true, nav=true, camera=true.
- tree-trunk: block=true, support=true(정상 top 의미 확인), climb=none(현행 opt-out), nav=false(통행 경로 없음), camera=true.
- rounded-rock: block/support=true, climb=mantleOnly, lipInset 등의 현재 데이터를 보존.
- one-way-eave: 위에서만 support; 아래쪽 ceiling/등반 clearance는 현재처럼 별도 block filter, nav 여부 명시. 일반 one-way 플랫폼과 달리 처마 아래쪽을 완전히 통과하도록 바꾸지 않음.
- actor: block=true, support/climb/mantle=false, nav obstacle은 동적 근방만, camera filter 별도.
- water: solid=false, volume=true, fluid profile(수면 함수/우선순위/저항). decorative: 등록 의도만 기록하고 물리 shape 없음.
- nav=false와 support=false는 다른 의미. legacy walk=false top도 playerFloor에서 지지한다는 사실을 보존; 기존 walk는 migration에서 legacyNav/legacySpawn 등으로 명시 매핑 후 제거. 먼저 support를 false로 바꾸지 않는다.

필수 API:
```text
register(instance) -> handle
updateTransform(handle, transform); setActive(handle, bool)
remove(handle); suspendRegion(id); resumeRegion(id)
queryAabb(bounds, filter) -> candidates
raycast(origin, directionUnit, maxDistance, filter) -> hit|null
overlapBody(profile, feetRoot, filter) -> contact[]
sweepBody(profile, feetRoot, delta, filter) -> firstHit/contactSet|null
sampleSupport(profile, root, {maxRise,maxDrop,previousSupport,filter}) -> contact|null
sampleSurface(surfaceId, localAnchor, revision) -> point/normal|null
sampleWater(profile, root, filter) -> volume sample|null
```
query filter는 purpose, actorId, regionId, excludeId, layerMask; purpose enum support/block/headroom/climb/footIK/nav/camera/water. 목적별 포함 여부는 정책의 한곳에서 결정. backend가 지원하지 않는 정밀 질의는 capability로 표시, fallback 정밀도를 기록한다. 기존 candidate의 거리 분할/이분 탐색은 approximate sweep으로 노출하고 exact TOI인 척하지 않는다. toi=null이면 불가/미계측; hit 시 separation 부호는 양수 gap/음수 penetration. 결정적 정렬은 toi/distance→surfaceId/featureId; 동률 epsilon은 .002m 초기 기준. topological seam 병합은 동일 연속 표면으로 확인된 인접 feature에서만. 변경된 revision은 저장된 접촉을 무효화.

## 4. 경사·미끄러짐을 중심으로 한 표면 판정

접촉 normal 하나로 모든 것을 결정하지 않는다. 기하 normal N은 실제 바깥 방향 단위 벡터. contactNormal C는 체적 접촉 solver의 분리 방향; slope classification은 N으로, overlap 해결은 C로. triangle/roof/surface local을 world로 변환(비균일 scale 허용 시 normal inverse-transpose). shading normal, 렌더 bump, 카메라 pitch는 물리 경사 판정에 사용 금지.

```text
up = (0,1,0)
theta = acos(clamp(dot(N,up),-1,1))
g = (0,-gravity,0)
gT = g - N * dot(g,N)
```

gT는 경사면 아래 방향의 접평면 가속도(게임 가상 중력). 0°에서 0, 수직벽의 gT가 크더라도 벽이 support라는 뜻은 아니다. 실제 발 아래/몸체 하부의 접촉 위치, 이동 방향과 support 정책을 함께 사용. 천장/벽은 바닥으로 오분류하지 않는다. 기존 slide 식의 horizontal acceleration gravity*k/(1+k*k)는 k=tan(theta)일 때 gT의 수평 성분과 일치하므로 기존 SLIDE.accel/max를 초기 보존하고 3D tangent projection과 비교. 물리량을 임의로 현실 중력으로 변경하지 않는다.

| 대표 기하 | 초기 기대 (기존 정책 기준) |
| --- | --- |
| 0°/30°/45° | 일반 보행 가능, 정지 시 불필요한 하강 없음, 경사 속도/접지 검증 |
| 49.9°/50°/50.1° | 초기 50° 경계 보존, chatter 및 수치 오차 측정. 진입/유지 hysteresis는 제안 50.5°/49.5°를 독립 실험하고 승인 전 적용 금지 |
| 60° | 발 지지 접촉 시 slide, uphill 의도 제거, 횡방향 조향 허용. 일반 점프 재사용 금지, 유효 등반으로만 상승 |
| 80°/89° | 실제 지지점 유지 가능할 때 급경사 slide, 지지 상실이면 fall. 각도만으로 허공에 붙여두지 않음 |
| 90°/overhang | 수평 벽 접촉 또는 ceiling, 걷기 support 아님. 별도 grab/hold 도달 검사 |

정책 순서: active/solid/filter → 기하 접촉 → support 후보(높이/발 하부/접촉 방향) → profile 보행/slide 한계 → mode 선택. 낮은 턱 auto-step은 높이 .48 이하, 실제 top의 폭/유효 지지/경사/원점 및 도착 headroom, upward-forward-down clearance. 점프 중/수영 중/slide 중 무조건 auto-step 금지. 단, 출수 mode에서 별도 transition 후보 허용. 계단 보정이 연속 ramp로 급경사를 위장하거나 벽 높이를 낮추지 않음.

하강 snap은 이전 walk support, 아래 방향/비상승, 연결된 다음 지지, 최대 허용 drop 이내, 경사 정책 합격 조건. 기존 .48 snap은 baseline이며 과도한 cliff adhesion을 실험 후 좁힐 수 있다. 보간은 물리 접촉을 대체하지 않는다. seam 내부 에지에서만 정상 normal의 연속성을 유지하고 경사/벽/낙차/모서리의 실제 기하 변화를 보존. 인접 support 선택이 바뀌면 이전/다음 featureId, normal, gap, velocity를 기록. 같은 plane의 삼각형 대각선에서 가짜 튀는 현상을 검사한다.

## 5. 행동별 예외가 허용되는 정확한 범위

| 상태 | 공용 표면을 읽는 방법 | 독립 운동/전환 |
| --- | --- | --- |
| grounded | sampleSupport/sweepBody/headroom | 가속·단차·하강 snap, 달리기 스태미나 |
| slide | steep support, 지지 정상/다중 접촉 | gT 하강 가속/횡 조향/마찰 및 제한, 상승 금지, support 상실→air |
| air | sweepBody, downward crossing | 중력·공중 제어, 실제 지지 착지 또는 grab |
| climb/mantle | face/ledge point 및 normal, 유효 root sweep/clearance, surfaceId+local anchor | 기존 action별 자세/경로·손발 교대/스태미나, 접촉·revision 상실 시 fall |
| swim | sampleWater + solid sweep/support | 수면 추종/부유/저항, 입출수 hysteresis, shoreline transition |
| NPC | 동일 geometry/policy 및 actor profile | 가까운 actor 실제 접촉, 먼 논리 이동, 능력 제한으로 climb/swim 경로 불허 가능 |
| camera/IK | 같은 surface ID와 실제 normal, purpose filter | 표시 전용 smoothing/pose, 물리 root 쓰기 금지 |

climb: 걷기 불가능과 등반 가능은 독립. climbable surface 후보 → 실제 몸체 및 손발 도달 가능성, headroom/stance 및 action 경로 검증 → anchor 유지 → mantle/crest/낙하로 인계. 정적 표면 ID/feature/revision과 local anchor로 pose가 동일 접촉을 읽게 한다. 임의 위치의 '보이지 않는 사다리' 등록 금지(의도적 상호작용 장치는 별도 정책). 실제 90° 벽 및 경사/원통/처마 예외 유지.

swim: sea/river/pool을 공통 water volume에 등록. 수면 높이는 volume 내부 함수, bottom은 같은 solid support query의 실제 바닥, 수심과 actor 침수량을 분리. 중첩 volume은 priority/id 결정. 물 자체를 solid floor로 취급 금지. 기존 SWIM_IN=1.30, OUT=1.05, FLOAT=1.32, wade=1.15의 의미를 혼동하지 않는다. 현행 maxRise=0 swim 상태에서 부유 높이보다 얕은 바닥 진입 차단 가능성이 있으므로 T1에서 재현하고 T5에서 출수 후보(up/forward/down body clearance, 실제 walkable support, volume exit) 및 상태 인계를 구현. 수면 경계에서 얕은 물↔swim이 반복될 때 증상 숨기는 camera 패치 금지. 지면 위 전환을 근거 없이 teleport하거나 underwater 지원 기능을 추가하지 않음.

공통 state: 현재 tick에서 root/velocity 권위는 하나. transition={from,to,reason,surfaceId,waterId,tick,consumedTime,remainingTime}. 기존 T1은 조회·등록이 우선이고 mode 통합 구현은 T3~T5에서 수행. 남은 tick 처리는 최대 2회 전환 등 상한을 계측 후 결정, 반복 무한루프 금지. renderer는 physics snapshot을 소비. 이전 pose를 강제 제거하지 않음.

## 6. 기존 코드 이관 매핑

| 현재 위치/함수 | 실제 변경 방식 |
| --- | --- |
| region.part.js PLAYER | legacy profile로 변환, 실측 profile 추가 가능. 수치 임의 변경 금지 |
| world-render L850~1216 addBox/addCyl/addRoof/insert/query | 공용 register 및 metadata 검증을 거치는 compatibility wrapper. grid/roofGrid를 당장 버리지 않음. region/handle/removal 및 캐시 invalidation 연결 |
| heightfieldTriangle/playerTerrain/groundAt/roof | tile/analytical shape adapter. sampleSupport는 heightfield·exact tread·roof·solid 후보의 공통 contact를 반환. 동일 XZ에서 여러 높이 보존; maxY 및 headroom 조건으로 선택 |
| playerFloor/Contacts/Ceiling/FootSurface/SteepGround | 기존 반환형 adapter는 한동안 유지, 공용 contact 결과를 unwrap. gradient fallback은 실제 삼각형/분석적 normal을 얻지 못한 legacy shape에 한정 및 trace |
| gameplay box/cyl/box2/G.* | 배치 입력 하나에서 시각 및 physics shape 정의 생성. 물리 의도 없는 Geo 세부 표현은 decorative 그룹으로 선언. old walk 기본값 차이 compatibility mapping |
| house, tower, bridge | 기존 compound 치수 그대로 manifest/factory data로 이관. bridge의 landmark transform 공유 및 기존 GLB/LOD 유지; 시각-물리 편차 별도 교정 |
| STAIRS | 원본 s 정의 → 실제 treads/fascia/parapet의 동일 shape/feature. NPC ramp는 nav representation, footIK는 actual tread. terrain cutout과 측벽 보존 |
| Forest/Rocks | 유형 preset 및 scale/LOD 독립 proxy, region 등록. 기존 mantleOnly/lipInset 보존 |
| bootMotionLab | 기존 fixture를 동일 registry/adapter로 등록. analytical lab surface 제공자로 전환하고 글로벌 sample/playerTerrain 함수 override 제거는 parity 통과 뒤 |
| Player.candidate/tryMove/traversal* | 공용 질의 소비, 기존 solver 보존한 채 단계적 이관. 행동 알고리즘의 큰 변경은 T3~T5 |
| Townsfolk/NavGrid/npc-movement | ground/occupancy를 동일 표면·profile로 파생, nav cache의 region/revision. 모델 생성 여부와 동적 proxy 활성 분리. 기존 생활/대화 저장 유지 |
| maktwoWorldRay/studio-integration | 공용 ray/foot query adapter로 연결, 카메라 보정 알고리즘은 T6까지 유지 |
| entity-registry/region-lifecycle | 기존 registry 이벤트/지역 활성 경계 연결; 영속 저장 형식 변경 없이 geometry handles 제거·재등록 |

## 7. 실행 순서 (T1 내부, 독립 T 추가 아님)

### 계측은 구현의 보조 수단이며 독립 착수 게이트가 아니다 (사용자 확정)

- A는 최소 기준 확보이며, 전수 계측을 끝내는 단계가 아니다. 최신 main/점유 조정 후 현행 코드 상수와 대표 fixture, 직접 관련 테스트를 기준으로 B의 공용 등록/검증 구현을 바로 시작한다. 실측치가 없으면 기존값을 LEGACY/CODE로 표시하고 임의 튜닝 없이 유지한다.
- 착수 시 기존 직접 테스트 1회 및 대표 장면 재현을 시도한다. 환경 문제로 실패하면 원인·명령·영향 범위를 남기고, 환경 복구를 위한 짧은 재시도 1회까지만 허용한다. 측정값을 얻기 위해 같은 실패를 반복하지 않는다. 실제 기능 결함의 수정·회귀는 이 제한과 별개다.
- 계측기는 구현에 필요한 최소 항목부터 붙인다: 등록 ID/shape/transform, 접촉 surface/normal/angle, root/state. 해당 변경 검증에 필요한 데이터만 추가하며 전체 데이터셋 완성, 정교한 시각화, 50 NPC 벤치마크, 30분 실행, 모든 모델 실측을 B~E 착수 전 요구하지 않는다.
- B~E 각 체크포인트는 변경 범위의 직접 테스트를 통과하면 독립 진행 가능. D01 실측이 없으면 기존 profile로 registry/표면/기하/등록 테스트 진행; 실제 rig별 치수 확정 및 IK 도달성은 해당 실측이 확보되어야 한다. D09 성능 baseline 미확보는 구조 구현을 막지 않되 성능 개선/통과 주장 및 최종 성능 승인은 보류한다. 브라우저 접근 불가도 순수 등록/질의 구현을 막지 않는다.
- 미확보 항목은 동일 작업 기록에 항목/상태(NOT RUN 또는 BLOCKED)/원인/영향/필수 검증 시점/재개 조건을 남긴다. 직접 실패한 변경 기능, unsafe registration, 기존 동작 퇴화, 불명확한 권위 계약은 실제 의존 구간을 막는다. 무관한 검증 대기만으로 다음 체크포인트나 독립 T를 막지 않는다. 접근 불가로 직접 검증 못 한 코드는 PASS/완료 처리하지 않으며, 실제 검증이 필요한 통합 전환은 기존 경로를 유지한다.
- 전체 T1을 계측만으로 완료할 수 없다. B~E의 실제 공용화 산출 및 직접 회귀가 필수다. 상위 최종 실기기·실게임·리그·성능 게이트는 삭제하지 않고 기존 작업의 필수 검증을 TODO로 떠넘기지 않는다. 계측 완성 자체를 새로운 T로 분리하지 않는다.

A. 최소 기준 확보(구현과 병행): 최신 main/AGENTS/점유 확인. MOVEMENT-002·NPC-11252115 관련 경로 조정. 기존 코드 상수·대표 fixture 및 실행 가능한 직접 테스트를 기준으로 B 착수. D01~D05/D09는 B~E에서 실제 필요에 맞춰 점진 확보. 환경 한계와 두 녹화의 입력 미확보를 기록하고 해당 데이터가 필요한 변경만 보류한다.

B. 공용 registry/shape contract: src/core/world-collision.js 후보와 tests/world-collision.mjs(신규)는 작업 scope 갱신 후 사용. 문서/테스트 먼저 작성, identity/transform/metadata/filter/region/removal/revision/중복/invalid 입력 통과. 기존 addBox/addCyl/addRoof wrapper를 통해 전 등록을 기록하되 기존 판정 결과는 동일. 공용 인터페이스 뒤에 legacy backend 연결. 덤프는 dev flag에서만; render 경로 미변경.

C. 표면·지형 contract: heightfield triangle, actual tread, rotated box/cyl, roof slab을 동일 SurfaceContact로 연결. normal 계산/feature ID/stacked surfaces/seam/shape capability 검증. legacy floor와 신규 support를 shadow compare; 비교가 필요한 대표 fixture만 이중 질의하며 release에서는 한 경로만. 모든 기존 지상/등반/수영 재현을 돌려 퇴화 없이 변경. 불일치는 기록 후 원인 수정 또는 의도적 정책 승인. 이동 solver 교체는 이 단계의 기본값 아님.

D. 제작 표준: box/box2/house/bridge/STAIRS/vegetation/lab 대표 유형을 명시 data로 등록. GLB는 우선 sidecar manifest(파서 단순, 기존 asset 변경 최소), 이후 marker import가 필요하면 동일 schema로 변환. 임시 legacy path는 owner/source/removeCondition 기록. authoring validation: 장식 선언 또는 유효 물리 spec, ID/transform/정책/shape/region, 겹치는 이중 등록 및 누락 검사. 복제/회전/크기 변경 테스트. 카탈로그 collision 필드가 실제 registration과 일치하도록 검사하며 단지 카탈로그 승인으로 간주하지 않는다.

E. 소비자 연결·통합: Player floor/contact/ceiling/traversal/IK, NPC nav, camera ray를 공용 adapter로 점진 연결; 단계별 direct test, 모델 없는 동적 proxy/profile·region gate 확인. NPC 먼 논리 움직임 유지. lab과 카엘에서 동일 query 결과 및 디버그 overlay. 데이터/계측/계약을 docs/contracts/MOTION_INTERACTION.md 및 MODEL_ASSETS.md에 최종 확정 후 기록. T1 성공 후 T2~T6 상태 개선. 기존 T1 계획의 경계·인체 조건을 대체하지 않고 구체화한다.

중간 작업에서는 기존 path 제거보다 parity 우선. 신규 module import 시 tools/build-game.mjs가 생성한 game.js와 sw.js 캐시/모듈 등록 일치. node tools/build-game.mjs --check, 기존 PWA 검증 정책 준수. planned scope에 없는 파일은 착수 시 범위 조정 및 check-infra; 이번 문서는 런타임 점유를 획득하지 않는다.

## 8. 기존 기술 채택 판단

추천 기본 접근: 공용 schema/facade와 기존 backend를 먼저 정리. 자체 solver를 더 복잡하게 만들기 전에 Rapier JS kinematic controller를 **격리된 비교 시편**에서 시험하는 선택지를 둔다. 완성된 외부 알고리즘으로 해결 가능하면 활용. 사전에 도입 확정하지 않는다.

| 후보 | 평가할 요소 |
| --- | --- |
| 기존 solver + 표준화 | 빌드/기존 등반·수영 호환, 정확한 접촉 normal 및 multilayer 지원, 유지보수 비용 |
| Rapier query backend + 기존 mode | shape cast/heightfield/mesh, 필터·접촉/내부 에지, terrain cutout·roof·water·anchor 대응. WASM 다운로드/초기화 및 PWA 오프라인 비용 |
| Rapier controller + 세른벨드 mode | walk/snap/step 및 slide 각도 분리, slide tangent 속도·기존 등반/수영 인계 지원. 필요한 custom 책임과 중복 적용 검증 |

같은 등록 schema를 소형 fixture에 사용. 실제 backend 버전/라이선스/JS API와 번들·메모리 확인. 0/30/45/50/60/90°, seam, 복합 다리, 좁은 계단, 수역 경계에서 동일 input 비교. 실측 후 비용·실패 사례·유지 기능으로 선택. Rapier 실패 시 기존 adapter 유지; 실험의 WASM/의존성을 production에 자동 반영하지 않는다. 성능 이점이 없거나 특수 행동 회귀가 발생하면 전면 도입 보류. 단순화된 기존 데이터 위에 검증된 library 질의만 부분 활용할 수도 있음. 대안 선택은 별도 사용자 합의.

## 9. 구체적 회귀 및 완료 기준

| ID | 재현 입력/fixture | 통과 조건 |
| --- | --- | --- |
| W01 | identical box/cyl/compound의 위치·yaw·scale 변경 및 2개 복제 | 시각·physics 동일 transform, 충돌 2개 독립 ID, 보행 정책 동일, 위치별 if 불필요 |
| W02 | 등록 중복/누락/decorative/invalid NaN/음수/미지원 변환 | 명확한 실패, 이전 world 상태 오염 없음. decorative 충돌 없음 |
| W03 | 지형 위 교량/처마/하부 통로, 위·아래·측면 접근 | 서로 다른 support ID/높이, 지붕 및 ceiling·one-way 정책 보존, 카메라 query 차이 문서화 |
| W04 | 0/30/45/49.9/50/50.1/60/80/89/90°, 상승·하강·정지·횡 이동 | 위 §4 기대, 기존 50° 경계(수치 오차 기록), 경사 각도·기하 normal 추적, 슬라이드 중 일반 재점프 없음 |
| W05 | 동일 평면을 삼각형 둘로 분할, 회전 seam, 진짜 sharp crest 및 cliff | 동일 plane의 가짜 normal 점프 없음; 실제 각도/경계 보존; 정지/미끄럼이 허공에 붙지 않음 |
| W06 | step .22/.47/.48/.49m, 좁은 상면/낮은 천장/12단/하강·모서리 | 현재 auto-step threshold 보존, 지지 가능 공간 검증, 경사 오판으로 step 허용 금지; 기존 카엘 계단 회귀 |
| W07 | 90° 벽/60° 경사/원통/처마/rounded rock 및 airborne grab | 기존 climb/mantle 성공·실패 기준 유지, 유효 anchor ID/normal/도달/clearance, 제거 시 invalid |
| W08 | 물 없음/얕은 물/연못 깊은 곳/경사 출수/수직 벽/수역 겹침 | water volume/solid 분리, 유효 수면·바닥·depth; 기존 swim 진입과 수평 이동 보존. 출수 완결은 T5 |
| W09 | NPC model absent/present/LOD, 크기 교환 및 2m 경계, region suspend/resume/removal | 같은 active body profile, 반경 교환 대칭, contact 없어야 할 때 0, 재등록 중복 없음 |
| W10 | legacy 카엘 실제 집/다리/전망대/나무/바위 및 동일 lab 시편 | 기존 테스트와 동선 보존, 모든 대표 collidable에 명시 spec/ID/region, 등록 누락·중복 0, 과거 알려진 예외 구분 |
| W11 | 30/60/120FPS 동일 tick 입력, .1s frame spike, 20회 반복 | 같은 tick 수에서 권위 결과 및 접촉/전환 순서 일치; dropped time 별도 기록. NaN/무한 loop 없음 |
| W12 | 50 NPC, 카엘/lab 동일 경로·quality, debug off | 후보/query/tick/frame p50/p95·메모리·초기화 비용, 기존 baseline 대비 p95 10% 제안 한도; 실제 모바일 별도 |

수치 초기 gate 제안: analytical fixture point 오차 ≤.002m 및 normal 각 오차 ≤.1°(실제 mesh는 proxy 측량 오차 별도), 경계 관통 ≤.01m 목표/최대 깊이와 지속 tick 기록, 알려진 legacy 오차는 baseline으로 분리하고 악화 불허. 50° 판정은 double precision과 contact skin 오차를 구분. 임계각 hysteresis/snap 폭/발판 최소폭은 실측 후 기준 확정. 허용치 변경 근거 필수. 시각 및 물리 비교는 별도; 녹화의 드르륵거림 해결 선언은 T3~T6 연속성 검증 후.

직접 검증: node tests/world-collision.mjs(추가 후), node tests/player-physics.mjs, node tests/world-playability.mjs --no-browser, node tests/world-performance.mjs, lab/카엘 Chromium 대표 W01~W10 캡처; NPC 관련 직접 회귀. 기존 verify.mjs 실행 옵션은 최신 코드에서 확인. 전체 CI/실기기 최종 게이트는 상위 계획의 요구를 유지. 개발 단계는 코드·계약·trace·테스트 통과 근거와 main SHA 확인으로 닫는다. 실제 T1 완결에는 B~E 구현과 해당 변경의 직접 회귀가 필요하다. 실측 미확보 항목은 위 진행 규칙에 따라 의존 범위 및 최종 필수 게이트에 연결하며, 독립 구현을 차단하지 않는다.

## 10. 계측과 실패 분석

등록 dump: instanceId/region/shape/source location/world transform/policy/active/revision/bounds. query trace: tick, input, actor profile, mode, requested/resolved delta, candidate count, hit surface+feature, N/C, angle, separation, support prev/next, water volume/depth, rejection reason, state transition. 표시 trace: renderPos, bodyRoot, foot/palm contact, cameraY 별도. float 값은 원정밀도로 저장, 화면 출력만 반올림. 고정 ring buffer 및 선택된 actor/fixture만, 전체 월드 매 frame 직렬화 금지.

오버레이: 기하 proxy, 실제 렌더, support point와 normal(기하/solver 다른 색), actor shape, 경사 분류, water bounds, query 결과 및 reason. 60Hz trace와 렌더 frame timestamp 연결. 첫 불일치가 등록, geometry, classification, motion state, render/IK, camera 중 어느 층인지 기록. 2개 녹화의 등반 해제/물 경계 반복은 실제 재현 시 이 trace로 원인 확정.

상태: 문서만 추가, 코드 구현·벤치마크·실기기·전체 check-infra NOT RUN. 자료의 API를 사용할 수 있는지 설치·실행한 결과가 아니고, 선택과 수치의 최종 승인은 별도.
