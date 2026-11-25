# 생활 세계 계약 (T2 부분, 2026-11-25)

- `createLivingWorldRegistry({handlers,regions,places})`: 기존 안정 ID를 참조하는 JSON 전용 배치 등록기. 현재 needs/actions/roles/profiles 지원. 중복, 미등록 handler/region/place, 참조 누락 및 수치 범위 검사. 실패 배치는 전체 미반영. 정의는 immutable이며 런타임 저장에 복제하지 않는다.
- needs: id,min,max,initial,perTick,threshold. actions: id,handlerId,duration(정수 tick),interruptPolicy(interruptible/atomic/pauseable),needWeights, 선택 placeId. roles: id,actionIds,needWeights. profiles: 기존 NPC id,regionId,roleId(정책 없는 경우 null),tags, 선택 needWeights/placeId. 가중치는 음수 금지. 이 필드들은 T3 행동 엔진의 초기 계약이며 실제 계수/데이터 미등록.
- `createLivingWorldState(save,registry,getDefinitions)`: 기존 NPC state store와 shared-items 사용. initialize에서 기존 save.v 유지, livingWorld v1 선택 하위 root 생성, 등록된 NPC의 필요도 및 빈 경제 owner 추가. 기존 owner 자금 및 NPC 대화·관계·메모리 유지. 기존 legacy economy migration과 함께 단일 저장 및 rollback. 미래 livingWorld version/손상된 주요 필드 거부. 기존 저장 상태 그대로 보존. 아직 실제 Save.load 및 렌더 checkpoint와 연결하지 않음.
- `projectState(id)`: body/economy/business/social 독립 축의 초기 읽기 projection. 욕구 임계값 이상을 attention으로 해석하는 방향은 초기 정책이며 세부 role/사회 정책은 후속. 재산은 itemEconomy 조회, 복제 저장하지 않는다.
- recipe/consumption/market/gather/offer 정책 등록은 기존 shared-items 계약 참조. WorldEventType, ConversationTemplate, ParticipationAction, RequestPolicy, RelationPolicy 및 scheduler 세부 저장 검증은 후속. 실제 카엘 콘텐츠 없음.
- 검증: 원본 core 모듈과 신규 테스트 V8 격리 실행 PASS 15 checks. Node 전체/브라우저/실기기/infra 검사 NOT RUN. PROTOTYPED/PARTIAL; 게임 번들 미연결.

## T3 행동 엔진·예약 큐 (초기)
- `createNpcBehavior(registry,handlers)`의 evaluate/choose: 게임 tick 기준 필요도 projection, 역할/프로필/행동 가중치, 선택 baseScore·계획 비용, 실패 backoff, 안정 ID tie-break. trusted handler.plan은 읽기 전용 아이템 조회와 NPC 복제본을 받고 {ok,plan,cost} 또는 실패 이유 반환. 실제 데이터/계수 미등록.
- `createNpcScheduler({save,registry,getDefinitions,handlers,configureItems,onCommit,retryTicks})`: decision/running 예약, 안정적인 dueTick/ID 순서, advanceTo(target,budget), cancel(npcId,instanceId), snapshot. 각 행동은 최소 1tick, 다음 결정은 다음 tick, 실패 재시도 기본 5tick. 등록된 역할의 NPC만 실행. 계획은 공용 item command 및 선택 reserve 또는 비경제 needEffects 중 하나. handler.canComplete는 필요할 때 순수 재검증. 예약 소비/생산/구매/제공과 공용 gather/offer 지원, 실제 handler 등록은 후속. 
- 한 slice의 shared-items는 별도 draft Save에서 실행, 모든 재산/예약/영수증/NPC 상태를 실제 Save.write 한 번으로 확정. 실패 시 전체 복구, 외부 알림은 성공 이후. 각 slice 단위 원자성, 프레임 단위 결과 독립성 검증. 저장 root의 논리 관찰 충돌은 T4에서 실게임 검증 필요.
- 현재 정렬 배열 큐로 동작, budget은 처리 건수 제한이며 ms/대규모 인구 성능 검증 아님. pause/resume·이동·능동 중단·상황별 선행 행동 연결, 일정/장소/도구 예약과 실제 clock 연동은 후속. 기존 scheduler 하위 배열 포맷 유지.
- V8 격리 테스트 PASS NPC scheduler/behavior: 56 checks. 실제 Node/브라우저/실기기/전체 인프라 NOT RUN. PROTOTYPED/PARTIAL.

### T3 일시정지/재개
- `pause(npcId,instanceId)`는 pauseable 행동만 정지하고 남은 tick을 저장한다. 재고를 무기한 점유하지 않도록 예약을 즉시 해제한다. `resume`은 동일 행동의 계획을 다시 검증하고 예약을 재취득, 남은 tick 이후에만 완료한다. 재취득 실패 시 행동 취소 및 backoff/다음 결정. pause 상태의 job은 실행 큐 처리 대상에서 제외하되 저장된다. 대화 UI 연결 및 재로드 시 자동 재개 정책은 후속.
- V8 기존 scheduler 56 checks + pause/resume 9 checks PASS. 실제 게임 및 전체 검증 NOT RUN.

## T4 논리 이동 초기 계약
- `npc-movement.js`: gameClockTick은 기존 day/hour를 1일차 0시 기준 정수 분으로 변환. buildLogicalRoute는 명시적 경로 및 모든 segment 검증 필요, 미도달/미등록 경로 실패. createNavGridRouteAdapter는 기존 NavGrid의 [x,z] 경유점을 지면/충돌 검증 어댑터로 연결. 위치는 3D 경로 거리 기준 계산.
- scheduler의 이동 전용 plan.route는 실제 경로 길이/속도로 dueTick을 결정. 시작/완료에서 trusted validateRoute 검증, logicalPosition 조회는 현재 worldTick의 위치 projection. 도착·정지 시 논리 위치 저장, pause 후 재계획. route와 경제 effect를 같은 행동에 섞지 않는다. 기본 validateRoute는 false로 미연결 시 안전하게 실패. 실제 NavGrid/지면 검증기, 능동 장애물 지연, region lifecycle/렌더 투영과 실제 clock 연결은 후속. route invalidation은 마지막 확정 위치 유지(이동 도중의 연속 checkpoint는 후속).
- V8 PASS NPC scheduler/behavior: 56 checks; PASS NPC pause/resume: 9 checks; PASS logical NPC movement: 18 checks. 실제 카엘/브라우저/전체 검증 NOT RUN.
