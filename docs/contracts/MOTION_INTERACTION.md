# 공용 물리·표면 상호작용 계약 (T1 등록 구현 진행)

상태: REGISTERED/PARTIAL. [실행 명세](../knowledge/WORLD_SURFACE_REFACTOR_PLAN.md), [작업](../tasks/active/MOTION-11261538.md). 런타임 game.js에는 등록·비교 어댑터만 연결; 실제 이동·등반·수영의 authoritative solver는 이전 그대로이며 신규 contact/sweep/query가 물리 권위가 된 것은 아니다. CI/실게임 검증은 아직 별도 확인 필요.

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
