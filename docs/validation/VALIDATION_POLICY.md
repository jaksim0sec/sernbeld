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

## 부분 검증과 인프라 검사

`node tools/verify.mjs build`에는 카탈로그·작업 기록·문서 링크 검사와 그 부정 사례 테스트가 포함된다. 실행기는 종료 코드와 명시적인 PARTIAL/NOT RUN/STRESS TARGET NOT MET 진단을 구분한다. 기존 여성 극단 포즈, 지도 드래그 후 터치, 피부 간격 진단만 명시적 유예로 두고 새 부분 검증은 기본적으로 차단한다. `node tools/verify.mjs --strict all`은 유예도 차단한다. 일반 CI 성공을 유예된 품질의 통과로 표현하지 않는다. 로그 기반 분류이며 무진단 테스트의 검증 범위는 여전히 요구별 기록으로 관리한다.
