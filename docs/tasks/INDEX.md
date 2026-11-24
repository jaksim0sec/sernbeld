# 작업 상태와 인수인계

여러 시스템에 걸치거나 다음 세션·동시 작업과 계약을 공유할 때 [양식](templates/task.md)으로 ID를 만들고 `active/`의 작업에 연결한다. 완료 후 근거와 결정은 남기고 `archive/`로 이동한다. 한 파일이나 문구 수정처럼 바로 검증 가능한 작업은 커밋과 간단한 결과로도 충분하다.

- 구현 단계는 `PROPOSED`, `DESIGNED`, `PROTOTYPED`, `REGISTERED`, `INTEGRATED`의 해당 범위를 기록한다.
- 결과별 검증은 `VERIFIED` 여부와 PASS·FAIL·PARTIAL·NOT RUN, 승인에는 `APPROVED` 여부와 승인 대상을 기록한다. 외형 승인과 게임 내 작동 승인처럼 다른 범위를 독립적으로 추적한다.
- 통합 직전 최신 main과 기준 SHA 사이의 관련 변경을 확인한다. 동시에 작업 중인 계약·경로·저장 형식이 있으면 해당 변경을 보존한 채 검증하고 기록을 갱신한다.

[개발 인프라 구축](active/INFRA-001.md)
