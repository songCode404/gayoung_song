// public/js/main.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getJsonFromAI } from './AIClient.js';
import { Planet } from './planet.js';

// --- 1. 기본 설정 ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 30, 100); // 초기 위치

const canvas = document.querySelector('#three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 조명
scene.add(new THREE.AmbientLight(0x222222)); // 우주 배경광
const sunLight = new THREE.PointLight(0xffffff, 2.0, 0);
sunLight.position.set(0, 0, 0); // 태양 위치
scene.add(sunLight);

const textureLoader = new THREE.TextureLoader();
const world = new CANNON.World();
world.gravity.set(0, 0, 0); // 무중력

let planets = [];

// --- 2. ★ 시나리오별 카메라 연출 ---
function handleCameraScenario(type) {
  console.log(`🎬 시나리오 모드: [${type}]`);

  switch (type) {
    case 'solar_eclipse': // 개기일식
    case 'lunar_eclipse': // 개기월식
      // 측면에서 일직선을 봐야 함
      camera.position.set(0, 0, 100); 
      camera.lookAt(0, 0, 0);
      break;

    case 'orbit': // 자전 및 공전
      // 위에서 널찍하게 궤도를 조망
      camera.position.set(0, 80, 120);
      camera.lookAt(0, 0, 0);
      break;

    case 'planet_birth': // 탄생
      // 가까이서 웅장하게
      camera.position.set(0, 10, 40);
      camera.lookAt(0, 0, 0);
      break;

    case 'collision': // 충돌
      // 대각선 위에서
      camera.position.set(0, 40, 80);
      camera.lookAt(0, 0, 0);
      break;

    default:
      camera.position.set(0, 30, 100);
      camera.lookAt(0, 0, 0);
      break;
  }
}

// --- 3. 루프 ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();

  world.step(1 / 60, deltaTime, 3);

  planets = planets.filter(planet => {
    planet.update(deltaTime);
    if (planet.isDead) {
      planet.dispose();
      return false;
    }
    return true;
  });

  renderer.render(scene, camera);
}
animate();

// --- 4. 입력 처리 ---
const generateButton = document.getElementById('generate-button');
const promptInput = document.getElementById('prompt-input');
const statusText = document.getElementById('status');

generateButton.addEventListener('click', async () => {
  const userInput = promptInput.value?.trim();
  if (!userInput) return;

  statusText.textContent = 'AI가 시나리오를 생성 중입니다...';
  generateButton.disabled = true;

  try {
    // 초기화
    planets.forEach(p => p.dispose());
    planets = [];

    // AI 데이터 수신
    const jsonData = await getJsonFromAI(userInput);
    const scenarioType = jsonData.scenarioType || 'orbit';
    
    // 데이터 배열 처리
    const objectList = Array.isArray(jsonData.objects) ? jsonData.objects : [jsonData.objects];

    // 행성 생성 (scenarioType을 넘겨줘서 탄생 여부 판단)
    objectList.forEach(data => {
      planets.push(new Planet(scene, world, textureLoader, data, scenarioType));
    });

    // 카메라 조정
    handleCameraScenario(scenarioType);
    statusText.textContent = `모드: ${scenarioType}`;

  } catch (err) {
    console.error(err);
    statusText.textContent = '오류 발생!';
  } finally {
    generateButton.disabled = false;
  }
});

// 리사이즈
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 마우스 회전 (Scene 전체)
let isDragging = false;
window.addEventListener('mousedown', () => isDragging = true);
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    scene.rotation.y += e.movementX * 0.005;
    scene.rotation.x += e.movementY * 0.005;
  }
});