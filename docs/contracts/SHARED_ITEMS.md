# 공용 아이템/NPC 경제 기반 (2026-11-25)

기준 d65140c3765a26c360ab85f8aa5382e363c17380. 첨부 v0.1 계약의 런타임 적용 1차. 기존 UI 디자인·물리 변경 없음.

- `src/core/shared-items.js`의 `createItemRuntime`이 `Save.data.itemEconomy`에 실물·소유·지갑·재고를 관리한다. 기존 ITEMS는 확장된 단일 도감이며 기존 Inventory/Wallet 호출부는 이 상태의 호환 인터페이스를 사용한다. 기존 inventory.js는 레거시 독립 테스트용이며 게임에서 호출하지 않는다.
- 기존 v1 수량, 은화, 장착, 고유 ID 및 자유 형식 state를 보존한다. 기존 무명 품질 50, 장비 레벨 1/일반/소모도 0 및 기존 기본 성능을 적용. 미해결 ID는 quarantine에 원본을 보존한다. 기존 재료 기념품은 legacyState를 가진 permanent 예외로 보존하되 거래/기존 스택 소비에서는 제외한다. 명세의 엄격한 정의/실물 mode 일치와 달라 향후 레거시 기념품 정의 이관 필요.
- NPC와 플레이어는 trade/holdingsFor/findDefinitions/findAvailable/equip/registerActor/createFor 공용 계약 사용. 실행되지 않는 ingredient 기능은 canUse에서 거부한다. 기존 고람과 상인에게 NPC별 초기 자금 100, 고람 장비별 재고 1을 제안 기본값으로 부여. 판매는 1개씩 선택, 구매 자동장착 제거. 상점 재고 소진 후 자동 보충 없음. 장기 실물 개인 스탯을 실제 장착 성능에서 참조한다. 수리/소모 공식 미정.
- P09/P10/P03/O03/P15 도감 정의 및 기존 채집 노드의 지형 후보 주변을 이용한 신규 후보 생성. 기존 노드 ID/위치와 장식은 보존. 새 노드는 기존 절차적 메시지를 재사용하는 임시 표현이며 실제 카엘 접근성 및 해당 3D 자산 적용은 확인되지 않았다. 실제 채집 품질 0~100 균등 분포, 수확량은 명세 범위, 기존 picked 키 보존. 기존 지역 저장/노드 재생은 picked를 사용.
- 기존 가방은 품목별 합산 표시이며 개별 품질/실물 선택 UI는 후속. NPC 스케줄/경제 시뮬레이션·실제 ingredient 처리·일반 분할/병합 API·세부 스킬/조건 레지스트리·멀티스택 수요 탐색·정식 자산/배치·엄격 JSON Schema 일치 미완료.
- 검증: V8 격리 실행의 12개 시나리오 PASS(마이그레이션, 기존 기념품, 품질, NPC 매매, 재고, 소유, 장착, 저장 재로드, 저장 실패/채집 중복). 실제 ITEMS 추출 후 20개 정의 및 기존 견습검 성능 확인, import 및 import.meta를 정규화한 소스와 번들 문법 컴파일 PASS. 원본 번들의 마지막 gameplay 부분과 원본 소스 일치 확인 후 해당 부분만 동일하게 교체. 전체 checkout DNS 오류로 `node tools/verify.mjs all`, 브라우저, 실제 카엘, PWA 오프라인, 인프라 전체 검증 NOT RUN. 작성자 자체 검토이며 독립 리뷰 미실행.

## T1 후속: 공급 할당, 소유 재고 예약, 저장 복구 (부분 구현)

- `planSupply({actorId,selector,quantity,sourceKinds,constraints})`: 소유 우선, 여러 실물 합산, 품질/등급/레벨/내구 조건, 명시적으로 접근 가능한 상인만 시장 후보로 선택. 읽기 결과의 expected는 실물·holding 정규화 fingerprint. 시장 실행 및 거리/영업 재검증은 후속.
- `reserve({operationId,actorId,allocations,expiresAt})`, `release(id)`: 현 단계는 소유 재고만 지원. itemEconomy의 선택 필드 reservations에 저장하고 재로드 시 검증. expiresAt는 논리 tick이며 실제 만료 처리는 scheduler 후속; 자동 실시간 만료 없음. 예약된 수량은 기존 trade/take/equip/merge에서 보호한다. 시장 예약·장소 용량·예약 소비·생산·공용 commitOperation은 아직 미구현.
- 기존 trade/equip/gather 등의 저장 실패에서 Save.data의 모든 JSON root를 복구하도록 공통 경계를 보강. 저장 콜백의 외부 부작용/렌더 논리 상태 보호는 T4에서 별도 검증. 기존 레거시 API의 non-persist 변경은 유지.
- 검증: 최신 main의 실제 원본 테스트와 추가 공급/예약/복구 테스트를 V8 격리 실행 PASS. 전체 Node/브라우저/카엘/PWA/인프라 검증 NOT RUN(DNS로 checkout 불가). 신규 콘텐츠 없음. 

### T1 공용 operation 1차: 직접 제공

- `registerTransferPolicy(id,validatePolicy)`는 trusted JS 코드의 검증기를 등록한다. 미등록 정책은 unsupported. 정책은 command/Save.data의 복제본만 전달받으며 순수 검증이어야 한다. 실제 거리·영업·관계 정책과 등록 호출은 런타임 연결 후속이다.
- `canExecute(command)`는 효과 없이 검증, `commitOperation({operationId,kind:'transfer',actorId,payload:{recipientId,allocations,policyId,reservationId?,tick?}})`는 소유자의 복수 lot/unique 제공을 단일 저장 및 영수증으로 처리한다. 예약 사용 시 정확한 예약 할당과 유효 tick 필요. 미예약 제공은 fingerprint 및 가용량 재검증. 지갑 보존, offer 참조 정리, unique ID/속성 보존, 동일 ID 재실행 및 재로드 멱등성. 기존 trade와 동일 transactions ID namespace 사용. 미등록 정책/다른 kind는 unsupported. 생산/소비/거래/요청의 공통 operation 핸들러 및 여러 도메인 draft 효과는 후속.
- 원본 12 시나리오, 공급/예약/복구 14 checks, 복수 실물 제공/영수증 14 checks V8 격리 실행 PASS. 전체 Node/브라우저 및 실제 게임 연결 NOT RUN.

### T1 소비·생산 operation

- `registerConsumptionPolicy(id,{input,effect,validate})`: 명시적인 단기 lot selector, 필요도 효과와 trusted JS 조건 검증기를 등록한다. `effect={needId,delta,min,max}`는 기존 NPC의 초기화된 숫자형 `npcStates[id].needs[needId]`만 변경한다. ingredient planned capability만으로는 소비할 수 없다. `commitOperation({operationId,actorId,kind:'consume',payload:{policyId,allocations,reservationId?,tick?}})`는 실제 재고와 필요도 변경을 하나의 저장 경계에서 확정한다.
- `registerRecipe(id,{inputs,outputs,qualityPolicy,validate})`: 입력은 수량·definitionId/태그/category·minQuality, 출력은 definitionId/quantity. 장소/도구/능력 조건은 trusted guard가 확인하고 품질은 등록된 함수가 결정한다. `kind:'produce'` payload의 recipeId, allocations, inputBindings(입력 슬롯별 recordId/quantity), seed 및 선택 예약/tick 사용. 여러 입력 슬롯이 같은 lot를 사용할 때 합산 검증, 불필요한 입력/잘못된 품질/미등록 출력 거부. 산출물은 실제 도감 기준이며 임의 caller 출력은 사용하지 않는다. 예약 해제·재료 소모·산출물·영수증 원자 저장.
- 등록/검증 함수는 신뢰된 코드 전용으로 순수하고 결정론적이어야 한다. 실제 정책·레시피는 추가하지 않았다. 필요도 상태 초기화, scheduler, 도구/장소 예약, 자동 만료, 시장 실행 및 종합 등록기 연결은 후속.
- V8 원본 12 시나리오 + 추가 44 checks PASS. Node 전체·카엘·브라우저·PWA/인프라 NOT RUN. 

### T1 복수 시장 구매·재고 예약

- `registerMarketPolicy(id,guard)`로 신뢰된 접근/영업 검증기를 등록한다. `planSupply`의 market 할당을 `reserve({operationId,actorId,allocations,expiresAt,policyId,tick})`로 잠그고 `commitOperation({operationId,actorId,kind:'purchase',payload:{allocations,policyId,reservationId?,tick?}})`로 복수 상인의 실물과 은화를 단일 저장에서 이동한다. 구매 시 현재 offer 가격/품질/소유권/잔액/접근 정책 재확인. 기존 trade도 예약된 수량에 접근 불가. 예약은 재고만 잠그며 은화를 별도 예약하지 않는다; 구매 시 잔액 부족은 실패. mixed owned/market 할당은 각각 분리해서 사용.
- `releaseExpiredReservations(tick,limit=32)`: 기존 expiresAt보다 큰 논리 tick에서 정렬된 최대 limit 예약을 해제. scheduler 호출 연결 후속. 기존 장착 시 해당 실물의 offer 노출 제거. 실제 상인 접근 정책 등록은 게임 연결 후속.
- V8 원본 12 시나리오 + 추가 58 checks PASS. 전체 checkout/Node/카엘/브라우저/PWA NOT RUN.
