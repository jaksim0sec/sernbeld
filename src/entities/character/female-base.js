// Lossless adapter for the female mesh packed in the supplied WebGL viewer.
// The model uses ORIGINAL vertices, per-part joint palettes, and its 47-joint hierarchy.
import {createStandardSkinMaterials} from '../../render/materials/standard-skin.js';

export const FEMALE_BASE_ID = 'female-base-v1';
export const FEMALE_BASE_URL = new URL('../../../assets/models/characters/female-base-v1.mesh.json', import.meta.url).href;
const HEIGHT = 1428, MAX_PALETTE = 16;
const IDENTITY = [1,0,0, 0,1,0, 0,0,1], ORIGIN = [0,0,0];
const MODEL_KEYS = ['p','n','f','wi','ww','bones','parts','hands'];

export function validateFemaleBaseData(data) {
  if (!data || !MODEL_KEYS.every(key => Object.hasOwn(data,key))) throw new Error('Invalid female base mesh format');
  if (data.bones.length !== 47 || data.parts.length !== 17 || data.hands.length !== 2) throw new Error('Unexpected original rig or mesh part count');
  if (data.p.length !== 278496 || data.n.length !== 139248 || data.f.length !== 556448 ||
      data.wi.length !== 185664 || data.ww.length !== 185664) throw new Error('Original packed geometry length mismatch');
  const maxIndices = data.f.length / 4;
  const vertices = data.p.length / 8;
  const partsEnd = data.parts.reduce((last, part) => {
    if (part.start !== last || part.count <= 0 || part.count % 3 !== 0 ||
        part.skin.length > MAX_PALETTE || !part.skin.length) throw new Error('Invalid mesh part palette or index range: '+part.name);
    return last + part.count;
  }, 0);
  if (partsEnd !== maxIndices || vertices !== 34812) throw new Error('Original index/vertex counts changed');
  const bones = new Set(data.bones.map(bone => bone.id));
  for (const part of data.parts) if (!part.skin.every(id => bones.has(id))) throw new Error('Part references unknown joint');
  return data;
}

function decodeBase64(value, Type) {
  const str = atob(value);
  const bytes = Uint8Array.from(str, c => c.charCodeAt(0));
  if (bytes.byteLength % Type.BYTES_PER_ELEMENT) throw new Error('Malformed packed component array');
  return new Type(bytes.buffer);
}

// Column-major rotation convention copied from the supplied original (including joint pivots).
function rotate(m,[x,y,z]) {
  return [m[0]*x+m[3]*y+m[6]*z,m[1]*x+m[4]*y+m[7]*z,m[2]*x+m[5]*y+m[8]*z];
}
function multiply(left,right) {
  return [0,3,6].flatMap(start => rotate(left,right.slice(start,start+3)));
}
function turn([x,y,z],degrees) {
  const angle=degrees*Math.PI/180, s=Math.sin(angle),c=Math.cos(angle),t=1-c;
  return [c+x*x*t,y*x*t+z*s,z*x*t-y*s,
    x*y*t-z*s,c+y*y*t,z*y*t+x*s,
    x*z*t+y*s,y*z*t-x*s,c+z*z*t];
}
export function calculateFemalePose(bones, pose = {}) {
  const transforms=new Map();
  for (const bone of bones) {
    const parent=transforms.get(bone.parent) || {rotation:IDENTITY,offset:ORIGIN};
    let local=IDENTITY;
    const angles=pose[bone.id] || [];
    bone.axes.forEach((axis,i) => {
      const degrees=angles[i] || 0;
      if (degrees) local=multiply(local,turn(axis.d,degrees));
    });
    const pivot=bone.pivot.map(value => value/HEIGHT);
    const movedPivot=rotate(local,pivot);
    const displacement=rotate(parent.rotation,pivot.map((v,i) => v-movedPivot[i]));
    transforms.set(bone.id,{
      rotation:multiply(parent.rotation,local),
      offset:parent.offset.map((v,i) => v+displacement[i])
    });
  }
  return transforms;
}
function toThreeMatrix(THREE,transform) {
  const {rotation:r,offset:t}=transform;
  // Three.js Matrix4.fromArray accepts column-major elements, as does original WebGL.
  return new THREE.Matrix4().fromArray([
    r[0],r[1],r[2],0, r[3],r[4],r[5],0, r[6],r[7],r[8],0,
    t[0],t[1],t[2],1
  ]);
}

export function createFemaleBase(THREE, source, options = {}) {
  const data=validateFemaleBaseData(source);
  const positions=decodeBase64(data.p,Int16Array);
  const normals=decodeBase64(data.n,Int8Array);
  const indices=decodeBase64(data.f,Uint16Array);
  const joints=decodeBase64(data.wi,Uint8Array);
  const weights=decodeBase64(data.ww,Uint8Array);
  const group=new THREE.Group(); group.name=FEMALE_BASE_ID;
  const parts=[];
  for (const part of data.parts) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('aPosition',new THREE.Int16BufferAttribute(positions,3,false));
    geometry.setAttribute('aNormal',new THREE.Int8BufferAttribute(normals,3,true));
    geometry.setAttribute('aJoints',new THREE.Uint8BufferAttribute(joints,4,false));
    geometry.setAttribute('aWeights',new THREE.Uint8BufferAttribute(weights,4,true));
    geometry.setIndex(new THREE.Uint16BufferAttribute(indices.subarray(part.start,part.start+part.count),1));
    // Draw the complete original indexed surface, followed by the inverted-hull pass.
    const skin=createStandardSkinMaterials(THREE,options.skin);
    const surface=new THREE.Mesh(geometry,skin.solid);
    surface.name=part.name;
    surface.frustumCulled=false;
    surface.renderOrder=0;
    const outline=new THREE.Mesh(geometry,skin.outline);
    outline.name=part.name+'-outline';
    outline.frustumCulled=false;
    outline.renderOrder=1;
    group.add(surface,outline);
    parts.push({spec:part,geometry,skin});
  }
  function setPose(pose={}) {
    const transforms=calculateFemalePose(data.bones,pose);
    for(const part of parts) {
      const matrices=part.spec.skin.map(id => toThreeMatrix(THREE,transforms.get(id)));
      part.skin.updateSkin(matrices);
    }
    return group;
  }
  setPose(options.pose || {});
  return {
    id:FEMALE_BASE_ID, group, bones:data.bones, hands:data.hands, source:data,
    setPose,
    dispose() {
      for(const part of parts) {part.skin.dispose();part.geometry.dispose();}
    }
  };
}
export async function loadFemaleBase(THREE, {url=FEMALE_BASE_URL, fetchImpl=fetch, ...options}={}) {
  const response=await fetchImpl(url);
  if(!response.ok) throw new Error('Failed to load '+FEMALE_BASE_ID+': HTTP '+response.status);
  return createFemaleBase(THREE,await response.json(),options);
}
