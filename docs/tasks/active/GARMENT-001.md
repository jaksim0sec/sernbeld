# GARMENT-001 기본 셔츠 품질 회귀

기준 main 523187365c81bd69a5e34b97da497e9e4970865b. 사용자의 의상 품질 개선 요청. 승인 원본·인체·리그·장비·기존 가림 계약을 보존한다. INFRA-001 소유 alignment 및 WORLD-001 gameplay/PWA는 변경하지 않는다.

확인된 증거: [Actions 45581484306](https://github.com/jaksim0sec/sernbeld/actions/runs/45581484306)의 여성 극단 자세 armpit p95 2.5505975, p99 3.7367852, 최대 절대 연장 .03668598m. 기준 p95 < 2.5, p99 < 3.5. 전완 단면은 남녀 attention/bend/twist/IK/walk/run/LOD와 독립 소매에서 기존 판정 통과; 측정 최악은 남성 굽힘 근위 단면 약 -.294mm. 과거 여성 -29mm 진단은 현재 측정에서 재현되지 않음. 전체 의상과 실제 시각 품질은 여전히 PARTIAL.

원인 가설: 어깨 인접 정점의 본 가중치 전이가 급한 상태에서 결합 극단 회전 시 상대 연장이 커진다. 공통 바인더의 기존 gradientLimit/smoothing 파라미터만 후보 비교하며 인체나 원본 형상은 수정하지 않는다. [후보 실행기](../../../tools/garment-quality-search.mjs)와 [검증 워크플로](../../../.github/workflows/garment-quality.yml). 기존 일반 포즈 및 커프/IK, 극단 포즈, baked 전완 단면, 원본/가림/바지 보존, 전체 회귀 통과 후에만 변경된 소스 및 재생성 사이드카를 원격 main이 같은 경우 fast-forward 반영한다. 기존 극단 목표를 완화하지 않고 통과한 후보에서만 필수 assert로 승격한다. 후보 실패 또는 병렬 변경 시 반영하지 않는다. GitHub Actions에서 실제 실행되며 이 커밋 자체에서는 후보 실행 NOT RUN. 시각 품질 및 전체 피부 간섭은 별도 검증 범위다.
