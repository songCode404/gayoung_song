// public/scenarios/SceneSolarSystem.js
import { Planet } from '../planet.js';

export const G = 100; 

export function initSolarSystem(scene, world, loader, aiData) {
    const planets = [];
    const objects = aiData?.objects || [];

    // 1. 태양 역할 (첫 번째 데이터)
    // 데이터가 없으면 기본 태양 사용
    const sunData = objects.find(o => o.name.toLowerCase().includes('sun')) || objects[0] || {
        name: 'Sun', textureKey: 'Sun', size: 6, mass: 500
    };

    const sun = new Planet(scene, world, loader, {
        ...sunData,
        position: { x: 0, y: 0, z: 0 }, // 태양은 무조건 중심
        velocity: { x: 0, y: 0, z: 0 }
    }, 'solar_system');
    planets.push(sun);

    // 2. 행성들 (나머지 데이터)
    // 태양을 제외한 나머지 객체들을 공전시킴
    const planetObjects = objects.filter(o => o !== sunData);
    
    // 만약 데이터가 없으면 기본 지구 하나 추가
    if (planetObjects.length === 0) {
        planetObjects.push({ name: 'Earth', textureKey: 'Earth', size: 2, mass: 1 });
    }

    let distance = 30; // 첫 행성 거리

    planetObjects.forEach((pData) => {
        // 공전 속도 자동 계산 (v = sqrt(GM/r))
        const speed = Math.sqrt((G * sun.mass) / distance);
        
        const p = new Planet(scene, world, loader, {
            ...pData, // AI가 준 텍스처, 크기 적용
            position: { x: distance, y: 0, z: 0 }, // 거리는 시나리오가 배치
            velocity: { x: 0, y: 0, z: speed }     // 속도는 물리 공식대로
        }, 'solar_system');
        
        planets.push(p);
        distance += 20; // 다음 행성은 더 멀리 배치
    });

    return { 
        planets, 
        cameraPosition: { x: 0, y: 100, z: 150 } 
    };
}