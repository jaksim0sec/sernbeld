# NPC 발화·상호작용 계약 (v2)
사용자 승인 범위: 참여 여부에 따른 두 표시 방식, 응답 배치 및 공용 접근 토큰, 기존 디자인 언어 보존. 글래스 농도와 이름 강조색은 구현 판단이며 최종 외형 승인과 별개.

## 런타임의 책임과 데이터 경계
- 선택지의 `itemId`는 실행 재검증용 식별자(의뢰·참여 행동 ID도 포함)이며 이미지 조회 키와 동일하다고 가정하지 않는다. `kind:"item"`인 경우에만 아이템 아이콘을 표시한다. 의뢰는 `iconItemId`에 실제 `definitionId`를 전달하고, 일반 상점/채집은 기존 아이템 ID를 사용한다. 비아이템 응답은 공용 SVG. 레거시/그래프 세션 모두 액션 ID·quote·revision을 유지한다.
- NPC 정의는 현재 `NAMED` 및 `townsfolk()`에서 영속적인 `def.id`, 이름, 외형, 직함, 역할, 일정, 발화 풀을 제공한다. 렌더 객체(`ch`)는 주민의 정의·소유 상태를 대신하지 않는다.
- 현재 상태: [NPC 상태 저장소](../../src/core/npc-dialogue.js)가 `Save.data.npcStates[def.id]`의 안정 ID 레코드를 관리한다. 최초 등록에만 기존 지역별 `lineI`를 이관하고 이후 안정 ID 커서를 우선한다. `met`, 기존 지역 레지스트리와 저장 키는 유지한다. 저장 시 활동·위치·지역을 기록하고 참여 대화의 횟수와 마지막 행동 결과를 저장한다. 위치·활동은 마지막 관찰값이며 스케줄 복원/경로 계획의 권위는 현재 Townsfolk에 있다. `resources`는 향후 경제 연동용 빈 필드로 유지하며 가짜 초기 자원이나 독립 재화 장부를 만들지 않는다.
- `Explore` 후보의 표시용 계약은 `{kind,itemId?,verb,label,dist,act}`. 기존 거리 및 위치 배치는 보존한다. NPC 후보는 높이·시야 조건을 추가한다. 아이템 이미지는 기존 `iconURL(itemId)`를 사용하고 NPC/웨이포인트/의뢰판은 SVG를 사용한다. 화면 문구는 콘텐츠 이름이며 행동명은 접근성 이름에 포함한다.
- 참여성: `GameUI.say(def,line,options)`가 명시적 세션을 생성한다. `options`의 `{label,act,kind?,itemId?}`를 UI가 표시한다. 입력은 잠시 제한하고 NPC는 세션 동안 상대를 바라본다. 종료 버튼/Escape 또는 선택지 실행으로 세션 종료. 이전 세션의 중복 선택은 거부한다. 후속 응답은 새 세션을 열 수 있다. 거래·길드·숙박 등의 실제 효과는 기존 Society 핸들러 소유. `Society.choices`의 `{id,label,kind?,itemId?}` 데이터를 UI 입력으로 변환하고 `executeChoice`에서 접근 조건과 현재 선택 가능 목록을 다시 계산한다. 화면 콜백이 직접 상태를 소유하지 않는다. `selectNpcLine`/`npcLinePool`은 두 발화 모드에서 공유하며 주변 발화는 커서를 갱신하지 않는다.
- 비참여성: `Townsfolk.labels`가 근처 보이는 NPC의 낮/밤 발화 풀로 `{speakerId,text,expiresAt,nextSightCheck}`를 생성하고 `GameUI.setLabels`가 월드 라벨 위치에 말풍선을 렌더링한다. 최대 하나, 4.5초 표시, 14초 재발화 간격, 시야 재검사 0.25초. 첫 만남 플래그/참여성 커서 변경 없음. 조작 차단 없음. 참여 대화 및 메뉴 상태에서는 억제.
- 기존 저장 키/버전은 유지하며 NPC 상태 필드만 가산한다. 표시용 세션과 주변 발화는 일시적 런타임 상태이다. 기존 Save, Wallet, Inventory, Guild를 그대로 사용한다.

## 이후의 자율 사회 확장 (계획, 미구현)
카엘의 `def.id`를 안정 ID로 사용한다. 다른 지역의 주민 ID는 세계 단위에서 충돌하지 않도록 등록해야 한다. 현재 지역 위치 및 활동, 자원(소유자 ID로 관리되는 인벤토리·은화), 관계/약속/기억은 각 도메인의 권위 있는 저장소가 관리한다. 지역 전환은 시각 인스턴스의 생성·제거이지 자원 상태 삭제가 아니다. 지역 인덱스 기반 저장 키 자체는 유지한다. 안정 ID 상태로 최초 이관 이후 구형 커서는 새 상태를 덮어쓰지 않는다.
행동 판단기는 현재 상태/조건에서 가능한 상호작용을 계산하고, 대사 제공자는 이를 표현한다. 발화/응답 데이터의 목표 계약은 speakerId, audience, mode, lineId/text, 조건, actionId/payload, 결과·후속 발화다. 대사 텍스트 자체에는 소유권/재고/잔액을 저장하지 않는다. 행동은 실행 시점에 권위 있는 상태를 재검증하고 성공/실패 결과를 발화로 반환한다. 인벤토리/화폐 거래의 원자적 변경, 재고·관계 상태와 NPC 간 대화/동적 생성은 경제 작업에 연계하며 이번에는 구현하지 않는다.

## UI 및 검증
[UI 지침](../UI_UX_DESIGN_GUIDELINES.md), [게임 진입](../../index.html), [표현 CSS](../../styles/menus-and-overlays.css), [접근 토큰](../../styles/hud.css), [런타임](../../src/gameplay/gameplay.part.js), [작업 기록](../tasks/archive/NPC-001.md).
계층: 월드 접근 토큰 → 명시적 참여 → 독립 이름표(이름·직함), 높이가 안정된 스크롤 가능한 본문 패널, 우측 상단 독립 응답 목록(마지막에 대화 끝내기) → 기존 행동 실행 → 후속 발화 또는 원래 플레이. 주변 발화는 별도 월드 요소이다. 카메라 재설계, 신규 경제 로직, 아웃게임 UI 개편은 범위 밖.

### 참여 대화 진행 계약
`createDialogueSession(def, line, options)`은 DOM/타이머와 독립적인 일시 상태로 참여자, 페이지 인덱스, 마지막 페이지의 선택 가능 응답 및 명시적인 종료/선택 상태를 관리한다. `line`은 문자열 또는 문자열 배열이다. UI는 진행 상태를 표시하고 입력을 전달하며 선택 완료 후 기존 Society 행동 계약을 호출한다. 첫 만남의 발화 배열은 참여 대화에서만 사용하고 주변 발화는 기존 문자열 풀을 유지한다. 중간 페이지에는 패널 내부 계속 버튼과 외부 목록의 대화 끝내기만 표시하고 행동 응답은 마지막 페이지에만 표시한다. 본문 타이핑은 표시 전용이며 나머지 글자의 레이아웃을 확보한다. 본문 탭으로 즉시 표시하고 페이지 이동·종료·후속 세션에서 이전 프레임을 취소한다. reduced-motion에서는 전체 문장을 즉시 표시한다. 브란의 첫 인사에 기존 문장을 그대로 두 페이지로 나눠 적용했다.

## 임시 개발 관찰 표시
NPC 행동·담화 개발 기간에만 가까운(8m 이내) 가시 모델의 이동·근무·대화·배회·휴식·대기 등 관찰 상태를 기존 월드 말풍선 위치에 표시한다. 정식 발화가 우선하며 참여 대화·메뉴 중 상태 표시는 억제한다. 저장·대사 커서·행동 결정에는 영향을 주지 않는다. 제거 조건은 [전역 TODO](../core/TODO.md)에 기록했다. 카엘 인구는 기존 25명과 신규 부두 일꾼 8명·주민 12명·경비병 5명(총 50명), 기존 ID/순서 보존. 실제 화면과 모바일 성능은 미검증이다.

## v1 그래프 등록 및 화제 선정 (NPC-003/T2)
`conversationTemplates`의 legacy group turns 형식은 그대로 유지한다. version=1/source/topicId/eligibility/slots/entryNode/nodes 형식은 [공용 topic 코어](../../src/core/npc-topic.js)에서 검증한다. 등록 시 named NPC ID, 지역, 직업, 사건 타입·factKey, 슬롯 및 노드 ID를 확인한다. 조건은 op와 명시적 인수, all/any/not; 알 수 없는 런타임 문맥은 not에서도 실패 안전. 효과는 허용 handler와 slot/fact 참조, ok/fail/stale 결과, 명시적 choice 진입만 허용한다. 모든 노드의 무조건 종료 가능 경로 및 자동 순환 금지를 검사한다. 사용자 입력 루프는 종료 선택 필요. graph personal 1NPC+player, event 최대 4NPC+player; graph ambientPath는 검증만 하며 기존 그룹 matcher에 섞지 않는다(T4 연결).
`createTopicResolver(registry)`는 등록 완료 후 생성/갱신하고 상호작용 시 resolve(context)를 호출한다. context: npcId/regionId/role/tags/activity/met/affinity/knownEvents/choiceIds/topicIds/actionIds/questStates/lastTopicTicks/lastTemplateId/now/cursor/services. 일반 화제는 적격 named 우선, 구체적인 personal 조건 우선, priority·안정 ID·cursor 및 최근 템플릿으로 동급 선택. 이벤트는 topic+event ID별 독립 선택, 해당 NPC의 knownEvents에서 active·revision·허용 사실을 바인딩한다. 서비스 descriptor는 전달만 하며 변경하지 않는다. 기존 선택 발화는 legacyLineGraph로 적응 가능. 실제 세션 진행, 효과 실행 및 저장 기록, UI/hold 연결은 T3/T4 미구현.

## 참여 그래프 러너 (NPC-003/T3)
`createTopicSession`은 anchor ID, 페이지, revision, 그래프 선택·화제 hub를 유지하고 기존 GameUI.say 렌더에 연결한다. graph 선택은 같은 세션에서 렌더만 갱신, 기존 외부 선형 say API는 호환 유지. 서비스 descriptor는 기존 Society.executeChoice의 quote/접근 조건을 검증하며 응답만 캡처한다. 실제 종료/지역·거리 이탈 시 anchor 해제, runtime의 기존 hold/resume 경로 재사용. 그래프 기억은 NPC state memory.dialogue에 policy 기반 16건 이하로 가산하며 저장 실패 롤백, 기존 버전과 cursor/met 유지. 사건/그룹 다인 경로는 T4 후속; 실제 브라우저/통합 검증은 미확정.

## 사건 그룹 그래프 (NPC-003/T4 코어)
ambientPath가 등록된 사건 그래프는 기존 L2/L3 그룹 formation/hold를 재사용한다. 실제 joined group의 cursor, offset, currentTurn과 그룹 ID를 유지한다. 각 발화 슬롯의 active 사건·revision·사실을 재확인하고 실제 joined group에서만 해당 graph topic을 노출한다. 세션 currentSpeakerId는 발화 슬롯의 실제 NPC ID, speakerId는 기존 anchor hold ID. 실제 UI 표시 및 효과/경제 통합 검증은 후속 잔여다.

T4: graph ambientPath에 등록된 participationIds는 기존 participationActions의 NPC 슬롯·사건 사실 참조를 검증한다. 실제 GameUI 이름·직급은 현재 발화자, activeSpeaker는 anchor 유지. 명시적 group effect는 유일한 기존 현재 Society 선택 및 scheduler/quote 검증만 재사용한다. 비앵커 소스/대상 슬롯은 group 효과에서만 허용하고 중복 후보는 실패 안전으로 처리한다.

## NPC-003/T5 최종 검증
[종결 기록](../tasks/archive/NPC-003.md) 및 [CI 45606026442](https://github.com/jaksim0sec/sernbeld/actions/runs/45606026442): T2~T4 구현·자동 통합 검증 완료. 등록/resolver, 세션/서비스, 그룹 사건 및 실제 scheduler 효과와 기존 카엘 production 회귀 PASS; graph runner Chromium DOM fixture 4 viewport와 NPC 50명 외형 PASS. 전체 게임 신규 graph E2E 및 실기기 NOT RUN. 신규 production graph 등록은 별도 작업이다.

## 화제 허브 분류 (2026-11-26)
마지막 페이지의 topic hub에서만 같은 분류의 일반 화제·거래·일반 의뢰·길드 업무를 묶는다. 단일 항목은 기존처럼 직접 노출하고 사건·그룹 참여·의뢰 제출/보고·숙박은 직접 접근을 유지한다. 하위 목록은 같은 세션 안에서 이동하며 이전으로 돌아가기와 기존 대화 끝내기를 제공한다. 분류 이동은 대사·효과·기억을 발생시키지 않으며 현재 도달 가능 여부 및 선택 revision을 검증한다. 실제 화제와 서비스의 실행·조건·quote·아이템 아이콘은 기존 계약을 사용한다. 화제 완료/서비스 응답은 최상위 허브로 돌아간다. 격리 V8 신규 회귀 PASS; 전체 Node/Chromium/실게임 및 배포는 미검증.
