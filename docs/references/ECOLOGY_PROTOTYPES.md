# 생태 에셋 시제품 배치 v1

기존 생태 기획에 등장한 10종의 이름을 기반으로 서로 다른 지면·습지·잎·꽃·갓 형태를 가진 실제 GLB 시제품을 생성했다. 원본 CSV 및 디자인 시트의 세부 기획과 비교하지 못했으므로 시제품이며 아트 승인 및 게임 통합이 아니다. 충돌은 모두 작은 장식성 생태 모델이라는 가정으로 decorative로 기록했다. 실제 배치 시 필요에 따라 수정한다.

[공용 에셋 스튜디오](../../tools/dev/assets.html)에서 같은 카메라와 조명으로 열 수 있다.

- [갯나팔꽃 (1638 triangles)](../../tools/dev/assets.html?model=beach-morning-glory) · 해안 모래땅
- [자주방울초 (3360 triangles)](../../tools/dev/assets.html?model=purple-bell) · 길가와 초지
- [길뚝쑥 (1521 triangles)](../../tools/dev/assets.html?model=roadside-mugwort) · 길뚝
- [둥근토끼풀 (2444 triangles)](../../tools/dev/assets.html?model=round-clover) · 풀밭
- [물깃갈대 (2957 triangles)](../../tools/dev/assets.html?model=water-reed) · 습지
- [샘부들 (1918 triangles)](../../tools/dev/assets.html?model=spring-cattail) · 샘과 물가
- [녹실이끼 (1628 triangles)](../../tools/dev/assets.html?model=green-thread-moss) · 그늘진 돌
- [그늘고사리 (3780 triangles)](../../tools/dev/assets.html?model=shade-fern) · 그늘
- [물결갓버섯 (1778 triangles)](../../tools/dev/assets.html?model=wave-cap-mushroom) · 축축한 그늘
- [돌톱풀 (360 triangles)](../../tools/dev/assets.html?model=stone-sawgrass) · 돌 틈

`node tools/build-ecology-prototypes.mjs`는 10개를 같은 원본에서 재생성한다. `--check`는 저장된 GLB와 정확히 비교한다. GLB 구조, 유한 좌표, 지면 기준과 삼각형 수는 검사하며 실제 렌더 품질·생태 배치·LOD·성능·게임 등록은 별도 단계다. [카탈로그](../catalog/ecology-prototypes.json)의 상태를 실제 검증 범위에 맞춰 갱신한다.
