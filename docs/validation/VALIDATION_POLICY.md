# 검증과 통합

| 단계 | 입증 대상 | 실행 예 |
| --- | --- | --- |
| V1 데이터 | 산출물 형식, 원본 재현, 생성물 동기화 | `node tools/verify.mjs build`, 의상 원본 검사 |
| V2 계약 | 리그, 가림, 슬롯, 저장, 월드 등록 | `node tools/verify.mjs clothing`, `node tools/verify.mjs core` |
| V3 기능 | 게임 진입, 실제 장착과 이동, UI의 실제 조작 | `node tools/verify.mjs world`, Chromium 스위트 |
| V4 품질 | 재질·관절·실루엣, 조작 경험, 성능 전후 | 스튜디오 비교, 실제 브라우저 캡처, 필요한 경우 실기기 및 사용자 승인 |
| V5 통합 | 동일 커밋의 게임, PWA, 배포 산출물 | `node tools/verify.mjs all`, [main 검증·배포](../../.github/workflows/main-validation.yml) |

요구 기준별 `PASS` / `FAIL` / `PARTIAL` / `NOT RUN`과 실행 환경·증거를 [작업 기록](../tasks/INDEX.md)에 남긴다. 일부 포즈나 제한된 WebGL 환경의 결과는 범위를 적는다. 감각·게임 방향에 대한 승인은 별도로 기록한다.

```sh
npm install --no-save --no-package-lock playwright pngjs three
npx playwright install chromium
node tools/verify.mjs all
```

일상 작업은 해당 그룹만 실행한다. 생성 파일을 변경해야 할 때는 소스와 결과를 같은 변경에 포함한다. CI에서 번들은 바이트 수준, 압축 사이드카는 풀린 데이터 수준으로 재생성 결과를 비교한다. 번들은 `node tools/build-game.mjs`, 인체 LOD는 `node tools/optimize-characters.mjs`, 기본 의상 바인딩은 `node tools/bake-garments.mjs`를 실행한 뒤 검사한다. 기존의 브랜치 분리 비교는 [이력 워크플로](../../.github/workflows/refactor-regression.yml)에 남아 있다.

통합 직전에 최신 `origin/main`과 겹치는 경로·공통 계약을 비교하고, 최신 변경이 들어간 최종 트리를 검증한다. 빠진 권한 또는 WebGL 환경 제약과 미검증 범위를 결과에 적는다.

Pages 배포는 GitHub 저장소의 Settings → Pages → Source가 **GitHub Actions**일 때 [main 검증·배포](../../.github/workflows/main-validation.yml)에서 자동으로 이뤄진다. 배포 Job은 데이터·기능·브라우저 검증을 통과한 실행의 아티팩트만 받는다. 브랜치 직접 게시가 설정된 저장소는 그 게시 소스를 전환하기 전까지 여전히 별도 경로로 배포된다. 실제 배포 성공은 Actions와 공개 URL에서 SHA 기준으로 확인한다.

## 단계 검증과 최종 게이트

- V1~V5는 입증 범위의 분류이지 모든 T가 순서대로 통과해야 하는 체크리스트가 아니다. 변경 범위와 실패 위험에 직접 필요한 검증을 선택한다. S 문서/데이터/국소 코드 변경은 링크·형식·관련 정적/격리 회귀 등 적절한 최소 검사로 충분하다. UI·물리·성능 등 실제 화면/환경이 요구의 핵심이면 그 검증은 유지한다.
- T별 직접 검증과 전체 작업 최종 게이트를 계획 단계에서 구분한다. 전체 CI·배포·공통 브라우저 회귀는 필요한 경우 최종 통합 SHA에서 한 번으로 합친다. 개별 T의 변경을 main에 올리면 기존 workflow가 자동 실행될 수 있으나 그 완료를 다음 T 착수의 일반 선행조건으로 삼지 않는다. 배포 아티팩트의 기존 CI 통과 조건은 변경하지 않는다.
- 필요한 직접 검증이 통과한 범위만 종결한다. CI가 진행 중이거나 새 커밋으로 취소됐거나 해당 T와 무관한 검증이 남은 상태는 다음 T를 자동 차단하지 않는다. 실제 관련 실패·미충족 선행 계약·회귀 위험은 먼저 해소한다. 필요한 경우 독립 단계는 미완료 기록을 유지한 채 진행한다.
- 전체 작업을 완료로 표시하기 전, 명시된 필수 최종 검증과 main 반영을 확인한다. 필수 검증의 FAIL/PARTIAL/NOT RUN은 그대로 남기고 완료로 바꾸거나 TODO로 밀어내지 않는다. 실기기 검증이 필요하지 않은 작업에 관행적으로 요구하지 않으며, 이미 합의된 필수 실기기 검증은 임의 삭제하지 않는다.

## 부분 검증과 인프라 검사

`node tools/verify.mjs build`에는 카탈로그·작업 기록·문서 링크 검사와 그 부정 사례 테스트가 포함된다. 실행기는 종료 코드와 명시적인 PARTIAL/NOT RUN/STRESS TARGET NOT MET 진단을 구분한다. 기존 여성 극단 포즈, 지도 드래그 후 터치, 피부 간격 진단만 명시적 유예로 두고 새 부분 검증은 기본적으로 차단한다. `node tools/verify.mjs --strict all`은 유예도 차단한다. 일반 CI 성공을 유예된 품질의 통과로 표현하지 않는다. 로그 기반 분류이며 무진단 테스트의 검증 범위는 여전히 요구별 기록으로 관리한다.
