# WORLD-001 생활 세계 베타 인프라

기준 ce03b4b73ed5573d528fcf5daf074715be1a6429. 사용자 승인 계획 T2 이후. ITEM-001 공용 경제 선행 작업은 blocked/부분 검증 상태 유지. MOVEMENT-002 및 INFRA-001 점유 파일 미변경.

T2 초기 구현: [생활 세계 계약](../../contracts/LIVING_WORLD.md), registry/state 및 단위 테스트. 빈 데이터 startup, 배치 참조 검증, 기존 저장 보존 및 오류/저장 실패 롤백, 독립 상태 축 V8 PASS 15 checks. PROTOTYPED/PARTIAL; 실제 게임과 통합하지 않았다. 신규 콘텐츠 없음. 전체 Node/브라우저/PWA/인프라 검사 NOT RUN. 다음: 등록 타입 보강 및 scheduler, 실제 연결 전 점유 조정.

T3 초기: 유틸리티 AI, deterministic due queue, 경제 draft slice, 예약/취소/재로드, fallback 및 프레임 독립 테스트. PASS NPC scheduler/behavior: 56 checks. 실제 clock, 이동, pause, 성능, 콘텐츠 등록 및 통합 후속. 기존 점유 경로 미변경.

T3 추가: pause/resume, 재료 예약 해제 및 재취득, 재로드/경쟁/저장 실패 9 checks PASS. 실제 UI 연결 후속.

T4 부분: 논리 경로/게임 분 변환/기존 NavGrid 인터페이스 어댑터, scheduler 이동 예약·pause·reload·경로 무효화. PASS NPC scheduler/behavior: 56 checks; PASS NPC pause/resume: 9 checks; PASS logical NPC movement: 18 checks. 실제 게임 연결 및 점유 조정 후속.

T4 실제 초기 연결: 기존 resident/상인 등록, clock, 논리 이동, 대화 pause, 채집 adapter, 번들/PWA cache 등록. PASS living-world runtime bridge: 11 checks. 기존 등반 범위 중 gameplay/game.js/sw.js 점유를 순차 통합 목적 WORLD-001로 이동; 등반 미검증 상태 유지. 실제 Chromium/동적 장애물/성능 미검증.
