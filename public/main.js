import * as THREE from 'three';
import * as CANNON from 'cannon-es'; // 물리 엔진 임포트
import { PLANET_TEXTURES } from './config.js';

// ==============================
// 1) 기본 설정
// ==============================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const canvas = document.querySelector('#three-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
camera.position.z = 50; // 충돌을 잘 보이도록 카메라를 뒤로 뺍니다.

// 조명
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 2.0, 0);
pointLight.position.set(0, 0, 0);
scene.add(pointLight);

const textureLoader = new THREE.TextureLoader();

// ==============================
// 2) ★ 물리 엔진 설정 ★
// ==============================
const physicsWorld = new CANNON.World();
physicsWorld.gravity.set(0, 0, 0); // 우주 (중력 없음)

// 활성 객체(Mesh + Body)를 추적하기 위한 배열
let physicsObjects = [];

// ==============================
// 3) 유틸리티 (기존과 동일)
// ==============================
function toThreeColor(colorStr) {
  if (typeof colorStr !== 'string') return 0xffffff;
  const s = colorStr.trim().toLowerCase();
  if (s.startsWith('#')) return parseInt(s.slice(1), 16);
  if (s.startsWith('0x')) return parseInt(s.slice(2), 16);
  const v = parseInt(s, 16);
  return Number.isFinite(v) ? v : 0xffffff;
}
const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

function fitCameraToObject(group, padding = 1.6) {
    // (이 함수는 현재 코드에서 사용되지 않지만, 유틸리티로 남겨둡니다)
    // (물리 객체는 'group'이 아니므로 별도 로직이 필요합니다)
}

// ==============================
// 4) ★ Gemini 프록시 호출 (물리용 프롬프트로 수정) ★
// ==============================
async function getJsonFromAI(userInput) {
  
  // ★ LLM이 물리 엔진용 JSON을 반환하도록 프롬프트를 수정합니다. ★
  const promptTemplate = `
당신은 최고의 3D 물리 시뮬레이션 JSON 전문가입니다.
사용자의 요청을 분석하여 3D 객체를 생성하기 위한 JSON을 반환합니다.
- 반드시 "objects" 키를 포함하는 단일 JSON 객체로만 응답합니다.
- 설명이나 코드블록(\`\`\`) 없이 순수한 JSON 텍스트만 반환합니다.
- "position"과 "velocity"는 { "x": 값, "y": 값, "z": 값 } 형식이어야 합니다.
- 텍스처가 있는 객체(태양, 지구 등)는 'textureKey'를 사용합니다.
- 'textureKey'는 "Sun", "Earth", "Mars", "Jupiter", "Saturn", "Venus", "Mercury", "Moon" 중 하나여야 합니다.

---
[요청 예시]
사용자 입력: 지구와 화성이 충돌
JSON 응답:
{
  "objects": [
    { 
      "name": "Earth", 
      "textureKey": "Earth",
      "size": 5, 
      "mass": 10,
      "position": { "x": -20, "y": 0, "z": 0 },
      "velocity": { "x": 10, "y": 0, "z": 0 }
    },
    { 
      "name": "Mars", 
      "textureKey": "Mars",
      "size": 3, 
      "mass": 5,
      "position": { "x": 20, "y": 0, "z": 0 },
      "velocity": { "x": -10, "y": 0, "z": 0 }
    }
  ]
}
---

[실제 요청]
사용자 입력: ${userInput}
JSON 응답:
`.trim();
  // --- [프롬프트 수정 완료] ---

  console.log('[DEBUG] 프록시 호출 준비:', { userInput });

  const res = await fetch('/api/gemini', { // vite.config.js의 프록시 설정이 필요
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userInput: promptTemplate })
  });

  console.log('[DEBUG] 프록시 응답 상태:', res.status);
  if (!res.ok) throw new Error(`Proxy failed: ${res.status}`);

  const data = await res.json();
  console.log('[DEBUG] 원본 응답:', data);

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('AI로부터 빈 응답을 받았습니다.');

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('JSON 파싱 오류:', error);
    throw new Error('AI가 유효하지 않은 JSON 형식으로 응답했습니다.');
  }
}

// ==============================
// 5) ★ 장면 구성 (물리 엔진용으로 수정) ★
// ==============================

/**
 * 충돌 이벤트 핸들러 (Mark and Sweep)
 */
function handleCollision(event) {
  console.log("충돌 감지!", event.body.name, "vs", event.contact.bi.name);
  // 충돌한 두 객체에 '제거 예정' 플래그 설정
  event.body.isMarkedForRemoval = true;
  event.contact.bi.isMarkedForRemoval = true;
}

/**
 * JSON 데이터를 기반으로 물리 객체와 메쉬를 생성합니다.
 */
function createCelestialObject(objData) {
  const radius = num(objData.size, 5);
  const mass = num(objData.mass, 1); // 질량이 0이면 Static 객체가 되므로 1을 기본값으로
  const pos = objData.position || { x: 0, y: 0, z: 0 };
  const vel = objData.velocity || { x: 0, y: 0, z: 0 };

  // 1. Three.js 메쉬 (보이는 것)
  const textureInfo = PLANET_TEXTURES[objData.textureKey] || {};
  const texture = textureLoader.load(textureInfo.map || '/textures/default.jpg');
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 32),
    material
  );
  mesh.position.set(num(pos.x), num(pos.y), num(pos.z));
  scene.add(mesh);

  // 2. Cannon.js 바디 (물리 계산용)
  const shape = new CANNON.Sphere(radius);
  const body = new CANNON.Body({
    mass: mass,
    shape: shape,
    type: CANNON.Body.DYNAMIC,
    position: new CANNON.Vec3(num(pos.x), num(pos.y), num(pos.z)),
    velocity: new CANNON.Vec3(num(vel.x), num(vel.y), num(vel.z)),
  });
  body.name = objData.name || 'Unknown'; // 디버깅용 이름
  body.addEventListener('collide', handleCollision); // 충돌 리스너 부착
  physicsWorld.addBody(body);

  // 3. 생성된 객체를 관리 배열에 추가
  physicsObjects.push({ mesh, body, name: body.name });
}

/**
 * AI가 반환한 JSON을 바탕으로 씬을 구성합니다.
 */
function buildSceneFromJSON(data) {
  if (!data || !Array.isArray(data.objects)) {
    console.error('오류: AI 응답 데이터에 "objects" 배열이 없습니다.', data);
    throw new Error('AI 응답의 데이터 형식이 잘못되었습니다.');
  }
  console.log('[DEBUG] buildSceneFromJSON 시작:', data);

  data.objects.forEach((objData) => {
    createCelestialObject(objData);
  });

  console.log('[DEBUG] buildSceneFromJSON 완료:', 'physicsObjects =', physicsObjects.length);
}

/**
 * 씬을 정리합니다. (물리 객체 포함)
 */
function clearScene() {
  for (const obj of physicsObjects) {
    // 1. 물리 세계에서 제거
    physicsWorld.removeBody(obj.body);
    // 2. 씬에서 메쉬 제거
    scene.remove(obj.mesh);
    // 3. 메모리 해제
    obj.mesh.geometry.dispose();
    obj.mesh.material.dispose();
  }
  physicsObjects = []; // 배열 비우기

  console.log('[DEBUG] clearScene 완료');
}

// ==============================
// 6) ★ 애니메이션 루프 (물리 엔진용으로 수정) ★
// ==============================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();

  // 1. 물리 엔진 세계를 업데이트합니다. (충돌 감지, 위치 계산)
  physicsWorld.step(1 / 60, deltaTime);

  // 2. 객체 제거 및 위치 동기화 (Mark and Sweep)
  const objectsToKeep = []; // 살아남은 객체를 담을 새 배열
  
  for (const obj of physicsObjects) {
    if (obj.body.isMarkedForRemoval) {
      // 2-1. 제거 플래그가 있으면?
      // 물리 세계와 씬에서 즉시 제거
      physicsWorld.removeBody(obj.body);
      scene.remove(obj.mesh);
      obj.mesh.geometry.dispose();
      obj.mesh.material.dispose();
      // 'objectsToKeep' 배열에 추가하지 않음 (버림)
    } else {
      // 2-2. 제거 대상이 아니면?
      // 물리 계산 결과를 3D 메쉬에 복사
      obj.mesh.position.copy(obj.body.position);
      obj.mesh.quaternion.copy(obj.body.quaternion);
      // 'objectsToKeep' 배열에 추가 (살림)
      objectsToKeep.push(obj);
    }
  }
  
  // 3. 관리 배열을 살아남은 객체들로 교체
  physicsObjects = objectsToKeep;

  // 4. 렌더링
  renderer.render(scene, camera);
}
animate(); // 애니메이션 루프 시작

// 마우스 드래그 회전 (scene 자체를 회전)
let isDragging = false;
renderer.domElement.addEventListener('mousedown', () => { isDragging = true; });
renderer.domElement.addEventListener('mouseup', () => { isDragging = false; });
renderer.domElement.addEventListener('mouseleave', () => { isDragging = false; });
renderer.domElement.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  scene.rotation.y += e.movementX * 0.005;
  scene.rotation.x += e.movementY * 0.005;
});

// 리사이즈 대응 (기존과 동일)
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  console.log('[DEBUG] 리사이즈:', window.innerWidth, window.innerHeight);
});

// ==============================
// 7) UI 바인딩 (기존과 거의 동일)
// ==============================
const promptInput = document.getElementById('prompt-input');
const generateButton = document.getElementById('generate-button');
const statusText = document.getElementById('status');

generateButton.addEventListener('click', async () => {
  const userInput = promptInput.value?.trim();
  if (!userInput) return;

  statusText.textContent = 'AI가 생성 중입니다...';
  generateButton.disabled = true;

  try {
    console.log('[DEBUG] 버튼 클릭: clearScene 호출');
    clearScene(); // 이전 객체들을 모두 제거

    const jsonData = await getJsonFromAI(userInput);
    console.log('[DEBUG] AI로부터 받은 JSON:', jsonData);

    // AI 데이터 구조 대응 (기존 코드)
    let sceneData;
    if (Array.isArray(jsonData)) {
      if (jsonData.length > 0 && jsonData[0].objects && Array.isArray(jsonData[0].objects)) {
        sceneData = jsonData[0];
      } else {
        sceneData = { objects: jsonData };
      }
    } else {
      sceneData = jsonData;
    }

    buildSceneFromJSON(sceneData); // 새 객체들 생성

    console.log('[DEBUG] 빌드 이후 상태:', 'physicsObjects =', physicsObjects.length);
    statusText.textContent = '생성 완료!';
  } catch (err) {
    console.error('[DEBUG] 생성 중 오류:', err);
    statusText.textContent = `오류: ${err.message}`;
  } finally {
    generateButton.disabled = false;
  }
});