import { Planet } from '../planet.js';

export function initBirthScene(scene, world, loader) {
    const planets = [];
    const count = 10; // 생성할 행성 개수

    for (let i = 0; i < count; i++) {
        // 랜덤 위치 (-30 ~ 30)
        const px = (Math.random() - 0.5) * 60;
        const pz = (Math.random() - 0.5) * 60;
        
        const planet = new Planet(scene, world, loader, {
            name: `BabyPlanet_${i}`,
            textureKey: Math.random() > 0.5 ? 'Earth' : 'Mars', // 랜덤 텍스처
            size: 2 + Math.random() * 2, // 크기 2~4
            mass: 1,
            position: { x: px, y: 0, z: pz },
            velocity: { x: 0, y: 0, z: 0 } // 제자리 생성
        }, 'planet_birth'); // ★ 이 플래그가 있어야 성장 애니메이션 발동

        planets.push(planet);
    }

    // 전체적으로 흩어진 행성들을 보기 좋은 쿼터뷰
    return { 
        planets, 
        cameraPosition: { x: 0, y: 60, z: 60 } 
    };
}