// public/scenarios/SceneCollision.js
import { Planet } from '../planet.js';

// ★ aiData 매개변수 추가! (여기로 JSON이 들어옵니다)
export function initCollisionScene(scene, world, loader, aiData) {
    //디버깅용 해당 함수가 잘 작동하는데 화면에 행성이 안나오는것인가?
    console.log("🚨 [SceneCollision] 함수가 실행되었습니다! 데이터:", aiData);
    const planets = [];
    
    // AI가 준 데이터에서 행성 목록을 가져옴 (없으면 기본값 사용)
    const objects = aiData?.objects || [];
    
    // [안전장치] 데이터가 부족할 경우를 대비한 기본 객체들
    const defaultP1 = { name: 'Player1', textureKey: 'Mars', size: 3, mass: 10 };
    const defaultP2 = { name: 'Player2', textureKey: 'Venus', size: 3, mass: 10 };

    const data1 = objects[0] || defaultP1;
    const data2 = objects[1] || defaultP2;

    // -----------------------------------------------------
    // ★ 시나리오 로직: "데이터는 AI가 주고, 위치/속도는 내가 정한다"
    // -----------------------------------------------------
    
    // 1. 왼쪽 행성 (AI가 준 첫 번째 행성 데이터 사용)
    const p1 = new Planet(scene, world, loader, {
        ...data1, // AI가 준 이름, 텍스처, 크기, 질량 덮어쓰기
        position: { x: -40, y: 0, z: 0 }, // 위치는 시나리오가 강제함 (충돌해야 하니까)
        velocity: { x: 20, y: 0, z: 0 }   // 속도도 시나리오가 강제함
    }, 'collision');

    // 2. 오른쪽 행성 (AI가 준 두 번째 행성 데이터 사용)
    const p2 = new Planet(scene, world, loader, {
        ...data2,
        position: { x: 40, y: 0, z: 0 },
        velocity: { x: -20, y: 0, z: 0 }
    }, 'collision');

    planets.push(p1, p2);

    // 카메라는 충돌이 잘 보이는 위치로 고정
    return { 
        planets, 
        cameraPosition: { x: 0, y: 30, z: 80 } 
    };
}