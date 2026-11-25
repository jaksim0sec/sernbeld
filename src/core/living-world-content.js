// First Kael production content. Existing resident schedules remain authoritative.
// One delivery per merchant, not a renewable reward faucet.
const regionId='sernbeld';
const orders=[
 {npc:'vendor0',need:'kael_mugwort_supply',item:'roadside_mugwort',quantity:2,quality:40,reward:6,label:'약재상에 보낼 길뚝쑥'},
 {npc:'vendor1',need:'kael_clover_supply',item:'round_clover',quantity:3,quality:30,reward:5,label:'가축 사료용 토끼풀'},
 {npc:'vendor2',need:'kael_shell_supply',item:'seashell',quantity:2,quality:50,reward:6,label:'공예용 조개껍데기'}
];
const profiles=[
 ...orders.map(o=>({id:o.npc,regionId,roleId:null,tags:['vendor','kael_market',o.need],needWeights:{[o.need]:1}})),
 ...Array.from({length:4},(_,i)=>({id:'docker'+i,regionId,roleId:null,tags:['docker','kael_dock']}))
];
// The conversation core forms groups of up to four before matching templates.
const chats=(topic,tag,lines,reply,max)=>Array.from({length:max-1},(_,i)=>{
 const size=i+2;
 return {id:topic+'_chat_'+size,topic,regionIds:[regionId],
  slots:Array.from({length:size},(_,j)=>({id:'speaker'+j,tags:[tag]})),
  turns:lines.map((text,j)=>({slotId:'speaker'+(j%size),text,duration:4})),
  participationIds:[reply]};
});
export const livingWorldContent=Object.freeze({
 definitions:{
  needs:orders.map(o=>({id:o.need,min:0,max:100,initial:80,perTick:0,threshold:60})),
  profiles,
  relationPolicies:[{id:'kael_delivery_trust',min:-20,max:20,delta:2,cooldownTicks:60}],
  requestPolicies:orders.map(o=>({id:o.need+'_delivery',needKey:o.need,tags:[o.need],selector:{definitionId:o.item},quantity:o.quantity,minimumQuality:o.quality,reward:o.reward,ttlTicks:10080,needDelta:-100,label:o.label,relationPolicyId:'kael_delivery_trust'})),
  participationActions:[
   {id:'kael_market_reply',kind:'reply',label:'시장에서는 어떤 물건을 취급해요?',reply:'약초나 조개 같은 것도 받아요. 물건마다 품질을 확인하니 잘 살펴서 가져오세요.'},
   {id:'kael_dock_reply',kind:'reply',label:'부두 일은 어떤가요?',reply:'짐을 나르는 일은 손발이 맞아야 해요. 통로만 비워 주면 한결 수월하죠.'}
  ],
  conversationTemplates:[
   ...chats('kael_market','vendor',[
    '해안에서 나는 물건은 배가 들어오는 날에도 찾는 사람이 있더군요.',
    '그렇죠. 작은 조개라도 깨지지 않은 건 공예하는 사람들이 좋아해요.',
    '약초도 마찬가지예요. 상태 좋은 물건은 따로 골라 둬야죠.'
   ],'kael_market_reply',3),
   ...chats('kael_dock','docker',[
    '짐 옮길 때는 통로부터 비워 놓자고.',
    '그래. 서로 지나갈 길은 남겨 둬야지.',
    '부두 끝에 놓인 짐은 저쪽부터 정리하면 되겠군.',
    '오늘도 무사히 일 끝내자고.'
   ],'kael_dock_reply',4)
  ]
 },
 handlers:Object.freeze({}),
 configureItems(_items){}
});
