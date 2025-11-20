import { Planet } from '../planet.js';

export function initCollisionScene(scene, world, loader) {
    const planets = [];

    // 1. 왼쪽 행성 (오른쪽으로 이동)
    const p1 = new Planet(scene, world, loader, {
        name: 'LeftStriker',
        size: 3,
        mass: 10,
        textureKey: 'Mars', // textureData.js에 키가 있어야 함 (없으면 기본값)
        position: { x: -30, y: 0, z: 0 },
        velocity: { x: 15, y: 0, z: 0 } // +x 방향 속도
    }, 'collision');

    // 2. 오른쪽 행성 (왼쪽으로 이동)
    const p2 = new Planet(scene, world, loader, {
        name: 'RightStriker',
        size: 3,
        mass: 10,
        textureKey: 'Venus',
        position: { x: 30, y: 0, z: 0 },
        velocity: { x: -15, y: 0, z: 0 } // -x 방향 속도
    }, 'collision');

    planets.push(p1, p2);

    // 충돌 지점을 잘 볼 수 있는 카메라 위치 반환
    return { 
        planets, 
        cameraPosition: { x: 0, y: 20, z: 60 } 
    };
}