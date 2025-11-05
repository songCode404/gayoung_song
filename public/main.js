// public/main.js
// CDN을 통해 three.js 임포트
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
// [수정] config.js에서 텍스처 맵을 임포트합니다.
import { PLANET_TEXTURES } from './config.js';

// ==============================
// 1) 기본 설정 (Scene, Camera, Renderer)
// ==============================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialIAS: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
camera.position.z = 30;

// [추가] 텍스처 로더 생성
const textureLoader = new THREE.TextureLoader();

// [추가] 텍스처를 위한 조명 설정
// MeshStandardMaterial은 빛이 없으면 검은색으로 보입니다.
// 1. 은은한 주변광
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // (색상, 강도)
scene.add(ambientLight);

// 2. 태양 위치에서 비추는 점광원 (태양계 중심)
const pointLight = new THREE.PointLight(0xffffff, 2.0, 0); // (색상, 강도, 거리)
pointLight.position.set(0, 0, 0); // 태양계 중심에 배치
scene.add(pointLight);

console.log('[DEBUG] 초기화 완료:', { scene, camera, renderer });

// ==============================
// 2) 전역 그룹 및 상태
// ==============================
const solarSystem = new THREE.Group();
scene.add(solarSystem);

const objectsToAnimate = [];
console.log('[DEBUG] 장면 세팅 직후:', { solarSystem }, 'children:', solarSystem.children.length);

// ==============================
// 3) 유틸리티
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
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim === 0) return;

  const fov = camera.fov * (Math.PI / 180);
  let distance = (maxDim / 2) / Math.tan(fov / 2);
  distance *= padding;

  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = Math.max(0.1, distance / 1000);
  camera.far = distance * 1000;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

// ==============================
// 4) Gemini 프록시 호출
// ==============================
async function getJsonFromAI(userInput) {
  // 프론트에서는 API 키를 절대 사용하지 않음! (server.js가 대신 호출)
  
  // [수정] 프롬프트 수정: AI가 'textureKey'를 반환하도록 유도
  const promptTemplate = `
당신은 최고의 JSON 전문가입니다.
아래 규칙을 반드시 지켜 응답하세요.
- 반드시 "objects" 키를 포함하는 단일 JSON 객체로만 응답합니다.
- 설명이나 코드블록(\`\`\`) 없이 순수한 JSON 텍스트만 반환합니다.
- 텍스처가 있는 객체(태양, 지구 등)는 'color' 대신 'textureKey'를 사용합니다.
- 'textureKey'는 "Sun", "Earth", "Mars", "Jupiter", "Saturn", "Venus", "Mercury", "Moon" 중 하나여야 합니다.

---
[예시 1]
사용자 입력: 태양과 지구
JSON 응답:
{
  "objects": [
    { "name": "Sun", "size": 20, "textureKey": "Sun", "rotation_speed": 0.004 },
    { "name": "Earth", "size": 10, "textureKey": "Earth", "rotation_speed": 0.01, "orbit": { "target": "Sun", "distance": 50, "speed": 0.005 } }
  ]
}
---
[예시 2]
사용자 입력: 화성과 달
JSON 응답:
{
  "objects": [
    { "name": "Mars", "size": 8, "textureKey": "Mars", "rotation_speed": 0.008 },
    { "name": "Moon", "size": 3, "textureKey": "Moon", "rotation_speed": 0.01, "orbit": { "target": "Mars", "distance": 15, "speed": 0.01 } }
  ]
}
---

[실제 요청]
사용자 입력: ${userInput}
JSON 응답:
`.trim();
  // --- [프롬프트 수정 완료] ---

  console.log('[DEBUG] 프록시 호출 준비:', { userInput });

  const res = await fetch('/api/gemini', {
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
// 5) 장면 구성
// ==============================

// [수정] createCelestialObject 함수 전체 수정
function createCelestialObject(objData) {
  const orbit = new THREE.Object3D();

  console.log('[DEBUG] createCelestialObject 원본:', objData);

  const geometry = new THREE.SphereGeometry(num(objData.size, 5), 32, 32);

  // --- [텍스처 및 재질 로직 수정] ---
  let material;
  const textureKey = objData.textureKey; // AI가 제공한 키 (예: "Earth")
  const textureInfo = textureKey ? PLANET_TEXTURES[textureKey] : undefined;

  if (textureInfo && textureInfo.map) {
    // 1. config.js에 텍스처 정보가 있는 경우
    const texture = textureLoader.load(textureInfo.map);

    if (textureKey === 'Sun') {
      // 1-1. 태양: 스스로 빛나야 하므로 MeshBasicMaterial 사용
      material = new THREE.MeshBasicMaterial({ map: texture });
    } else {
      // 1-2. 행성/위성: 조명에 반응해야 하므로 MeshStandardMaterial 사용
      material = new THREE.MeshStandardMaterial({ map: texture });
    }
  } else if (objData.color) {
    // 2. 텍스처 키가 없고 'color'가 제공된 경우 (예전 방식 또는 태양)
    material = new THREE.MeshBasicMaterial({
      color: toThreeColor(objData.color)
    });
  } else {
    // 3. 텍스처도 색상도 없는 경우 (안전 장치)
    material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.8
    });
  }
  // --- [재질 로직 수정 완료] ---

  const mesh = new THREE.Mesh(geometry, material);

  if (!objData.orbit || !objData.orbit.target) {
    // 루트 메쉬를 바로 solarSystem에 올리는 기존 로직 유지
    solarSystem.add(mesh);
  } else {
    mesh.position.x = num(objData.orbit.distance, 0);
    orbit.add(mesh);
  }

  orbit.userData.orbitSpeed = objData.orbit ? num(objData.orbit.speed, 0) : 0;
  mesh.userData.rotationSpeed = num(objData.rotation_speed, 0);

  objectsToAnimate.push({ orbit, mesh });

  console.log('[DEBUG] 생성된 오브젝트:', {
    name: objData.name,
    size: geometry.parameters.radius * 2,
    textureKey: objData.textureKey, // 디버그 로그 수정
    rotation_speed: mesh.userData.rotationSpeed,
    orbit_speed: orbit.userData.orbitSpeed,
    hasOrbit: !!(objData.orbit && objData.orbit.target)
  });

  return { mesh, orbit };
}

function buildSceneFromJSON(data) {
  // 데이터 형식이 올바른지 확인하여 TypeError를 원천 방지하는 코드
  if (!data || !Array.isArray(data.objects)) {
    console.error('오류: AI 응답 데이터에 "objects" 배열이 없습니다.', data);
    // 사용자에게 직접적인 피드백을 주기 위해 statusText를 업데이트할 수 있습니다.
    throw new Error('AI 응답의 데이터 형식이 잘못되었습니다.');
  }

  console.log('[DEBUG] buildSceneFromJSON 시작:', data);

  const map = {};
  data.objects.forEach((objData, idx) => {
    const { mesh, orbit } = createCelestialObject(objData);
    map[objData.name] = { mesh, orbit };
    console.log(`[DEBUG] [${idx}] 생성 완료 ->`, objData.name, '| orbit?', !!objData.orbit);
  });

  data.objects.forEach((objData) => {
    if (objData.orbit && objData.orbit.target) {
      const parent = map[objData.orbit.target];
      const child = map[objData.name];
      if (parent && child) {
        // 기존 로직 유지: 부모 mesh에 자식 orbit 부착
        parent.mesh.add(child.orbit);
        console.log('[DEBUG] 부모-자식 연결:', `${objData.name} -> ${objData.orbit.target}`);
      } else {
        console.warn('[DEBUG] 부모/자식 참조 실패:', objData.name, '→', objData.orbit.target);
      }
    }
  });

  console.log('[DEBUG] buildSceneFromJSON 완료:', 'solarSystem children =', solarSystem.children.length);
  // 빌드 직후 카메라 자동 피팅(보기 편의)
  fitCameraToObject(solarSystem, 1.6);
}

function clearScene() {
  for (let i = objectsToAnimate.length - 1; i >= 0; i--) {
    const { mesh, orbit } = objectsToAnimate[i];
    if (mesh.parent) mesh.parent.remove(mesh);
    if (orbit.parent) orbit.parent.remove(orbit);
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material;
    (Array.isArray(mats) ? mats : [mats]).forEach(m => m && m.dispose && m.dispose());
  }
  while (solarSystem.children.length > 0) solarSystem.remove(solarSystem.children[0]);
  objectsToAnimate.length = 0;

  console.log('[DEBUG] clearScene 완료:', 'solarSystem children =', solarSystem.children.length, 'objectsToAnimate =', objectsToAnimate.length);
}

// ==============================
// 6) 애니메이션 & 인터랙션
// ==============================
function animate() {
  requestAnimationFrame(animate);
  for (const obj of objectsToAnimate) {
    if (Number.isFinite(obj.orbit.userData.orbitSpeed)) obj.orbit.rotation.y += obj.orbit.userData.orbitSpeed;
    if (Number.isFinite(obj.mesh.userData.rotationSpeed)) obj.mesh.rotation.y += obj.mesh.userData.rotationSpeed;
  }
  renderer.render(scene, camera);
}
animate();

// 마우스 드래그 회전
let isDragging = false;
renderer.domElement.addEventListener('mousedown', () => { isDragging = true; });
renderer.domElement.addEventListener('mouseup', () => { isDragging = false; });
renderer.domElement.addEventListener('mouseleave', () => { isDragging = false; });
renderer.domElement.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  solarSystem.rotation.y += e.movementX * 0.005;
  solarSystem.rotation.x += e.movementY * 0.005;
});

// 리사이즈 대응
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  console.log('[DEBUG] 리사이즈:', window.innerWidth, window.innerHeight);
});

// ==============================
// 7) UI 바인딩
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
    clearScene();

    const jsonData = await getJsonFromAI(userInput);
    console.log('[DEBUG] AI로부터 받은 JSON:', jsonData);

    // AI의 변칙적인 데이터 구조에 대응하기 위한 최종 로직
    let sceneData;
    if (Array.isArray(jsonData)) {
      // 데이터가 배열일 경우
      if (jsonData.length > 0 && jsonData[0].objects && Array.isArray(jsonData[0].objects)) {
        // [ { objects: [...] } ] 구조일 경우, 내부 객체를 사용
        sceneData = jsonData[0];
      } else {
        // [ {...}, {...} ] 구조일 경우, 객체로 감싸줌
        sceneData = { objects: jsonData };
      }
    } else {
      // 데이터가 원래부터 객체 { objects: [...] } 였을 경우
      sceneData = jsonData;
    }

    buildSceneFromJSON(sceneData);

    console.log('[DEBUG] 빌드 이후 상태:', { scene, solarSystem }, 'children:', solarSystem.children.length);
    statusText.textContent = '생성 완료!';
  } catch (err) {
    console.error('[DEBUG] 생성 중 오류:', err);
    statusText.textContent = `오류: ${err.message}`; // 사용자에게 좀 더 친절한 오류 메시지 표시
  } finally {
    generateButton.disabled = false;
  }
});