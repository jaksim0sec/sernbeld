# 기준 캐릭터와 리그 계약

실제 게임 기준은 [Character Studio 런타임](../CHARACTERS.md#active-character-runtime)이다. [원본 남녀 데이터](../../assets/models/characters/studio-v1.json.gz), [로더](../../src/entities/character/studio-source.js), [형상 생성](../../src/entities/character/studio-geometry.js), [캐릭터 생성](../../src/entities/character/studio-model.js)을 공용으로 쓴다. 구형 독립 여성 에셋은 독립 검증과 이력 참조용이다.

- 인체 버전은 `studio-v1`이다. 47개 본의 이름·순서·계층, 기준 프레임, 인체 정점과 토폴로지는 이 원본과 로더에서 읽는다. 거리 LOD에는 [생성된 인덱스](../../assets/models/characters/studio-v1.lod.json.gz)를 사용한다.
- 의상의 발 기준 제작 높이는 1.76m이며 마지막으로 적용된 IK와 본 행렬을 따른다. 축과 참조 프레임은 [공통 바인더](../../src/entities/character/clothing/garment-binding.js)와 양쪽 체형에서 확인한다. 관절 이름만 일치해도 바인딩이 호환된다고 판단하지 않는다.
- 의상 모델링은 캐릭터 데이터를 읽기 전용으로 쓴다. 바인딩 정책은 의상에 둔다. 본·정점·LOD 생성 방식 변경 시 피부, 목/손 접합, 기존 의상과 저장된 외형 프로필을 함께 검증한다.
- 원본, 제품의 표시 형상, GPU가 그린 자세를 각각 재현할 수 있어야 한다. [의상 작업 흐름](../workflows/CLOTHING.md)에 비교 항목과 실행 경로가 있다.
