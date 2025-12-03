import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Planet } from './planet.js';
import { getJsonFromAI } from './AIClient.js'; 

// ★ 시나리오 파일들 Import
import { initCollisionScene } from './scenarios/SceneCollision.js';
import { initSolarSystem } from './scenarios/SceneSolarSystem.js';
import { initBirthScene } from './scenarios/SceneBirth.js';
//import { initGiantImpact } from './scenarios/SceneGiantImpact.js';

// ==========================================
// 1. 기본 씬(Scene) 설정
// ==========================================
const canvas = document.querySelector('#three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); 

// 카메라 초기 설정
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 50, 100);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 2, 1000);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// ==========================================
// ★ 우주 배경 (Sky Sphere)
// ==========================================
function createUniverse() {
    const loader = new THREE.TextureLoader();
    const geometry = new THREE.SphereGeometry(2000, 64, 64);
    const texture = loader.load('/assets/textures/galaxy.png', undefined, undefined, (err) => {
        console.warn("배경 이미지를 찾을 수 없습니다. (/textures/galaxy.png)");
    });
    
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide 
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    return mesh;
}

const universeMesh = createUniverse();

// ==========================================
// 2. 물리 월드 & 변수
// ==========================================
const world = new CANNON.World();
world.gravity.set(0, 0, 0); 
world.broadphase = new CANNON.NaiveBroadphase();

let planets = []; 
let currentScenarioType = ''; 
let currentScenarioUpdater = null;

// ★ [추가] 카메라 추적용 변수
let followTarget = null; // 현재 따라다니고 있는 행성 (없으면 null)
const originalCameraPosition = new THREE.Vector3(0, 400, 550); // 리셋용 위치

// ==========================================
// 3. 유틸리티 함수들
// ==========================================

function resetScene() {
    currentScenarioUpdater = null;
    followTarget = null; // 추적 해제

    for (const p of planets) {
        if (p.dispose) p.dispose();
    }
    planets = [];

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
    console.log("🧹 씬 초기화 완료");
}

async function createSceneFromData(aiData) {
    resetScene(); 

    if (!aiData || !aiData.scenarioType) {
        console.error("🚨 데이터 오류: scenarioType 없음");
        return;
    }

    const safeScenarioType = aiData.scenarioType.toLowerCase().trim();
    currentScenarioType = safeScenarioType;
    let setupData = null;
    const loader = new THREE.TextureLoader();

    switch (safeScenarioType) {
        case 'collision':
            setupData = initCollisionScene(scene, world, loader, aiData);
            break;
        case 'solar_system':
        case 'orbit':
        case 'solar_eclipse':
        case 'lunar_eclipse':
            setupData = initSolarSystem(scene, world, loader, aiData);
            break;
        case 'planet_birth':
            setupData = initBirthScene(scene, world, loader, aiData);
            break;
        default:
            setupData = { planets: [], cameraPosition: aiData.cameraPosition };
            if (aiData.objects) {
                for (const objData of aiData.objects) {
                    const p = new Planet(scene, world, loader, objData, currentScenarioType);
                    planets.push(p);
                }
            }
            break;
    }

    if (setupData) {
        if (setupData.planets) planets = setupData.planets;
        
        if (setupData.update && typeof setupData.update === 'function') {
            currentScenarioUpdater = setupData.update;
        }

        const camPos = setupData.cameraPosition || aiData.cameraPosition;
        if (camPos) {
            // 기본 카메라 위치 저장
            originalCameraPosition.set(camPos.x, camPos.y, camPos.z);
            camera.position.copy(originalCameraPosition);
            camera.lookAt(0, 0, 0);
            controls.target.set(0, 0, 0); // 컨트롤 타겟 초기화
        }
    }
}

function applyGravity() {
    if (currentScenarioType === 'collision' || currentScenarioType === 'planet_birth') return;
    if (planets.length < 2) return;
    
    const sortedPlanets = [...planets].sort((a, b) => b.mass - a.mass);
    const star = sortedPlanets[0]; 
    const G = 100; 

    for (let i = 1; i < sortedPlanets.length; i++) {
        const planet = sortedPlanets[i];
        if(!planet.body) continue;

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
// 4. 사용자 입력 처리
// ==========================================
const inputField = document.getElementById('user-input'); 
const sendBtn = document.getElementById('send-btn');    
const statusDiv = document.getElementById('ai-status'); 

async function handleUserRequest() {
    const text = inputField.value;
    if (!text) return;

    try {
        statusDiv.innerText = "AI가 생각 중... 🤔";
        sendBtn.disabled = true;

        const scenarioData = await getJsonFromAI(text);
        await createSceneFromData(scenarioData);

        statusDiv.innerText = `✅ 적용 완료: ${scenarioData.scenarioType}`;
    } catch (error) {
        console.error("🚨 오류:", error);
        statusDiv.innerText = "오류 발생!";
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
// ★ [업그레이드] 클릭 시 줌인 & 추적 (Zoom & Follow)
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const infoBox = document.getElementById('planet-info'); 
const infoTitle = document.getElementById('info-title');
const infoDesc = document.getElementById('info-desc');

const planetDescriptions = {
    'sun': '태양계의 중심이자 유일한 별입니다.',
    'mercury': '태양과 가장 가까운 행성입니다.',
    'venus': '가장 뜨거운 행성입니다.',
    'earth': '우리가 사는 푸른 행성입니다.',
    'moon': '지구의 위성입니다.',
    'mars': '붉은 행성입니다.',
    'jupiter': '태양계 최대의 가스 행성입니다.',
    'saturn': '아름다운 고리를 가진 행성입니다.',
    'uranus': '누워서 자전하는 얼음 거인입니다.',
    'neptune': '태양계 끝자락의 푸른 행성입니다.',
    'pluto': '명왕성(Pluto)'
};

// 드래그와 클릭 구분을 위한 변수
let isDragging = false;
let mouseDownTime = 0;

window.addEventListener('pointerdown', () => {
    isDragging = false;
    mouseDownTime = Date.now();
});

window.addEventListener('pointermove', () => {
    isDragging = true;
});

window.addEventListener('pointerup', (event) => {
    // 1. 드래그(회전)였다면 클릭으로 인정 안 함
    const clickDuration = Date.now() - mouseDownTime;
    if (isDragging && clickDuration > 200) return; 
    
    if (!infoBox) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        let foundName = null;

        // 텍스처 이름으로 식별
        if(object.material && object.material.map && object.material.map.source) {
             const src = object.material.map.source.data.src || '';
             if (typeof src === 'string') {
                 const match = src.match(/\/([^\/]+)\.(jpg|png)/i);
                 if(match && match[1]) {
                     foundName = match[1].replace('2k_', '').toLowerCase();
                     if(foundName.includes('earth')) foundName = 'earth';
                 }
             }
        }

        if (foundName && planetDescriptions[foundName]) {
            // ★ 클릭한 행성을 추적 대상으로 설정!
            // (부모가 있으면 부모를 추적 - 예: 토성 고리 클릭 시 토성 본체 추적)
            followTarget = object;

            // 설명창 표시
            infoTitle.innerText = foundName.toUpperCase();
            infoDesc.innerText = planetDescriptions[foundName];
            infoBox.style.display = 'block';
            infoBox.style.left = event.clientX + 10 + 'px';
            infoBox.style.top = event.clientY + 10 + 'px';
            
            console.log(`🔭 추적 시작: ${foundName}`);
        } else {
            // 배경이나 궤도 선 클릭 시 -> 추적 해제 및 전체 뷰 복귀
            followTarget = null;
            infoBox.style.display = 'none';
            console.log("🔭 추적 해제 (전체 뷰)");
        }
    } else {
        // 허공 클릭 시 -> 추적 해제
        followTarget = null;
        infoBox.style.display = 'none';
        console.log("🔭 추적 해제 (전체 뷰)");
    }
});

// ==========================================
// 6. 애니메이션 루프
// ==========================================
const clock = new THREE.Clock();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (universeMesh) universeMesh.rotation.y += 0.0001; 

    applyGravity(); 
    world.step(1 / 60);

    for (let i = planets.length - 1; i >= 0; i--) {
        const p = planets[i];
        if(p.update) p.update(deltaTime);
        if (p.isDead) {
            if(p.dispose) p.dispose();
            planets.splice(i, 1);
        }
    }

    if (currentScenarioUpdater) {
        currentScenarioUpdater(deltaTime); 
    }

    // ★ [카메라 추적 로직]
    if (followTarget) {
        // 1. 타겟 행성의 현재 위치 가져오기 (월드 좌표)
        const targetPos = new THREE.Vector3();
        followTarget.getWorldPosition(targetPos);

        // 2. 컨트롤의 중심(Focus)을 행성으로 부드럽게 이동
        controls.target.lerp(targetPos, 0.05);
        
        // 3. (옵션) 카메라도 행성에 바짝 붙게 하고 싶다면?
        // 하지만 사용자가 줌인/아웃을 자유롭게 하려면 controls.target만 옮기는 게 자연스러움.
        // 여기서는 자동으로 가까워지는 효과를 위해 거리를 체크해서 당겨줌
        const dist = camera.position.distanceTo(targetPos);
        if (dist > 30) { // 너무 멀면 좀 당겨줌 (줌인 효과)
            const dir = new THREE.Vector3().subVectors(camera.position, targetPos).normalize();
            const newPos = targetPos.clone().add(dir.multiplyScalar(30)); // 목표 거리 30
            camera.position.lerp(newPos, 0.05);
        }

    } else {
        // 추적 대상이 없으면? (리셋 상태)
        // 컨트롤 타겟을 다시 원점(0,0,0)으로
        controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
        
        // 카메라도 원래 자리로 슬슬 돌아감 (선택 사항)
        // camera.position.lerp(originalCameraPosition, 0.02);
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});