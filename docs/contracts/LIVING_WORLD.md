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

### T4 실제 게임 초기 연결
- living-world-runtime.js 및 living-world-content.js: 기존 NPC ID/지역/소유자 구조 등록. 실제 생활 정책은 비어 있음. smith/vendor 초기 재산은 조회가 아니라 시작 단계에서 기존 seedMerchant 정책 그대로 부여; 기존 재산 보존. 다른 NPC 0 잔액. 빈 콘텐츠에서 기존 일과 유지, 매 프레임 저장 없음.
- 정책 등록 NPC만 Townsfolk 기존 일과 및 저장 관찰에서 제외, 논리 위치 투영. GameClock 정수 분, 대화 시작/종료 pause/resume, 기존 NavGrid 경유점 및 지면/수면/충돌 검증, 실제 채집 노드 adapter 및 picked 공유. 지역 비활성 중에도 clock 처리.
- 현재 tick 직접 위치 투영; 보간/동적 장애물 지연 및 실제 카엘/Chromium/PWA 미검증. 미등록 시장/레시피/소비 정책 unsupported. 실제 콘텐츠 없음.
- 검증: V8 PASS living-world runtime bridge: 11 checks, 이전 번들의 gameplay 원본 suffix 일치 후 해당 조각 교체, 정규화 V8 문법 컴파일 및 sw 문법 PASS. 전체 Node/infra NOT RUN.

- 후속: 현재 참여 중인 pauseable NPC는 pause 상태에서도 기존 Society 접근 검증을 통과하도록 연결하되 중복 pause 금지. 스케줄러 decision 대기 상태의 관리 NPC와의 대화 hold는 미구현이므로 현재는 선택지를 표시하지 않는다. T6/T7에서 보강. 런타임 브리지 12 checks PASS.

## T5 세계 사건·지식·지역 지표 (부분)
- `eventTypes`: id, regionIds, evaluateHandlerId, propagationHandlerId, minIntensity/maxIntensity, factKeys. `regionSignalTypes`: id, regionIds, handlerId, min/max. 등록된 trusted `content.societyHandlers`만 실행한다. evaluate는 현재 상태·active 사건·읽기 전용 item 조회를 받아 현재 활성 원인의 배열을 반환: key, intensity, affectedNpcIds, subjectRefs, facts, 선택 observations(NPC별 관찰 fact key). 부재한 기존 원인은 resolved로 전환; 임계값 hysteresis는 등록 정책이 active를 보고 처리. 동일 원인·지역·type 중복 방지. 실제 데이터 없음.
- scheduler의 5게임분 정기 평가(설정 가능)와 행동 완료 직후 평가를 동일 draft에 포함. 정기 검사도 budget을 소비하며 같은 tick은 정기 검사 우선. 저장 실패 시 사건/지표/경제/지식 함께 복구. 사건 알림은 성공 후만. 정책 없는 경우 검사 없음. 플레이어 경제 변경은 다음 정기 평가에 반영(즉시 hook 미연결).
- `shareKnowledge`는 유효한 현재 사건 revision과 실제 발신자가 아는 fact key, 동일 지역 및 등록 propagation guard를 검증; 명시적 호출만 전달. 영속 operationReceipts 멱등성. 영향자 전원에게 원인 broadcast 금지, 과거 지식과 현재 사실 구분. 관계 효과 및 실제 비관측 상호작용 연결은 T7 후속. `knownEvents`는 아는 사실만 제공. 사건/영수증 압축 및 세부 저장 검증은 후속.
- V8 PASS world society: 26 checks; PASS NPC scheduler/behavior: 56 checks; PASS NPC pause/resume: 9 checks; PASS living-world runtime bridge: 12 checks; PASS living world registry/state: 15 checks; PASS logical NPC movement: 18 checks. PWA 캐시 목록 갱신 및 문법 검사. 전체 Node/Chromium/카엘/PWA 실행 NOT RUN. 실제 이벤트/신호 콘텐츠 등록 없음.

## T6 담화 코어 (부분)
- conversationTemplates: id, topic, regionIds, 2~4 slots(id/tags), turns(slotId/text/duration seconds), optional eventTypeId/factRefs(key,slotId,factKey), participationIds(식별자만, T7 실행/참조 검증 후속). 등록된 사실만 해당 화자 placeholder로 허용. 현재 event revision 및 지식을 확인하고 안정 ID 순으로 슬롯을 매칭한다.
- createNpcConversations: 세션 시간(초), 활성 지역·주변 정지 NPC·공통 태그·전원 pair 거리/장애물 guard, 최대 4명, 공간 셀 및 후보/비교 예산, 독점 hold/release. 중거리 dots, 근거리 최초 materialize, hysteresis 및 경과 cursor, stale 사건 종료, cooldown/지역 해제. 비활성/외곽은 pair scan 및 materialize 없음. 빈 템플릿에서는 그룹 미형성 및 레거시 발화 유지. 실제 UI/hold 어댑터는 다음 통합 작업. 템플릿 발화는 지식/경제 변경 없음.
- V8 PASS NPC conversation groups: 18 checks. Node/브라우저/실기기 NOT RUN. 실제 콘텐츠 없음.

### T6 실제 연결 (부분)
- 런타임 bridge는 registry profile 분류 태그, 논리 이동·pauseable 여부, 현재 참여/스케줄 backlog를 검증. 관리 NPC는 scheduler.pause/resume, 기존 일과 NPC는 그룹 소유 동안 wander만 보류. 일정 변경·지역 해제·메뉴 진입은 그룹 종료. 플레이어의 기존 직접 대화는 해당 NPC hold를 인계하고 다른 참가자를 해제한다. 실패한 resume은 다음 update에서 재시도. 기존 참여 UI는 유지, 실제 그룹 참여 분기/효과는 T7 후속.
- Townsfolk/기존 GameUI 말풍선 연결. 그룹 발화 우선, 그룹 없으면 기존 주변 발화. 실제 템플릿이 없으면 그룹 업데이트 자체를 하지 않는다. 지면과 기존 월드 ray를 pair guard로 사용. 동일 role slot의 여러 binding 중 실제 지식 충족 binding 탐색(최대 24). PWA precache 59.
- V8 PASS NPC conversation groups: 18 checks; PASS NPC conversation runtime adapter: 8 checks (scheduler bridge는 mock 의존성), 게임 번들 원본 suffix 일치 및 교체 후 정규화 문법 PASS. 실제 브라우저/카엘/PWA/모바일 성능·전체 Node NOT RUN. 실제 템플릿 미등록.

## T7 요청 코어 (부분)
- requestPolicies: id, needKey, tags, selector.definitionId, quantity, minimumQuality, reward, ttlTicks, needDelta(음수), label, optional relationPolicyId. relationPolicies: id,min,max,delta,cooldownTicks. 실제 데이터 없음. 필요 episode당 하나 생성, 명시적 수락/제출, 해결/만료, 동일 episode 중복 차단. 최신 revision/물품 allocation/재원 확인과 ledger/need/affinity 원자적 저장. 기존 talk 횟수와 affinity 별개. UI/그룹 참여·실제 런타임 검증 후속. 요청 평가 주기와 대규모 비용은 T8에서 검증.

- T7 요청 UI: 기존 Society.choices/executeChoice의 직접 대화 분기, 실제 물품명·수량·품질·은화 표시, 기존 거리 검사 및 quote/revision/allocation 검증. 일반 상점도 이전 재고/가격 quote를 비교. requestComplete 전용 policy를 별도 등록. 기존 UI는 유지하고, 그룹 분기 및 실제 화면 검증은 후속.

- T7 participationActions: reply(읽기/잡담), question(알려진 사실), share(실제 NPC→NPC 정보 전달), request(대상 슬롯의 기존 의뢰). 참여는 등록된 conversationTemplates.participationIds, 유효한 슬롯/사건 revision으로 제한. share 성공에 한해 대상 NPC 관계 정책 적용; 반복 정보 전달은 선택 불가. accepted 의뢰는 포기 가능하며 같은 필요 episode 재발행을 차단. 그룹 join은 모든 기존 hold를 유지하고 종료 시 재개한다. 실제 화면 어댑터 및 Chromium 검증 후속.
