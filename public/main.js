import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Planet } from './planet.js';
import { getJsonFromAI } from './AIClient.js'; 

// ★ 시나리오 파일들 Import
import { initCollisionScene } from './scenarios/SceneCollision.js';
import { initSolarSystem } from './scenarios/SceneSolarSystem.js';
import { initBirthScene } from './scenarios/SceneBirth.js';

// ==========================================
// 1. 기본 씬(Scene) 설정
// ==========================================
const canvas = document.querySelector('#three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 50, 100);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 2, 1000);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// ==========================================
// 2. 물리 월드(Physics) 설정
// ==========================================
const world = new CANNON.World();
world.gravity.set(0, 0, 0); 
world.broadphase = new CANNON.NaiveBroadphase();

// ==========================================
// 3. 상태 관리 변수
// ==========================================
let planets = []; 
let currentScenarioType = ''; 

// ==========================================
// 4. 유틸리티 함수들
// ==========================================

// (1) 화면 초기화 (청소)
function resetScene() {
    for (const p of planets) {
        p.dispose();
    }
    planets = [];
}

// (2) AI 데이터 + 시나리오 파일 결합 (★ 디버깅 핵심 구역)
async function createSceneFromData(aiData) {
    resetScene(); 

    // 🔍 [디버그 3] 데이터 수신 확인
    console.log("📦 [Debug] 3. createSceneFromData 함수 진입. 받은 데이터:", aiData);

    if (!aiData || !aiData.scenarioType) {
        console.error("🚨 [Error] 데이터에 scenarioType이 없습니다!");
        return;
    }

    // ★ 대소문자 및 공백 제거 (안전장치)
    const safeScenarioType = aiData.scenarioType.toLowerCase().trim();
    
    // 🔍 [디버그 4] 변환된 타입 확인
    console.log(`🧐 [Debug] 4. 변환된 시나리오 타입: '${safeScenarioType}' (원본: ${aiData.scenarioType})`);

    currentScenarioType = safeScenarioType;
    let setupData = null;
    const loader = new THREE.TextureLoader();

    // ★ switch 문에서 safeScenarioType을 사용해야 합니다!
    switch (safeScenarioType) {
        case 'collision':
            console.log("⚡ [Debug] 5. 'collision' 케이스 당첨! -> 파일 로딩 시작");
            setupData = initCollisionScene(scene, world, loader, aiData);
            break;

        case 'solar_system':
        case 'orbit':
        case 'solar_eclipse':
        case 'lunar_eclipse':
            console.log(`☀️ [Debug] 5. '${safeScenarioType}' 케이스 당첨! -> 파일 로딩 시작`);
            setupData = initSolarSystem(scene, world, loader, aiData);
            break;

        case 'planet_birth':
            console.log("🌱 [Debug] 5. 'planet_birth' 케이스 당첨! -> 파일 로딩 시작");
            setupData = initBirthScene(scene, world, loader, aiData);
            break;

        default:
            console.warn(`⚠️ [Debug] 5. Switch문에 없는 타입입니다: '${safeScenarioType}'`);
            console.log("🤖 [Debug] 시나리오 파일 없이 AI 데이터로 직접 생성합니다.");
            
            setupData = { 
                planets: [], 
                cameraPosition: aiData.cameraPosition 
            };
            
            if (aiData.objects) {
                for (const objData of aiData.objects) {
                    const p = new Planet(scene, world, loader, objData, currentScenarioType);
                    planets.push(p);
                }
            }
            break;
    }

    // 시나리오 파일에서 반환된 데이터 적용
    if (setupData) {
        if (setupData.planets && setupData.planets.length > 0) {
            console.log(`✅ [Debug] 6. 파일에서 행성 ${setupData.planets.length}개 로드 성공`);
            planets = setupData.planets;
        } else {
            console.log("ℹ️ [Debug] 6. 파일에서 생성된 행성이 없거나 직접 생성 모드입니다.");
        }

        const camPos = setupData.cameraPosition || aiData.cameraPosition;
        if (camPos) {
            camera.position.set(camPos.x, camPos.y, camPos.z);
            camera.lookAt(0, 0, 0);
        }
    }
}

// (3) 만유인력 적용
function applyGravity() {
    if (currentScenarioType === 'collision' || currentScenarioType === 'planet_birth') return;

    if (planets.length < 2) return;
    
    const sortedPlanets = [...planets].sort((a, b) => b.mass - a.mass);
    const star = sortedPlanets[0]; 

    const G = 100; 

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

// ==========================================
// 5. 사용자 입력 처리
// ==========================================
const inputField = document.getElementById('user-input'); 
const sendBtn = document.getElementById('send-btn');    
const statusDiv = document.getElementById('ai-status'); 

async function handleUserRequest() {
    const text = inputField.value;
    // 🔍 [디버그 1] 버튼 클릭 확인
    console.log(`🖱️ [Debug] 1. 버튼 클릭됨. 입력값: "${text}"`);
    
    if (!text) return;

    try {
        statusDiv.innerText = "AI가 생각 중... 🤔";
        sendBtn.disabled = true;

        // 1. AI에게 질문
        const scenarioData = await getJsonFromAI(text);
        
        // 🔍 [디버그 2] AI 응답 확인
        console.log("🤖 [Debug] 2. AI 응답 도착:", scenarioData);

        // 2. 씬 구성
        await createSceneFromData(scenarioData);

        statusDiv.innerText = `✅ 적용 완료: ${scenarioData.scenarioType}`;
        
    } catch (error) {
        console.error("🚨 [Error] 처리 중 오류 발생:", error);
        statusDiv.innerText = "🚨 오류 발생! 콘솔을 확인하세요.";
    } finally {
        sendBtn.disabled = false;
        inputField.value = ''; 
    }
}

if (sendBtn && inputField) {
    sendBtn.addEventListener('click', handleUserRequest);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserRequest();
    });
}

// ==========================================
// 6. 애니메이션 루프
// ==========================================
const clock = new THREE.Clock();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();

    applyGravity(); 
    world.step(1 / 60);

    for (let i = planets.length - 1; i >= 0; i--) {
        const p = planets[i];
        p.update(deltaTime);

        if (p.isDead) {
            p.dispose();
            planets.splice(i, 1);
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

// 초기 실행
createSceneFromData({ 
    scenarioType: 'solar_system', 
    objects: [] 
});

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});