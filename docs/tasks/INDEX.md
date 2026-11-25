# 작업 상태와 인수인계

여러 시스템에 걸치거나 다음 세션·동시 작업과 계약을 공유할 때 [양식](templates/task.md)으로 ID를 만들고 `active/`의 작업에 연결한다. 완료 후 근거와 결정은 남기고 `archive/`로 이동한다. 한 파일이나 문구 수정처럼 바로 검증 가능한 작업은 커밋과 간단한 결과로도 충분하다.

- 구현 단계는 `PROPOSED`, `DESIGNED`, `PROTOTYPED`, `REGISTERED`, `INTEGRATED`의 해당 범위를 기록한다.
- 결과별 검증은 `VERIFIED` 여부와 PASS·FAIL·PARTIAL·NOT RUN, 승인에는 `APPROVED` 여부와 승인 대상을 기록한다. 외형 승인과 게임 내 작동 승인처럼 다른 범위를 독립적으로 추적한다.
- 통합 직전 최신 main과 기준 SHA 사이의 관련 변경을 확인한다. 동시에 작업 중인 계약·경로·저장 형식이 있으면 해당 변경을 보존한 채 검증하고 기록을 갱신한다.

[개발 인프라 구축](active/INFRA-001.md)

[상호작용 UI v2](archive/NPC-001.md)

[NPC 데이터 계약 후속](archive/NPC-002.md)

## 병렬 작업의 기계 검사

장기/병렬 작업은 상세 Markdown과 같은 ID의 JSON 파일을 `active/`에 함께 둔다. [INFRA-001 예시](active/INFRA-001.json)처럼 id/status/baseline/detail/scope/contracts/dependencies/next를 기록한다. scope는 저장소 상대 파일·디렉터리 경로이며 in_progress/blocked 상태에서만 경로를 점유한다. 같은 파일 또는 상하위 경로의 중복 점유는 `node tools/check-infra.mjs`에서 실패한다. 완료 시 상태를 done으로 바꾸고 두 파일을 archive로 이동한 뒤 detail 링크를 갱신한다. 이 검사는 기록된 범위의 충돌만 찾으며 실제 Git 동시 편집은 최신 HEAD/병합 검증이 필요하다.
