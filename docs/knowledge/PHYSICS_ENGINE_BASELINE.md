# 세른벨드 현행 물리엔진 구조 순회 기록

2026-11-26 · 기준 main `715a141f42562d9b31b9ac0c12eb3e511cc89a30` · [MOTION-11261538](../tasks/active/MOTION-11261538.md) T1 준비 자료.
상태: 소스 정적 조사. 실제 브라우저/실기기 실행, 남녀 리그 계측, 월드 전체 collider 인스턴스 수와 성능은 NOT RUN. 줄번호는 기준 SHA의 소스에 한정한다. 구현 및 기존 작업 점유는 변경하지 않는다. [연구·데이터 명세](MOTION_ENGINEERING_RESEARCH.md)와 함께 사용.

## 1. 엔진 성격과 파일 지도

자체 운동학적 캐릭터 이동·충돌 시스템. 조사한 경로는 강체 질량/impulse solver가 아니라 발 기준 위치·높이 필드·간소화된 정적 proxy·동적 주민 proxy와 직접 계산된 속도/접촉으로 구성된다. Three.js는 수학·리그·렌더를 제공한다. *.part.js는 독립 ESM이 아니라 기존 game.js 번들의 공유 스코프 조각([구조](../STRUCTURE.md)); character/core 모듈은 독립 ESM. 소스 조각 변경은 tools/build-game.mjs 및 PWA 규칙을 따른다.

| 소스 | 담당 (기준 줄번호) |
| --- | --- |
| [region.part.js](../../src/world/region.part.js) | L3~36 CFG, PLAYER, GRID_N; 월드 설정 |
| [terrain-runtime.part.js](../../src/world/terrain-runtime.part.js) | L243~545 필드·지형·도시 도로/계단, L367~395 stairSurface, L546~584 sample/normalAt/waterLevel |
| [world-render.part.js](../../src/render/world-render.part.js) | L850~1238 정적 proxy·공간 해시·roof·지면·접촉·천장·spawn·NPC용 질의 |
| [gameplay.part.js](../../src/gameplay/gameplay.part.js) | L64~1332 구조물 및 proxy 생성, L2862~2999 Input, L3010~3403 traversal, L3404~3794 Player, L3796~3920+ 카메라, L4895~5479 NavGrid/Townsfolk, L5827~5870 worldRay, L6731~6913 lab, L7050~7091 지역/논리 경로 연결, L7435~7517 메인 프레임 |
| [studio-integration.js](../../src/entities/character/studio-integration.js) | L13~128 높이/카메라, L201~405 pose 및 foot IK, L426~567 slide/traversal, L588~620 카메라 적용 |
| [avatar-motion.js](../../src/entities/character/avatar-motion.js), [schoolyard-motion.js](../../src/entities/character/schoolyard-motion.js) | gaitPhaseStep, animatePlayer, pose driver, pivot 발, clip/IK |
| [studio-model.js](../../src/entities/character/studio-model.js) | L7~23 rig 생성/scale, L224~235 NPC animate |
| [npc-movement.js](../../src/core/npc-movement.js), [living-world-runtime.js](../../src/core/living-world-runtime.js) | 논리 경로 검증·게임 시계 기반 위치·생활 세계 |
| [entity-registry.js](../../src/core/entity-registry.js), [region-lifecycle.js](../../src/core/region-lifecycle.js) | live entity ID/region 등록·상태 checkpoint/활성화, 정적 collider와 별개 |

## 2. 실제 메인 프레임 호출 순서

```text
DOM Input → keys/stick/look/jump queue
render frame
  clock.update → living.update
  메뉴/지도/대화 입력 차단 분기
  player.look [프레임 1회]
  MovementCameraFollow.prepare
  Townsfolk.playerContacts(player) [근방 proxy snapshot]
  Player.advance(dt,input,nearby)
    accumulator → 0..6 × fixed 1/60s tick
    update → walk / fly → traversal 또는 일반 이동
    previousPos/pos → renderPos, visualY
  MovementCameraFollow.update
  CameraRig.update
  Townsfolk.update [활성 region]
  기존 게임 행동 표시 갱신
  avatars.update → applyThirdCamera → updateTrail
  gatherables / explore / terrain LOD / render
```

근거 gameplay L7435~7492, Player.advance L3456~3488. NPC contacts는 advance 전에 프레임당 한 번 생성되고 모든 하위 tick에 동일 배열 전달. NPC의 실제 표시 좌표 갱신은 플레이어 이후, living.update는 그 이전. 전체가 같은 60Hz 스냅샷을 사용하지 않는다. player advance가 UI 때문에 생략되어도 clock/living/NPC 경로는 별개. 프레임 타이밍의 실제 영향은 재현 필요.

## 3. 기준 값 및 상태 소유권

| 항목 | 코드 값 |
| --- | --- |
| 좌표 | m, Y-up, walk의 pos는 발 기준; fly 전환 시 eye 높이만큼 위로 이동 |
| 월드 | CFG.half=1280, cell=2.5m, GRID_N=1025, chunk=160m, seaLevel=0; walk XZ BOUND=1500, fly ±4000 |
| 인체 | PLAYER.height=1.5(eye), body=1.72, radius=.35, step=.48, wade=1.15 |
| 이동 | walk=2.6, run=7.5, jump=7m/s, gravity=24m/s²; 지상/공중/수영 속도 응답 12/2.5/4 s⁻¹ |
| 시간 | h=1/60s, accumulator cap=.1s, walk 내부 dt cap=.08 |
| 접촉 | CONTACT_SKIN=.002m, 수평 원 + 수직 bot/top 범위 |
| 경사 | WALK_GRADE=tan(50°), gradient 차분 e=.04m |
| 물 | SWIM_IN=1.30, OUT=1.05, FLOAT=1.32m, 이동 2.6/3.6m/s |
| 스태미나 | max 100, drain 12.5/s, recovery 25/s, delay .8s, restart 30; climb drain 6.5/s |
| 등반 | gap=radius+.018, rise/side .30m, duration .46s, overhang depth 1.05/reach 2.32m |
| 방향 | yaw/pitch, facingYaw, moveBasisYaw, moveHeading, 표시 bodyYaw, camera yaw/pitch |

고정 PLAYER 치수는 실제 male/female rig 측량값이 아니다. wade와 현행 SWIM_IN/OUT은 구분. walk 분기는 후자를 사용한다.

## 4. 지형·정적 경계 등록

- sample(x,z): World.H bilinear 보간, grid 외부 heightFn. normalAt은 1.25m 차분. playerTerrain(x,z)은 exact stairSurface 우선, 그 외 heightfieldTriangle과 roofHeight의 max. 삼각형 보간은 렌더 표면과 대응하려는 경로. groundAt(x,z,feetY)은 NPC용 연속 계단 경사, 주변 4방향 보조 표본, sample 및 walk=true top을 높이/step 조건으로 선택.
- stairSurface(x,z,margin,exactTreads): STAIRS 정의의 로컬 u/v를 계산. exact=false 연속, true는 단수별 높이(+.06). lab은 fixture 함수로 대체. waterLevel은 해수면 및 하천 조건; playerFloor로 바닥을 따로 구한다.
- gameplay mesh/box/cyl, buildStairs, house, registerCutstoneBridgeCollision 등에서 표시 메시와 충돌 proxy를 등록. box는 같은 중심·크기·yaw의 OBB, cyl은 두 반경의 max인 원통 proxy(테이퍼와 차이 가능), collide=false이면 표시만. 수동 addBox/addCyl/addRoof 경로도 존재. GLB 전체 삼각형 자동 충돌로 해석하지 않는다.

| 등록 | 자료/동작 |
| --- | --- |
| addBox | type, cx/cy/cz, hx/hy/hz, yaw/cos/sin, top/bot, walk, 선택적 climbable/stance/mantleOnly/lipInset |
| addCyl | type, x/z/r, y0/y1→bot/top, walk, 선택 속성 |
| addRoof | 별도 roofGrid, footprint/outer extent, yaw, shape gable/cone/shed, base/rise/thickness/facets |
| insert/query | CELL=32m XZ 공간 해시. 외접 반경을 덮는 셀에 참조 삽입, all에 등록. stamp/_s 중복 제거, 공유 out scratch 배열 반환. |
| ownership | 정적 grid/all/roofGrid에 공용 stable surfaceId, layer/mask, region ownership의 일반 규격 없음. 공유 query 결과의 장기 보관·중첩 호출에 주의. |

지붕: roofHeight는 solid footprint 안 지붕을 playerTerrain에 포함. footprint 바깥 overhang은 roofOverhangTop에서 maxY 이하만 지지. roofSlabsAt은 top/bottom 생성. roofSlabHit/playerCeiling은 중심 및 8개 둘레 표본으로 하부 겹침 검사. roofGableTop은 박공 끝 등반면 상단 보완. 상면 지지와 하부 차단은 다른 조건.

## 5. 충돌 질의 지도 (world-render L1066~1238)

| 함수 | 동작 및 제한 |
| --- | --- |
| playerContact(o,x,z,radius) | 원/OBB·원/원 겹침, {nx,nz,depth,collider}; 수평만. cyl 중심 일치 +X fallback, box 내부 가장 가까운 면 |
| playerSweepColliders | 주변 query를 넓은 원 접촉으로 필터, tick 내 후보 재사용 |
| playerFloor(x,z,maxY,radius,solids) | terrain/overhang/정적 top 중 최고 가능 높이, ID 대신 수치. walk=false top도 지지 가능, nearby 제외, radius=0 점 판정 |
| playerContacts(x,z,y,nearby,radius,solids) | static+nearby, 수직 PLAYER.body 범위 확인 후 수평 contact; walk로 차단 분리하지 않음 |
| playerCeiling | 상승 목표를 underside/slab 아래로 제한, PLAYER.body/radius 참조, nearby 인자 없음 |
| playerSteepGround | floor가 terrain/roof인지 확인, stair 제외, 50° 초과 gradient의 uphill ux/uz/k |
| playerFootSurface | radius=0, feetY+PLAYER.step로 playerFloor 호출, 표시 IK용 |
| groundAt | 연속 계단 및 walk=true인 top 지지, 주로 NPC |
| bodyBlockedAt / pushOut | 별도 겹침/직접 위치 보정 helper. walk/step 예외와 다른 epsilon. 주요 Player.walk→tryMove 경로는 이들을 사용하지 않음; 다른 소비자 전수 확인 후 제거 여부 판단 |
| occupiedAt | NavGrid/경로용 단순 높이와 inside margin |
| playerSafeSpawn | terrain 및 y 미지정 시 walk=true box top 검사, .25~24m 주변 탐색; 실패 시 terrain 이상 fallback으로 완전 안전 보장 아님 |
| collidersAt | 개발용 type/top/bot/walk/반올림 중심. ID/normal/정밀 폭/회전 등 없음 |

핵심: walk 플래그는 NPC 지지/spawn/기존 helper의 조건이지만 playerFloor는 모든 고체 top을 지지한다. traversalSolid는 climbable을 별도로 본다. support/block/climb/oneWay 정책을 분리해서 문서화한 뒤 수정할 것.

## 6. 플레이어 물리 (gameplay L2862~3794)

Input: 키 입력은 keyboardSteering=true, 모바일 이동 pointer는 false. move()는 길이 1 이하 전후/횡 벡터, groundMove()는 W/S 전후와 A/D turn 분리. Shift/모바일 sprint toggle. jump 소비형 queue, look은 렌더 프레임 1회 소비. traversal/swim/slide는 일반 vector 경로. 3인칭 keyboard facingYaw 독립, 1인칭 결합, turn=2.4rad/s, 후진 sprint 제한.

한 tick:
1. terrain 아래 좌표 복구 → 입력/movementYaw → jump consume.
2. 기존 traversal이면 advanceTraversal 후 return; 아니면 grab 후보 성공 시 traversal 전환/속도 초기화 후 return.
3. 목표 속도·지수 가속/감속, slide일 때 횡 조향 및 downhill, grounded jump.
4. 정적 sweep 후보 1회 수집, 이동 거리 .09m 이하 조각으로 tryMove. candidate에서 terrain/floor, step, 경사, 원점 ceiling, 수평 contacts 검사. 기존 겹침은 깊이가 감소하는 경우 허용.
5. tryMove는 최대 4회 잔여 이동 처리. 7회 이분 탐색으로 최초 blocked probe 근사, 해당 normal에 잔여 벡터와 수평 velocity를 최대 2회 투영. 축별 이동이나 질량/impulse 교환이 아님. 정확한 일반 swept convex TOI도 아님. 얇은 복합 proxy 누락 여부는 실험 필요.
6. 이동 뒤 물/바닥/수심으로 swim 전환. 일반 수직 운동은 ceiling, 하강 crossing, 이전 grounded인 경우만 제한된 snap; 급경사 slide는 onGround=false.
7. 후보 해제, 실제 이동한 grounded sprint만 stamina 소모, stepRise/moveHeading 기록.

jump vel.y=7, 하강 속도 하한 -45, 착지 시 landImpact 기록. slide는 uphill 제거·횡 조향 및 아래 방향 가속; 일반 재점프 제한. swim은 depth>1.3 및 발/ground 조건에서 진입, depth<1.05 이탈, 목표 y=surface-1.32+sin(simTime*2.1)*.025와 수직 응답·ceiling/support clamp. 현재 FLOAT는 고정값. fly는 별도 속도/범위 및 terrain 최소높이 clamp. teleport/setMode에서 traversal/slide·보간 초기화. 상태는 mode/onGround/swimming/running/exhausted/traversal/slide 등 분리 필드이며 상호배타 단일 enum은 없음.

## 7. 등반 계층 (gameplay L3030~3403, advanceTraversal L3640~3676)

action 종류 latch/climb/mantle/crest. surface={box?,x,z,nx,nz,...}; hands/feet에 point/normal, action에 from/to/elapsed/duration/tilt 및 이전 접촉. box는 climbable!==false, cylinder는 opt-in 및 r>=.3, mantleOnly/stance 별도.
- traversalStart: 지상·공중·slide에서 jump+방향 입력, solid face/terrain grade/ledge 후보.
- traversalFaceAt: box/cyl 표면 또는 높이필드 교점. stair·완만한 경사 제외. traversalContacts는 고정 높이/좌우 offset으로 접촉 후보를 구성하며 rig별 실측값이 아님.
- traversalBody: action 진행률에 따른 root 경로; traversalPathClear 정적 clearance 샘플(nearby=[]), advanceTraversal에서 실제 nearby로 재검사. 접촉 실패/소진/취소 시 action 해제와 낙하.
- latch→climb 반복 또는 side/segment handoff→mantle/crest→ground. 기존 처마/박공/원통 분절/측면을 보존. poseTraversal은 renderTraversal로 손발 IK 및 표시 몸통을 연결. 물리 후보 reach와 실제 rig 도달량 차이를 T1/T4에서 측량한다. 기존 MOVEMENT-002 실게임 미검증은 유지.

## 8. NPC와 기존 엔티티

NavGrid: 2m 기본 cell, groundAt으로 g, 수심 .3 미만 및 occupiedAt margin .5로 ok 생성. maxRise=1.65m/edge, 8방향 A*, 대각선 corner/높이 검사, nearestOpen 및 los. 정적 셀 pathCache와 정확한 목적지 별도, 검색 typed-array 재사용, heap 탐색 상한. 실제 지형 변경 시 invalidation 범위 확인 필요.

| 좌표 경로 | 동작 |
| --- | --- |
| 일반 주민 | Townsfolk.update에서 n.x/y/z, dt 기반 waypoint, 2.25m/s(작은 scale ×1.25), y는 groundAt과 dt*12 보정. 플레이어 근방/방향 조건에서 정지. strict 경로 검증 및 non-strict fallback 존재 |
| 관리형 | living.position(n.def.id)의 검증된 게임 clock 기반 논리 경로 좌표를 대입. 일반 Player solver 사용 아님 |
| 대화 접근 | prepareConversation/socialStep: 일반 주민의 검증된 단거리 목표, player/다른 주민 거리 조건, activityPoint. 관리형은 scheduler 좌표 유지 |

activitySegment는 .5m 표본, boot validateResidentSegment는 .35m 표본 및 별도 허용 오차. npc-movement.js는 유한 좌표/종점/길이/segment 검증 후 logical minute 기반 route.position. 경로 검증과 동적 접촉 해결은 별도 책임.

Townsfolk.playerContacts(L5471~5479): hidden 또는 n.ch 없음, 높이 차>2m/거리>2m 제외. {type:cyl,x,z,r:max(.12,.62*scale-PLAYER.radius),bot:n.y,top:n.y+1.72*scale,walk:false}. Player.advance에 전달. NPC 모델이 생성되어 화면 밖 visible=false인 경우까지 제외하는 것은 아님. 주민 logic은 미로딩에도 생존. 두 액터 반경의 독립 profile 및 양방향 solver 없음. 일반 경로의 NPC끼리도 Player solver를 공유하지 않음. 대화/목적지 분산은 별도 정책.

기존 createEntityRegistry: register/get/remove/removeRegion/list, {id,kind,region,ref}, 중복 ID 거부. regionEntries는 resident:region:index, NPC ref 및 lineI 저장/표시 활성 콜백. n.def.id는 생활·대화 별도 식별자. RegionLifecycle mount/suspend/resume/unmount 및 checkpoint로 registry/저장 관리. suspend는 registry 제거/표시 비활성, 메인 loop의 active gate는 NPC 충돌/갱신에 적용. 정적 grid/all/roofGrid의 일반적인 지역별 해제 API는 조사 경로에서 확인되지 않음. 신규 레지스트리 중복 도입보다 기존 재사용 검토.

## 9. 표시와 카메라 권위

| 계층 | 값/처리 |
| --- | --- |
| 물리 | pos/vel/state, 60Hz |
| tick 사이 | previousPos→renderPos, visualY exp(23/s) 및 ±.13m clamp 후 지면 하한; traversal은 renderTraversal.t로 action 재평가 |
| 몸통 | sampleBodySupport 5표본·span .48m, bodySupportCorrection, smoothBodyHeight 속도 제한 → actor.group.position |
| 발 IK | pivotFootTarget 지지 발, 일반 footSurface 높이 오차, 2-bone solveFoot 및 도달 제한. physics root 변경 없음 |
| 모션 | gaitPhaseStep(speed,dt), 후진/회전/절차적 pose 및 gaitSpeed 보간 |
| 주민 표시 | n.x/y/z→group, speed/phase 및 schoolyard update, LOD |
| 카메라 | CameraRig, MovementCameraFollow, smoothCameraHeight, solveThirdBoom/solveTraversalCamera |

sampleBodySupport는 surface ID 없이 높이 비교. 일반 fitFeet는 높이 침범/근접 보정이며 모든 지지발을 세계 위치에 고정하는 예측 IK는 아니다. pivot은 별도 고정 상태. renderPos/bodyY/cameraY의 보정 책임을 추적하되 무작정 하나로 합치지 않음.

MovementCameraFollow: keyboard 55° 초과 시작/30° 정지, 수동 look 우선. vector 이동은 입력 구간 moveBasisYaw 고정, 실제 이동과 요청 방향이 맞을 때 100° 초과 자동 추적. traversal/swim/slide/fly 제외. CameraRig는 base yaw/pitch/roll 및 속도/착지. studio third boom 목표 3.1m, 중심+near plane 4코너 및 body envelope 검사, 압축/복귀/fallback; traversal은 outward 주변 후보 검사.

worldRay(L5827~5870)는 정적 OBB/cyl finite segment 교차 + terrain/tread .1m 표본과 이분 탐색. 별도 roofSlabHit를 직접 호출하지 않으며 playerTerrain의 footprint 지붕은 검사. 바깥 처마/차양 및 동적 주민의 가림은 대표 fixture에서 별도 재현. 물리 clearance와 ray의 동일성을 가정하지 않는다.

## 10. 모션 테스트 공간

createMotionLabFixtures/bootMotionLab L6731~6913. 별도 query 페이지, 일반 카엘/주민/living 미생성, labSave 복사 및 write no-op. 실제 Player/Input/MovementCameraFollow/CameraRig/createCharacterRuntime 및 addBox/addCyl 재사용. 전역 playerTerrain/sample/stairSurface/waterLevel을 fixture 함수로 교체해 일반 heightfield/hydrology 생성과 다름.
- 30/45/60° wedge와 90° 벽, 12단 계단, .45/.85/1.38/1.72m 턱, 연못 및 동쪽 진입 경사, 더미. 연못 측벽 일부는 표시만, 높이 경계로 표현. 더미는 r=.35/top=1.81의 정적 cyl이며 live entity registry와 별개.
- lab Player.advance의 nearby=[]; 동적 NPC 접촉은 시험하지 않음. 현재 lab 표시 행동은 본게임 전체 상호작용 경로와 동일하지 않음.
- window.__dev는 player/input/avatars/rig/fixtures/renderer·높이/간소 collider 조회/reset/frame 노출. ID/normal/접촉 기록·본별 trace의 구조화 export는 없음. 최소 변경으로 기존 개발 훅 확장 제안.

## 11. 성능 관련 보존 자산

정적 32m hash/stamp dedup 및 query scratch, tick당 static 후보 수집; NavGrid typed-array/정적 path cache; 주민 큐 최대 3개/프레임 및 약 2.5ms deadline(첫 작업 보장); 모델 생성 .08s 간격, 가시성/거리 LOD, SHADOW 내/대화는 매 프레임, 그 외 30/20/10Hz, pose dt cap .12s. camera boom 개방 공간 기본 5 rays, 차단 시 추가 탐색; worldRay는 정적 broadphase 1회와 terrain 표본. 실제 효과/후보 수/시간/할당/실기기 성능은 미측정.

## 12. 확인한 구조적 차이 및 후속 검증 가설

| ID | 정적 관찰 | 실험할 영향 |
| --- | --- | --- |
| P01 | 고정 PLAYER profile 및 NPC radius의 PLAYER.radius 종속 | 남녀·scale별 경계 오차/크기 교환 T1 |
| P02 | sample/playerTerrain/groundAt 및 exact tread/ramp 차이 | 지형/계단/지붕 경계 실제 오차 T1 |
| P03 | walk 정책이 floor/spawn/occupied/helper마다 다름 | support/block/climb 정책 및 실제 형상 T1 |
| P04 | 모델 생성 여부와 프레임 snapshot 기반 NPC 접촉 | 모델 전후·교행·벽 가까이 겹침 T1 |
| P05 | Player fixed tick, NPC dt/논리 clock | 상태·시간·지역 인계의 일관성 T1 |
| P06 | renderPos/bodyY/foot IK/cameraY 표시 보정 | 몸통 튐/발 뜸 최초 불일치 계층 T2/T3/T6 |
| P07 | 별도 traversal action과 고정 anchor 후보 | rig 도달·잡기/놓기 전환 T1/T4 |
| P08 | 고정 float/수심 hysteresis | 입출수·체형별 경계 T5 |
| P09 | roof slab과 worldRay 정책 차이 | 처마 등 실제 시점 가림 T6 |
| P10 | registry와 정적 grid 별개, lab 함수 override | stable ID/해제/실게임 차이 T1/T7 |
| P11 | query 공유 scratch, collider 객체 참조 | 중첩 질의와 장기 접촉 기록 안전성 T1 |
| P12 | 분리 상태 필드 및 early return | 전환 시 유효 상태 조합·속도/접촉 인계 T3~T6 |

관찰은 코드의 구조이며, 사용자 체감 버그의 직접 원인 확정이나 실제 발생률 증거가 아니다.

## 13. 기존 시험과 다음 수집

- [player-physics.mjs](../../tests/player-physics.mjs): 실제 소스 조각 합성 환경, fixed tick/벽/모서리/계단/천장/점프/수영/NPC/스태미나/등반/카엘 등록/입력·조향.
- [world-playability.mjs](../../tests/world-playability.mjs): 실제 카엘 Node/Chromium 및 lab 진입·fixture·수영·저장/복귀.
- tests/camera-comfort.mjs: 보간/boom/시점; tests/world-performance.mjs: graphics/geometry/cache(실기기 FPS 보장 아님); tests/npc-movement.mjs 및 resident-activity.mjs: 논리 경로/활동; tests/schoolyard-motion.mjs, schoolyard-ik.mjs, studio-model.mjs: 리그/모션/IK.
- 시험 코드와 역사적 기록의 범위를 확인했으며 이번 실행 PASS가 아니다.

T1 다음 순서: 최신 main 및 점유 조정 → 기존 회귀 기준 실행 → 실제 남녀 rig 치수 D01 → world/lab proxy와 표면 D02/D03 → 재현 input/tick trace D04/D05 → 표시 좌표 및 비용 D09 → 공용 판정 계약/허용치 확정. 초기 디버그 도구는 기존 물리를 바꾸지 않고 body/geometry proxy, normal, 접촉, pos/renderPos/bodyRoot를 겹쳐 표시하는 방향. 기존 MOVEMENT-002/NPC 필수 검증은 유지.

## 14. 검증 한계

정적 소스의 주요 함수·분기·등록 및 호출 관계 확인. 모든 개별 구조물 인스턴스/legacy helper 소비자 전수 동적 계측, 실제 테스트·브라우저/실기기·리그 측량 미실행. 전체 node tools/check-infra.mjs는 이번 환경에서 NOT RUN. 문서 참조·단계 보존·변경 파일·main 반영을 별도 확인한다. 이번 등록으로 T1 구현을 시작/완료 처리하지 않는다.
