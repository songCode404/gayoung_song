import { Planet } from '../planet.js';

// 시나리오 전용 상수 (main.js에서 import해서 쓸 수 있게 export)
export const G = 100; 

export function initSolarSystem(scene, world, loader) {
    const planets = [];

    // 1. 태양 (중심, 정지)
    const sun = new Planet(scene, world, loader, {
        name: 'Sun',
        textureKey: 'Sun',
        size: 6,
        mass: 1000, // 매우 무거움
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 }
    }, 'solar_system');

    planets.push(sun);

    // 2. 지구 (공전)
    const r = 50; // 태양과의 거리
    // 원운동 속도 공식: v = sqrt(G * M_sun / r)
    const orbitalSpeed = Math.sqrt((G * sun.mass) / r);

    const earth = new Planet(scene, world, loader, {
        name: 'Earth',
        textureKey: 'Earth',
        size: 2,
        mass: 1,
        position: { x: r, y: 0, z: 0 }, 
        velocity: { x: 0, y: 0, z: orbitalSpeed } // z축(접선) 방향으로 발사
    }, 'solar_system');

    planets.push(earth);

    // 전체 궤도를 내려다보는 Top-Down 뷰
    return { 
        planets, 
        cameraPosition: { x: 0, y: 120, z: 0 } 
    };
}