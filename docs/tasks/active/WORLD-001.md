# WORLD-001 생활 세계 베타 인프라

기준 ce03b4b73ed5573d528fcf5daf074715be1a6429. 사용자 승인 계획 T2 이후. ITEM-001 공용 경제 선행 작업은 blocked/부분 검증 상태 유지. MOVEMENT-002 및 INFRA-001 점유 파일 미변경.

T2 초기 구현: [생활 세계 계약](../../contracts/LIVING_WORLD.md), registry/state 및 단위 테스트. 빈 데이터 startup, 배치 참조 검증, 기존 저장 보존 및 오류/저장 실패 롤백, 독립 상태 축 V8 PASS 15 checks. PROTOTYPED/PARTIAL; 실제 게임과 통합하지 않았다. 신규 콘텐츠 없음. 전체 Node/브라우저/PWA/인프라 검사 NOT RUN. 다음: 등록 타입 보강 및 scheduler, 실제 연결 전 점유 조정.

T3 초기: 유틸리티 AI, deterministic due queue, 경제 draft slice, 예약/취소/재로드, fallback 및 프레임 독립 테스트. PASS NPC scheduler/behavior: 56 checks. 실제 clock, 이동, pause, 성능, 콘텐츠 등록 및 통합 후속. 기존 점유 경로 미변경.

T3 추가: pause/resume, 재료 예약 해제 및 재취득, 재로드/경쟁/저장 실패 9 checks PASS. 실제 UI 연결 후속.

T4 부분: 논리 경로/게임 분 변환/기존 NavGrid 인터페이스 어댑터, scheduler 이동 예약·pause·reload·경로 무효화. PASS NPC scheduler/behavior: 56 checks; PASS NPC pause/resume: 9 checks; PASS logical NPC movement: 18 checks. 실제 게임 연결 및 점유 조정 후속.

T4 실제 초기 연결: 기존 resident/상인 등록, clock, 논리 이동, 대화 pause, 채집 adapter, 번들/PWA cache 등록. PASS living-world runtime bridge: 11 checks. 기존 등반 범위 중 gameplay/game.js/sw.js 점유를 순차 통합 목적 WORLD-001로 이동; 등반 미검증 상태 유지. 실제 Chromium/동적 장애물/성능 미검증.

T4 후속: 참여 중 pause된 NPC 접근 검증 및 중복 pause 방지. V8 runtime bridge 12 checks PASS. decision 대기 상태 hold는 T6 후속.

T5 부분: 사건의 조건 평가·해결·지식 전달·지표 및 scheduler/runtime 통합. PASS world society: 26 checks. 플레이어 변경 즉시 hook/관계/비관측 상호작용, 실제 브라우저 및 전체 검증 후속. 실제 콘텐츠 없음.

T6 초기: 그룹/템플릿/LOD core. PASS NPC conversation groups: 18 checks. 실제 연결 후속.

T6 초기 실제 연결: Townsfolk 및 말풍선 adapter, 관리 NPC hold 인계/재개/실패 재시도, PWA. PASS NPC conversation groups: 18 checks; PASS NPC conversation runtime adapter: 8 checks. 실제 콘텐츠 없음; 그룹 참여 및 실브라우저 미검증.

T7 부분: 필요 episode 기반 요청/수락/제출/만료/자체 해결, 공용 경제 requestComplete 및 관계 변화, scheduler transaction 및 runtime API. V8 신규 테스트 21 checks PASS. UI/그룹 참여/Node/Chromium/PWA 미검증. 실제 콘텐츠 없음.

T7 요청 UI 연결: 기존 Society 선택지에서 명시적 수락/제출, 수량·품질·보상 표시, 거리/quote/revision/allocation 재검증. 공용 request policy 분리, 요청 결과 별도 저장 금지. PWA cache 60. V8 검증 및 번들 suffix 일치; 실제 브라우저 및 그룹 참여 미완료.

T7 그룹 참여 코어: 등록형 reply/question/share/request, 사건/슬롯/실제 지식 검증, 명시적 중재만 정보 및 대상별 친화도 변경, 의뢰 포기 및 기존 원자적 거래 재사용. 그룹 hold 전환/해제. 실제 게임 어댑터 후속.

T7 실제 어댑터: 그룹 전체 hold를 기존 직접 대화로 인계, 그룹 참여 선택 및 사건/거리/경로 재검증, 의뢰 포기 UI, 대화 종료 시 hold 해제. V8 코어 테스트 41 checks, 그룹 18+8+6 checks 이전 커밋 PASS; 실제 브라우저/PWA 및 전체 Node 미검증. 콘텐츠 미등록.

T7 연결 후 V8 실행: 요청/참여 41 checks, 그룹 18+8+6 checks, 기존 runtime 12 checks, 신규 runtime 그룹 진입/응답/유지/stale/해제 5 checks PASS. 공용 아이템 12 scenarios + 74 checks PASS. 브라우저 DOM·카엘·PWA 실행 및 전체 Node는 미실행.

T8 초기: 의뢰 평가를 slice 종료에서 결정적 게임 분 예약으로 변경, 같은 tick 기존 사건→행동→의뢰 순, budget에 포함. 요청/스케줄러/공용 아이템/재로드 통합 테스트와 기존 생활 코어 테스트 CI 등록. V8 검증; 브라우저/실기기/전체 Node 미실행. 전체 T8 게이트 미충족.

T8 후속: bc85cae Actions Node에서 통합 72 checks 및 생활 코어/공용 경제 통과. 기존 대화 테스트의 새 DOM 반영, INFRA-001 소유 verify 파일 점유 반환(순차 등록), 실제 게임/PWA 생활 모듈 확인 및 콘텐츠 작성 규약 추가. 새 CI, 실기기 및 30분 실제 월드 검증 미확정. 기존 ecology GLB, shirt-recovery, 기본 sword 오류 별도.

T8 통합 fixture: 91 cumulative checks V8 PASS. 실제 공급·사건·지식·담화·관계·자율 해결·경쟁·재로드. 부하 fixture: 100/300/1000 논리 NPC, slice 32, 100 NPC 7일 sparse queue, 30분 비관측 및 밀집 담화 상한 V8 PASS. Node CI 등록. 이 검사는 실제 모바일 frame/저장 latency, 30분 실제 게임이나 고빈도 7일 경제 부하를 대신하지 않는다. 최종 CI 및 실기기 검증 전 PARTIAL.

T8 CI a6a262e: 38/42 contracts PASS, 2 PARTIAL, 2 FAIL; browser 10/12 PASS, 1 PARTIAL, 1 FAIL. 생활 코어 91 checks, NPC DOM 4 해상도, PWA 오프라인 및 startup bridge PASS. Node 논리 NPC 100/300/1000 p95 2/4/13ms, max 2/4/18ms. 실제 기기 미검증. 공용 아이템 이전 이후 캐릭터가 삭제된 Save.data.equip을 읽어 장착 메시가 사라지는 실제 회귀 확인: canonical Inventory.equipped를 주입하고 같은 결과로 grip을 구동. 기존 browser failure RED, 실제 attachWeapons 격리 테스트 RED/GREEN(이전 저장 변환, 해제, 반대손 장착). 셔츠 복구 fixture의 10번째 byte width 누락 수정; 실제 로더 및 전체 browser 재검증 CI 필요. 생태 GLB 10종 V8 byte 동일, Node 22 CI 차이는 진단 필요.

T8 검증/최적화: 8057165 Actions Node GLB 10종·셔츠 복구 PASS, studio-model의 독립 런타임 호출 getEquipped 누락 확인. 실제 canonical item과 모델 장착·해제·반대손 회귀 추가. 스케줄러 slice의 반복 전체 정렬을 최초 정렬+정렬 위치 삽입으로, before/draft 중복 JSON 복제를 단일 직렬화 및 실패 시 복원으로 변경. 공용 경제 검증의 owner/record/holding 선형 탐색을 검증 1회 지역 Set/Map으로 변경(계약·저장 스키마 무변경). V8 1000명 p95 약 56ms→16ms, 저장 크기/쓰기 횟수·budget 동일. 통합 91, scheduler 56+9, movement 18, society 26, participation 41, shared items 12 scenarios+74 checks PASS. 실제 Node/Chromium 최종 CI 및 실기기 모바일 2ms/4ms 목표 미확정. 다른 작업의 점유 경로는 같은 세션에서 순차 통합했고 기존 점유 기록은 유지.

T8 재개: main `59759df5dbe9301b0a0c4768c8a8a478454ae4c8`의 [Actions 45581484306](https://github.com/jaksim0sec/sernbeld/actions/runs/45581484306) 실제 로그 확인. Node build/core/clothing/world 40/42 PASS, 기존 의상 2 PARTIAL, 차단 0; Chromium 11/12 PASS, 기존 지도 터치 1 PARTIAL, 차단 0; package/deploy 성공. 생활 통합 91 checks, 실제 카엘 경로 및 PWA 오프라인 PASS. Node 논리 NPC 100/300/1000 p95 3/3/11ms, max 3/3/11ms; 실기기 2ms/frame·4ms/slice 기준에 대한 증거 아님. 운영 데이터가 비어 있어 기존 브라우저 검증은 관리형 NPC 경제·담화 전 흐름을 증명하지 않는다.

검증 전용 [실브라우저 fixture](../../../tests/living-world-browser.mjs) 추가: Playwright route로 격리된 테스트 콘텐츠만 주입, 실제 게임의 goram 관리 정책·공용 의뢰/품질 lot·보상·저장 재로드·지역 suspend/resume·대화 hold·큐 상한 및 update 시간 측정. `node tests/living-world-browser.mjs` 단기 smoke, `node tests/living-world-browser.mjs --minutes=30` 장시간 실행. 이 세션은 Git checkout DNS 및 Chromium 실행 불가로 문법 검사만 수행; fixture 실행 NOT RUN, 기본 CI에 아직 미등록. 기존 UI 실제 참여/그룹/사건 전 흐름, 30분 전체 검증, 고빈도 7일 장기 부하, 실제 S22급 성능은 별도 미완료. T8은 PARTIAL/in_progress 유지. 운영 콘텐츠나 게임 런타임 수정 없음.

T8 총검증 재개: 별도 [Living world T8 soak](../../../.github/workflows/living-world-soak.yml) 워크플로 등록. 검증 전용 fixture 변경 시 smoke 성공 후 30분 실제 Chromium 연속 실행, 수동 workflow_dispatch 지원. 기존 main-validation 및 INFRA-001 점유 경로 변경 없음. 운영 정책 미등록 유지. 이 커밋 시점의 신규 smoke/soak 결과는 NOT RUN(실행 결과는 Actions에서 확인); 실제 UI/사건/그룹/고빈도 7일/실기기 기준에 대한 대체 검증이 아니다. 원격 조회는 가능하나 로컬 GitHub DNS 실패로 전체 저장소 checkout 불가. 완료 선언 보류.
