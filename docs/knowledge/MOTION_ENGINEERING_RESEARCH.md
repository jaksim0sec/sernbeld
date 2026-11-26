# 공용 모션·물리 엔지니어링 조사 및 구현 데이터 명세

2026-11-26 · [MOTION-11261538](../tasks/active/MOTION-11261538.md) T1~T8 지원 자료.
기준 main: `988880cefdf2a95cbfd3aa70955a44ead7ec3e30`. 상태: 외부 기술 자료 조사 및 코드 정적 확인. 설계 후보이며 신규 계약 승인·실측·구현 완료가 아니다. 외부 엔진의 기본값과 세른벨드 실제 계수를 혼동하지 않는다. 링크는 원 출처이며 설명은 자체 요약과 적용 제안이다. GDC는 공개 세션 설명을 확인한 범위로, 영상 전체 분석을 주장하지 않는다.

## 0. 착수 판단

기존 JS/Three.js, 60Hz 물리, 공간 해시, studio-v1 리그, schoolyard procedural pose, IK, 독립 lab을 재사용한다. 엔진 도입, MoCap 대량 구매, ML Motion Matching 학습, 전역 root motion은 지금 선행조건이 아니다. 우선 같은 지형과 같은 인체가 같은 판정 결과를 내고, 접촉·시간·거리 데이터에 근거해 모션을 만드는 것이 목표다. 공용 계약과 임계치 확정은 T1/T2에서 하고 T3 이후 임의로 완화하지 않는다. 기존 NPC/이동 점유 및 미검증 게이트는 기존 계획대로 유지.

## 1. 실무 기술 조사 카드

| ID / 원자료 | 실제 공개 방식 | 적용 / 유의점 | 관련 T |
|---|---|---|---|
| R01 [Unity Character Controller](https://docs.unity3d.com/kr/current/Manual/class-CharacterController.html) | 캐릭터 형상, skin width, step offset, slope limit 설정을 분리. | PLAYER 상수/접촉 허용차/계단 정책을 별도 profile로. Unity의 skin width 값을 이식하지 않는다. | T1/T3 |
| R02 [Godot CharacterBody3D stable](https://docs.godotengine.org/en/stable/classes/class_characterbody3d.html) | 사용자 주도 운동체의 slide, floor/wall/ceiling, floor snap, recovery margin을 명시. | 위 방향과 접촉 normal을 통해 분류; 상승 중 무조건 snap 금지. 기존 물리 권위를 보존. | T1/T3/T4 |
| R03 [Rapier JS controller](https://rapier.rs/docs/user_guides/javascript/character_controller/) | 캐릭터 이동량을 충돌에 맞게 수정하고 계단·snap·충돌 필터를 제공. | 기존 solver의 step 높이뿐 아니라 착지 공간, 지지 너비, 진입 조건을 검사. Rapier로 교체하자는 의미는 아님. | T1/T3 |
| R04 [Jolt CharacterVirtualTest](https://github.com/jrouwe/JoltPhysics/blob/master/Samples/Tests/Character/CharacterVirtualTest.cpp), [unit tests](https://github.com/jrouwe/JoltPhysics/blob/master/UnitTests/Physics/CharacterVirtualTests.cpp) | 계단 오르기·바닥 부착을 조절하는 샘플 및 단위 검증 존재. | lab에서 기능을 분리 ON/OFF하여 경사/단차/모서리 회귀를 좁힌다. | T1/T3 |
| R05 [Glenn Fiedler, Fix Your Timestep](https://github.com/mas-bandwidth/gafferongames/blob/main/content/post/fix_your_timestep.md) | 고정 시간 간격과 남은 시간 기반 표시 보간, 과도한 catch-up의 위험. | Player.advance의 고정 tick 유지; 입력 타임라인·누적 절단·시각 보간을 따로 기록. | T1/T3/T6 |
| R06 [Ubisoft GDC 2016, Fitting the World](https://gdcvault.com/play/1023316/Fitting-the-World-A-Biomechanical) | Assassin's Creed의 복잡한 지형에서 단순 사후 반응 대신 예측 기반 발 IK를 연구. | 접지 예상 시점/위치를 먼저 구해 지면을 질의하고 지지발 고정과 다음 발 목표를 나눔. 세부 구현은 자체 제안. | T2/T3/T4 |
| R07 [Epic Lyra locomotion](https://dev.epicgames.com/documentation/unreal-engine/animation-in-lyra-sample-game-in-unreal-engine) | 시작·정지·착지와 지속 이동에 거리 기반 재생 및 보폭 보정을 조합. | 이동량 대비 phase, 재생률과 stride 보정을 독립 계측. 현재 procedural gait를 유지. | T2/T3 |
| R08 [Epic Sync Groups](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-sync-groups-in-unreal-engine) | 관련 애니메이션을 공통 접지 마커로 맞춰 서로 다른 사이클을 연결. | L/R plant·lift 이벤트를 명문화, walk↔run/turn 사이드 대응. | T2/T3/T6 |
| R09 [Unity Two Bone IK](https://docs.unity3d.com/kr/Packages/com.unity.animation.rigging%401.2/api/UnityEngine.Animations.Rigging.AnimationRuntimeUtils.html) | 두 본 길이, target, hint, 가중치를 받는 IK 제약. | 실제 리그 segment 길이/관절축/pole을 읽고 현재 손·발 IK 검증. 단순히 끝점을 맞추려고 본을 늘리지 않는다. | T1/T2/T4 |
| R10 [Epic Motion Warping](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-warping-in-unreal-engine) | 애니메이션의 특정 구간을 목표 위치/회전에 맞춤. | 턱·등반에는 먼저 실제 허용 접점과 안전 이동을 계산하고 제한된 시각 조정만 적용. 전역 root-motion 전환 금지. | T4 |
| R11 [GDC 2018, Gears of War Inertialization](https://www.gdcvault.com/play/1025165/Inertialization-High-Performance-Animation-Transitions), [Daniel Holden springs](https://theorangeduck.com/page/spring-roll-call) | 이전 자세와 새 자세의 차이를 감쇠하는 전환 기법. | cross-fade 기준군부터, 실제 병목/전환 불연속 측정 후 offset decay 실험. 물리 root와 고정된 손발은 감쇠로 이동시키지 않음. | T2/T6 |
| R12 [Ubisoft La Forge Learned Motion Matching](https://www.ubisoft.com/en-us/studio/laforge/news/6xXL85Q3bF2vEj76xmnmIu/introducing-learned-motion-matching) | 자세·미래 이동의 특징을 활용한 선택, 전환 및 발 고정 후처리, 대형 데이터셋 메모리 문제. | 데이터의 특징/접촉/전환을 기록하는 원칙만 우선 채택. 현재 clip 수로 ML 도입·효율 수치 일반화 금지. | T2/T8 |
| R13 [Animation Mentor 12 principles](https://www.animationmentor.com/blog/tutorial-12-principles-of-animation/), [body mechanics](https://www.animationmentor.com/blog/animation-tips-tricks-what-makes-or-breaks-a-good-body-mechanics-shot/) | 준비, 무게 이동, 시차, 궤적, 타이밍과 읽히는 자세를 설계. | 주요 pose의 동세를 먼저 검수하고 나중에 보간/장식/손 IK. 물리 판정을 바꾸지 않는 과장만. | T2/T8 |
| R14 [Epic Movement Components](https://dev.epicgames.com/documentation/en-us/unreal-engine/movement-components-in-unreal-engine) | 보행/공중/수영 등의 모드와 물리 파라미터 구분. | 수심/수면/바닥과 행동 진입·이탈 기준 분리; 이미 있는 SWIM_IN/OUT부터 시험. | T5 |
| R15 [Epic Spring Arm](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-spring-arm-components?application_version=4.27) | 카메라의 원하는 거리, 공간 검사, 추적 지연 분리. | 기존 boom near-plane 및 몸체 여유, 빠른 충돌 회피/완만한 복귀 실험. 물리 root 수정 금지. | T6 |
| R16 [Recast/Detour integration](https://recastnav.com/md_Docs_2__2__BuildingAndIntegrating.html) | 전역 경로와 crowd/local movement·장애물 회피 기능 구분. | NPC 일정/논리 경로와 근방 이동 경계 인계를 분리. 전체 NPC에 동일 고비용 solver를 강제하지 않음. | T1/T7 |
| R17 [Epic collision responses](https://dev.epicgames.com/documentation/unreal-engine/collision-response-reference-in-unreal-engine), [animation notifies](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-notifies-in-unreal-engine) | 차단·겹침·무시의 정책 분리, 타임라인 기반 시청각 알림. | 일반 게임 엔티티의 충돌/트리거/표시 반응을 독립시키고 실제 게임 이벤트와 표시 알림을 중복 처리하지 않는다. | T7/T8 |
| R18 [Epic Animation Budget Allocator](https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-budget-allocator-in-unreal-engine) | 중요도와 계산 예산에 맞춰 애니메이션 갱신 빈도를 조정. | 이미 존재하는 NPC pose LOD를 기반으로 대화/근접 우선, 멀리서 pose만 덜 갱신. 충돌·시간 권위와 독립. | T1/T8 |
| R19 [Three.js animation system](https://threejs.org/manual/pages/animation-system.html), [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) | clip/action/mixer, 트랙/키/보간, 리그 계층·bind matrix 규격. | 기존 procedural/clip API 유지; 향후 GLB clip은 축/시간/bind 검증 후 읽기 어댑터. | T2/T8 |
| R20 [Chrome Performance](https://developer.chrome.com/docs/devtools/performance/reference), [Memory](https://developer.chrome.com/docs/devtools/memory), [Three Renderer.info](https://threejs.org/docs/pages/WebGLRenderer) | 프레임·메인 스레드·할당·렌더러 카운터 계측. | 동일 부하의 frame p50/p95, 각 구간 CPU, 후보 수, draw calls, geometry/texture count, 실제 heap trace 비교. renderer.info는 GPU byte 직접 측정이 아님. | 전 T |

## 2. 현재 코드에서 확보한 기준 데이터

아래는 소스에 실제 등록된 값이며 권장 신체 치수나 확정 개편 값이 아님. 구현 착수 시 최신 SHA 재추출.

| 분류 | 현재 값 | 원본 위치 |
|---|---|---|
| 인체 충돌 | radius 0.35m, body 1.72m, eye 1.50m, step 0.48m, wade 1.15m | [region.part.js](../../src/world/region.part.js) PLAYER |
| 이동 | walk 2.6m/s, run 7.5m/s, jump 7m/s, gravity 24m/s² | region PLAYER |
| 시간 | 1/60s, accumulator cap 0.1s, visualY 목표의 ±0.13m clamp | [gameplay.part.js](../../src/gameplay/gameplay.part.js) Player.advance |
| 공간 질의 | CELL 32m, CONTACT_SKIN .002m; OBB/cyl/roof 및 terrain | [world-render.part.js](../../src/render/world-render.part.js) |
| 경사/등반 | slide 50° 초과 기준, CLIMB rise/side .30m, duration .46s, drain 6.5/s, TRAVERSE_WALL_GAP radius+.018m; OVERHANG depth 1.05m/reach 2.32m | gameplay constants/traversal* |
| 수영 | SWIM_IN 1.30m, SWIM_OUT 1.05m, FLOAT 1.32m, 수면 bob .025m | gameplay Player.update; wade는 별도 config |
| 스태미나 | max 100, drain 12.5/s, recovery 25/s, delay .8s, restart 30 | gameplay STAMINA |
| 조향 카메라 | 3인칭 자동 추적 시작 55°, 종료 30° | gameplay MovementCameraFollow |
| 보폭 위상 | cycle strideLength = clamp(.9+.55×speed,1.2,3.8)m; phase delta = speed×dt×2π/stride | [avatar-motion.js](../../src/entities/character/avatar-motion.js) |
| NPC | walk 2.25m/s, scale<.8일 때 ×1.25; 현재 playerContacts의 n.ch·2m 조건 및 r=max(.12,.62×scale−PLAYER.radius), top=y+1.72×scale | [npc-movement.js](../../src/core/npc-movement.js), gameplay Townsfolk.playerContacts |
| NPC pose LOD | SHADOW 내 또는 대화 중 매 프레임; 그 외 22m 미만 30Hz, 42m 미만 20Hz, 나머지 10Hz. pose dt .12s cap | gameplay Townsfolk.update |
| 리그 | studio-v1 47본, 원본 pivot 차이 /1428로 local bone position 생성, group scale, 모델 발 기준 정렬 | [studio-model.js](../../src/entities/character/studio-model.js), [CHARACTER_RIG](../contracts/CHARACTER_RIG.md) |
| 실험실 | 30/45/60°(height 6m), 90° wall, 12단 rise .22/run .55m, 턱 .45/.85/1.38/1.72m, 연못 x[-56,-26], z[-13,13], bottom -3/surface -.18m, 동쪽 진입 경사 6m | gameplay createMotionLabFixtures |

### 데이터 상태 구분

- CODE: 코드에서 확인한 값. MEASURED: 동일 SHA의 실제 계측값. PROPOSED: 실험 후보. APPROVED: 사용자가 특정 범위를 승인한 값.
- 1.72m와 1.76m(의상 제작 기준)는 실제 두 체형 발~머리의 실측 결과가 아니다. 1428 변환 및 group/model scale과 foot alignment까지 적용한 모델 좌표를 측정해야 한다. 남녀 리그 원본 바이너리의 실제 수치 추출/캡처는 이번 조사에서 NOT RUN.
- 외부 엔진 예제의 수치, 사람 일반 치수, 모캡 영상의 화면 픽셀을 게임 리그 계측으로 대체하지 않는다.

## 3. 구현 전 필요한 데이터셋 및 추출 방법

경로명은 산출물의 논리적 ID로, T1에서 기존 구조 확인 후 파일 위치/형식을 확정. 단순 산출물은 JSON, 대용량 trace는 NDJSON/CSV, 영상·이미지는 기존 참조 경로와 해시. 아래 모든 데이터에 schemaVersion, sourceCommit, units, status, measurementMethod를 포함한다. 원본 자산을 수정하지 않는다.

| 데이터셋 | 필수 필드 | 수집·산출 방법 | 필요 T |
|---|---|---|---|
| D01 rig-profile | rigVersion, bodyVariant, scale, boneId/parentId/index, local rest transform, world rest pivot, bind matrix, segment lengths, joint local axes, limits, foot sole/palm anchor, root offset | studio-source.js로 실제 남녀 원본 로드; studio-model의 transform/foot 정렬 적용; 정면/측면 overlay와 수치 export. 각 체형/등록 scale별 측정; 의상·머리카락 별도 bounds. | T1 |
| D02 actor-boundary | actorId/type, rigProfileId, feet-root, radius/height/eyeHeight, shape, layer/mask, support/trigger flags, activation state | PLAYER와 NPC 산식 기준으로 비교하고 메시와 proxy 사이 간격을 표기. 일반 이동 경계는 간소형 유지; 모든 정점 충돌에 사용하지 않음. | T1 |
| D03 world-surface | regionId/fixtureId, stable surfaceId, source transform, collision shape, bounds, actual top/normal, support/block/climb/oneWay/water/decorative, material tag | 실제 카엘 등록 및 lab builder에서 추출. 회전 OBB/roof/원통/terrain 실제 샘플 비교. 수면은 bottom/surface/volume/entry profile 별도. | T1 |
| D04 motion-input | scenarioId, seed, actor/profile, fixtureId, start root/yaw, fixed tick, input flags/axis/look, timestamps, reset/teleport events | lab 실제 입력 또는 재현 runner 사용. 같은 tick에 같은 입력을 공급; 렌더 FPS만 변경. | T1/T3 |
| D05 physics-trace | tick, dt, requested/actual delta, root/velocity, previousRoot, action, supportId, contact normals/depth, grounded/swim/slide, blocked/reject reason, stamina | Player.advance와 query 측에 debug-only 기록; 고정 크기 ring buffer 후 일괄 export, render trace와 tickId 연결. | T1~T6 |
| D06 pose-trace | pose time/phase, actorId, clip/state, channel weights, rootRender/bodyRoot, per-joint local quaternion/position, hand/foot world anchors, contact weight/ID, camera transform | 실제 actor의 world matrices 업데이트 후 기록, IK 전/후 구분. 모든 NPC의 전체 본은 기본으로 기록하지 않음. | T2~T6 |
| D07 clip-manifest | stable id, schemaVersion, rigVersion, kind procedural/keyframe, duration, repeat, supported actions, syncGroup, markers, channels/mask, expected displacement or in-place, transition windows, contact constraints, source/license, tests | 기존 SCHOOLYARD_CLIPS와 procedural gait/turn/social catalog 분석. 기존 이름 유지, 새 clip 승인과 등록 분리. | T2/T8 |
| D08 reference-motion | referenceId, creator/source/license, action/context, frame rate, frame time, view, annotated key poses, support phase, path, observed vs inferred, allowed reuse | 직접 제작한 평범한 동작/허가된 자료 또는 원본 공개 교육 자료를 분석. 영상 좌표는 실제 3D 좌표로 단정하지 않는다. 게임/영상 자산 무단 복제 금지. | T2/T8 |
| D09 performance-trace | device/OS/browser, graphics/viewport/dpr, actorCount/visible/active, tick/render rate, frame/tick/pose/IK/query ms, candidate pairs, allocation/heap/renderer.info, warmup, trace length | Chrome Performance/Memory, performance.now() 구간 측정; WebGLRenderer.info. debug full pose 추적은 성능 비교에서 별도 실행. | 전 T |
| D10 entity-event-trace | tick, actionInstanceId/eventId, abstract entityId, active/visible, accepted/rejected reason, presentation event, cleanup/reset | 게임용 더미와 일반 트리거의 접촉/표시 수명 주기를 기록. 게임 이벤트 중복 방지/제거/저장 격리 시험. | T7 |
| D11 quality-review | scenarioId, baseline/new SHA, camera view, metric values/limits, captured assets, reviewer, aesthetic acceptance, automated PASS/FAIL/PARTIAL/NOT RUN | 동일 조건 다각도 영상/스틸과 trace 비교, 사용자 품질 판단과 기능 통과 구분. | 전 T |

### 인체/경계 계측 체크리스트 (T1)

1. 원본과 실제 런타임에서 같은 male/female profile을 생성. 중립 pose에서 월드 발·머리·눈·골반·어깨·무릎·발목·손목 위치 및 본 간 거리를 추출. 좌우 구분, 계층/축/단위/scale 포함.
2. 메시에 적용된 group/model 변환·발 바닥 offset·의상/장식 여부를 함께 기록. 원본 로컬 AABB를 그대로 런타임 몸체로 쓰지 않는다.
3. 몸체 충돌 proxy와 모델을 겹쳐 표시. 이동 충돌에 적합한 반경/높이는 지지 안정성, 좁은 통로, 계단 및 아트 간격을 검증해 결정. 긴 소매/머리카락 등 시각 요소는 본체 경계와 별개.
4. 손발 접촉 앵커의 월드 위치는 최종 pose와 IK 결과에서 추출; local bone pivot와 실제 표면 anchor 차이 기록. 리그가 바뀌면 profile 재생성.
5. 데이터 export를 원본 SHA 및 fixture ID로 재현할 수 있는지 확인. 남녀 값이 비슷하다는 이유로 측정 생략 금지.

### 지형/판정 데이터의 최소 매트릭스 (T1)

| 종류 | 변형 | 기대 확인 |
|---|---|---|
| 평면·벽 | 0°, 90°, 정면/사선/회전 | 지지/차단, 이동 중 모서리 탈출, 수직 겹침 |
| 경사 | 30/45/50±1/60°; 오르막/내리막/가로 | 걷기/slide/공중 상태 경계, 속도 일관성 |
| 계단 | 현재 12단, 단일 낮은 턱 및 임계 높이 ±오차 | 윗면 실제 위치, 착지 공간, 천장, 연속 보행 |
| 신체 높이 턱 | .45/.85/1.38/1.72m | 표면 도달 여부와 안전한 상태 전환 |
| 지붕·차양·원통 | 카엘 대표 구조, one-way/opt-in, 회전 | 표시 형상과 지지/차단 정책 대응 |
| 수영 | 얕은/깊은 물, 입출구, 수심 임계 전후 | 상태 chatter 없음, 바닥·수면 분리 |
| NPC·더미 | 동일/다른 scale, 모델 미생성, 숨김, 활성 경계 | 같은 경계 profile, 의도하지 않은 중첩·지지 없음 |

## 4. 동세 연구를 실제 작업으로 변환 (T2)

동세는 단순히 모션의 진폭이 큰 것이 아니라 방향성, 무게 이동, 시간 분배 및 자세의 읽힘이다. Animation Mentor의 원리를 참고하되 캐릭터가 실제 물리와 상호작용하는 게임에서는 입력 응답과 접촉 유지가 선행한다.

### 4.1 제작 순서

1. 의도와 읽혀야 할 방향/감정(중립·활기·차분 등)을 한 문장으로 정의. 입력 중단·전환 규칙부터 명시.
2. 키 포즈 blocking: 시작, 준비, 주요 자세, 회복, 끝. 보행 반복의 경우 contact/down/passing/up 등의 지지·통과 시점을 먼저 표시하고 양발 교대 규칙을 적는다. 실제 시간은 실측으로 확정.
3. 몸통·골반 방향과 시각적 무게 이동, 머리/팔의 독립 타이밍을 설정. 머리부터 손끝까지 같은 프레임에 동일한 각도를 더하지 않는다.
4. 관절/끝점 궤적의 spacing과 easing을 조정. 지지발·표면 접촉은 우선 고정하며 발/손 도달 범위를 검사한다.
5. 기존 pose 대조군, 낮음/기준/강함 3가지 변형을 같은 입력·속도·카메라로 비교. 변화는 한 변수군만; 완전 정지와 느린 재생에서도 확인.
6. 실제 게임 입력에서 전환, 부하 및 재사용을 확인. 등록 manifest 및 승인 기록으로 남긴다. 관절 과장으로 물리 root를 이동시키지 않는다.

### 4.2 동세 관측표

| 평가 항목 | 계측/관찰 | 실패 예 |
|---|---|---|
| 방향성 | 주요 pose의 가슴/골반/시선 방향, silhouette의 명료성 | 방향은 바뀌는데 몸 전체가 동시에 회전 |
| 지지/무게 | 고정 발의 drift, 접촉 시작/종료, bodyRoot 높이 변화; 실제 질량 분포가 없는 경우 골반은 시각 proxy라고 명기 | 체중이 옮겨지지 않는데 발만 들림 |
| 리듬 | 주요 pose/접지 marker 사이 시간, phase 속도 | walk/run 전환 중 같은 발이 두 번 접지 |
| 연결 | 이전/다음 pose의 각도·속도 차, 반복 경계 오차 | 순간적인 관절 튐, phase 무의미 reset |
| 궤적 | 손/발 끝점의 arc·spacing, lead/lag | 직선 로봇 궤적, 무의미한 전신 흔들림 |
| 자연스러움 | 정면·측면·45°/실제 플레이 시점의 비교 검수 | 자동 수치 PASS지만 불명확한 동작 |
| 응답성 | 입력→물리 상태 시작 tick 및 입력→표시 반응 시간 | 긴 선행 애니메이션이 입력을 무시 |

### 4.3 시험할 모션 기법

- Distance/stride: 이동한 실제 수평 거리 d를 기준으로 phase 변화량을 계산하는 변형과 현재 속도 기반 방식을 비교. 미끄러짐/공중/제자리 회전은 별도 규칙; 멈춘 발을 진행거리로 계속 돌리지 않는다. 보폭/phase 조정 범위는 실제 rig reach와 관찰을 근거로 결정.
- Sync marker: 왼발/오른발 지지 상태와 접지·이탈 시점을 맞춘 뒤 walk↔run을 혼합. 진입 시 같은 phase 숫자보다 접지 의미가 맞는지 확인. marker를 찾지 못하면 안전한 기본 transition 사용.
- Foot IK: authored swing을 유지하고 다음 착지 후보의 지면을 확인, plant 구간에 world anchor를 유지, lift 시 해제. 지면이 사라지거나 닿지 않으면 보정을 강제로 지속하지 않는다. 지지 다리와 swing 다리를 다르게 취급; bodyRoot 보정은 유계.
- Transition: 현행 blend를 기준으로 짧은 cross-fade/offset decay를 비교. 관절 quaternion은 최단 회전 및 정규화, 이전/다음 각속도는 진단용. 전환 대상이 물리 접촉으로 고정되면 그 접촉을 우선. 단순 smoothstep은 시작/끝 pose만 연결하는 것으로 실제 속도 연속성 보장은 아님.
- Layering: 전신 locomotion → 허용된 상체/시선 제스처 → 접촉·장착 IK → 의상/헤어 및 렌더. 실제 기존 구현 순서를 조사해 책임 정리; 이 순서는 제안이며 무조건적인 재배치가 아님.

### 4.4 예시 manifest (설명용; 실제 등록 데이터 아님)

```json
{
  "schemaVersion": 1,
  "id": "example.gesture.wave",
  "rigVersion": "studio-v1",
  "kind": "procedural",
  "durationSec": null,
  "rootPolicy": "inPlace",
  "repeat": false,
  "allowedStates": ["idle"],
  "syncGroup": null,
  "markers": [],
  "channelMask": ["upperBody"],
  "contacts": [],
  "transition": {"interruptible": true},
  "source": {"kind": "original", "license": null},
  "status": "PROPOSED"
}
```
null은 아직 정해지지 않은 초안 값이며 실행용 schema에서는 검증된 양수 duration과 source 권한 등이 필수. 기존 이름과 actual bone mask는 T2 확정.

## 5. 행동/연속성/카메라·엔티티 연구 적용

| 단계 | 선행 데이터 | 테스트 노하우 및 구현 판단 |
|---|---|---|
| T3 지상/공중 | D01–D07 | 속도·방향·접지 marker 기반으로 보행 전환. 일정 거리·각도에 따른 phase와 지지 오차 기록; 30/60/120FPS에서 같은 tick 입력 재생. FPS별 입력 타이밍이 달라 생긴 차이와 solver 자체 차이 구분. |
| T4 등반 | D01–D06 | 실제 표면/접점 및 도달 제한을 먼저 확정하고 기존 traversal 상태와 pose 연결. 실제 경로·상단 여유·접촉 상실로 실패가 구분되는 trace. Motion Warping은 목표 정렬의 개념만 차용. |
| T5 수영 | D02–D06 | 현행 수심 hysteresis를 임계 전후에서 반복 검증. 수면 높이/바닥 지지/벽과 시각 pose를 별도 추적. 입수/출수/낙하의 상태 전환 순서를 기록. |
| T6 연속성 후 카메라 | D04–D06/D09 | 먼저 카메라 수정 없이 연속 루트/상태/접촉 검증. 이후 boom 목표/실제 카메라/차단 여부/수동 조작을 분리하고 복귀 지연, jerk 비교. 카메라 보정에서 물리 값 변경 금지. |
| T7 엔티티 | D02/D03/D05/D09/D10 | NPC 논리/표시/활성 경계 분리. 같은 안정 ID와 게임용 이벤트 수명 규격, 중복 및 해제 검증. 게임용 더미 반응·시각 효과만 시험하고 현실 인체 위해 모델링은 범위 밖. |
| T8 제스처 생산 | D01/D06–D11 | 공용 manifest/clip 및 상태 정책에 연결. 기존 모션 ID와 레이어 우선순위 보존, 등록·미리보기·NPC/플레이어 적용·제거 흐름 검증. 중요도 기반 pose 갱신; 별도 엔진 도입 판단은 측정 후. |

## 6. 실험실 계측 명세

### 최소 로그 레코드 예시 (개념, 실제 실측값 아님)

```json
{"scenarioId":"lab.step.walk","tick":0,"actorId":"test-player","fixtureId":"lab.stairs","physics":{"root":null,"velocity":null,"state":null,"supportId":null,"contactIds":[]},"pose":{"phase":null,"bodyRoot":null,"leftPlant":null,"rightPlant":null},"timingMs":{"physics":null,"pose":null,"ik":null}}
```

실행 시 null이 허용되는 실제 비활성 필드 외에는 계측값 필요. 상태/접촉의 유효 여부와 data unavailable를 구분. 전체 본의 배열은 필요한 capture에만 별도 저장하고 지표를 요약하여 보관한다.

### 직접 계산할 품질 지표

- 고정 지지 발 drift = plant 구간 시작 anchor 대비 평면 거리(최대 및 p95, 이동 지지면은 지지면 로컬 기준). 양발 독립. 명시적 스윙/미끄러짐 구간 제외.
- 접촉 오차 = 표시 anchor와 요청된 표면 접점의 거리 및 표면 normal 방향 signed distance. 수치 허용 skin과 실제 표시 관통의 구분. 실제 렌더와 proxy 오차를 따로 기록.
- 관절 전환 각도 = 2 acos(clamp(abs(dot(qPrev,qNow)),0,1)); 각도 속도는 실제 샘플 dt로 나눔. 관절 회전 단위 rad. 예외: 리셋/텔레포트는 일반 transition metric에서 별도 분류.
- root/카메라 연속성: 시간 스탬프에 기반한 속도·가속도·jerk 비교, 최대 single-frame displacement와 진동 횟수. 유효 입력/실제 낙하·계단 높이로 설명되는 변화는 분류. 불연속을 0으로 강제하지 않음.
- 상태 안정성: 기대 state sequence, 1 tick에서 상호배타 상태 중복, 경계 근처 왕복 전환 횟수, 지원되지 않는 접촉의 지속 및 reset 누수.
- 성능: frame/tick/pose/IK/query 각각 p50/p95, 최악값 및 장시간 heap 변화, 활성 후보수·동시 pose 수. 평균 FPS만 보고 판정하지 않음. 60Hz의 16.67ms는 전체 주기의 상한이고 개별 물리 비용 예산이 아님. 문서의 10% 상대 악화/0.03m drift/0.01m 표시 관통은 **이전 계획의 제안치**, 실측 확정 전 PASS를 선언하지 않는다.

### 재현 실험 설계

- A: 고정 입력·고정 tick·기존 알고리즘 기준. B: 변경 변수 하나만. seed/profile/그래픽/시작점/기기/해상도/동일 시간 스크립트 유지.
- 테스트 세트: 합성 단일 표면 → lab 실제 렌더/리그 → 카엘 대표 경로 → 50 NPC와 모바일 부하. 비활성/가시 여부는 독립 축.
- 성능은 제안 기준 warmup 10초, 30초 측정 3회; 실제 30분 연속은 최종 게이트. 기기 thermal throttling/브라우저 버전/빌드·캐시 상태 기록; cold-load와 정상 프레임 시간 구분.
- 실패를 trace로 저장하고 최초 불일치 tick을 찾아 회귀 추가. 시각 품질은 영상/스틸과 수치 비교 후 판단. 직접 테스트 성공을 실기기·승인 결과로 대체하지 않음.

## 7. 데이터 우선순위 및 착수 체크리스트

| 구간 | 확보되어야 하는 것 | 현재 상태 |
|---|---|---|
| T1 전/중 | D01 실제 남녀 측량, D02 profile 후보, D03 lab/카엘 표면 목록, D04 input, D05 physics trace, D09 baseline | 코드 상수/추출 경로만 확보, 측정 NOT RUN |
| T2 전/중 | D06 pose trace, D07 기존 clip inventory/marker, D08 참고 동작, D11 품질표 | 연구/형식 후보 확보, 실제 pose capture NOT RUN |
| T3~T6 | 상태별 입력/전환 fixture, 실루엣/접촉/연속성 trace | 계획에 지정, 구현 NOT RUN |
| T7 | D10 이벤트/생명주기 기록, 성능/저장 격리 | 후속 |
| T8 | 전체 manifest 및 생산 사례, 권한·승인·재사용·비용 기록 | 후속 |

첫 착수에서는 D01~D05/D09의 최소 수집기를 기존 lab과 테스트에 붙이고, 실제 원본 데이터 읽기/fixture 측정이 성공할 때까지 캐릭터 크기·관절 한계·계단 임계치를 임의 확정하지 않는다. 직접 검증은 `node tests/player-physics.mjs`, `node tests/world-playability.mjs --no-browser`, 필요한 Chromium/리그 검사로 시작; 기존 작업 점유 조정 후 수행한다.

## 8. 문서 검증과 미확인 범위

- 공식 엔진 문서, 기술 발표 공개 설명, 연구 개발자 자료와 교육 자료의 공개 페이지/검색 본문을 확인했다. Rapier 및 Fiedler 본문 열기 중 캐시 미응답이 있었으므로 해당 항목은 검색 발췌/대체 공개 링크 기반이다. GDC 전체 강연이나 연구 코드 전체를 확인한 것으로 간주하지 않는다.
- 실제 모델 데이터·모션 캡처·실험 수치 및 브라우저 테스트는 이번 문서 작업에서 생성하지 않았다. 위의 현행 상수는 코드 확인 결과; 실측 및 튜닝 허용치는 T1/T2에서 결정.
- 기존 모션·리그·월드·게임 파일 변경 없음. 기존 T 주소·상태·점유·최종 검증 기준 변경 없음.
