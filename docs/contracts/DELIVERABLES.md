# 산출물과 시스템 등록

새 자료는 안정적인 ID, 출처·원본 위치, 대상 계약/버전, 현재 구현·검증·승인 범위, 재현 방법을 해당 에셋 메타데이터나 [작업 기록](../tasks/INDEX.md)에 남긴다. 런타임 값은 기존 레지스트리·저장 스키마를 따른다.

| 산출물 | 추가 정보와 실제 등록 경로 |
| --- | --- |
| 일반 3D | 분류, 미터 단위 크기, 축·피벗, 재질, LOD, 충돌 정책. [에셋 흐름](../workflows/MODEL_ASSETS.md)과 [월드 배치 코드](../../src/gameplay/gameplay.part.js) |
| 의상 | 슬롯, 체형, 리그 버전, 관절 범위, 가림, 레이어, 재질. [의상 등록 계약](../../src/entities/character/clothing/README.md) |
| NPC | ID, 지역, 역할, 외형, 생활 행동, 대화, 저장 상태. [엔티티](../../src/core/entity-registry.js), [지역](../../src/core/region-lifecycle.js), 게임의 `Townsfolk` |
| 아이템 | ID, 분류, 설명, 스택/인스턴스 정책, 외형, 상호작용. [인벤토리](../../src/core/inventory.js)와 게임의 아이템 정의 |
| 건물 | 배치 기준, 출입구·동선, 보행면·충돌, 상호작용, 지역. 게임의 `box2`·계단과 [실제 이동 검증](../../tests/world-playability.mjs) |
| UI | 화면 목적, 행동 경로, 계층, 화면 상태, SEED 및 핸들러 연결. [UI 흐름](../workflows/UI_UX.md) |
| 스킬 | 행동 조합, 비용, 조건, 효과, 저장 포맷. [컴파일러](../../src/core/skill-engine.js), [저장소](../../src/core/skill-library.js), [실행기](../../src/core/skill-runner.js) |
| 시연 | 참조 및 입력, 실행 환경/경로, 조작, 검증 범위 |
| 콘텐츠 기획 | 세계관에서의 목적, 요구 시스템과 의존성, 미결정 사항, 완료 기준. 여러 작업이 참조할 ID는 [작업 인덱스](../tasks/INDEX.md)에 등록 |

## 저장 호환

게임 저장 키 `sernbeld.save.v1`과 데이터 버전의 실제 읽기·정규화는 `Save` 정의를 확인한다. 기존 스택과 개별 고유 아이템, 지역 기본값 대비 변경분, 사용자 기술 스키마는 각 코어 모듈이 관리한다. 기존 저장 로드, 새 저장 작성, 재로드, 모르는 필드/버전 처리를 변경 전후에 검증한다. 지역의 표시·갱신과 저장된 상태의 수명은 별도로 확인한다.

## 기계 검사 가능한 산출물 카탈로그

`docs/catalog/*.json`은 배열 단위로 저장한다. 기존 런타임 레지스트리를 대체하지 않고, 새 콘텐츠의 영속 ID·현재 단계·원본/런타임 경로·승인 범위·검증 근거를 연결한다. 기존 사례는 [existing.json](../catalog/existing.json) 참고. `id`, `kind`, `title`, `stage`, `source`, `approval`, `checks`가 공통 필드다. REGISTERED/INTEGRATED에는 실제 `runtime` 경로, asset/building에는 `collision`(decorative/walkable/blocking/mixed), `units`, `pivot`, garment에는 `slot`, `rig`, `bodies`가 필요하다. `checks`는 criterion/result/evidence를 사용하며 미검증을 숨기지 않는다. `node tools/check-infra.mjs`로 배치 내외 중복 ID·경로·필수 필드를 검사한다. 이것은 등록 메타데이터 검사이며 실제 런타임 사용을 보증하지 않는다.
