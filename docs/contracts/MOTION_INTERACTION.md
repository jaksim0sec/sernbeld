# 공용 물리·표면 상호작용 계약 (T1 부분 구현)

상태: PROTOTYPED, 독립 모듈 검증만. [실행 명세](../knowledge/WORLD_SURFACE_REFACTOR_PLAN.md), [작업](../tasks/active/MOTION-11261538.md). 실제 game.js 소비 없음.

- `src/core/world-collision.js` createWorldCollision: instance ID/region/physics/transform/shapes 등록. m, Y-up, yaw radians, positive scale. box/water half extents, cylinder radius/height(동일 XZ scale), heightfield/roof는 geometryRef 및 local bounds. 비지원 변환·누락된 explicit policy·중복 ID는 거부. 장식은 빈 shapes, water는 비고체 volume. 원본/반환 스냅샷과 내부 데이터 분리.
- handle은 id+generation; 삭제 후 같은 ID 재등록해도 이전 handle 무효. revision은 변환/활성/지역 상태 변경 때 증가하여 anchor 무효화. region suspend는 개별 active 값을 보존. query purpose 및 layer/self exclusion은 공통 resolver에서 적용. oneWay의 방향성, 실제 geometry query는 backend의 책임.
- 정책은 block/support/mantle/oneWay/nav/camera/water 및 climb none/face/mantleOnly 명시. legacy walk=false도 support=true, nav=false. legacy spawn/ceiling 등 추가 정책 매핑과 전체 기존 의미 검증은 후속 이관. policy.id는 문자열 식별자이며 현재 별도 preset registry 없음.
- queryAabb는 정확한 yaw-transformed box/cylinder bounds 및 analytical bounds 기반 **개발 참조 검색**이다. 좁은 실제 충돌이나 생산용 공간 해시가 아니다. backend query API는 args/filter/resolveShape callback을 전달하며 resolveShape를 hit 선택 이전에 호출해야 한다. backend 없으면 지원되지 않는 기능으로 명시 실패. 실제 raycast/sweep/overlap/sampleSupport/sampleSurface/sampleWater의 기하 알고리즘 및 결과 검증은 후속 단계. backend spatial index 동기화/원자성도 통합 시 구현·시험할 것.
- classifySupport: 단위 기하 normal, 실제 발 접촉, support 정책, walkMax와 slideEnter/Exit를 분리. 수직/아래면 비지지. 임계각 50° 기존값을 테스트에서 보존. slopeGravity는 경사 접평면 중력 성분만 반환하며 실제 slide controller는 미변경.
- 테스트: `node tests/world-collision.mjs`. 작성 함수와 동일한 테스트 함수 47 assertions JS V8 PASS, Node 파일 직접 실행/통합 미실행. 실제 기하 contactNormal/feature ID, 부호, TOI, 기존 shape adapters, broadphase/region 동기화와 profile 소비는 미완료. 이 계약을 런타임 적용 완료로 간주하지 않는다.
