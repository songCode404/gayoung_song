// public/scenarios/SceneLunarEclipse.js

import { Planet } from '../planet.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es'
 
/**
 * 월식 장면을 초기화합니다. (Sun -> Earth -> Moon 정렬)
 * @returns {Object} { planets: Planet[], cameraPosition: {x, y, z} }
 */
export function initLunarEclipseScene(scene, world, loader, aiData) {
    console.log("🌕 [SceneLunarEclipse] 함수 실행되었습니다.");
    const planets = [];
    const SCENARIO_TYPE = 'lunar_eclipse';

    // --- 설정 상수 ---
    const SCALE_DISTANCE = 30; 
    const SCALE_SIZE = 1;      

    // --- 기본 천체 데이터 ---
    const sunData = { name: 'Sun', textureKey: 'Sun', size: SCALE_SIZE * 20,};// mass: 10000 
    const earthData = { name: 'Earth', textureKey: 'Earth', size: SCALE_SIZE * 1.5, };//mass: 100 
    const moonData = { name: 'Moon', textureKey: 'Moon', size: SCALE_SIZE * 0.5, };//mass: 5 

    // --- 1. 위치/속도 설정 (월식 정렬) ---
    
    // A. 태양: 멀리 떨어진 광원
    sunData.position = { x: 0, y: 0, z: -SCALE_DISTANCE * 3 };
    sunData.velocity = { x: 0, y: 0, z: 0 };

    // B. 지구: 그림자를 만드는 주체 (태양과 달 사이)
    earthData.position = { x: 0, y: 0, z: -SCALE_DISTANCE * 0.2 }; 
    earthData.velocity = { x: 0, y: 0, z: 0 }; 

    // C. 달: 지구 그림자 영역에 위치 (지구 뒤)
    moonData.position = { x: 3, y: 0, z: 0 }; 
    moonData.velocity = { x: 0, y: 0, z: 0 }; // 서서히 그림자 속으로 진입

    // --- 2. 행성 생성 ---
    // Planet 클래스 생성 시 내부적으로 Three.js Mesh와 CANNON.js Body가 생성됩니다.
    const sun = new Planet(scene, world, loader, sunData, SCENARIO_TYPE);
    const earth = new Planet(scene, world, loader, earthData, SCENARIO_TYPE);
    const moon = new Planet(scene, world, loader, moonData, SCENARIO_TYPE);
    
    planets.push(sun, earth, moon);

    moon.body.velocity = new CANNON.Vec3(0,0,0);
    moonData.position.x = 0;

    // --- 3. 그림자 설정 (핵심 로직) ---
    // main.js에서 sunLight.castShadow = true;가 설정되었다고 가정합니다.

    //태양광 조명 설정
    const sunLight = new THREE.DirectionalLight(0xffffff, 3);
    sunLight.distance = 0;

    if(sun.body){
        sunLight.position.copy(sun.body.position);
    }
    else{
        sunLight.position.set(sunData.position.x, sunData.position.y, sunData.position.z);
    }
    sunLight.castShadow = true;
    sunLight.target.position.set(0, 0, 0);
    scene.add(sunLight)
    scene.add(sunLight.target);
    
    // 지구: 그림자를 던져야 함
    if (earth.mesh) {
        earth.mesh.castShadow = true; 
        console.log("✅ 지구 castShadow 활성화.");
    }

    // 달: 지구의 그림자를 받아야 함
    if (moon.mesh) {
        moon.mesh.receiveShadow = true;
        console.log("✅ 달 receiveShadow 활성화.");
    }

    // --- 4. 카메라 설정 ---
    const cameraPosition = { x: SCALE_DISTANCE * 3, y: SCALE_SIZE * 4, z: -SCALE_DISTANCE * 1 };
    const setupControls = (camera, controls) => { // ✨ controls 객체를 받도록 수정
        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                if (earth.mesh && moon.body) { // ✨ moon.body의 존재 여부 확인

                    const earthPos = earth.mesh.position;
                    
                    // 1. 카메라 위치 이동
                    camera.position.set(
                        earthPos.x,
                        earthPos.y,
                        earthPos.z
                    );
                    
                    // 2. OrbitControls 타겟 업데이트
                    controls.target.copy(moonData.position); // 컨트롤 타겟을 지구 중심으로 설정
                    controls.update();
                    
                    // 3. ✨ 월식 애니메이션 시작 (달의 속도 설정)
                    const moonVelocity = new CANNON.Vec3(-1, 0, 0); // X축 음수 방향으로 이동
                    moon.body.velocity.copy(moonVelocity); 
                    
                    console.log("📸 카메라 이동 및 월식 애니메이션 시작.");
                } else {
                    console.warn("⚠️ 행성 Mesh/Body가 정의되지 않아 카메라 이동/애니메이션 불가.");
                }
            }
        };
        
        window.addEventListener('keydown', handleKeydown);

        // Scene 종료 시 리스너를 정리할 함수 반환
        return () => {
            window.removeEventListener('keydown', handleKeydown);
            console.log("🧹 월식 Scene 컨트롤이 정리되었습니다.");
        };
    };

    return { 
        planets, 
        cameraPosition,
        setupControls
    };
}