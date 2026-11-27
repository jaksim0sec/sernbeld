# 세른벨드 작업 진입점

기준 저장소는 `jaksim0sec/sernbeld`, 통합 기준은 `main`이다. 먼저 현재 HEAD, 원격 main, 작업 트리와 관련 최근 변경을 확인한다. 사용자 작업을 유지하고 요청 없이 새 브랜치를 만들거나 기존 브랜치를 변경하지 않는다.

저장소 변경 작업은 검증 후 변경 커밋이 원격 `main`에 포함됐음을 확인해야 완료다. 사용자가 작업 범위를 따로 지정하면 그 범위를 따른다.

이 저장소의 개발 체계는 **축적·계승형 개발 아키텍처(TRACE; Task Routing & Agent Continuity Environment)**이다. 작업 주소(`WORLD-001/T8` 등)가 주어지면 [작업 색인과 주소 규약](docs/tasks/INDEX.md#작업-주소-규약)을 통해 해당 기록의 마지막 검증 및 남은 범위를 확인하고 재개한다. 세션 기억이나 단계 번호만으로 완료를 추정하지 않는다.

[현재 구현과 기준 자료](docs/core/CURRENT_STATE.md)에서 현재·과거·제안을 구분한다. 요청이 걸치는 행을 함께 읽고, 각 문서가 연결한 코드·도구로 바로 들어간다.

[전역 TODO](docs/core/TODO.md)는 프로젝트 전체의 남은 일 목록이다. 사용자의 요청을 우선하며, 요청을 완료한 후 작업 여유가 있거나 다음 과제가 없을 때 전역 TODO를 확인한다. 최신 작업 기록과 점유 범위·의존성을 확인하고 처리 가능한 항목만 진행한다. 새 미완료 과제·검증·문제는 작업 종료 전 TODO에 연결하고 완료 근거를 갱신한다. 여유가 없으면 기록만 남기며, 요청 범위 밖의 중대한 변경을 임의로 진행하지 않는다.

| 작업 | 먼저 읽을 문서 | 실제 시작점 |
| --- | --- | --- |
| 의상·장착·리그 | [의상 제작](docs/workflows/CLOTHING.md), [기준 리그](docs/contracts/CHARACTER_RIG.md) | [공용 의상 스튜디오](tools/dev/index.html), [장착 계약](src/entities/character/clothing/README.md) |
| 3D 에셋·생태·건축 | [에셋·월드 제작](docs/workflows/MODEL_ASSETS.md), [산출물 계약](docs/contracts/DELIVERABLES.md) | [에셋 스튜디오](tools/dev/assets.html), [아트·세계관](세른벨드_게임_컨셉_종합.md#2-아트-디렉션과-세계의-분위기) |
| UI·마법진 | [UI/UX 설계 지침](docs/UI_UX_DESIGN_GUIDELINES.md), [UI 작업과 실행 검증](docs/workflows/UI_UX.md) | [SEED](styles/seed.css), [UI 작업대](tools/dev/ui.html) |
| 물리·충돌·동선 | [디버깅과 최적화](docs/workflows/DEBUGGING.md), [에셋·월드 제작](docs/workflows/MODEL_ASSETS.md) | [물리 검증](tests/player-physics.mjs), [카엘 실월드 검증](tests/world-playability.mjs) |
| NPC·아이템·스킬·저장·콘텐츠 기획 | [산출물과 등록](docs/contracts/DELIVERABLES.md), [현재 구현](docs/core/CURRENT_STATE.md) | [게임 기획](세른벨드_게임_컨셉_종합.md), [코어 모듈](src/core/) |
| 최적화·리팩터링 | [디버깅과 최적화](docs/workflows/DEBUGGING.md), [구조](docs/STRUCTURE.md) | 변경 대상의 계약, 실제 성능과 보존 비교 |
| 빌드·PWA·배포 | [검증·통합](docs/validation/VALIDATION_POLICY.md), [PWA](docs/PWA.md) | [검증 실행기](tools/verify.mjs), [검증·배포 CI](.github/workflows/main-validation.yml) |

- S(간단 수정)는 관련 규격과 최소 검증만 수행한다. M(새 콘텐츠)은 분야별 작업 흐름을 따른다. L(시스템 변경)은 통합 검증을 하고 [작업 기록](docs/tasks/INDEX.md)을 남긴다. XL(공용 계약 개편)은 영향과 의존 작업을 먼저 조정한다. 주요 디자인이나 비호환 계약 변경은 적용 전에 사용자와 범위를 합의한다.
- T는 독립적인 기능 결과 단위로만 분할한다. S는 0~1T, M은 1~3T, L은 2~4T가 기본이며 초과 분할은 실제 의존성·위험 근거가 필요하다(XL은 필요에 따라). 조사·구현·검증·커밋·보고만을 별도 T로 분리하지 않는다. [단계 규약](docs/tasks/INDEX.md#t-분할과-진행-기준)을 따른다.
- T별 필수 검증은 변경 범위에 직접 필요한 최소 증거만 지정한다. 전체 CI·배포·실기기 검증을 매 T에 반복 강제하지 않고 실제 요구에 맞는 최종 게이트에서 합쳐 확인한다. CI 대기나 독립된 미검증 항목만으로 다음 T를 차단하지 않는다. [검증 정책](docs/validation/VALIDATION_POLICY.md#단계-검증과-최종-게이트)을 따른다.
- 요구사항별로 결과와 보존 기준을 먼저 정한다. 공용 도구와 [승인 선례](docs/references/INDEX.md)를 재사용하고, 실패 시 [재현과 판단 근거](docs/knowledge/INDEX.md)를 확인한다.
- 통합 전에 최신 main을 다시 확인하고, 다른 작업과 겹친 경로·계약을 비교한다. 생성물과 소스는 한 변경으로 검증한다. 검증 결과와 사용자 승인 범위는 각각 기록한다.
- 작업 종료 시 변경된 계약, 확인한 실패 원인, 승인 선례와 현재 상태 중 해당하는 기준 문서만 갱신한다. 갱신 대상은 [지식 관리](docs/knowledge/INDEX.md)에 있다.

- M 이상 신규 콘텐츠의 메타데이터를 [산출물 계약](docs/contracts/DELIVERABLES.md)의 카탈로그에 남긴다. 장기·병렬 작업은 시작할 때 구조화 작업 기록을 추가하고 `node tools/check-infra.mjs`로 범위 중복과 링크를 검사한다. [인프라 명세](docs/core/INFRASTRUCTURE_SPEC.md)는 인프라 자체를 개편할 때 읽는다.
- 사용자 직접 개입(조작·권한 승인·실기기 확인·의사결정)이 실제로 필요한 경우에만 응답에 파란 토큰칩 `needHand`를 표시한다. 칩을 지원하지 않는 환경에서는 `needHand` 텍스트를 사용한다. 바로 옆에 필요한 사용자 행동과 이유를 명시한다. 에이전트가 자체 해결할 수 있는 문제, 단순 CI 대기 및 일반 진행 보고에는 사용하지 않는다.
