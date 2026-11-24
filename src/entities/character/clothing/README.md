# 의상 런타임 등록 (Clothing)

인체 원본, 외형 설정, 애니메이션은 그대로 유지한다. 의상은 실제 게임의 최종 스켈레톤과 IK를 따라가는 독립 장착물이다.

## 새 의상 등록

슬롯: `collar`, `top`, `vest`, `pants`, `shoes`, `hat`.

- `registry.js`: `registerClothing({id, slot, name, build, defaultWhen?})`. 동일 슬롯만 교체한다. `build(T, actor, fullIndex)`는 `{object, dispose, bodyCoverage?, firstPersonCoverage?, setFirstPerson?}`를 반환한다. `bodyCoverage`는 인체 정점별 Uint8 마스크(0/255)이며 각 의상은 자기 마스크만 반환한다. 컨트롤러가 활성 의상의 합집합을 계산한다. 다른 의상의 마스크나 공유 인체 정점을 수정하지 않는다.
- `garment-binding.js`: 발 기준 1.76m reference pose의 position/normal/index를 실제 게임 인체 삼각형에 매핑한다. 정책의 `regions`, `guide(i,asset)`, `constrain(i,asset,weights,bones)`, `fit`, `smoothing`, `parts`, `attributes`로 부위 제약을 지정한다. constrain은 가중치 배열을 수정하고 rigid anchor이면 true를 반환한다. 손가락·반대쪽 팔다리 같은 무관한 본은 의상 설계 시 제외한다. 연결 정점 및 일치하는 seam 정점의 가중치와 간격 보정을 함께 평활화하고, 실제 edge 길이에 비례하여 가중치 변화량을 제한(`gradientLimit`, L1/m)한 뒤 4개 또는 8개 본으로 정규화한다(기본 4, 복합 관절 연결부는 maxInfluences:8 선택). 커프 같은 rigid anchor는 보존한다. 임의의 공간상 이웃을 연결하지 않는다.
- `garment-pose.js`: `createGarmentPart(T,actor,lease,partId,materialFactory)`가 실제 스켈레톤의 최종 bone world matrix에서 reference-space dual quaternion을 계산한다. materialFactory는 (공통 pose uniforms, GLSL skinning 함수)를 전달받아 vertex shader에서 `garmentPose(positionOut, normalOut)`를 호출한다. 본 계층 전체에서 quaternion 부호를 일관되게 선택하여 인접 정점의 변형이 뒤집히지 않게 한다. rigid 영역은 회전·이동만 하며 선형 스키닝의 역행렬 불안정성/비틀림 수축을 피한다. CPU에서 같은 변형을 검사할 수 있다.
- 바인딩은 에셋/정책/체형/참조 프레임별로 캐싱한다. 동일 체형 NPC는 정점 버퍼와 파트 인덱스를 공유하며, 장착 해제는 참조 카운트로 관리한다. 실시간 CPU 정점 변형·천 시뮬레이션은 하지 않는다.

## 기본 셔츠 및 카라

`shirt-binding.js`는 위 공통 바인더를 호출하는 셔츠 정책이다. 기존 에셋의 어깨/팔꿈치 가중치로 소매 체인을 지정하고, 커프는 전완 본에 고정한다. 몸통과 카라·단추는 몸통 체인에 연결한다. 원본 형상과 텍스처 좌표, 재질, 카라, 단추를 유지한다.

`top.basic-shirt`와 `collar.basic`는 기본 장착되는 별도 슬롯이다. 동일 승인 에셋의 정점과 스키닝을 공유하고 인덱스를 서로 겹치지 않게 분리하여 카라가 두 번 그려지지 않는다. 어느 하나만 교체·해제할 수 있다. 셔츠 데이터가 없는 독립 캐릭터에서는 기존 procedural collar builder를 사용한다. 첫인칭은 소매를 표시하고 카라는 숨긴다.

검증: `node tests/shirt-runtime.mjs`는 실제 게임 모델에 대해 attention pose, rigid cuff edge lengths, shoulder edge strain, 최종 손 IK, actor world transform, 슬롯 및 coverage 합집합, 공유 버퍼 수명을 검사한다. 다른 의상도 같은 기준으로 검사할 것. 렌더러 시각 결과 및 모든 포즈에서의 피부 간섭 완전 해소는 별도 검증 대상이다.

일반 포즈·실제 손 IK와 극단 스트레스 포즈는 구분한다. 극단 포즈의 상대 변형 목표(p95 < 2.5, p99 < 3.5)는 여성 리그에서 아직 미충족이며 테스트에서 `STRESS TARGET NOT MET`으로 표시한다. 최대 절대 연장 4.5cm 한도 및 일반 포즈/IK 회귀 기준은 실패 시 테스트를 중단한다. 현재 방식은 실시간 천 충돌/길이 보존 솔버가 아니므로 모든 자세에서 무신축을 보장하지 않는다.

## 기본 바지

`pants.basic-trousers`는 `pants` 슬롯의 기본 장착 의상이다. 첨부 최적화 원본 남녀 각 5,471정점 / 10,752삼각형을 손실 없이 gzip으로 보존한다. `pants-source.js`는 원본 인덱스와 좌표를 읽고 원본 재질의 주름 속성을 생성한다. `pants.js`의 하체 정책은 실제 무릎 기준점, 골반과 허리, 좌우 다리 체인 및 강체 밑단을 기존 공통 바인더에 전달한다. 사선 주머니·봉제선·직물 결을 원본 재질에서 이식한다. 별도의 스키닝 엔진은 추가하지 않는다. 셔츠/카라와 독립적으로 교체·해제하며 첫인칭에서는 숨긴다. `node tests/pants-runtime.mjs`로 원본, 장착, 관절 변형 및 가림 마스크를 검사한다.

## 초기 로딩

기본 상의와 바지는 `tools/bake-garments.mjs`에서 성별별 기준 바인딩을 사전 계산하여 `runtime-bindings-v1.json.gz`로 저장한다. 빌드 CI가 생성·검증한다. 브라우저에서는 실제 인체 스켈레톤과 정점 순서를 검증한 뒤 버퍼를 복원한다. 얼굴 변형으로 인한 전체 키 차이는 기준 프레임의 역변환으로 처리하며 재바인딩하지 않는다. 새 몸통 의상은 `bakeId`로 이 경로에 참여할 수 있으며, 얼굴 자체를 감싸는 의상은 동일 토폴로지/형상 검증 없이 이 정책을 사용하지 않는다. 사이드카가 없거나 호환되지 않으면 체형당 한 번 계산하는 공통 캐시로 폴백한다. NPC 데이터는 즉시 등록되고 모델은 가까운 가시 주민부터 한 번에 하나씩 준비한다. 캐릭터 편집기는 의상 에셋을 다시 다운로드하지 않는다.
