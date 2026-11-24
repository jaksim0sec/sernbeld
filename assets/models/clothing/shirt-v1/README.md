# Shirt v1 / 승인된 긴소매 셔츠

이 디렉터리는 SERNBELD_shirt_final.html 승인본의 재현 가능한 원본 에셋이다. 의상 ID 예정값은 `top.basic-shirt`이며, 현재 상태는 **runtime**이다. 원본은 별도로 보존하며 기존 clothing registry의 `top` 슬롯에 게임용 build 함수를 등록했다.

## 보존 범위

- 남녀 개별 메시, 기존 삼각형 순서, 소매·팔꿈치·어깨 곡면 보정, 카라, 소맷부리, 중앙 여밈선, 단추 5개, 천 재질 및 주름 셰이더.
- 좌표는 승인된 뷰어와 동일한 Float32, 인덱스는 손실 없이 Uint16으로 변환했다. 중복·미사용 정점이 없어 정점 삭제나 단순화는 적용하지 않았다.
- rig와 reference-body의 .part 파일은 전송 크기 때문에 분할된 원본 텍스트이다. manifest 순서로 연결하며 게임 로딩 대상이 아니다. 참조 신체는 리그 검증용이며 현재 게임의 신체 에셋을 교체하지 않는다.
- manifest의 SHA-256으로 좌표·인덱스·참조 리그·참조 신체의 무손실 복원을 검사한다.

```sh
node tools/export-shirt-reference.mjs
node tests/shirt-reference.mjs
```

첫 명령은 독립적인 포즈 뷰어 HTML을 다시 생성한다. 두 번째 명령은 남녀 각 7개 포즈와 단추 계산을 검사한다. 승인본과 무손실 재패킹본의 해당 14개 포즈에서 좌표·노멀·단추 좌표 배열의 완전 일치를 로컬 Node에서 확인했다. 실제 게임의 WebGL 및 스켈레톤 통합은 아직 검증되지 않았다.

## 실제 장착 이식 시 필수 조건

- 기존 `src/entities/character/clothing/registry.js`의 top 슬롯, equip/unequip, first-person visibility, dispose 계약을 지킨다.
- 현재 game character skeleton과 참조 뷰어의 shoulder/elbow 기준 자세 및 좌표 변환을 확인한다. 단순 skinWeight 전이나 정적 SkinnedMesh로 곡면 재구성 알고리즘을 대체하지 않는다.
- 기존 collar 슬롯과 셔츠 내 카라 접합을 이중 생성하지 않도록 소유권을 정한다. 승인된 외형을 보존하고, 캐릭터 메시를 교체하지 않는다.
- 몸통 원본, 무기 애니메이션, 카메라, NPC 기존 동작을 변경하지 않는다. 실제 게임의 기본 자세, 팔꿈치 90/120도, 어깨 측면·전면 회전, 복합 포즈, 장착/해제, 양 성별, 모바일 성능을 비교 검증한 다음 등록한다.

## 렌더링용 경량 메시

원본 Float32 좌표, 인덱스, 신체 및 리그 파일은 수정하지 않았다. 남녀 각각 `render-patches.json`을 등록했다. 움직임이 없는 몸통 내부 정점만 국소 재삼각화하며 리그, 노멀 계산, 단추 위치 계산은 원본 메시를 사용한다. 카라 안쪽/바깥쪽은 접합 노멀을 계산한 뒤 실제 참조하는 정점만 GPU에 전달한다(무손실). 기존 Uint16 렌더 인덱스를 유지한다. 원본 시뮬레이션 정점 수나 CPU 리그 비용이 감소한 것은 아니다.

- 남성: 20384 → 20225 정점, 40432 → 40114 삼각형.
- 여성: 32301 → 32143 정점, 64110 → 63794 삼각형.
- 국소 접평면 높이 차이 최대 0.443mm. 경계, 퇴화면 및 비다양체 검사를 통과했다. 실제 포즈/화면 테스트는 별도 검증 필요.
- `node tools/check-shirt-render-lod.mjs`로 패치 재생성 일치 여부 검증.
- `getClothingAsset('top.basic-shirt')`로 상의 데이터 조회 가능. 게임용 빌더는 `src/entities/character/clothing/shirt.js`에 있다.

## 게임 기본 장착

남녀 각각의 `runtime.json`/`runtime.*.part`는 원본 정점과 카라/단추, 주름, 원본 솔버의 어깨 옆/앞/뒤 및 팔꿈치 자세 보정값을 포함한다. GPU dual-quaternion 스키닝과 자세 보정 보간을 사용하므로 실시간 CPU 충돌 재계산은 하지 않는다. 복합 자세와 실제 게임 스켈레톤에서의 완전한 외형 일치는 아직 검증되지 않았다. 모든 캐릭터가 성별별 지오메트리를 공유하며 인체 원본은 수정하지 않는다. `node tools/bake-shirt-runtime.mjs`로 재생성한다. 첫인칭 소매 표시, 카라 슬롯 중복 방지 및 오프라인 리소스 캐싱을 적용했다.
