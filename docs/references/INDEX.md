# 재사용할 기준과 선례

| 선례 | 원본 / 실제 구현 | 범위 |
| --- | --- | --- |
| 기본 긴소매 셔츠·카라 | [승인 원본과 복원법](../../assets/models/clothing/shirt-v1/README.md), [장착 계약](../../src/entities/character/clothing/README.md) | 외형 승인 원본을 참조한다. 현재 피부 간격·극단 포즈·시각 결과는 [알려진 범위](../knowledge/INDEX.md) 확인 |
| 기본 바지 | [최적화된 원본과 메타데이터](../../assets/models/clothing/pants-v1/manifest.json), [공통 바인더 적용](../../src/entities/character/clothing/pants.js) | 게임에 연결됨. 일반 검증과 스타일 승인 근거는 따로 기록 |
| 시스템 UI | [캐릭터 생성](../../src/entities/character/studio.html), [원본 스타일](../../src/entities/character/studio-ui.css), [디자인 지침](../UI_UX_DESIGN_GUIDELINES.md) | 실제 화면과 공통 SEED의 기준 |
| 카엘의 석재 및 충돌 | [카엘 GLB](../../assets/kael-cutstone-v7.glb.gz), [월드 이동 테스트](../../tests/world-playability.mjs), [충돌 수정](https://github.com/jaksim0sec/sernbeld/commit/ac49a42a) | 시각 구조물과 물리 등록을 비교하는 선례 |
| 자유 시작·커스텀 기술 | [설계 이력](../superpowers/plans/2026-11-21-sernbeld-beta1-topdown.md), [현재 시스템](../core/CURRENT_STATE.md) | 설계 예시는 구현 상태와 구분 |

[생태 GLB 시제품 10종](ECOLOGY_PROTOTYPES.md): 제작 기반을 위한 미승인 시편, 실제 월드 통합 아님.
