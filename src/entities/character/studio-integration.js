import {normalizeStudioCharacter, resolveNpcAppearance, npcHeadScale} from './appearance.js';

const DB='sernbeld-character-v1', STORE='models', PLAYER_ASSET='player.glb';
function openDB(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined') return reject(new Error('IndexedDB unavailable'));
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
  r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);
 });
}
async function modelStorage(mode,value){
 const db=await openDB();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode==='read'?'readonly':'readwrite');
  const store=tx.objectStore(STORE);
  const r=mode==='read'?store.get(PLAYER_ASSET):mode==='delete'?store.delete(PLAYER_ASSET):store.put(value,PLAYER_ASSET);
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });}finally{db.close();}
}
const EXAMPLE=normalizeStudioCharacter({body:'female'});
const fit=(v,min,max)=>Math.max(min,Math.min(max,v));

/** Bridges SERNBELD-Character/1 GLB exports to the existing combat and camera. */
export function createCharacterRuntime({THREE,scene,camera,player,folk,Save,createCharacter,GLTFLoader,makeWeapon,attackPose,worldCameraShift}) {
 const fallback=createCharacter(),fallbackRoot=fallback.group;
 fallbackRoot.name='SERNBELD Player • fallback rig';scene.add(fallbackRoot);
 const npcProfiles=new Map();
 for(const npc of folk.list){
  const profile=resolveNpcAppearance(npc.def);
  npc.def.gender=profile.gender;
  npc.appearance=profile.character;
  npc.ch.group.userData.appearance=profile;
  npcProfiles.set(npc.def.id,profile);
  const scale=npcHeadScale(profile);
  npc.ch.B.head.scale.set(...scale);
 }
 let studioRoot=null,studioBones=new Map(),studioRest=new Map(),studioHeight=1;
 let third=Save.data.settings.view==='third',activeAsset=false;
 let weaponNodes={right:null,left:null},weaponTypes={right:null,left:null};
 const defaultProfile=normalizeStudioCharacter(Save.data.character||EXAMPLE);
 Save.data.character=defaultProfile;
 const editor=document.createElement('dialog');
 editor.id='character-chooser';
 editor.style.cssText='border:1px solid #6d867b;border-radius:16px;background:#faf9f4;color:#26342b;padding:19px;width:min(430px,92vw);max-height:82svh;overflow:auto;box-shadow:0 12px 36px #0005';
 editor.innerHTML=`<h2 style="margin:0 0 8px;font-size:18px">내 캐릭터</h2>
 <p style="font-size:12px;line-height:1.6">스튜디오에서 저장한 설정(JSON)과 내보낸 전신 모델(GLB)을 연결할 수 있어. GLB는 이 기기에 저장돼.</p>
 <label style="display:block;font-size:13px">체형 데이터 <select id="character-body" style="margin-left:8px"><option value="female">여성</option><option value="male">남성</option></select></label>
 <label style="display:block;margin:14px 0 4px;font-size:13px">캐릭터 설정 JSON 불러오기 <input id="character-json" type="file" accept=".json,application/json" style="display:block;max-width:100%"></label>
 <label style="display:block;margin:14px 0 4px;font-size:13px">캐릭터 스튜디오 GLB 불러오기 <input id="character-glb" type="file" accept=".glb,model/gltf-binary" style="display:block;max-width:100%"></label>
 <div id="character-status" style="font-size:12px;color:#4e6156;margin:12px 0">기본 전신 모델 사용 중</div>
 <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="character-default">가져온 모델 제거</button><button type="button" id="character-close">닫기</button></div>`;
 document.body.appendChild(editor);
 const el=id=>editor.querySelector('#'+id);
 const status=text=>el('character-status').textContent=text;
 el('character-close').onclick=()=>editor.close();
 el('character-body').value=defaultProfile.body;
 el('character-body').onchange=()=>{
  Save.data.character=normalizeStudioCharacter({...Save.data.character,body:el('character-body').value});
  Save.write();
  applyFallbackFace();
  status('체형 설정 저장됨. 정확한 모델은 해당 체형 GLB를 불러오면 적용돼.');
 };
 el('character-json').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   const raw=JSON.parse(await file.text()),appearance=normalizeStudioCharacter(raw);
   Save.data.character=appearance;Save.write();el('character-body').value=appearance.body;
   applyFallbackFace();status('얼굴 조절값 30개와 장식/피부 설정을 저장했어. 모델 반영은 GLB와 함께 이뤄져.');
  }catch(err){status('설정 불러오기 실패: '+err.message);}
  e.target.value='';
 };
 function disposeImported(){
  if(!studioRoot)return;
  scene.remove(studioRoot);
  studioRoot.traverse(object=>{
   if(object.isMesh||object.isSkinnedMesh){
    object.geometry?.dispose();
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials)material?.dispose();
   }
  });
  studioRoot=null;studioBones.clear();studioRest.clear();
 }
 async function loadGLB(buffer,saveIt=true){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>45*1024*1024)throw new Error('45MB 이하 GLB만 지원해.');
  const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer.slice(0),'',resolve,reject));
  if(!gltf.scene)throw new Error('GLB에 모델 장면이 없어.');
  const root=new THREE.Group();
  root.name='SERNBELD Player • studio model';
  const model=gltf.scene;
  root.add(model);
  const bounds=new THREE.Box3().setFromObject(model);
  if(bounds.isEmpty())throw new Error('GLB에 표시할 메시가 없어.');
  const size=bounds.getSize(new THREE.Vector3());
  const height=fit(1.76/(size.y||1),0.4,3.6);
  model.scale.setScalar(height);
  model.position.y=-bounds.min.y*height;
  const bones=new Map(),rests=new Map();
  model.traverse(object=>{
   if(object.isBone){bones.set(object.name,object);rests.set(object.name,object.quaternion.clone());}
   if(object.isMesh||object.isSkinnedMesh){object.frustumCulled=false;object.castShadow=true;object.receiveShadow=true;}
  });
  if(bones.size<10)throw new Error('전신 스키닝 관절이 있는 캐릭터 GLB가 필요해.');
  disposeImported();
  studioRoot=root;studioBones=bones;studioRest=rests;studioHeight=height;
  scene.add(root);activeAsset=true;fallbackRoot.visible=false;
  if(gltf.parser?.json?.extras?.character){
   Save.data.character=normalizeStudioCharacter(gltf.parser.json.extras.character);
   el('character-body').value=Save.data.character.body;
   Save.write();
  }
  if(saveIt)await modelStorage('write',buffer.slice(0));
  weaponTypes={right:null,left:null};attachWeapons(true);
  status('선택한 전신 GLB를 캐릭터에 연결했어. 3인칭에서 확인할 수 있어.');
 }
 el('character-glb').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{status('모델 검사 중');await loadGLB(await file.arrayBuffer());}
  catch(err){status('모델 불러오기 실패: '+err.message);}
  e.target.value='';
 };
 el('character-default').onclick=async()=>{
  try{await modelStorage('delete');}catch{}
  disposeImported();activeAsset=false;fallbackRoot.visible=third;
  weaponTypes={right:null,left:null};attachWeapons(true);status('기본 전신 모델로 돌아왔어.');
 };
 function applyFallbackFace(){
  const s=npcHeadScale({character:Save.data.character});
  fallback.B.head.scale.set(...s);
  fallbackRoot.userData.appearance=Save.data.character;
 }
 applyFallbackFace();
 modelStorage('read').then(buffer=>buffer&&loadGLB(buffer,false)).catch(err=>console.warn('Character cache',err));
 function setThird(value){
  third=Boolean(value);
  Save.data.settings.view=third?'third':'first';Save.write();
  fallbackRoot.visible=third&&!activeAsset;
  if(studioRoot)studioRoot.visible=third;
 }
 function setProfile(raw){
  Save.data.character=normalizeStudioCharacter(raw);Save.write();
  el('character-body').value=Save.data.character.body;
  applyFallbackFace();
 }
 function openChooser(){if(!editor.open)editor.showModal();}
 function modelBones(){
  return activeAsset?studioBones:fallback.B;
 }
 function removeWeapon(node){
  if(!node)return;
  node.parent?.remove(node);
  node.geometry?.dispose();
 }
 function attachWeapons(force=false){
  const bones=modelBones();
  for(const side of ['right','left']){
   const def=Save.data.equip?.[side];
   if(!force&&weaponTypes[side]===def)continue;
   removeWeapon(weaponNodes[side]);weaponNodes[side]=null;weaponTypes[side]=def;
   if(!def)continue;
   const hand=bones instanceof Map?bones.get('hand_'+side):bones['hand_'+side];
   if(!hand)continue;
   const item=makeWeapon(def);
   if(!item)continue;
   // Geometry points +Y; on a neutral hand it points down, then follows the actual joint.
   item.rotation.z=Math.PI;
   item.position.set(0,-.035,.018);
   hand.add(item);weaponNodes[side]=item;
  }
 }
 const axis=(name,x,y,z)=>{
  const b=studioBones.get(name),q=studioRest.get(name);
  if(!b||!q)return;
  b.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ')));
 };
 function poseStudio(dt,t,speed,swing){
  const pace=fit(speed/3.6,0,1.5),stride=Math.sin(t*(2.8+pace*5));
  axis('thigh_left',-.48*stride*pace,0,0);axis('thigh_right',.48*stride*pace,0,0);
  axis('shin_left',Math.max(0,-stride)*.48*pace,0,0);
  axis('shin_right',Math.max(0,stride)*.48*pace,0,0);
  axis('ribcage',.015*Math.sin(t*1.5),0,0);
  axis('head',-player.pitch*.24,0,0);
  for(const side of ['left','right']){
   const sign=side==='right'?1:-1;
   const active=swing&&swing.side===sign;
   const movement=side==='right'?-stride:stride;
   axis('upper_arm_'+side,(active?-.65-.6*swing.pull:movement*.29*pace),0,
     sign*(active?-.18-swing.arc*.35:.08));
   axis('forearm_'+side,active?-.42-.54*swing.extension:-.12,0,0);
   axis('hand_'+side,active ? 0.2*swing.recoil : 0,0,0);
  }
 }
 function update(dt,t,combat){
  const speed=Math.hypot(player.vel.x,player.vel.z);
  const swing=attackPose(combat.swing);
  const root=activeAsset?studioRoot:fallbackRoot;
  root.position.copy(player.pos);
  root.rotation.y=player.yaw+Math.PI;root.visible=third;
  if(activeAsset)poseStudio(dt,t,speed,swing);
  else{
   fallback.speed=speed;fallback.animate(dt,t);
   fallback.B.head.rotation.x=-player.pitch*.24;
   if(swing){
    const side=swing.side===1?'right':'left',sign=swing.side;
    fallback.B['upper_arm_'+side].rotation.x=-.66-.64*swing.pull;
    fallback.B['upper_arm_'+side].rotation.z=sign*(-.18-swing.arc*.32);
    fallback.B['forearm_'+side].rotation.x=-.48-.46*swing.extension;
    fallback.B.ribcage.rotation.y+=-swing.arc*swing.weight*.13;
   }
  }
  attachWeapons();
 }
 function applyThirdCamera(){
  if(!third)return;
  const yaw=player.yaw;
  worldCameraShift(camera,Math.sin(yaw)*3.15,0.48,Math.cos(yaw)*3.15);
 }
 return {
  get mode(){return third?'third':'first';},
  setThird,openChooser,update,applyThirdCamera,setProfile,applyFallbackFace,
  get profile(){return Save.data.character;},get npcProfiles(){return npcProfiles;},
  get usingStudioModel(){return activeAsset;},loadGLB,
  dispose(){disposeImported();fallbackRoot.parent?.remove(fallbackRoot);editor.remove();}
 };
}
