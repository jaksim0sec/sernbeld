# 생활 세계 콘텐츠 작성

[생활 세계 계약](../contracts/LIVING_WORLD.md), [공용 경제](../contracts/SHARED_ITEMS.md), [산출물 등록](../contracts/DELIVERABLES.md)을 먼저 읽는다. 승인받은 실제 콘텐츠만 등록하며 테스트 시계나 fixture는 tests/에 둔다.

1. 기존 지역·장소·주민·아이템 정의 ID 확인. 새 아이템은 도감/실물·소유/품질·내구 계약에 등록하고 초기 지급/공급원을 별도 승인받는다.
2. [production 진입점](../../src/core/living-world-content.js)의 definitions에 needs, actions, roles, profiles 등록. 기존 주민 ID만 override 가능. roleId:null은 기존 일과 유지. 필요 범위/threshold, 게임 분, 가중치, interruptPolicy, 실제 placeId를 지정한다. 의뢰 needKey는 role/profile/action needWeights에 포함한다.
3. trusted handlers의 plan은 읽기 전용 조회를 사용하고 성공 plan 또는 실패 이유 반환. 소비·생산·거래는 configureItems의 공용 정책과 command, 필요하면 reserve 사용. 이동은 기존 route adapter를 사용하며 효과와 경제 거래 중복 금지.
4. societyHandlers의 평가/전파/지표는 실제 상태 기반. 사건은 안정 원인 key, 영향 NPC, 실제 subjectRefs, factKeys 및 직접 관찰자를 명시. 원인이 사라지면 평가 결과에서 제외. 단순 관측으로 재산/친화도 변화 금지.
5. conversationTemplates는 지역, 2~4명 slot/tag, turn/초, eventTypeId 및 화자가 실제 아는 factRefs 지정. participationActions는 reply/question/share/request. requestPolicies는 실제 필요, 공급 정의, 품질, 수량, 보상, TTL, needDelta 등록. 재원 및 공급 가능성 검증. 관계 정책은 의미 있는 행동에만 연결.
6. 전체 참조 검사 및 기존/새 저장 초기화, 재로드, 오류 롤백, 빈 콘텐츠 검증. 실제 콘텐츠의 ID/승인/검증 근거를 카탈로그와 작업 기록에 남긴다.

## 검증

- `node tests/living-world-integration.mjs`, `node tests/living-world-runtime.mjs`: 목적→공급→변화→담화→참여/미참여→해결, 중복 보상 방지. 미등록 정책은 fallback으로 남으며 완성 콘텐츠로 간주하지 않는다.
- `node tools/verify.mjs core world browser`, `node tools/build-game.mjs --check`, `node tools/check-infra.mjs`, PWA 오프라인 재실행. 변경 번들과 precache를 함께 확인.
- 성능은 동일 모바일 월드/카메라 frame p50/p95, heap, draw calls, localStorage 실제 쓰기, 30분 실플레이 및 7일 논리 진행을 기록. 2ms p95/4ms slice 목표 및 10% 회귀 한계는 실제 측정 없이는 통과로 표기하지 않는다.

- 논리 부하 회귀: `node tests/living-world-performance.mjs`. 100/300/1000 인구의 초기 스케줄링, 7일 sparse queue, 비관측/밀집 담화 카운터 및 저장 크기 계측. 기기 프레임 시간과 구분한다.

- 첫 production 사례: 카엘 상인 3명의 기존 채집물 납품(품질·NPC 자금·친화도·1회 보상) 및 상인/부두 일꾼 담화. `tests/kael-living-content.mjs`는 실제 production 모듈을 읽는다. 기존 일과를 대체하지 않으며 그룹 크기별 2~4인 템플릿을 등록한다. 신규 아이템은 임시 SVG 아이콘을 사용한다.
