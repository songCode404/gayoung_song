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
// ★ 우주 배경 (Sky Sphere) 생성
// ==========================================
function createUniverse() {
    const loader = new THREE.TextureLoader();
    
    // 1. 아주 거대한 구를 만듭니다 (반지름 1700)
    const geometry = new THREE.SphereGeometry(1700, 64, 64);
    
    // 2. 우주 이미지를 로드합니다 (경로 주의: /textures/)
    const texture = loader.load('/assets/textures/galaxy.png', 
        () => console.log("🌌 우주 배경 로드 성공"),
        undefined,
        (err) => console.error("🚨 우주 배경 로드 실패:", err)
    );
    
    // 3. 재질 설정 (안쪽 면 렌더링)
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide 
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    return mesh;
}

// 배경 생성 및 변수에 저장
const universeMesh = createUniverse();

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
let currentScenarioUpdater = null; // 시나리오 전용 업데이트 함수

// ==========================================
// 4. 유틸리티 함수들
// ==========================================

// (1) 화면 초기화 (강력한 청소)
function resetScene() {
    // 1. 시나리오 애니메이션 끊기
    currentScenarioUpdater = null;

    // 2. 물리 엔진용 행성 비우기
    for (const p of planets) {
        if (p.dispose) p.dispose();
    }
    planets = [];

    // 3. ★ 화면(Scene)에 그려진 객체 강제 삭제
    // (우주 배경, 조명, 카메라는 보호)
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];

        // 보호 구역: 조명, 카메라, 우주 배경
        if (obj.isLight || obj.isCamera || obj === universeMesh) continue;

        // 그 외(이전 행성, 궤도 선, 파티클 등) 삭제
        scene.remove(obj);

        // 메모리 해제
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
    }
    
    console.log("🧹 씬 초기화 완료");
}

// (2) AI 데이터 + 시나리오 파일 결합
async function createSceneFromData(aiData) {
    resetScene(); 

    console.log("📦 [Debug] 받은 데이터:", aiData);

    if (!aiData || !aiData.scenarioType) {
        console.error("🚨 [Error] 데이터 오류: scenarioType 없음");
        return;
    }

    const safeScenarioType = aiData.scenarioType.toLowerCase().trim();
    console.log(`🧐 [Debug] 시나리오 타입: '${safeScenarioType}'`);

    currentScenarioType = safeScenarioType;
    let setupData = null;
    const loader = new THREE.TextureLoader();

    // ★ 시나리오 선택
    switch (safeScenarioType) {
        case 'collision':
            console.log("⚡ 충돌 시나리오 로딩");
            setupData = initCollisionScene(scene, world, loader, aiData);
            break;

        case 'solar_system':
        case 'orbit':
        case 'solar_eclipse':
        case 'lunar_eclipse':
            console.log("☀️ 태양계 시나리오 로딩");
            setupData = initSolarSystem(scene, world, loader, aiData);
            break;

        case 'planet_birth':
            console.log("🌱 탄생 시나리오 로딩");
            setupData = initBirthScene(scene, world, loader, aiData);
            break;

        default:
            console.warn(`⚠️ 알 수 없는 타입: '${safeScenarioType}' -> 기본 생성`);
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

    // ★ 설정 적용
    if (setupData) {
        // 행성 리스트 갱신
        if (setupData.planets && setupData.planets.length > 0) {
            planets = setupData.planets;
        }

        // ★ 시나리오 전용 업데이트 함수 연결 (폭발, 공전 등)
        if (setupData.update && typeof setupData.update === 'function') {
            console.log("⚡ 시나리오 전용 애니메이션 연결됨");
            currentScenarioUpdater = setupData.update;
        }

        // 카메라 이동
        const camPos = setupData.cameraPosition || aiData.cameraPosition;
        if (camPos) {
            camera.position.set(camPos.x, camPos.y, camPos.z);
            camera.lookAt(0, 0, 0);
        }
    }
}

// (3) 만유인력 적용 (물리 기반 모드일 때만)
function applyGravity() {
    // 충돌이나 탄생 모드 등에서는 중력 끄기 (시나리오가 알아서 함)
    if (currentScenarioType === 'collision' || currentScenarioType === 'planet_birth') return;

    if (planets.length < 2) return;
    
    const sortedPlanets = [...planets].sort((a, b) => b.mass - a.mass);
    const star = sortedPlanets[0]; 

    const G = 100; 

    for (let i = 1; i < sortedPlanets.length; i++) {
        const planet = sortedPlanets[i];
        if(!planet.body) continue; // body가 없으면(시각적 모드 등) 건너뜀

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
    console.log(`🖱️ 버튼 클릭: "${text}"`);
    
    if (!text) return;

    try {
        statusDiv.innerText = "AI가 생각 중... 🤔";
        sendBtn.disabled = true;

        const scenarioData = await getJsonFromAI(text);
        console.log("🤖 AI 응답:", scenarioData);

        await createSceneFromData(scenarioData);

        statusDiv.innerText = `✅ 적용 완료: ${scenarioData.scenarioType}`;
        
    } catch (error) {
        console.error("🚨 오류:", error);
        statusDiv.innerText = "🚨 오류 발생! 콘솔 확인";
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

    // 1. 우주 배경 회전
    if (universeMesh) {
        universeMesh.rotation.y += 0.0001; 
    }

    // 2. 물리 엔진 업데이트
    applyGravity(); 
    world.step(1 / 60);

    // 3. 각 행성 업데이트
    for (let i = planets.length - 1; i >= 0; i--) {
        const p = planets[i];
        if(p.update) p.update(deltaTime);

        if (p.isDead) {
            if(p.dispose) p.dispose();
            planets.splice(i, 1);
        }
    }

    // 4. 시나리오 전용 애니메이션 (폭발, 궤도 공전 등)
    if (currentScenarioUpdater) {
        currentScenarioUpdater(deltaTime); 
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

// 화면 리사이즈 대응
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});