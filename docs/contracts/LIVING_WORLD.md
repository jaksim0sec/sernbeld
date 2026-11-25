# 생활 세계 계약 (T2 부분, 2026-11-25)

- `createLivingWorldRegistry({handlers,regions,places})`: 기존 안정 ID를 참조하는 JSON 전용 배치 등록기. 현재 needs/actions/roles/profiles 지원. 중복, 미등록 handler/region/place, 참조 누락 및 수치 범위 검사. 실패 배치는 전체 미반영. 정의는 immutable이며 런타임 저장에 복제하지 않는다.
- needs: id,min,max,initial,perTick,threshold. actions: id,handlerId,duration(정수 tick),interruptPolicy(interruptible/atomic/pauseable),needWeights, 선택 placeId. roles: id,actionIds,needWeights. profiles: 기존 NPC id,regionId,roleId(정책 없는 경우 null),tags, 선택 needWeights/placeId. 가중치는 음수 금지. 이 필드들은 T3 행동 엔진의 초기 계약이며 실제 계수/데이터 미등록.
- `createLivingWorldState(save,registry,getDefinitions)`: 기존 NPC state store와 shared-items 사용. initialize에서 기존 save.v 유지, livingWorld v1 선택 하위 root 생성, 등록된 NPC의 필요도 및 빈 경제 owner 추가. 기존 owner 자금 및 NPC 대화·관계·메모리 유지. 기존 legacy economy migration과 함께 단일 저장 및 rollback. 미래 livingWorld version/손상된 주요 필드 거부. 기존 저장 상태 그대로 보존. 아직 실제 Save.load 및 렌더 checkpoint와 연결하지 않음.
- `projectState(id)`: body/economy/business/social 독립 축의 초기 읽기 projection. 욕구 임계값 이상을 attention으로 해석하는 방향은 초기 정책이며 세부 role/사회 정책은 후속. 재산은 itemEconomy 조회, 복제 저장하지 않는다.
- recipe/consumption/market/gather/offer 정책 등록은 기존 shared-items 계약 참조. WorldEventType, ConversationTemplate, ParticipationAction, RequestPolicy, RelationPolicy 및 scheduler 세부 저장 검증은 후속. 실제 카엘 콘텐츠 없음.
- 검증: 원본 core 모듈과 신규 테스트 V8 격리 실행 PASS 15 checks. Node 전체/브라우저/실기기/infra 검사 NOT RUN. PROTOTYPED/PARTIAL; 게임 번들 미연결.
