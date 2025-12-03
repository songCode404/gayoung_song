// public/scenarios/SceneSolarEclipse.js

import { Planet } from '../planet.js';
import * as THREE from 'three'; // ✨ THREE 객체를 사용하려면 import 필요
import * as CANNON from 'cannon-es'

/**
 * 개기일식 장면을 초기화합니다. (Sun -> Moon -> Earth 정렬)
 * @returns {Object} { planets: Planet[], cameraPosition: {x, y, z} }
 */
export function initSolarEclipseScene(scene, world, loader, aiData) {
    console.log("🌑 [SceneSolarEclipse] 함수 실행되었습니다.");
    const planets = [];
    const SCENARIO_TYPE = 'solar_eclipse';

    // --- 설정 상수 ---
    const SCALE_DISTANCE = 30; 
    const SCALE_SIZE = 1;      

    // --- 기본 천체 데이터 ---
    const sunData = { name: 'Sun', textureKey: 'Sun', size: SCALE_SIZE * 20};//, mass: 10000 
    const earthData = { name: 'Earth', textureKey: 'Earth', size: SCALE_SIZE * 1.5};//, mass: 100 
    const moonData = { name: 'Moon', textureKey: 'Moon', size: SCALE_SIZE * 0.5};//, mass: 5 

    // --- 1. 위치/속도 설정 (일식 정렬) ---
    
    // A. 태양: 멀리 떨어진 광원 (Z축 음수 방향)
    sunData.position = { x: 0, y: 0, z: -SCALE_DISTANCE * 10 }; 
    sunData.velocity = { x: 0, y: 0, z: 0 };

    // B. 지구: 관찰 기준점 (중앙)
    earthData.position = { x: 0, y: 0, z: 0 };
    earthData.velocity = { x: 0, y: 0, z: 0 }; 

    // C. 달: 지구와 태양 사이에 위치하여 태양을 가림
    moonData.position = { x: 0, y: 0, z: -SCALE_SIZE * 5 }; 
    moonData.velocity = { x: 0, y: 0, z: 0 }; // 서서히 이동하며 일식 진행

    // --- 2. 행성 생성 ---

    const sun = new Planet(scene, world, loader, sunData, SCENARIO_TYPE);
    const earth = new Planet(scene, world, loader, earthData, SCENARIO_TYPE);
    const moon = new Planet(scene, world, loader, moonData, SCENARIO_TYPE);

    planets.push(sun, earth, moon); // 인스턴스를 배열에 추가

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
    
    // ✨ 수정: moon과 earth 인스턴스의 mesh 속성에 접근합니다.
    // 안전을 위해 객체가 존재하는지 확인합니다.
    if (moon.mesh) {
        moon.mesh.castShadow = true; // 달이 그림자를 던져 태양을 가림
    }
    if (earth.mesh) {
        earth.mesh.receiveShadow = true; // 지구가 달의 그림자를 받음
    }
    scene.add(sunLight);

    // --- 3. 카메라 설정 ---
    const cameraPosition = { x: 0, y: SCALE_SIZE * 10, z: SCALE_DISTANCE * 3 }; 

    const setupControls = (camera, controls) => { // ✨ controls 객체를 받도록 수정
            const handleKeydown = (event) => {
                if (event.key === 'Enter') {
                    if (earth.mesh && moon.body) { // ✨ moon.body의 존재 여부 확인

                        moon.body.position = new CANNON.Vec3(3, 0, -SCALE_SIZE * 5 );
    
                        const earthPos = earth.mesh.position;
                        
                        // 1. 카메라 위치 이동
                        camera.position.set(
                            earthPos.x,
                            earthPos.y,
                            earthPos.z
                        );
                        
                        // 2. OrbitControls 타겟 업데이트
                        controls.target.copy(sunData.position); // 컨트롤 타겟을 지구 중심으로 설정
                        controls.update();
                        
                        // 3. ✨ 일식 애니메이션 시작 (달의 속도 설정)
                        const moonVelocity = new CANNON.Vec3(-0.7, 0, 0); // X축 음수 방향으로 이동
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