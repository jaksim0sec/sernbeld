# 의상 등록 (Clothing)

인체 메시, 캐릭터 커스터마이징 및 기본 NPC 모델과 독립적인 장착 슬롯이다. 실제 게임에서 생성하는 모든 남녀 캐릭터는 기본 긴소매 셔츠를 자동 장착한다. 인체 메시와 기존 외형 설정은 변경하지 않는다.

슬롯: `collar` 카라, `top` 상의, `vest` 조끼, `pants` 바지, `shoes` 신발, `hat` 모자. 조끼와 상의는 서로 다른 슬롯이다.

`registry.js`의 `registerClothing({id, slot, name, build})`에 의상 정의를 추가한다. `build(THREE, actor, fullIndex)`는 기존 인체를 읽기만 하고, 모델 로컬 좌표로 된 독립 Object3D와 리소스 정리 함수 `{object, dispose}`를 반환한다. fullIndex는 캐릭터의 원본 LOD0 인덱스다.

등록된 카라 ID: `collar.basic`. 이전 승인된 제스처 뷰어의 V 절개 링, 전면 드레이프, 후면 공유 접합부를 그대로 사용한다. 남녀 모델별로 실제 단면을 맞추며 기존 스켈레톤에 피부 가중치를 전이한다.

```js
actor.clothing.equip('collar.basic');
actor.clothing.getEquipped('collar');
actor.clothing.unequip('collar');
actor.clothing.snapshot();
```

동일 슬롯 장착 시 기존 의상만 교체된다. 셔츠만 기본 장착하며 인체 모델은 교체하지 않는다. 현재 저장·인벤토리·UI 연결 및 애니메이션 시각 검증은 별도 범위다. 첫인칭에는 의상 메시를 숨기며, actor.dispose() 시 같이 정리된다.

등록된 상의 ID: `top.basic-shirt`. `getClothingAsset(id)` / `listClothingAssets(slot)`에서도 원본 에셋을 조회한다. 상의에는 카라와 단추가 포함된다. 독립 카라 장착 시 통합 카라를 숨기고 해제 시 복원한다. 첫인칭에서는 소매만 표시한다.
