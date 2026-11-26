# MOVEMENT-002 등반 및 턱 오르기

- 기준 `352b593`. 기존 점프 입력에서 지형·물체 표면, 몸의 충돌 및 리그 접촉을 연결한다.
- 지형·벽 등반과 턱 오르기를 각각 재현하고 남녀 리그 손·발 접촉과 기존 점프·계단을 검증한다.

## 4b02361 후속 보정
- 기존 물리 접점/충돌 경로 보존. 벽을 향할 때 로컬 +X(왼쪽)는 negative across에 대응하므로 양손·양발 표시 순서를 수정한다.
- 턱 잡기 구간의 손목 목표와 실제 체형별 팔 길이, 기존 팔꿈치 제한을 사용해 제한된 시각 몸통 보정을 구한 뒤 손·발 IK를 수행한다. 접점 이동이나 팔 길이 변경 없음.
- 등반 카메라는 기존 near-plane 충돌 검사를 재사용하고, 요청 시점이 막힌 경우 벽 바깥/측면을 탐색한다. 공간이 전혀 없으면 기존 안전 전환을 유지한다.
- 검증: 카메라 합성 회귀 및 도달 범위 수식 격리 실행 PASS. 실제 남녀 리그의 낮은/중간/높은 회전 턱 회귀 추가, 전체 저장소 실행/Chromium/카엘 시각 품질은 NOT RUN (Git 네트워크 및 원본 바이너리 접근 제한). 실제 회귀와 시각 품질 확인 전 작업 완료로 표시하지 않는다.

## 4bbf41f 후속 수정 (경사·건물)
- 재현: 피로 상태에서도 50° 초과 경사를 점프 연타로 무제한 상승(경사 착지가 일반 착지로 처리), 낭떠러지에서 하강 스냅이 걸음을 유지, 건물 벽은 `climbable` 화이트리스트에 없어 등반 불가.
- 50° 초과 지형은 서 있는 지면이 아니다: 하강 스냅·착지·재점프 불가, 경사선 방향으로 미끄러짐(`Player.slide`). 입력은 경사선 가로 방향만 조향한다. 미끄러지는 중이나 공중에서 벽 쪽 점프 입력은 잡기를 시도한다.
- 모든 고체 상자는 `climbable:false`가 아니면 등반 가능. 집·창고·수도원·테라스 전면·외곽 인스턴스 집은 벽 상단을 처마 높이로 맞추고, 벽 바닥면 범위에만 경사 지붕을 플레이어 지면(`addRoof`, `playerTerrain`)으로 등록한다. 처마 돌출부는 충돌 없음. 도머·굴뚝 충돌체 추가, 길드 탑은 고체·등반 제외.
- 턱 오르기 착지 높이는 벽 상단 또는 그 위 지붕 높이; 손은 벽선 바로 안쪽의 보이는 지붕 면에 둔다. 손이 닿는 범위 안의 벽 상단은 모서리를 잡는다.
- 등반 전용 스태미나(6.5/s), 한 사이클 0.30 m / 0.46 s.
- 검증: `player-physics`(경사 연타·낭떠러지·미끄러짐·건물 등반/지붕 착지/공중 잡기 추가), `camera-comfort`, `world-performance`, `world-playability --no-browser` PASS. `build-ecology-prototypes --check`는 main에서도 동일 실패(무관). Chromium/카엘 시각 확인 NOT RUN.

## 처마·측면·원기둥·미끄러짐 (같은 작업 연장)
- 지붕 기록 일반화(`addRoof`): 박공·각진 원뿔(G.cone 각수/회전 그대로)·차양. 벽 바닥면 위는 발 기준 지면, 바깥 돌출부(처마·박공 처마·차양)는 위에서만 밟히는 일방향 발판이며 등반 몸통·상승하는 머리는 그 판(`roofSlabHit`, `playerCeiling`)을 통과하지 못한다.
- 돌출부 넘기(`traversalOverhang`/`traversalPull`): 밑면 바로 아래까지 접근 → 가장 낮은 밑면 아래로 내려 바깥으로 스윙 → 손은 실제 끝 가장자리 상면 → 넘어서 첫 유효 착지점. 돌출 깊이 1.05 m, 손 높이 2.32 m 초과는 넘기 불가(측면 이동으로 우회). 앞쪽 처마/차양 끝은 지상·공중 점프 입력으로 잡는다(`traversalLedgeAhead`).
- 박공 끝 벽면은 박공 삼각면 실제 상단까지 등반 면(`roofGableTop`).
- 측면 등반(`traversalSide`): 면 따라 0.30 m, 면 끝에서 정지. 원기둥은 호를 따라 이동.
- 원기둥 등반은 명시 opt-in만. 등대(기단·5분절 테이퍼·전망대), 수도원 원탑, 전망대 기단, 바위(끌어올리기 전용, 정수리 손 위치) 충돌체를 렌더 형상에 맞춤. 분절 간 면 인계(`traversalHandoff`). 원뿔 지붕(망루·길드탑·수도원 탑)은 지면 등록, 가파르면 미끄러짐.
- 발코니 바닥판·난간 충돌체, 상점 차양 지붕 기록 추가. 기단 위에 떠 있는 벽(0.3 m 이내)도 하단 모서리를 디딘다.
- 미끄러짐 포즈(`poseSlide`): 내리막 방향, 웅크림, 등고선 방향 양발을 경사면에 IK, 팔 균형. 당기기 동작에서는 스윙 시작과 함께 발을 벽에서 뗀다.
- 나무 줄기 등반은 제외: 줄기가 휘고 가늘어지는 절차 형상인데 충돌체는 곧은 원통+0.1 m라 손이 허공을 잡게 된다. 생성기 줄기 축 기반 등반 면이 필요.
- 검증: player-physics(처마·박공·측면·공중 잡기·차양·발코니·원기둥 분절/전망대·바위), studio-model(남녀 실제 리그 미끄러짐 발 접지·처마 손 도달) PASS. 실제 카엘 월드 Node 시뮬레이션: 박공 집 정면 중앙 59곳 중 57곳 등반 시작, 47곳 지붕 도달(10곳은 차양 우회), 나머지 10곳은 벽 폭 거의 전체를 덮는 차양/발코니로 모서리 회전 없이 우회 불가. 관통 0. Chromium 시각 확인 NOT RUN.

## 공유 경로 순차 통합
생활 세계 WORLD-001의 실제 연결을 위해 gameplay/game.js/sw.js 점유를 이전했다. 등반·카메라의 기존 구현과 미검증 상태는 유지한다. 이동 후속 수정 전 최신 main 및 공유 경로 점유 재조정.

## 모바일 달리기 분리 및 스프린트 조정 (사용자 후속 S 작업)
- 모바일 스틱 최대 입력 자동 달리기 제거. 점프 위 독립 토글, aria-pressed 선택 상태, 키보드 Shift 유지. blur/캐릭터·대화·지도·편집 진입 등에서 토글 초기화. 기존 지상 스태미나, 수영·비행 속도, 걷기 2.6m/s 보존; 지상 달리기 5→7.5m/s(1.5배).
- schoolyard locomotion의 달리기 상체 전경사·허벅지·팔·팔꿈치 진폭 및 골반 리듬 강화. 걷기 포즈 동일, 1인칭 전경사 추가하지 않음. 기존 IK/등반/카메라 구조 유지. 사용자 미지정 버튼 위치와 토글 방식 및 모션 계수는 구현 판단.
- PASS 실제 Input 이벤트 모의 실행 및 실제 motion 드라이버 V8 포즈 회귀 15 assertions(동일 변경). 실제 player-physics.mjs 본문 V8 격리 14863 assertions PASS (PASS: fixed-step diagonal movement, wall slide, generic steps, head clearance, jumps, landings, exact treads, slopes, swimming, NPC contact and teleport interpolation; PASS: sprint drain, fixed ticks, exhaustion, recovery, wall contact, airborne movement, swimming and flight; PASS traversal: lip height, rotated wall anchors, planted supports, exhaustion/drop, headroom and steep terrain crest; PASS steep ground: no hop climbing, cliff edges fall, steep faces slide, gentle descents stay grounded; PASS building climb: walls, eave and rake pull-over, roof/eave walking, sideways climb, airborne grab, awning ledge, balcony stop; PASS cylinders: opt-in, segment hand-off, gallery pull-over, boulder pull-up only; PASS terrain recovery, safe spawn, thin-wall/deck ray and presentation floor; PASS: Kael planter, balcony, railing and lookout geometry has matching colliders; PASS: 13 Kael flights/landings, 762 fascia faces, 140 parapets; side approach and camera ray; PASS corner grazing angle 3.04 progress 9.286m; PASS corner grazing angle 4.64 progress 9.320m; PASS corner grazing angle 6.24 progress 9.327m; PASS corner grazing angle 1.44 progress 9.243m). 기존 번들 원본 region 포함 및 gameplay suffix 일치 확인 후 정확히 교체. PWA 73. 전체 Node/Chromium/실게임/실기기/CI 미실행, 실제 모션 품질과 화면 간섭은 확인 필요. 공유 gameplay/game/sw는 NPC-11252115의 기존 구현 및 검증 범위를 보존하는 국소 수정; 점유는 유지.

## 계단 보행 루트 높이 통합 (사용자 후속 S 작업)
- 영상의 몸통 상승에 대해 물리 exact tread → renderPos 하한 보정 → bodyY → 별도 footOffset의 중첩을 원인 후보로 확인. 3인칭 캐릭터 루트 높이만 수정: 이동 방향 ±0.24m 내 5지점 낮은 지면의 공간 평균, 높이 차가 큰 장애물/낭떠러지 배제, 엇갈린 발판에서 양발 보정 제한, 최종 높이 단일 속도 제한 보간. 기존 pelvis 추가 footOffset 제거, 실제 발 IK/물리/카메라의 높이 알고리즘은 유지. 순간이동·공중·수영·등반·시점 전환 시 보간 초기화. 5지점·속도 제한·발 보정 상한은 구현 판단.
- PASS V8 격리 실행: 기존 camera-comfort 본문 및 추가 실제 카엘 계단 정의(13개 중 상승 구간 9개, 20/30/60/120FPS × 걷기/달리기 × 상하행 = 144개 프로파일) 회귀, 60FPS 걷기 최대 0.04467m/frame, 달리기 0.110m/frame. 합성 발 위치 기준 루트와 물리 높이 최대 차 약 0.335m; 실제 리그 발 접지/벽 가까이 보행/계단 입출구 및 사용자 영상과 동일한 환경의 시각 재검증 NOT RUN. 실제 물리 player.pos 및 충돌/지형 소스 변경 없음. 구현 0df3102, 회귀 e0ab901. 전체 Node/Chromium/배포 미확인.

## 키보드 전후진·회전 분리 (사용자 후속 S 작업)
- W/S는 캐릭터 전후진, A/D는 제자리 회전, 조합은 고정 물리 tick의 전후진과 회전을 동시에 적용. 키보드 지상에서는 기존 입력 구간 카메라 자동 180° 회전을 끄고 몸통이 이동 속도 대신 조준 yaw를 추종한다. 후진은 걷기 속도 및 역방향 보행 위상. 모바일 스틱 벡터, 비행·수영·등반·미끄러짐의 기존 방향 이동 보존. 회전 속도 2.4rad/s와 후진 달리기 제한은 구현 판단. 공유 gameplay/game.js/sw.js는 NPC 작업의 기존 변경과 점유를 보존하는 국소 순차 수정.
- PASS: 실제 player-physics.mjs 본문 V8 격리 14876 assertions, 신규 키보드 Input/Player/카메라 계약 회귀 포함. 전체 원본 번들 일치 확인 후 재조립, PWA 버전 증가. 실제 Chromium/실기기 조작 감각·후진 모션·CI·배포 NOT RUN.

## 키보드 실월드 입력 회귀 (후속)
- 8793522의 실제 main Actions 45759129736 contracts에서 `player-physics`와 `camera-comfort` 및 Node 실월드 검증 PASS 확인. 전체 contracts는 별도 INFRA-001/NPC-11252115의 tools/verify.mjs 중복 점유로 FAIL. 직전 Chromium의 캐릭터 에디터 featureError 실패는 이동과 별개이며 최신 browser 결과는 이 기록 시점 미확인.
- 기존 `world-playability` Chromium 시나리오에 실제 Input의 window keydown/keyup 이벤트를 통과시키는 카엘 지상 회귀 추가: 전진·후진·Shift 후진 제한·제자리 회전·전후진+회전 조합. 열린 평탄부 선택, 고정 물리 tick, 충돌 확인; Node 경로는 그대로 유지. 런타임/조작 계수 변경 없음. 테스트 함수 JS 구문 확인 PASS; 새 Chromium 실행, 카메라/캐릭터 실화면 및 사용자 기기 체감 NOT RUN.

## 캐릭터 조향과 카메라 분리 (사용자 후속 S 작업)
- 직전 변경의 공통 yaw 때문에 작은 회전도 화면을 돌리고 상대 시선/몸통 회전을 축소했다. 3인칭 키보드 facingYaw를 카메라 yaw와 분리. A/D는 몸 방향, W/S는 몸 기준 전후진. 55° 이상 조향 차에서만 완만하게 추적, 30° 차에서 정지(지수 2.4/s, 최대 2.6rad/s; 구현 판단), 수동 드래그 우선. 1인칭, 모바일 벡터, 카메라 충돌·등반·수영, 학교 V3 보행/달리기 계수·발 IK 유지. turnStep/gazeYaw 연결 복원, 후진 위상은 몸 기준, 순수 회전 위상은 원래대로. 공유 gameplay/game/sw 국소 순차 통합.
- PASS 실제 player-physics.mjs V8 격리 15285 assertions, 소각도 고정/대각도 완만 추적/정지/연속 회전/수동 orbit/후진/카메라 독립 이동 및 기존 물리. 실월드 Chromium 테스트 독립 heading 계약으로 갱신, 구문 확인. 기존 번들 blob SHA 일치 검증. 실제 렌더링·모션/조작감, Chromium 및 배포 NOT RUN.

## 0bfd06c 실제 main CI 검증 (세션 복구)
- Actions 45759739558: `player-physics`, `camera-comfort`, schoolyard motion joints/registered clips/world-translation ownership, Node/Chromium 카엘 실월드 PASS. Chromium 실제 window 키 입력: W/S ±0.589626m, A/D 제자리 ±1.2rad, W/S+A/D 조합 각 ±0.72rad 및 곡선 이동, 모든 물리 조향 케이스 cameraYaw=0. 카메라 자동 보정은 별도 player-physics 회귀 PASS; 실화면에서의 자동 보정·모션 감각은 NOT RUN. PWA 오프라인 회귀 PASS.
- 전체 CI FAIL: `tools/check-infra.mjs`의 INFRA-001/NPC-11252115 `tools/verify.mjs` 점유 중복, `character-runtime-browser.mjs`의 reference-round 얼굴 featureError=0.0007923543453216553 (선행 실패와 동일 종류). 기존 의상/지도 터치 PARTIAL 유지. 검증 기반 package/deploy는 SKIPPED; 별도 Pages build/deployment 45759738399 SUCCESS (공개 URL SHA 미확인). 이동 소스는 재수정하지 않음. 사용자 실기기 체감/시각 품질 확인 전 전체 작업 종결하지 않음.
