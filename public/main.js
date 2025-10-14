// public/main.js
// 로컬 three.module.js 임포트 (public 폴더 안에 설정)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

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
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
camera.position.z = 30;

console.log('[DEBUG] 초기화 완료:', { scene, camera, renderer });

// ==============================
// 2) 전역 그룹 및 상태
// ==============================
const solarSystem = new THREE.Group();
scene.add(solarSystem);

const objectsToAnimate = [];
console.log('[DEBUG] 장면 세팅 직후:', { scene, solarSystem }, 'children:', solarSystem.children.length);

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
  const promptTemplate = `
당신은 JSON 전문가입니다.
아래 스키마로만 JSON 응답하세요. (코드블록/설명 금지)

{
  "objects": [
    {
      "name": "영문명",
      "size": 10,
      "color": "0xffff00",
      "rotation_speed": 0.01,
      "orbit": { "target": "Sun", "distance": 30, "speed": 0.01 }
    }
  ]
}

[사용자 입력]
${userInput}
  `.trim();

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
  if (!text) throw new Error('빈 응답');
  return JSON.parse(text); // 서버에서 JSON 모드로 요청 중
}

// ==============================
// 5) 장면 구성
// ==============================
function createCelestialObject(objData) {
  const orbit = new THREE.Object3D();

  console.log('[DEBUG] createCelestialObject 원본:', objData);

  const geometry = new THREE.SphereGeometry(num(objData.size, 5), 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: toThreeColor(objData.color) });
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
    color: objData.color,
    rotation_speed: mesh.userData.rotationSpeed,
    orbit_speed: orbit.userData.orbitSpeed,
    hasOrbit: !!(objData.orbit && objData.orbit.target)
  });

  return { mesh, orbit };
}

function buildSceneFromJSON(data) {
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

    buildSceneFromJSON(jsonData);

    console.log('[DEBUG] 빌드 이후 상태:', { scene, solarSystem }, 'children:', solarSystem.children.length);
    statusText.textContent = '생성 완료!';
  } catch (err) {
    console.error('[DEBUG] 생성 중 오류:', err);
    statusText.textContent = '오류가 발생했습니다. 콘솔을 확인해주세요.';
  } finally {
    generateButton.disabled = false;
  }
});
