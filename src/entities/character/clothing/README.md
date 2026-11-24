# 의상 등록 (Clothing)

인체 메시, 캐릭터 커스터마이징 및 기본 NPC 모델과 독립적인 장착 슬롯이다. 현재 자동 장착되는 의상은 없다.

슬롯: `collar` 카라, `top` 상의, `vest` 조끼, `pants` 바지, `shoes` 신발, `hat` 모자. 조끼와 상의는 서로 다른 슬롯이다.

`registry.js`의 `registerClothing({id, slot, name, build})`에 의상 정의를 추가한다. `build(THREE, actor, fullIndex)`는 기존 인체를 읽기만 하고, 모델 로컬 좌표로 된 독립 Object3D와 리소스 정리 함수 `{object, dispose}`를 반환한다. fullIndex는 캐릭터의 원본 LOD0 인덱스다.

등록된 카라 ID: `collar.basic`. 이전 승인된 제스처 뷰어의 V 절개 링, 전면 드레이프, 후면 공유 접합부를 그대로 사용한다. 남녀 모델별로 실제 단면을 맞추며 기존 스켈레톤에 피부 가중치를 전이한다.

```js
actor.clothing.equip('collar.basic');
actor.clothing.getEquipped('collar');
actor.clothing.unequip('collar');
actor.clothing.snapshot();
```

동일 슬롯 장착 시 기존 의상만 교체된다. 기본 캐릭터에 자동 장착하거나 모델을 교체하지 않는다. 현재 저장·인벤토리·UI 연결 및 애니메이션 시각 검증은 별도 범위다. 첫인칭에는 의상 메시를 숨기며, actor.dispose() 시 같이 정리된다.

데이터 등록 전용 항목: `top.basic-shirt` (`top`, reference-only). `getClothingAsset(id)` / `listClothingAssets(slot)`에서 조회한다. 장착 가능한 `getClothing` / `listClothing`은 변경하지 않으며, 기본 인체 또는 자동 장착 동작에는 영향을 주지 않는다.
