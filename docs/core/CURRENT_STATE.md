# 현재 구현과 기준 자료

최신 구현 상태는 현재 `main`의 코드, 자산 및 검증 결과로 판단한다. 아래는 영역별 진입점이다. [구조 이력](../STRUCTURE.md)과 [지난 기능 계획](../superpowers/plans/)은 당시의 변경과 제안을 추적할 때 사용한다.

| 영역 | 지금 작업할 기준 | 확인 범위 |
| --- | --- | --- |
| 게임·아트 | [게임 콘셉트](../../세른벨드_게임_컨셉_종합.md) | 확정 방향과 예시·미정 설정은 해당 문서의 구분을 따른다 |
| 캐릭터 | [Character Studio 런타임](../CHARACTERS.md#active-character-runtime), [기준 리그](../contracts/CHARACTER_RIG.md) | 플레이어와 NPC 공용 남녀 체형. 구형 독립 여성 메시도 저장소에 있다 |
| 의상 | [등록 계약](../../src/entities/character/clothing/README.md), [선례](../references/INDEX.md) | 카라·긴소매 셔츠·바지 기본 장착. 개별 포즈와 실기기 외형 검증 범위는 별도 확인 |
| UI | [UI/UX 지침](../UI_UX_DESIGN_GUIDELINES.md) 및 [공용 SEED](../../styles/seed.css) | 캐릭터 생성이 시스템 UI 기준. 마법진의 게임 콘텐츠 표현은 별도 목적에 맞춘다 |
| 달리기 스태미나 | [플레이어 물리](../../src/gameplay/gameplay.part.js), [회귀 검증](../../tests/player-physics.mjs) | 지상 달리기 중 소모, 소진 시 걷기 속도, 회복 중 허리 옆 원형 HUD |
| 등반·턱 오르기 | [물리](../../src/gameplay/gameplay.part.js), [표면 IK·카메라](../../src/entities/character/studio-integration.js), [작업 기록](../tasks/active/MOVEMENT-002.md) | 지형·벽·건물·원기둥(opt-in) 등반, 측면 이동, 턱 오르기와 처마·차양·전망대 돌출부 넘기(지붕·원뿔·차양은 `addRoof` 지면/일방향 발판); 50° 초과 지형은 미끄러짐(전용 포즈)·재점프 불가; 리그 좌우 대응 및 도달 보정, 충돌 없는 대체 등반 카메라. 실제 리그/카엘 시각 품질 재검증 필요 |
| 독립 모션 테스트 | [런타임](../../src/gameplay/gameplay.part.js), [회귀](../../tests/world-playability.mjs) | 플레이 설정 → 개발자 모드 → 모션 테스트 공간; 30/45/60° 경사, 90° 벽, 계단, 신체 높이별 턱, 실제 수영 연못, 비NPC 더미, 맨손/검 모션 미리보기. 일반 월드 저장 분리. 브라우저 기능·시각 확인 대기; 더미 피격 로직은 후속 과제 |
| 카엘 항구 | [월드 소스](../../src/world/), [실월드 시나리오](../../tests/world-playability.mjs) | 경로·계단·충돌과 지역 상태의 구현 범위. 다른 지역의 자동 스트리밍이나 생태 기획 전체의 통합 여부는 항목별 확인 |
| 생태·생활 경제 기획 | [70종 인덱스 및 오늘 범위](../content/kael-economy-20261125.md) | 기획 등록; 한국풍 가중치 폐기; 런타임 미통합 |
| NPC 대화·상호작용 | [계약](../contracts/NPC_DIALOGUE.md), [회귀](../../tests/npc-dialogue.mjs), [DOM 검증](../../tests/npc-dialogue-browser.mjs) | 기존 액션과 일과 재사용; 참여 패널/비참여 발화 분리, 안정 ID NPC 상태·참여 대화 기억 및 조건 재검증, 코어 참여 대화 세션·명시적 페이지 진행 연결. NPC 실제 경제 소유권 및 생활 엔진 기초는 별도 공용 계약 참조; 의뢰 완료·정보 중재 기반 친화도, 그룹 참여 선택/hold 연결; NPC-003/T4 공용 그래프·동일 세션 서비스·사건별 그룹 참여/current speaker 및 권위 지식·관계 트랜잭션 연결(격리 모듈·DOM 회귀); T5 [최종 CI](https://github.com/jaksim0sec/sernbeld/actions/runs/45606026442) 8071107 contracts 41/42, Chromium 11/12, 기존 PARTIAL 각 1, blocking 0, 패키징·배포 PASS. 그래프 DOM 4 viewport 및 NPC 50명 외형 검증 통과. [NPC-003 종결](../tasks/archive/NPC-003.md); 전체 게임 신규 graph E2E/실기기 NOT RUN, 실기기 TODO 이관 없음 |
| 아이템·NPC 공용 경제 | [공용 아이템 계약](../contracts/SHARED_ITEMS.md), [회귀](../../tests/shared-items.mjs) | 공용 실물/소유/지갑·거래·기존 저장 변환 1차, 실제 카엘/브라우저 검증 필요 |
| 아이템·스킬·저장 | [코어](../../src/core/), [게임 진입](../../src/gameplay/gameplay.part.js), [산출물 계약](../contracts/DELIVERABLES.md) | 등록·저장 API와 런타임 호출 경로를 각각 확인 |
| 빌드·배포 | [검증·통합](../validation/VALIDATION_POLICY.md), [PWA](../PWA.md) | 배포된 SHA, 검증한 SHA, 작업 HEAD를 구분 |

| 생활 세계 인프라 | [계약](../contracts/LIVING_WORLD.md), [작업 기록](../tasks/archive/WORLD-001.md) | 공용 경제·등록·스케줄러·논리 이동·사건·담화 LOD·필요 기반 요청/친화도 및 직접/그룹 대화 연결; 카엘 상인 3명 실제 납품 의뢰와 상인/부두 일꾼 2~4인 담화 등록; 기존 일과 유지. [콘텐츠 작성](../workflows/LIVING_WORLD_CONTENT.md), 통합 fixture 및 CI 등록. 최신 main 59759df CI의 Chromium/PWA 검증 PASS(기존 지도 터치 유예); 관리형 정책의 실브라우저 fixture·30분 및 실기기 검증 미완료; 신규 생산 콘텐츠의 실게임 검증도 별도; 베타 구현 종결 및 점유 해제, 잔여 검증 TODO 유지 ; [NPC-11252115/T2](../tasks/active/NPC-11252115.md) 일반 NPC 30분 행동 캐시 및 초기 배회 분산 구현, CI/실게임/실기기 검증 대기 |

- NPC-11252115/T3: 일반 NPC 보행 2.25m/s, 초기 pose/신규 관리형 경로 기본값 공유. 격리 회귀 PASS, 실제 카엘/CI/실기기 검증 대기.

- NPC-11252115/T4~T5: 카엘 주민 19명 6개 장소 순환 및 일과 편차, 부두 12명 분산, 배회 목적지 예약/밀집도 및 strict 경로 재시도 적용. 실제 정의 격리 검증 PASS; 실제 카엘 밀집도/경로 성능·CI/실기기 미검증.

- NPC-11252115/T6: 경비 8→4명(전체 50명 유지), 대화 접근/도착 후 발화 및 발화·청자·대기 모션 연결. 격리 회귀 PASS, 실게임/실기기/CI 미검증.
