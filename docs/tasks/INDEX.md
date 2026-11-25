# 작업 상태와 인수인계

프로젝트 전체에서 다음 할 일을 찾을 때는 [전역 TODO](../core/TODO.md)를 확인한다. 개별 작업의 진행 상태와 검증 근거는 이 작업 기록에서 유지한다.

여러 시스템에 걸치거나 다음 세션·동시 작업과 계약을 공유할 때 [양식](templates/task.md)으로 ID를 만들고 `active/`의 작업에 연결한다. 완료 후 근거와 결정은 남기고 `archive/`로 이동한다. 한 파일이나 문구 수정처럼 바로 검증 가능한 작업은 커밋과 간단한 결과로도 충분하다.

- 구현 단계는 `PROPOSED`, `DESIGNED`, `PROTOTYPED`, `REGISTERED`, `INTEGRATED`의 해당 범위를 기록한다.
- 결과별 검증은 `VERIFIED` 여부와 PASS·FAIL·PARTIAL·NOT RUN, 승인에는 `APPROVED` 여부와 승인 대상을 기록한다. 외형 승인과 게임 내 작동 승인처럼 다른 범위를 독립적으로 추적한다.
- 통합 직전 최신 main과 기준 SHA 사이의 관련 변경을 확인한다. 동시에 작업 중인 계약·경로·저장 형식이 있으면 해당 변경을 보존한 채 검증하고 기록을 갱신한다.

[개발 인프라 구축](active/INFRA-001.md)

[상호작용 UI v2](archive/NPC-001.md)

[NPC 데이터 계약 후속](archive/NPC-002.md)

[달리기 스태미나](archive/MOVEMENT-001.md)

## 작업 주소 규약

TRACE의 작업 주소는 `AREA-NNN` 또는 `AREA-NNN/Tn`이다. 작업 ID는 저장소 내에서 고유하고, 단계 ID(`T1`, `T2` 등)는 해당 작업 내에서만 고유하다. 예: `WORLD-001/T8`은 생활 세계 베타 인프라의 통합 검증·최적화 단계다.

- 재개 시: 최신 main → AGENTS.md → 이 색인 또는 `active/<작업ID>.json`의 detail → 상세 Markdown의 해당 단계 및 이후 관련 기록 순으로 확인한다. 완료·보관 작업은 archive에서 찾는다. JSON이 없는 기존 작업은 Markdown을 직접 참조한다.
- `T8`처럼 작업 ID가 생략된 경우 현재 명시된 작업으로 유일하게 해석할 수 있을 때만 사용한다. 모호하면 작업 ID를 확인한다. 단계가 존재하지 않으면 임의 생성하거나 다른 단계로 바꾸지 않는다.
- 새 다단계 작업은 `## T1 단계명` 형식으로 안정된 단계 ID, 목표/완료 기준, 구현·검증·남은 범위를 기록한다. 시작한 단계 ID는 재번호화하거나 다른 의미로 재사용하지 않는다. 기존 `T8 초기`, `T8 후속` 등의 누적 기록도 같은 주소의 근거로 인정한다.
- 재개 시 단계의 선행 의존성·실제 코드·최신 검증 결과를 대조하고, 미완료 범위부터 수행한다. 종료 시 같은 단계 아래 결과와 한계·다음 행동을 갱신하고 구조화 기록의 `next`도 실제 다음 작업 주소와 맞춘다. 단계 번호 자체는 완료 증거가 아니다.
- 주소 표준은 기존 ID, Markdown 및 JSON 스키마와 호환된다. 현재 단계 단위의 별도 기계 검사는 없으며 기존 범위·링크 검사를 유지한다. 간단한 작업에 단계 번호를 강제하지 않는다.

## 병렬 작업의 기계 검사

장기/병렬 작업은 상세 Markdown과 같은 ID의 JSON 파일을 `active/`에 함께 둔다. [INFRA-001 예시](active/INFRA-001.json)처럼 id/status/baseline/detail/scope/contracts/dependencies/next를 기록한다. scope는 저장소 상대 파일·디렉터리 경로이며 in_progress/blocked 상태에서만 경로를 점유한다. 같은 파일 또는 상하위 경로의 중복 점유는 `node tools/check-infra.mjs`에서 실패한다. 완료 시 상태를 done으로 바꾸고 두 파일을 archive로 이동한 뒤 detail 링크를 갱신한다. 이 검사는 기록된 범위의 충돌만 찾으며 실제 Git 동시 편집은 최신 HEAD/병합 검증이 필요하다.

[공용 아이템/NPC 경제 1차](active/ITEM-001.md)

[생활 세계 베타 인프라](active/WORLD-001.md)

[기본 셔츠 품질 회귀](active/GARMENT-001.md)

[최초 캐릭터 로딩 구조 개선 (PERF-001)](active/PERF-001.md)

[통합 NPC 대화 템플릿 및 진행 엔진 (NPC-003)](active/NPC-003.md)
