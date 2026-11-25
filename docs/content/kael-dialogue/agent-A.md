# 세른벨드 NPC 대화 생산 브리핑
기준 main SHA: 3321c23a14b002cac21af8f8a72996bb32e61755 / NPC-11252342. 이 문서는 단독으로 읽고 작업할 수 있다. 저장소 접근이나 다른 세션 기억은 필요 없다.

## 게임과 이번 목표
세른벨드는 밝고 회화적인 애니풍 판타지 자연·도시를 탐험하는 모바일 웹 오픈월드 RPG다. 무명인부터 자기 삶을 개척하며 정해진 직업·주인공·운명·강제 메인 퀘스트가 없다. 카엘 항구는 노동·생활·교역이 실제로 이루어지는 장소다. NPC는 플레이어에게 의뢰만 주는 기계가 아니라 자기 일과와 관점을 가진 주민이다. 이번에는 이미 구현된 선택지 기반 대화 엔진에 넣을 한국어 대화 데이터만 만든다. 게임 코드 수정, 직접 등록, 자유입력 AI, 새 세계관 확정, 새로운 경제·효과·아이템·서비스는 범위 밖이다.

## 확인한 실제 세계 자료
- 지역 ID sernbeld = 카엘 항구. 장소: harbor_office 항만 사무소, quay 부두 주변, pier_a/pier_b 부두, stall_a/b/c 가판대, guild_desk 조합 접수대, guild_board 의뢰판, smithy 대장간, inn 여관, inn_yard 여관 마당, plaza 광장, fountain_bench 분수 벤치, north_gate 북문, west_gate 서문, home 각 주민 집. 일정은 아래 자료에 나타나는 시간대만 참고하고 지금 실제 그 장소에 있다고 단정하지 않는다.
- 고유 NPC 6명:
  - bran / 브란 / 항만 관리인: 짧고 건조한 연장자 반말. 항만 사무소 06~12/14~19, 정오 부두 주변, 저녁 여관. 기존 인사는 입항세·일거리 안내. 입항세 징수 기능을 약속하지 않는다.
  - sera / 세라 / 조합 접수원: 실무적이고 명확한 존댓말. 조합 데스크 07~12/13~19, 정오 stall_b, 저녁 여관. 견습 등록/의뢰판/보고 서비스가 있다.
  - goram / 고람 / 대장장이: 툭툭 끊는 무뚝뚝한 반말, 장인다운 관찰. 대장간 06~12/13~20, 점심 여관 마당. 기존 상점 서비스만 실제 구현.
  - miel / 미엘 / 여관 주인: 친절하고 현실적인 존댓말. 09시 stall_a, 11시 여관 마당, 나머지 여관. 숙박은 은화 3, 외상 없음.
  - tino / 티노 / 견습 모험가: 또래 느낌의 반말, 경쟁심은 있지만 강요하지 않음. 06시 의뢰판, 08시 북문 배회, 17시 분수 벤치, 19시 여관. 실적 숫자는 기존 서비스만 권위.
  - iva / 이바 / 경비대장: 단호하고 간결한 반말. 06시 서문, 10시 광장, 14시 부두, 18시 북문. 경비 업무 안내만, 통행증 지급/신고 처리 등 미구현 기능 약속 금지.
- 일반 NPC 44명: vendor0~2(오렌, 하나, 피트), docker0~11(루사, 델, 마르코, 비비, 라온, 미라, 다온, 에단, 리나, 유안, 세린, 로엔), folk0~18(사샤, 토마, 에린, 노아, 카이, 렌, 유리, 하린, 아린, 엘로, 마린, 루엔, 나리, 소라, 이안, 카린, 레온, 리아, 아벨), kid0~2(도린, 페이, 실라), guard0~6(보르, 오렌, 하엘, 테오, 시온, 노엘, 엘린). 이름보다 ID가 권위이며 개인 배경을 창작하지 않는다. 일반 개인 화제의 role은 vendor/docker/folk/kid/guard. 상인은 07~18 가판대, 18~21 여관 마당 배회; 부두 일꾼 06~12 pier_b, 12~13 quay, 13~19 pier_a, 19~22 inn; 주민 광장→가판대→분수→부두; 아이 분수→부두→광장; 경비병 북문→광장→서문. 모든 NPC는 일정이 바뀔 수 있다.
- 등록된 실제 납품: vendor0 roadside_mugwort 길뚝쑥 2개 품질40+ 보상 은화6; vendor1 round_clover 둥근토끼풀 3개 품질30+ 은화5; vendor2 seashell 조개껍데기 2개 품질50+ 은화6. 각 상인 1회 의뢰이며 현재 활성/완료 여부는 상태에 달려 있다. 일반 vendor 화제는 어느 상인도 특정 납품을 주고 있다고 단정하지 말고 품질 등 일반 정보만 사용한다.
- 실제 서비스: guild.register / guild.report / guild.board, shop.buy / shop.sell, inn.sleep, living.request.accept/abandon/submit 계열은 런타임 권위. 이 배치는 서비스 효과를 연결하지 않고 기존 선택지가 알아서 표시된다. 가격·재고·의뢰 상태·친화도·사건·실적을 상상하지 않는다. 이름 없는 출신/고대 문명·새 지명·세력·괴물·설정·기획 중 생태는 정설로 사용하지 않는다.
- 현재 production eventTypes 및 societyHandlers는 등록 없음. fixture 사건은 테스트용이다. 이벤트 및 ambientPath 사건 그래프는 이번에 0개, 추후 실제 사건 등록 후 별도 배치. 일반 그룹은 기존 legacy 규격 사용. 현재 profile 태그 vendor는 3명, docker는 docker0~3의 4명에만 존재한다. 일반 주민/경비/아이 그룹을 지금 만들지 않는다.

## 작성 규격 (정확한 런타임 필드)
그래프: id/version/source/topicId/priority/eligibility/slots/entryNode/nodes 및 선택적 label/cooldown/memoryPolicy만 사용. 이번 명세에서 배정한 id/source/topicId/priority/eligibility/label 그대로 복사. 슬롯 npc/player 2개 고정. 각 화제에 자연스러운 첫 발화, 서로 다른 의미의 사용자 선택 2개 이상, 각각 별도 응답, 언제든 화제 복귀/끝내기. 1페이지 1~2문장 권장, 최대 500자, pages 1~16개. 노드 최대128개, choice 최대16개, ID는 소문자 영숫자/밑줄 및 .:/- 구분자, graph 내 node/choice ID 각각 고유. 모든 노드 도달 가능·무조건 종료 경로 필수, 자동 순환 금지. 조건은 배열이며 이번 배치 빈 배열만 사용(동적 상태를 추측하지 않기 위함). 실제 선택지는 마지막 페이지에만 나타난다. 모든 choice에는 조건 없는 종료 경로 포함. end.mode는 topicHub(다른 이야기), close(대화 종료). 플레이어가 하는 말은 choice.label에만 기록하고 speak는 NPC만 발화한다. 효과, eventBinding, ambientPath, fact placeholder, 조건식, 새 필드를 이 배치에서 사용하지 않는다. 허용되지 않은 참조나 상태·보상·전투 결과를 만들지 않는다. 그래프의 topicId 공유는 의도적: 같은 4개 주제에서 고유→직업→지역 범용 우선 선택; 배정된 ID를 바꾸면 안 된다. label은 UI의 화제 제목.

아래는 문법 설명용 예시(실제 반환에 포함하지 말 것):
```json
{
  "id": "kael.example.only",
  "version": 1,
  "source": "named",
  "topicId": "kael.topic.work",
  "label": "하는 일",
  "priority": 10,
  "eligibility": {
    "regionIds": [
      "sernbeld"
    ],
    "npcIds": [
      "bran"
    ],
    "conditions": []
  },
  "slots": [
    {
      "id": "npc",
      "kind": "npc"
    },
    {
      "id": "player",
      "kind": "player"
    }
  ],
  "entryNode": "intro",
  "nodes": [
    {
      "id": "intro",
      "type": "speak",
      "speakerSlot": "npc",
      "pages": [
        "[첫 발화]"
      ],
      "next": "ask"
    },
    {
      "id": "ask",
      "type": "choice",
      "choices": [
        {
          "id": "ask_detail",
          "label": "[질문]",
          "conditions": [],
          "nextNode": "detail"
        },
        {
          "id": "give_view",
          "label": "[의견]",
          "conditions": [],
          "nextNode": "view"
        },
        {
          "id": "back",
          "label": "다른 이야기",
          "conditions": [],
          "nextNode": "hub"
        }
      ]
    },
    {
      "id": "detail",
      "type": "speak",
      "speakerSlot": "npc",
      "pages": [
        "[질문에 맞는 대답]"
      ],
      "next": "hub"
    },
    {
      "id": "view",
      "type": "speak",
      "speakerSlot": "npc",
      "pages": [
        "[의견에 맞는 다른 대답]"
      ],
      "next": "hub"
    },
    {
      "id": "hub",
      "type": "end",
      "mode": "topicHub"
    }
  ]
}
```
범용 그래프는 위와 동일하되 source=personal, eligibility는 명세의 roles 또는 regionIds만. 본문의 [대괄호]는 예시 안내이며 실제 반환에 남기지 않는다.

일반 그룹(legacy) 규격: id/topic/regionIds/slots/turns/participationIds. 슬롯은 NPC만 2~4명, 정확히 명세 size. {id:"speaker0",tags:["vendor"]} 또는 docker. turns는 {slotId,text,duration} 배열, 모든 화자 적어도 한 번, 3~6턴 자연스러운 주고받기, duration 초 단위 0.5~30(3~5 추천). 실제 화자 이름을 정해 부르지 않는다. 참여 답변은 등록할 텍스트 전용 action {id,kind:"reply",label,reply}로 각각 질문·의견에 대응한다. 행동 효과 없음. 같은 topic의 인원별 변형은 같은 participationIds를 공유하므로 질문·답변은 모든 변형에 맞아야 한다. 예시(문법용, 반환 제외):
```json
{
  "id": "kael.example.group",
  "topic": "kael.example.topic",
  "regionIds": [
    "sernbeld"
  ],
  "slots": [
    {
      "id": "speaker0",
      "tags": [
        "docker"
      ]
    },
    {
      "id": "speaker1",
      "tags": [
        "docker"
      ]
    }
  ],
  "turns": [
    {
      "slotId": "speaker0",
      "text": "[화제 제시]",
      "duration": 4
    },
    {
      "slotId": "speaker1",
      "text": "[이에 대한 응답]",
      "duration": 4
    }
  ],
  "participationIds": [
    "kael.example.reply"
  ]
}
```
참여 action 예시: {"id":"kael.example.reply","kind":"reply","label":"[플레이어 질문]","reply":"[NPC 답변]"}. 그룹 대화에는 source/topicId/version/nodes를 붙이지 않는다. 사건 그래프는 기존 엔진에서 eventBinding.typeId 및 화자 소유 factRefs와 ambientPath가 필요한데 현재 실제 등록 사건이 없으므로 생성 금지.

## 자연성·반환
정보 전달만 하지 말고 관점·일상·짧은 감정·대화 여운을 넣는다. 질문/의견을 같은 대답으로 돌리지 않는다. 사용자 동의 없이 의뢰 수락, 거래, 친화도 변경, 장소 이동을 확정하지 않는다. 플레이어를 반드시 모험가/조합원이라 부르지 않는다. 직접적인 현실 세계 언어(앱/게임/레벨/UI)는 대사에 넣지 않는다. 기존 첫인사를 복제하지 않는다. 같은 표현과 주제의 중복을 줄이며 분기마다 독립적으로 읽어 검수한다. 생산물은 UTF-8 JSON 단일 파일, 최상위 {"batchId":"A 또는 B","baseline":"3321c23a14b002cac21af8f8a72996bb32e61755","conversationTemplates":[...],"participationActions":[...]}로 제출. 배정 외 항목이나 설명, 테스트 예시를 배열에 섞지 않는다. 이 최상위 포맷은 전달용이며 실제 런타임 등록은 중앙 세션이 수행한다.

## 배치 A 작업 명세
목표: 그래프 28개, 일반 그룹 0개, 텍스트 전용 참여 답변 0개. 키워드는 대사 원문이 아니라 해당 대화가 다뤄야 할 내용이다. 아래 metadata에서 keyword/voice/branches/tag/size/direction은 작성 지시이며 런타임 객체에 복사하지 않는다. 이 배치에 없는 ID를 생성하지 않는다.

```json
{
  "graphs": [
    {
      "id": "kael.named.bran.work",
      "source": "named",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "bran"
        ],
        "conditions": []
      },
      "keyword": "입항 관리·부두 통로",
      "voice": "브란(항만 관리인): 짧고 건조한 연장자 반말. 항만 사무소 06~12/14~19, 정오 부두 주변, 저녁 여관. 기존 인사는 입항세·일거리 안내. 입항세 징수 기능을 약속하지 않는다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.bran.place",
      "source": "named",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "bran"
        ],
        "conditions": []
      },
      "keyword": "항만 사무소와 부두의 차이",
      "voice": "브란(항만 관리인): 짧고 건조한 연장자 반말. 항만 사무소 06~12/14~19, 정오 부두 주변, 저녁 여관. 기존 인사는 입항세·일거리 안내. 입항세 징수 기능을 약속하지 않는다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.bran.rest",
      "source": "named",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "bran"
        ],
        "conditions": []
      },
      "keyword": "바람을 관찰하는 습관·업무 후 휴식",
      "voice": "브란(항만 관리인): 짧고 건조한 연장자 반말. 항만 사무소 06~12/14~19, 정오 부두 주변, 저녁 여관. 기존 인사는 입항세·일거리 안내. 입항세 징수 기능을 약속하지 않는다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.bran.people",
      "source": "named",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "bran"
        ],
        "conditions": []
      },
      "keyword": "처음 온 외지인과 오래 머문 사람",
      "voice": "브란(항만 관리인): 짧고 건조한 연장자 반말. 항만 사무소 06~12/14~19, 정오 부두 주변, 저녁 여관. 기존 인사는 입항세·일거리 안내. 입항세 징수 기능을 약속하지 않는다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.sera.work",
      "source": "named",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "sera"
        ],
        "conditions": []
      },
      "keyword": "견습 등록과 의뢰판 이용의 차이",
      "voice": "세라(조합 접수원): 실무적이고 명확한 존댓말. 조합 데스크 07~12/13~19, 정오 stall_b, 저녁 여관. 견습 등록/의뢰판/보고 서비스가 있다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.sera.place",
      "source": "named",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "sera"
        ],
        "conditions": []
      },
      "keyword": "접수대와 시장 골목",
      "voice": "세라(조합 접수원): 실무적이고 명확한 존댓말. 조합 데스크 07~12/13~19, 정오 stall_b, 저녁 여관. 견습 등록/의뢰판/보고 서비스가 있다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.sera.rest",
      "source": "named",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "sera"
        ],
        "conditions": []
      },
      "keyword": "접수 업무가 끝난 뒤 일상",
      "voice": "세라(조합 접수원): 실무적이고 명확한 존댓말. 조합 데스크 07~12/13~19, 정오 stall_b, 저녁 여관. 견습 등록/의뢰판/보고 서비스가 있다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.sera.people",
      "source": "named",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "sera"
        ],
        "conditions": []
      },
      "keyword": "조합에 가입하지 않는 삶도 존중",
      "voice": "세라(조합 접수원): 실무적이고 명확한 존댓말. 조합 데스크 07~12/13~19, 정오 stall_b, 저녁 여관. 견습 등록/의뢰판/보고 서비스가 있다.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.goram.work",
      "source": "named",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "goram"
        ],
        "conditions": []
      },
      "keyword": "물건을 다루는 장인의 태도",
      "voice": "고람(대장장이): 툭툭 끊는 무뚝뚝한 반말, 장인다운 관찰. 대장간 06~12/13~20, 점심 여관 마당. 기존 상점 서비스만 실제 구현.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.goram.place",
      "source": "named",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "goram"
        ],
        "conditions": []
      },
      "keyword": "대장간 주변의 일상",
      "voice": "고람(대장장이): 툭툭 끊는 무뚝뚝한 반말, 장인다운 관찰. 대장간 06~12/13~20, 점심 여관 마당. 기존 상점 서비스만 실제 구현.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.goram.rest",
      "source": "named",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "goram"
        ],
        "conditions": []
      },
      "keyword": "일을 마친 뒤 조용한 휴식",
      "voice": "고람(대장장이): 툭툭 끊는 무뚝뚝한 반말, 장인다운 관찰. 대장간 06~12/13~20, 점심 여관 마당. 기존 상점 서비스만 실제 구현.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.goram.people",
      "source": "named",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "goram"
        ],
        "conditions": []
      },
      "keyword": "초보 손님과 익숙한 손님",
      "voice": "고람(대장장이): 툭툭 끊는 무뚝뚝한 반말, 장인다운 관찰. 대장간 06~12/13~20, 점심 여관 마당. 기존 상점 서비스만 실제 구현.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.miel.work",
      "source": "named",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "miel"
        ],
        "conditions": []
      },
      "keyword": "객실과 숙박 안내",
      "voice": "미엘(여관 주인): 친절하고 현실적인 존댓말. 09시 stall_a, 11시 여관 마당, 나머지 여관. 숙박은 은화 3, 외상 없음.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.miel.place",
      "source": "named",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "miel"
        ],
        "conditions": []
      },
      "keyword": "여관 마당과 시장",
      "voice": "미엘(여관 주인): 친절하고 현실적인 존댓말. 09시 stall_a, 11시 여관 마당, 나머지 여관. 숙박은 은화 3, 외상 없음.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.miel.rest",
      "source": "named",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "miel"
        ],
        "conditions": []
      },
      "keyword": "여행객이 쉬는 일상의 의미",
      "voice": "미엘(여관 주인): 친절하고 현실적인 존댓말. 09시 stall_a, 11시 여관 마당, 나머지 여관. 숙박은 은화 3, 외상 없음.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.miel.people",
      "source": "named",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "miel"
        ],
        "conditions": []
      },
      "keyword": "손님과 마을 주민의 생활 차이",
      "voice": "미엘(여관 주인): 친절하고 현실적인 존댓말. 09시 stall_a, 11시 여관 마당, 나머지 여관. 숙박은 은화 3, 외상 없음.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.tino.work",
      "source": "named",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "tino"
        ],
        "conditions": []
      },
      "keyword": "견습 활동에 대한 자기 생각",
      "voice": "티노(견습 모험가): 또래 느낌의 반말, 경쟁심은 있지만 강요하지 않음. 06시 의뢰판, 08시 북문 배회, 17시 분수 벤치, 19시 여관. 실적 숫자는 기존 서비스만 권위.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.tino.place",
      "source": "named",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "tino"
        ],
        "conditions": []
      },
      "keyword": "의뢰판과 북문·분수",
      "voice": "티노(견습 모험가): 또래 느낌의 반말, 경쟁심은 있지만 강요하지 않음. 06시 의뢰판, 08시 북문 배회, 17시 분수 벤치, 19시 여관. 실적 숫자는 기존 서비스만 권위.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.tino.rest",
      "source": "named",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "tino"
        ],
        "conditions": []
      },
      "keyword": "쉬는 날을 보내는 방식",
      "voice": "티노(견습 모험가): 또래 느낌의 반말, 경쟁심은 있지만 강요하지 않음. 06시 의뢰판, 08시 북문 배회, 17시 분수 벤치, 19시 여관. 실적 숫자는 기존 서비스만 권위.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.tino.people",
      "source": "named",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "tino"
        ],
        "conditions": []
      },
      "keyword": "경쟁과 각자의 속도",
      "voice": "티노(견습 모험가): 또래 느낌의 반말, 경쟁심은 있지만 강요하지 않음. 06시 의뢰판, 08시 북문 배회, 17시 분수 벤치, 19시 여관. 실적 숫자는 기존 서비스만 권위.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.iva.work",
      "source": "named",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "iva"
        ],
        "conditions": []
      },
      "keyword": "경비의 목적과 주민 안전",
      "voice": "이바(경비대장): 단호하고 간결한 반말. 06시 서문, 10시 광장, 14시 부두, 18시 북문. 경비 업무 안내만, 통행증 지급/신고 처리 등 미구현 기능 약속 금지.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.iva.place",
      "source": "named",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "iva"
        ],
        "conditions": []
      },
      "keyword": "서문·북문·광장",
      "voice": "이바(경비대장): 단호하고 간결한 반말. 06시 서문, 10시 광장, 14시 부두, 18시 북문. 경비 업무 안내만, 통행증 지급/신고 처리 등 미구현 기능 약속 금지.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.iva.rest",
      "source": "named",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "iva"
        ],
        "conditions": []
      },
      "keyword": "근무 중 짧은 여유",
      "voice": "이바(경비대장): 단호하고 간결한 반말. 06시 서문, 10시 광장, 14시 부두, 18시 북문. 경비 업무 안내만, 통행증 지급/신고 처리 등 미구현 기능 약속 금지.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.named.iva.people",
      "source": "named",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 10,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "npcIds": [
          "iva"
        ],
        "conditions": []
      },
      "keyword": "낯선 사람과 주민을 대하는 태도",
      "voice": "이바(경비대장): 단호하고 간결한 반말. 06시 서문, 10시 광장, 14시 부두, 18시 북문. 경비 업무 안내만, 통행증 지급/신고 처리 등 미구현 기능 약속 금지.",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.common.work",
      "source": "personal",
      "topicId": "kael.topic.work",
      "label": "하는 일",
      "priority": 0,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "conditions": []
      },
      "keyword": "각자의 하루와 하는 일",
      "voice": "특정 직업·성별·출신을 가정하지 않는 자연스러운 존댓말",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.common.place",
      "source": "personal",
      "topicId": "kael.topic.place",
      "label": "카엘의 장소",
      "priority": 0,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "conditions": []
      },
      "keyword": "카엘에서 눈에 띄는 장소",
      "voice": "특정 직업·성별·출신을 가정하지 않는 자연스러운 존댓말",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.common.rest",
      "source": "personal",
      "topicId": "kael.topic.rest",
      "label": "일상의 여유",
      "priority": 0,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "conditions": []
      },
      "keyword": "쉬거나 산책하는 일상",
      "voice": "특정 직업·성별·출신을 가정하지 않는 자연스러운 존댓말",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    },
    {
      "id": "kael.common.people",
      "source": "personal",
      "topicId": "kael.topic.people",
      "label": "사람들과 생활",
      "priority": 0,
      "eligibility": {
        "regionIds": [
          "sernbeld"
        ],
        "conditions": []
      },
      "keyword": "주민·여행객과 마주치는 생활",
      "voice": "특정 직업·성별·출신을 가정하지 않는 자연스러운 존댓말",
      "branches": [
        "관심을 보이며 구체적으로 묻기",
        "다른 관점 또는 자기 생각을 말하기",
        "다른 이야기로 돌아가기"
      ]
    }
  ],
  "legacyGroups": [],
  "replyActions": []
}
```
반환 파일명: kael-dialogue-A.json. 모든 배정 ID가 정확히 한 번씩 있는지 확인 후 반환한다.
