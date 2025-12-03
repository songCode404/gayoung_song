// main.js - 통합 버전 (Code A + Code B + 버그 수정)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Planet } from './planet.js';
import { getJsonFromAI } from './AIClient.js';

// ─────────────────────────────────────────────────────────────
// ★ 시나리오 및 이펙트 Import (모든 시나리오 통합)
// ─────────────────────────────────────────────────────────────
import { initCollisionScene } from './scenarios/SceneCollision.js';
import { initSolarSystem } from './scenarios/SceneSolarSystem.js';
import { initBirthScene } from './scenarios/SceneBirth.js';
import { initGiantImpact } from './scenarios/SceneGiantImpact.js';
import { initSolarEclipseScene } from './scenarios/SceneSolarEclips.js'; 
import { initLunarEclipseScene } from './scenarios/SceneLunarEclips.js';
import { Explosion } from './Explosion.js';

// ─────────────────────────────────────────────────────────────
// 1. 기본 씬 설정 & 배경
// ─────────────────────────────────────────────────────────────
const canvas = document.querySelector('#three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// ★ 우주 배경 (Sky Sphere) - Code A 스타일
function createUniverse() {
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.SphereGeometry(2000, 64, 64);
  const texture = loader.load('/assets/textures/galaxy.png', undefined, undefined, (err) => {
    console.warn('배경 이미지를 찾을 수 없습니다. (검은 배경 사용)');
  });
  
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.6
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}
const universeMesh = createUniverse();

// 카메라 설정
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const originalCameraPosition = new THREE.Vector3(0, 50, 100);
camera.position.copy(originalCameraPosition);

// 조명
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 2, 1000);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// ─────────────────────────────────────────────────────────────
// 2. 물리 월드 & 상태 변수 (통합)
// ─────────────────────────────────────────────────────────────
const world = new CANNON.World();
world.gravity.set(0, 0, 0);
world.broadphase = new CANNON.NaiveBroadphase();

// 통합 상태 관리
let planets = [];
let explosions = []; 
let currentScenarioType = '';
let currentScenarioUpdater = null; // 시나리오별 커스텀 업데이트 함수
let currentControlsCleanup = null; // Code B: 카메라 컨트롤 정리용

// Giant Impact 전용 상태
let giantImpactTime = 0;
let isGiantImpactPlaying = false;
let gaiaRef = null;
let theiaRef = null;
let impactHappened = false;
let timeScale = 1.0;

// 카메라 추적 상태
let followTarget = null; 

// ─────────────────────────────────────────────────────────────
// 3. 유틸리티 (Reset, Collision, Explosion)
// ─────────────────────────────────────────────────────────────

// ★ 씬 초기화 (Code A의 강력한 청소 + Code B의 컨트롤 정리 통합)
function resetScene() {
  // 1. 상태 및 컨트롤 정리
  currentScenarioUpdater = null;
  followTarget = null;
  giantImpactTime = 0;
  isGiantImpactPlaying = false;
  impactHappened = false;
  timeScale = 1.0;

  if (currentControlsCleanup) {
      currentControlsCleanup();
      currentControlsCleanup = null;
  }

  // 2. 객체 논리적 제거
  for (const p of planets) {
    if (p.dispose) p.dispose();
  }
  planets = [];

  for (const e of explosions) e.dispose?.();
  explosions = [];

  // 3. 씬 그래픽 객체 완전 제거 (배경/카메라/조명 제외)
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.isLight || obj.isCamera || obj === universeMesh) continue;

    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
    }
  }
  
  // 카메라 타겟 리셋
  if (currentScenarioType !== 'giant_impact') {
      controls.target.set(0, 0, 0);
      controls.enableZoom = true; // 컨트롤 제한 해제
      controls.enableRotate = true;
  }
  
  console.log('🧹 씬 초기화 완료');
}

// 폭발 생성
window.createExplosion = (position, color) => {
  try {
    const explosion = new Explosion(scene, position, color);
    explosions.push(explosion);
  } catch (e) {
    console.warn('Explosion class error:', e);
  }
};

// ★ [추가] 물리 엔진만 믿지 않고 거리 기반으로 확실하게 충돌 처리
function checkCollisions() {

    if (currentScenarioType === 'solar_eclipse' || currentScenarioType === 'lunar_eclipse') {
      return; 
    }
    if (planets.length < 2) return;
    for (let i = 0; i < planets.length; i++) {
        for (let j = i + 1; j < planets.length; j++) {
            const p1 = planets[i];
            const p2 = planets[j];
            if (p1.isDead || p2.isDead) continue;

            const dist = p1.mesh.position.distanceTo(p2.mesh.position);
            const threshold = (p1.radius + p2.radius) * 0.9; // 90% 거리에서 충돌 판정

            if (dist < threshold) {
                window.handleMerger(p1, p2);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 4. 시나리오별 로직 (Giant Impact & Merger)
// ─────────────────────────────────────────────────────────────

// Giant Impact 타임라인 시작
function startGiantImpactTimeline() {
  giantImpactTime = 0;
  isGiantImpactPlaying = true;
  impactHappened = false;
  followTarget = null; 

  if (theiaRef?.body) {
    theiaRef.body.velocity.set(-8, 0, 0); 
  }
}

// Giant Impact 카메라 연출
function updateGiantImpactCamera(delta) {
  if (!isGiantImpactPlaying) return;
  giantImpactTime += delta;

  if (giantImpactTime < 4) { // 줌인
    timeScale = 0.7;
    const targetPos = new THREE.Vector3(0, 35, 260);
    camera.position.lerp(targetPos, 0.03);
    controls.target.lerp(new THREE.Vector3(0,0,0), 0.1);
  } else if (giantImpactTime < 8) { // 충돌 슬로모션
    timeScale = 0.3;
    const targetPos = new THREE.Vector3(0, 20, 120);
    camera.position.lerp(targetPos, 0.05);
  } else { // 회전
    timeScale = 0.5;
    const t = giantImpactTime - 8;
    const radius = 150;
    const height = 25;
    const speed = 0.2;
    camera.position.lerp(new THREE.Vector3(Math.cos(speed*t)*radius, height, Math.sin(speed*t)*radius), 0.08);
    camera.lookAt(0, 0, 0);
  }
}

// 충돌 섬광
function createImpactFlash(pos) {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
  const flash = new THREE.Mesh(geometry, material);
  flash.position.copy(pos);
  flash.scale.set(12, 12, 12);
  scene.add(flash);

  const expandFlash = () => {
    flash.scale.multiplyScalar(1.08);
    flash.material.opacity -= 0.12;
    if (flash.material.opacity > 0) requestAnimationFrame(expandFlash);
    else { scene.remove(flash); geometry.dispose(); material.dispose(); }
  };
  expandFlash();
}

// 행성 병합 핸들러
window.handleMerger = (p1, p2) => {
  if (p1.isDead || p2.isDead) return;

  // Theia 충돌 확인
  const n1 = p1.data.name; const n2 = p2.data.name;
  const combinedNames = (n1 + n2).toLowerCase();
  const isGiantImpact = combinedNames.includes('theia');

  if (currentScenarioType === 'giant_impact') {
    if (impactHappened) return;
    impactHappened = true;
  }

  // 물리량 병합
  const newMass = p1.mass + p2.mass;
  const newRadius = Math.cbrt(Math.pow(p1.radius, 3) + Math.pow(p2.radius, 3));
  const ratio = p1.mass / newMass;
  
  const newPos = {
    x: p1.body.position.x * ratio + p2.body.position.x * (1 - ratio),
    y: p1.body.position.y * ratio + p2.body.position.y * (1 - ratio),
    z: p1.body.position.z * ratio + p2.body.position.z * (1 - ratio),
  };
  const newVel = {
    x: (p1.mass * p1.body.velocity.x + p2.mass * p2.body.velocity.x) / newMass,
    y: (p1.mass * p1.body.velocity.y + p2.mass * p2.body.velocity.y) / newMass,
    z: (p1.mass * p1.body.velocity.z + p2.mass * p2.body.velocity.z) / newMass,
  };

  p1.isDead = true; p2.isDead = true;

  // 새 행성 생성 지연 실행
  setTimeout(() => {
    const loader = new THREE.TextureLoader();
    const textureKey = isGiantImpact ? 'MoltenEarth' : (p1.mass > p2.mass ? p1.data.textureKey : p2.data.textureKey);
    const name = isGiantImpact ? 'Molten-Earth' : `Merged-${p1.data.name}`;

    const mergedPlanet = new Planet(scene, world, loader, {
      name, textureKey, size: newRadius / 3.0, mass: newMass, position: newPos, velocity: newVel,
    }, 'merge_event');

    // 시각 효과
    if (isGiantImpact) {
      mergedPlanet.mesh.material.color.setHex(0xffaa00);
      mergedPlanet.mesh.material.emissive = new THREE.Color(0xff2200);
      mergedPlanet.mesh.material.emissiveIntensity = 3.0;
      createImpactFlash(new THREE.Vector3(newPos.x, newPos.y, newPos.z));
      
      // 달 생성은 로직 복잡도로 생략 (필요 시 Code A의 createMoonSequence 추가)
    } else {
      window.createExplosion(newPos, 0xffffff);
    }
    planets.push(mergedPlanet);
  }, 50);
};

// ─────────────────────────────────────────────────────────────
// 5. 통합 시나리오 생성 함수 (AI Data -> Scene)
// ─────────────────────────────────────────────────────────────
async function createSceneFromData(aiData) {
  resetScene();

  if (!aiData || !aiData.scenarioType) {
    console.error('🚨 scenarioType 없음');
    return;
  }

  let safeScenarioType = aiData.scenarioType.toLowerCase().trim();
  console.log(`🎬 시나리오 시작: ${safeScenarioType}`);

  // Theia 감지 시 자동 Giant Impact
  const hasTheia = aiData.objects?.some((o) => o.name.toLowerCase().includes('theia'));
  if (hasTheia) safeScenarioType = 'giant_impact';

  currentScenarioType = safeScenarioType;
  let setupData = null;
  const loader = new THREE.TextureLoader();

  // ★ 통합 Switch 문
  switch (safeScenarioType) {
    case 'collision':
      setupData = initCollisionScene(scene, world, loader, aiData);
      break;
    case 'solar_system':
    case 'orbit':
      setupData = initSolarSystem(scene, world, loader, aiData);
      break;
    case 'solar_eclipse':
      setupData = initSolarEclipseScene(scene, world, loader, aiData);
      break;
    case 'lunar_eclipse':
      setupData = initLunarEclipseScene(scene, world, loader, aiData);
      break;
    case 'planet_birth':
      setupData = initBirthScene(scene, world, loader, aiData);
      break;
    case 'giant_impact':
      setupData = initGiantImpact(scene, world, loader, aiData);
      gaiaRef = setupData.gaia;
      theiaRef = setupData.theia;
      startGiantImpactTimeline();
      break;
    default:
      // 기본 생성 (직접 목록)
      setupData = { planets: [], cameraPosition: aiData.cameraPosition };
      if (aiData.objects) {
        for (const objData of aiData.objects) {
          const p = new Planet(scene, world, loader, objData, currentScenarioType);
          planets.push(p);
        }
      }
      break;
  }

  // 데이터 적용
  if (setupData) {
    if (setupData.planets) planets = setupData.planets;
    if (setupData.update) currentScenarioUpdater = setupData.update;

    // Code B의 컨트롤 셋업 처리
    if (setupData.setupControls && typeof setupData.setupControls === 'function') {
        currentControlsCleanup = setupData.setupControls(camera, controls);
    }

    // 카메라 위치 설정
    const camPos = setupData.cameraPosition || aiData.cameraPosition;
    const lookAtPos = setupData.cameraLookAt || { x: 0, y: 0, z: 0 };

    if (camPos && !isGiantImpactPlaying) {
      camera.position.set(camPos.x, camPos.y, camPos.z);
      camera.lookAt(lookAtPos.x, lookAtPos.y, lookAtPos.z);
      controls.target.set(lookAtPos.x, lookAtPos.y, lookAtPos.z);
      originalCameraPosition.set(camPos.x, camPos.y, camPos.z);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 6. 물리 로직 (중력 & 변형)
// ─────────────────────────────────────────────────────────────
function applyGravity() {
  if (currentScenarioType === 'collision' || currentScenarioType === 'planet_birth') return;
  if (planets.length < 2) return;

  const sortedPlanets = [...planets].sort((a, b) => b.mass - a.mass);
  const star = sortedPlanets[0];
  const G = 10; // Code A 기준 (시뮬레이션 안정성)

  for (let i = 1; i < sortedPlanets.length; i++) {
    const planet = sortedPlanets[i];
    const distVec = new CANNON.Vec3();
    star.body.position.vsub(planet.body.position, distVec);
    const r_sq = distVec.lengthSquared();
    if (r_sq < 1) continue;
    const force = (G * star.mass * planet.mass) / r_sq;
    distVec.normalize();
    distVec.scale(force, distVec);
    planet.body.applyForce(distVec, planet.body.position);
  }
}

function applyMutualDeformation(deltaTime) {
  if (currentScenarioType !== 'giant_impact' || planets.length < 2) return;

  for (const p of planets) p.targetDeformAmount = 0;

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i]; const b = planets[j];
      const dist = a.mesh.position.distanceTo(b.mesh.position);
      const sumR = a.radius + b.radius;

      if (dist > sumR * 1.4) continue;
      const t = THREE.MathUtils.clamp(1 - (dist - sumR * 0.7) / (sumR * 0.7), 0, 1);
      if (t <= 0) continue;

      const dirAB = new THREE.Vector3().subVectors(b.mesh.position, a.mesh.position).normalize();
      a.setDeform(dirAB, t);
      b.setDeform(dirAB.clone().negate(), t);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 7. 사용자 입력 (AI 요청 & Raycasting Interaction)
// ─────────────────────────────────────────────────────────────
const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusDiv = document.getElementById('ai-status');

async function handleUserRequest() {
  const text = inputField.value;
  if (!text) return;
  sendBtn.disabled = true; inputField.disabled = true;
  try {
    statusDiv.innerText = 'AI가 생각 중... 🤔';
    const scenarioData = await getJsonFromAI(text);
    await createSceneFromData(scenarioData);
    statusDiv.innerText = `✅ 적용 완료: ${scenarioData.scenarioType}`;
  } catch (error) {
    console.error('🚨 오류:', error);
    statusDiv.innerText = '🚨 오류 발생!';
  } finally {
    sendBtn.disabled = false; inputField.disabled = false;
    inputField.value = ''; inputField.focus();
  }
}

if (sendBtn) {
  sendBtn.addEventListener('click', handleUserRequest);
  inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserRequest(); });
}

// ★ Raycasting: 클릭 시 정보 표시 및 추적
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const infoBox = document.getElementById('planet-info');
const infoTitle = document.getElementById('info-title');
const infoDesc = document.getElementById('info-desc');

// 텍스처 이름 매핑
const planetDescriptions = {
    'sun': '태양', 'mercury': '수성', 'venus': '금성', 'earth': '지구',
    'moon': '달', 'mars': '화성', 'jupiter': '목성', 'saturn': '토성',
    'uranus': '천왕성', 'neptune': '해왕성', 'pluto': '명왕성', 'molten-earth': '녹아내린 지구'
};

let isDragging = false;
let mouseDownTime = 0;
window.addEventListener('pointerdown', () => { isDragging = false; mouseDownTime = Date.now(); });
window.addEventListener('pointermove', () => { isDragging = true; });
window.addEventListener('pointerup', (event) => {
    if (isDragging || Date.now() - mouseDownTime > 200) return;
    if (isGiantImpactPlaying) return; // 시네마틱 중 무시

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    let foundTarget = null;
    let foundName = null;

    if (intersects.length > 0) {
        const object = intersects[0].object;
        if(object.material?.map?.source?.data?.src) {
             const src = object.material.map.source.data.src;
             const match = src.match(/\/([^\/]+)\.(jpg|png)/i);
             if(match) foundName = match[1].replace('2k_', '').toLowerCase();
        }
        if (!foundName && object.userData?.name) foundName = object.userData.name.toLowerCase();
        if (foundName && (planetDescriptions[foundName] || object.userData.isPlanet)) {
            foundTarget = object;
            if(infoBox) {
                infoTitle.innerText = foundName.toUpperCase();
                infoDesc.innerText = planetDescriptions[foundName] || foundName;
                infoBox.style.display = 'block';
                infoBox.style.left = event.clientX + 10 + 'px';
                infoBox.style.top = event.clientY + 10 + 'px';
            }
        }
    }

    if (foundTarget) {
        followTarget = foundTarget;
        console.log(`🔭 추적: ${foundName}`);
    } else {
        followTarget = null;
        if(infoBox) infoBox.style.display = 'none';
    }
});

// ─────────────────────────────────────────────────────────────
// 8. 애니메이션 루프
// ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();

  // 1. 시네마틱 카메라 제어
  if (currentScenarioType === 'giant_impact' && isGiantImpactPlaying) {
    updateGiantImpactCamera(rawDelta);
  } else {
    timeScale = 1.0;
  }
  const deltaTime = rawDelta * timeScale;

  // 2. 물리 및 충돌
  applyGravity();
  checkCollisions(); // ★ 추가된 강제 충돌 체크
  world.step(1 / 60, deltaTime, 10); // 정밀도 상향 (3 -> 10)

  // 3. 행성 업데이트 및 제거
  for (let i = planets.length - 1; i >= 0; i--) {
    const p = planets[i];
    p.update(deltaTime);
    if (p.isDead) {
      p.dispose();
      planets.splice(i, 1);
    }
  }

  // 4. 이펙트 업데이트
  applyMutualDeformation(deltaTime);
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].update();
    if (explosions[i].isFinished) explosions.splice(i, 1);
  }

  // 5. 커스텀 시나리오 로직
  if (currentScenarioUpdater) currentScenarioUpdater(deltaTime);

  // 6. 배경 회전 및 카메라 추적
  if (universeMesh) universeMesh.rotation.y += 0.0001;
  
  if (!isGiantImpactPlaying && followTarget) {
      const targetPos = new THREE.Vector3();
      followTarget.getWorldPosition(targetPos);
      controls.target.lerp(targetPos, 0.05);
      
      const dist = camera.position.distanceTo(targetPos);
      if (dist > 40) {
          const dir = new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
          camera.position.lerp(targetPos.clone().add(dir.multiplyScalar(40)), 0.05);
      }
  }

  controls.update();
  renderer.render(scene, camera);
}

// 초기화: 태양계로 시작
// createSceneFromData({ scenarioType: 'solar_system', objects: [] });
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});