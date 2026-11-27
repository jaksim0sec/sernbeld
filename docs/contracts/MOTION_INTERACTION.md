# 공용 물리·표면 상호작용 계약 (T1 기반 종결)

상태: T1 공용 기반 VERIFIED/PASS/DONE (등록/정적 Player 및 terrain/stair/roof 높이 소비). 전체 이관은 T2~T8에서 계속한다. 아래 PARTIAL 메모는 당시의 역사적 기록이며 마지막 절의 확정 범위 및 단계별 책임이 우선한다.

- `src/core/world-collision.js` createWorldCollision: instance ID/region/physics/transform/shapes 등록. m, Y-up, yaw radians, positive scale. box/water half extents, cylinder radius/height(동일 XZ scale), heightfield/roof는 geometryRef 및 local bounds. 비지원 변환·누락된 explicit policy·중복 ID는 거부. 장식은 빈 shapes, water는 비고체 volume. 원본/반환 스냅샷과 내부 데이터 분리.
- handle은 id+generation; 삭제 후 같은 ID 재등록해도 이전 handle 무효. revision은 변환/활성/지역 상태 변경 때 증가하여 anchor 무효화. region suspend는 개별 active 값을 보존. query purpose 및 layer/self exclusion은 공통 resolver에서 적용. oneWay의 방향성, 실제 geometry query는 backend의 책임.
- 정책은 block/support/mantle/oneWay/nav/camera/water 및 climb none/face/mantleOnly 명시. legacy walk=false도 support=true, nav=false. legacy spawn/ceiling 등 추가 정책 매핑과 전체 기존 의미 검증은 후속 이관. policy.id는 문자열 식별자이며 현재 별도 preset registry 없음.
- queryAabb는 정확한 yaw-transformed box/cylinder bounds 및 analytical bounds 기반 **개발 참조 검색**이다. 좁은 실제 충돌이나 생산용 공간 해시가 아니다. backend query API는 args/filter/resolveShape callback을 전달하며 resolveShape를 hit 선택 이전에 호출해야 한다. backend 없으면 지원되지 않는 기능으로 명시 실패. 실제 raycast/sweep/overlap/sampleSupport/sampleSurface/sampleWater의 기하 알고리즘 및 결과 검증은 후속 단계. backend spatial index 동기화/원자성도 통합 시 구현·시험할 것.
- classifySupport: 단위 기하 normal, 실제 발 접촉, support 정책, walkMax와 slideEnter/Exit를 분리. 수직/아래면 비지지. 임계각 50° 기존값을 테스트에서 보존. slopeGravity는 경사 접평면 중력 성분만 반환하며 실제 slide controller는 미변경.
- 테스트: `node tests/world-collision.mjs`. 작성 함수와 동일한 테스트 함수 47 assertions JS V8 PASS, Node 파일 직접 실행/통합 미실행. 실제 기하 contactNormal/feature ID, 부호, TOI, 기존 shape adapters, broadphase/region 동기화와 profile 소비는 미완료. 이 계약을 런타임 적용 완료로 간주하지 않는다.

## Legacy primitive 연결부 (부분 구현)

- `src/core/world-collision-legacy.js`의 createLegacyStaticCollision은 addBox/addCyl 완료 record와 기존 query/inside/local/playerContact를 받아 정적 shape 등록, 기존 top support 및 lateral contact를 변환한다. 지원 범위는 static primitive만이며 실제 geometry 변형/이동은 legacy grid 재삽입 전에는 지원하지 않는다. 현재 revision 해석은 backend 내부 resolver의 revision 생략일 때만 허용; 저장 anchor는 명시 revision 필수. removed/inactive/self/layer/purpose 필터는 후보 선택 이전 수행.
- support hit의 separation은 root.y-top; overlap은 기존 수평 penetration의 음수. 모서리의 geometricNormal은 null(고유 단일 face 없음), contactNormal은 solver 분리 방향. top feature point는 실제 상면에 제한. 아직 지형/roof/water/nav 등의 종합 질의 아님. 미등록 record를 무시하므로 기존 runtime authority 전환 금지. `sampleHeightfieldTriangle`은 기존 삼각형 interpolation과 실제 normal/feature를 반환하는 geometry helper, outside grid는 null. 지형 등록·global surface ID 연결은 다음 이관.
- `node tests/world-collision-legacy.mjs`: 실제 world-render source 조각 기반 parity 테스트. 동일 함수의 V8 격리 실행 44 assertions PASS, 기존 47 PASS. Node 파일/실제 game.js/브라우저 미실행. 기존 runtime은 미수정.

## Analytical 표면과 수역 (격리 구현)

- `registerAnalytical(instance,{sample,priority})`는 단일 roof/heightfield 또는 water source만 등록한다. world-coordinate sampler와 명시 bounds, region/revision/필터를 공유한다. 움직이는 geometry 및 생산용 공간 인덱스 미지원. `sampleSupport`는 기존 primitive 및 analytical 후보를 함께 선택한다. 기하 normal이 고유하지 않은 ridge/corner는 null; analytical 접촉의 solver normal은 미계산(null). roof overhang의 방향별 차단/ceiling/overlap 및 실제 동작은 후속. `sampleWater`는 수면·바닥·수심·침수량을 별도로 반환하며 고체 support가 아니다. 실제 sea/river/pool domain 연결 및 부력은 후속.
- `tests/world-collision-surfaces.mjs`의 48 신규 assertion과 기존 91 assertion 격리 실행 PASS. 실제 runtime 변경 없음. 위 표면 선택은 legacy max terrain과 다를 수 있어 통합 전 비교 필요.

## 실제 런타임 등록 어댑터 (T1 미완료)

- `src/core/world-collision-runtime.js`는 기존 `addBox/addCyl/addRoof` 완료 record에서 공용 `createLegacyStaticCollision`로 동일 기하의 별도 명시 등록을 만든다. 구형 record는 움직임 계산의 기존 공간 해시 안에 남으며, 신규 표준 필터는 ID/지역/형상/정책/reference sample만 제공한다. 임시 serial ID는 월드 생성 순서에 따라 결정되므로 저장 앵커나 동적 authoring의 영속 ID로 사용 금지; 정식 authoring에는 명시적 collisionId와 수명/리비전 검증이 필요하다.
- 지붕은 footprint와 돌출 overhang의 oneWay/support 정책을 분리 등록한다. heightfield/STAIRS/모션 실험실 pool의 analytical sampler를 등록하되 실제 벽면·처마 overlap, sweep/ceiling, 수역 출수 이동 및 NPC pathfinding은 legacy authoritative 경로를 유지한다. 참조 analytical 검색은 선형이라 매 프레임 대량 호출 금지.
- `GameEvents`의 region 활성/중지/해제는 레지스트리에 전달되나, 레거시 grid의 정적 데이터 소유권 및 실제 지면 판정과 동등하게 비활성화된다는 뜻은 아니다. `window.__dev.collision.stats()/probe(x,z,y)`는 디버깅용으로 기존 floor/new sample의 불일치를 관찰할 뿐 자동 보정하지 않는다.
- 로드되지 않은 NPC 모델도 `Townsfolk.playerContacts` 반환 후보에 남는다. 모델/LOD와 body의 생명주기는 분리됐지만 현재 NPC 충돌 반경 계산은 legacy 상수 기반이며, 프로파일 대칭·접촉 쌍 분리 및 필터 검증은 추가 필요.
- `tests/world-collision-runtime.mjs`과 기존 3개 reference 테스트를 메인 workflow에서 직접 실행하도록 추가. CI 출력을 얻기 전까지 PASS라고 선언하지 않으며 관련 runtime 통합의 browser/실게임/실기기 결과도 NOT RUN. T1 잔여 B~E 직접 판정 이관과 W01~W12는 [작업 기록](../tasks/active/MOTION-11261538.md)에 유지.

## 정적 플레이어 판정의 공용 권위 이관 (2026-11-26, PARTIAL)

- `playerContacts`: `createRuntimeCollisionBridge.contacts` → `registry.overlapBody`를 사용. source-grid의 이미 수집된 solids 후보를 중복 조회하지 않고, registry ID/region/policy로 필터링한 후 기존 `{nx,nz,depth,collider}`를 동일 후보 순서로 반환한다. NPC 동적 근접 contact는 기존 별도 인자 뒤에 유지한다. 전체 움직임 알고리즘과 좌표 적분은 교체하지 않는다.
- `playerFloor`: 정적 box/cyl 최고 상면 선택을 `staticSupport` → `sampleSupport({staticOnly:true})`로 이관. 실제 terrain/STAIRS/roof는 현재 별도 기존 수면·표면 계산을 유지. `playerFootSurface`도 `playerFloor` 호출을 통해 정적 부분을 간접 소비. 값이 동일하도록 `tests/world-collision-runtime.mjs`에서 bridge on/off parity 검증한다.
- `playerCeiling`: 정적 box/cyl 최저 아랫면 선택을 `staticCeiling` → `sampleCeiling`의 `underside` feature와 `[0,-1,0]` 기하 normal로 등록. 최종 `PLAYER.body + CONTACT_SKIN`과 처마 `roofSlabsAt` 로직은 유지. 층/지붕 underside parity 직접 회귀 추가. `bodyBlockedAt/pushOut/occupiedAt`와 camera ray 및 신규 surface IDs는 아직 완전 통합하지 않았다.
- `tests/world-collision-runtime.mjs`는 동일 레거시 world-render 소스를 새 bridge 켬/끔으로 평가하며 두 경로의 높이, normal/depth/order/ceiling clearance를 직접 비교한다. 외부 결과는 [CI 45847848067](https://github.com/jaksim0sec/sernbeld/actions/runs/45847848067)의 Node 7종 및 Chromium 2종 PASS, [CI 45848804611](https://github.com/jaksim0sec/sernbeld/actions/runs/45848804611)의 추가 headroom Node 7종 PASS까지 확인. `game.js` 재생성, `sw.js` v82; 최신 수정 SHA의 browser/실모바일 회귀는 별도 게이트.
- 현재 analytical 표면 조회는 debug/reference로 한정. 생산용 indexed roof/stair/terrain query와 실제 경사 normal 일치, water/clearance profile, anchor/revision, NPC navigation·카메라 소비, 제작 manifest/경로 점유 해제, W01~W12/실모바일 측정 완료 전에는 T1 **종결 금지**.

## Analytical 공간 인덱스 및 명시 ID (2026-11-27, PARTIAL)

- 정적 analytical 등록 시 XZ 32m sparse cell 인덱스에 연결한다. 256개 셀 초과 대형 source는 별도 목록으로 처리해 전체 월드 격자 할당을 피한다. 정확한 bounds 및 기존 policy/revision resolver를 narrow phase 전에 검사한다. 제거 시 인덱스도 정리하며 suspend/resume은 기존 resolver에서 처리한다. 전체 registry queryAabb는 여전히 debug reference이다.
- stair bounds는 기존 stairUV 투영의 역변환으로 실제 네 모서리를 계산한다. terrain/stair/water도 명시 collisionId를 받을 수 있고, roof 자식 ID 중복은 두 자식 등록 전에 검사한다. 기존 미지정 serial ID는 유지되므로 제작 manifest 전체 이관은 아직 아니다.
- runtime bridge에 sampleWater를 노출했다. 기존 수영 controller는 바꾸지 않았다. 신규 회귀는 원거리 80개 source, 인덱스 삭제, 대형 수역, suspend/resume, 명시 ID와 회전된 계단 bounds를 확인한다. 실제 renderer source를 사용한 V8 격리 실행 및 analytical surface 테스트 PASS; Node/Chromium/실기기와 성능 p95는 NOT RUN. 기존 지형/지붕/계단/수역 권위 소비자, 제작 manifest 및 NPC nav/camera/IK 이관은 미완료.

## 표면 높이의 실제 소비자 이관 (2026-11-27, PARTIAL)

- sourceKind별 indexed analytical support 조회를 노출한다. terrain/계단/roof footprint/roof overhang을 구분하고, 가장 높은 roof/terrain 및 첫 등록 stair 선택을 보존한다. roofHeight/roofOverhangTop, heightfieldTriangle, playerTerrain의 exact tread 경로가 실제 renderer에서 이 질의를 소비한다. 따라서 playerFloor/foot IK에도 연결된다. 기존 범위 밖 terrain sample 및 모션 lab의 별도 analytical height callback을 유지한다. legacy 계단 우선순위와 처마 maxY/skin 보존.
- 모션/solver/수영/경사 유한차분 및 roof slab/headroom의 기존 동작은 미변경. region suspend 시 roof support는 공용 resolver에서 제거되지만 terrain fallback과 legacy grid 등은 추가 이관 필요. 정확한 slope normal/anchor, NPC nav/camera, 수역 controller, asset manifest는 미완료.
- 실제 renderer 소스를 사용하는 runtime fixture 159 assertions와 analytical fixture 48 assertions V8 격리 실행 PASS. game.js는 동일 6개 source fragment 순서로 재생성, SW v83. 최신 변경의 실제 Node/Chromium/모바일은 NOT RUN/NOT VERIFIED; 이전 main f3545fe CI 45908175756에서 물리 직접 Node 7개 PASS, 전체 contracts의 기존 INFRA/NPC tools/verify.mjs 점유 충돌과 browser 얼굴 형상 featureError는 FAIL로 보존.

## T1 기반 종결 (2026-11-27)

- `f3fde2ed817cb02e8f411b5f3f04e6490a7a8db2`의 [CI 45908960059](https://github.com/jaksim0sec/sernbeld/actions/runs/45908960059)에서 공용 등록/실제 소비자 Node 직접 검사, 물리/실월드 Node 회귀, 카엘 및 모션랩 Chromium 직접 회귀 PASS. 전체 CI는 check-infra 및 캐릭터 featureError FAIL이며 실모바일은 NOT RUN.
- 등록/purpose/region/revision·primitive/analytical의 실제 지원 범위만 T1 계약으로 확정한다. 완전한 sweep/raycast, 미이관된 수역/경사/anchor/nav/camera/actor 및 manifest는 완료된 권위 API로 사용하지 않는다.
- T2~T8의 미완료 필수 구현과 W01~W12·실모바일 책임은 [T1 종결 및 잔여 책임](../tasks/active/MOTION-11261538.md#t1-종결--공용-물리-기반의-독립-결과-2026-11-27)을 따른다. 기존 수치 및 검증 기준은 유지한다.

## T2 모션 실험 초안 (2026-11-27)

[실험 모듈](../../src/entities/character/motion-experiment.js)과 `window.__dev.motionExperiment`는 모션랩 전용: manifest(), rig(), replay({scenario,strength,scale,frames}), start(), stop(), read(). trace는 최대 600프레임, 명시적 수집만 수행하고 자동 중지한다. replay는 분리 배우에서 기존 driver를 사용하되 물리/IK 완결을 의미하지 않으며, 강도 변화는 중립 대비 상체 채널에만 적용하고 관절 제한 유지. 실제 플레이어 root/기존 모션은 변경하지 않는다. supportCandidate는 판정 후보이지 접지 확정이 아니며 ankleProxyGap은 실제 발바닥 위치가 아니다. contact/transition windows 및 실화면 품질 미확정.

## T2 실제 피부 메시 접촉 관측 보강 (2026-11-27)

- trace/capturePose에 rest sole 하단 25mm의 foot 계열 가중치 0.5 이상인 실제 body vertex를 선별해 posed skin 좌표를 표면과 비교하는 `soles`를 추가한다. 발목 proxy도 보존한다. 의상/신발, 완전한 발 전체 형상, 접촉 권위 및 실제 support window를 대신하지 않는다. 표면 없는 샘플은 null, 재접촉/teleport와 같은 vertex의 연속 관측을 구분한다. 수집은 실험실/분리 replay에 한정된다.
- `summary`는 action 관찰 구간, ±15mm 내 후보 접촉 구간, 동일 vertex 연속 관측의 최대 수평 drift/비교 수, grounded 최대 관통을 제공한다. 관측이 없으면 null이며 통과로 해석하지 않는다. 기존 제안 30mm drift/10mm penetration 허용치는 변경하지 않는다. Chromium 실제 이동 및 3방향 캡처, 남녀 분리 rig sole 테스트를 추가했으며 신규 SHA CI/시각 판독은 아직 NOT RUN.

## T2 재현·평가 기준 (2026-11-27)

- 직접 측정의 PASS와 동작 품질의 PASS는 별개다. 기존 실시간 idle→walk trace(CI 45920356268)는 left 541.2mm drift/21.94mm penetration, right 215.8mm/9.52mm를 관측했다. 근접 vertex 연속 비교이지 지지 의도/실제 foot lock을 증명하지 않는다. 기존 30/10mm 기준 유지. T3는 의도된 지지 구간을 별도 명시하고 실제 지지 중 drift를 다시 검증한다. 지면 근접만으로 지지 판정하지 않는다.
- `motionQuality`는 동일 teleport 및 0<dt<=0.1s에서 phase wrap/reverse, local quaternion 최소 회전각(부호 불변), pivot heading 변화, grounded 전환을 기록한다. rootRender와 bodyRoot의 편차는 표시 보정 관측이며 물리 위치를 수정하지 않는다. 고정 60Hz 기존 Player→avatar.update 재현은 idle/walk/backpedal/pivot/jump, 132 samples/행동, 전후 idle 포함; 실제 3인칭 post-IK pose와 원본 trace를 artifact로 보존한다. 단순 phase 반대는 입력 반전/잔여 속도와 분리하여 판정한다. 동세 평가는 방향, 지지/무게 중심, 준비·실행·회복, 골반/흉곽/머리/팔의 시간차, 실루엣 및 전환 연속성을 함께 보고, low/baseline/high는 실험 옵션이지 승인된 외형 preset이 아니다.
- 기존 motion manifest의 contact/transition null은 아직 미작성임을 의미한다. contact는 의도된 지지 조건과 관측 window를 분리하고, transition은 실제 입력/물리 상태에 의해 시작되는 시점과 표시 blend를 분리한다. 이후 T3~T6는 동일 trace/metric을 소비하며 T8은 새 clip의 authored windows와 채널 우선순위를 등록한다.

## T2 모션 표현 및 접촉/전환 표준 v1 (2026-11-27)

- `motionPolicy(action)`을 절차적 manifest에 포함한다. 권위 action 전환은 clip 완료를 기다리지 않는다. phase 유지가 기본이며 teleport/actor replacement는 별도 reset 사건이다. idle/social은 양발 지지 후보, walk/run/backpedal은 기존 gait/near-surface 보정 후보(후진 phase 역방향), airborne/swim/fly는 지면 lock 없음. pivot만 기존 pivotFootTarget의 반주기 지지/스윙과 가중치를 명시한다. gait 및 기존 keyframe의 저작 접촉 window는 미작성 null로 유지하며 접지 관측이나 무릎 각도에서 임의 확정하지 않는다. T3는 실제 지지 의도/foot lock, T4~T5는 행동별 접촉 계약, T8은 신규 clip의 저작 marker를 채운다. 이 표준은 런타임 동작 수정이 아니라 이후 단계의 입력/평가 계약이다.
- 동세 강도 실험은 동일 body/scale/root/phase/timing에서 중립 대비 골반·허리·흉곽·머리·팔 채널 .65/1/1.35배(리그 범위 clamp), 하체 local pose 유지. `compareMotionStrength`로 동일 root/phase/하체 채널 및 상체 회전 차이를 비교한다. 실제 피부 리그를 동일 camera/lighting으로 2개 시점×3방향×3강도 캡처하고 수치/원본 pose를 artifact로 저장한다. detached driver이며 본게임 post-IK 품질·미적 승인을 뜻하지 않는다. 미적 방향은 기준 모션을 기본값으로 보존하고 선택 전 실제 증거를 검토한다.
- 합격 조건: 직접 실험 재현 PASS, 동일 root/phase/하체 local 차이 0, 상체 표현 차이 관측, 3방향 가독성 평가. 향후 행동 구현 품질 기준은 지지 중 drift 30mm/관통 10mm 목표와 별도 전환 검증을 유지한다. 새 SHA 직접 CI 및 캡처 육안 판독은 아직 미확인.

## T3 지상 소비자 이관 1차 (2026-11-27, PARTIAL)

- 등록된 primitive의 활성 및 지역/block 필터를 bodyBlockedAt/pushOut/occupiedAt에 공통 적용한다. 기존 허용치와 기하 판정은 유지. bridge 없는 legacy fixture fallback 및 stale 등록 비활성 유지.
- groundSlope는 실제 선택 지지 높이와 일치하는 terrain/lab-ground normal에만 classifySupport를 적용한다. null은 확인된 보행 가능, undefined는 미확정(기존 경로로 복귀)이다. 계단/지붕 분기 및 50° 기준 유지. T3 이동 후보/모션·접지/실화면 검증은 미완료.


## T3 등록 정적 수평 sweep (PARTIAL)

- `sweepBody({root,delta,profile,candidates}, {regionId,purpose:'block'})`: static box/cylinder only, delta.y=0; returns sorted SurfaceContacts with normalized contactNormal and fractional toi. Rounded OBB corner uses geometricNormal=null. Existing start overlap is left to endpoint escape policy. Runtime staticSweep selects simultaneous earliest contacts and Player candidate consumes the existing cached broadphase at the candidate feet height when endpoint overlap permits. Step/vertical/terrain/roof/dynamic ownership remains with existing solver; this does not establish full continuous 3D collision coverage.

- Ground support queries use support-only stair selection; an unreachable upper tread remains a horizontal admission barrier but cannot erase the lower landing surface or override its steep-grade classification. Stair seam exemption is bounded to nearby reachable tread heights; legacy no-registry behavior remains.

- Heightfield seams: original interpolated height is unchanged. Noncoplanar diagonal/cell edges and shared vertices return a `seam:` feature with `geometricNormal=null`, while coplanar seams retain their exact normal. Runtime `groundSlope` defers ambiguous normals to the existing fallback. Directional seam traversal and full compound sweep are not established by this change.

## T3 live ground-gait support (2026-11-27, PARTIAL)

`gaitSupportWeight` uses the procedural low-knee half-cycle (cos(phase+sideOffset)<-.12) with a ramp. `groundGaitTarget` anchors the ankle in world XZ only in third-person grounded gait; near-surface acquisition, bounded correction, support revalidation and release preserve authored swing and physics ownership. Reverse playback uses the same windows. Torso support is stance-weighted, penetration correction is retained on swing feet, and pivot/traversal/first-person/slide/combat/airborne paths do not acquire gait anchors. This is authored ankle intent, not verified sole contact; the 30mm/10mm actual posed sole gates and V01 remain unverified.

T3 transition consumer: `transitionBodyHeight` preserves visual offset relative to the physical root at takeoff and ground re-entry. Airborne offset decays at 12/s; landing uses the existing bounded height smoother. Low-speed stance weighting continuously blends bilateral and gait support. Physics root and authoritative events remain unchanged. Actual visual continuity is pending direct verification.

Ground foot IK uses continuous downward correction release and authored shin flexion reach bounds, with anatomical forward fallback for poorly conditioned ground knee poles. This is a presentation safeguard only; actual joint discontinuity and skin contact require direct measurement. Existing pivot and traversal solve paths retain their prior policy.

Motion-lab wedge sidewalls use the existing primitive sweep on an exact horizontal slice of the authored triangular side face at candidate origin feet height, for exterior approaches only. Top support remains analytical; outward exit and front entry are not treated as a sidewall. Capsule clearance and posed-mesh intersection are separate acceptance evidence.


## T3 triangle geometry support (PARTIAL)
- Explicit immutable world-space triangle meshes may opt into support. Outward-wound upward faces supply center-point support and geometric normals; equal-height creases conservatively select the steepest incident face. Block-only remains default. BVH/clipped projection shared by horizontal sweep and circular head-footprint upward clearance; ceiling limitY is consumed by Player. Closed-solid validation, full volume overlap, general 3D sweep and visible asset registration remain pending.
