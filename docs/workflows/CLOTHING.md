# 의상 제작부터 장착까지

1. [기준 리그](../contracts/CHARACTER_RIG.md), [등록 계약](../../src/entities/character/clothing/README.md), [승인 선례](../references/INDEX.md)를 확인한다. 신규 장착 요구가 6개 기존 슬롯과 공용 바인더에서 가능한지 먼저 확인한다.
2. 저장소 루트에서 `python3 -m http.server 8000`을 실행하고 `/tools/dev/`를 연다. 남녀 원본과 같은 카메라에서 의상을 비교한다. 승인 원본과 런타임 결과는 각각 보존한다. 기존 셔츠 승인 뷰어 복원은 [셔츠 원본](../../assets/models/clothing/shirt-v1/README.md)을 따른다.
3. ID, 체형, 원본 및 변환법, 슬롯과 가림 정책을 기록한다. 정적 GLB 메시를 쓴다면 `node tools/extract-garment.mjs <원본.glb> <형상.mjs>`로 위치·법선·인덱스와 UV를 추출한다. 원본 GLB에 재질, 텍스처와 외형 승인을 보존하고 가림·본 제약·게임 재질은 등록 모듈에서 지정한다. 추출은 이미지나 외부 리소스가 없는 삼각형 GLB를 지원한다. 에셋 로더와 `build`를 만들고, 선택적 테스트 모듈에서 공용 레지스트리에 등록한다. 스튜디오의 `module` 파라미터로 저장소 내부 `src/entities/character/clothing/` 또는 `tools/dev/`의 JS 모듈을 불러올 수 있다. 예시는 [테스트 에셋](../../tools/dev/sample-garments.js)이다. 실제 등록은 기존 `registry.js`의 제작물 로딩 및 장착 경로에 연결한다.
4. 두 체형에서 차렷·팔꿈치 굽힘·비틀기·실제 손 IK·보행을 비교한다. 가까운 LOD, 원거리 LOD, 1인칭, 단독 장착과 레이어 조합에서 경계·피부 가림·커프/밑단·원본 재질을 점검한다. 일반 자세와 극단 스트레스는 다른 결과로 기록한다.
5. `node tools/check-garment.mjs <ID...>`로 등록한 의상을 체형·포즈·LOD·장착 수명에 따른 구조와 실행을 검사한다. 이 검사는 외형과 피부 간격의 품질을 별도로 판정하지 않는다. 시험 등록 모듈은 `--module tools/dev/sample-garments.js`처럼 전달한다. 제품 검증은 `node tools/verify.mjs clothing` 및 `node tools/verify.mjs browser`를 사용한다. 팔꿈치부터 손목까지 실제 피부와 의상 단면을 비교하고 GPU 출력과 눈으로 확인할 외형을 각각 기록한다. 커프 추적 오차만으로 피부에 맞는다고 판정하지 않는다.
6. 실제 게임에서 플레이어와 NPC를 확인한다. 바인딩 정책·기준 형상이 바뀌면 `node tools/bake-garments.mjs`로 재생성할 범위를 확인한다. 새 의상은 양쪽 체형에서 기본 바인더를 사용하고 레지스트리와 바인딩 정책에 같은 `bakeId`를 지정하면 베이커에서 자동 발견된다. 에셋 데이터는 Node와 브라우저 양쪽에서 준비할 수 있어야 한다. 층이 맞닿는 새 조합에는 가림 관계를 따로 지정한다. 새 런타임 파일이 오프라인 필수면 [PWA 계약](../PWA.md)을 갱신한다.

## 변형 검증 추가

`node tools/check-garment.mjs --module tools/dev/sample-garments.js top.preview-long-sleeves top.preview-short-sleeves`는 승인 셔츠의 소매 원본에서 서로 다른 길이를 분리한 시험 형상을 공통 바인더로 새로 계산한다. 모든 참조 정점의 좌표와 에지 변형 통계를 출력하고 최소 본 수를 확인한다. 임의 의상은 등록 정의의 `validation.minBones`, `maxP95`, `maxExtension`으로 의도한 가동 범위와 측정 한계를 명시할 수 있다. 이 두 시편은 독립적인 신상품/외형 승인이나 피부 단면 통과 증거가 아니다. 신규 전체 의상의 조형·레이어·피부 간격은 별도 실전 작업으로 입증한다.
