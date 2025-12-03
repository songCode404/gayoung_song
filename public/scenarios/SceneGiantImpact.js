// public/scenarios/SceneGiantImpact.js
import { Planet } from '../planet.js';
import * as THREE from 'three';

export function initGiantImpact(scene, world, loader, aiData) {
  const planets = [];

  // 1. 초기 지구 (가이아) - 화면 정중앙 근처
  const gaia = new Planet(
    scene,
    world,
    loader,
    {
      name: 'Gaia',
      textureKey: 'Mars',   // 식어가는 원시 지구 느낌
      size: 5,
      mass: 100,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
    'giant_impact'
  );

  // 표면 살짝 붉고 거칠게
  gaia.mesh.material.color.setHex(0xaa7770);
  gaia.mesh.material.roughness = 1.0;
  gaia.mesh.material.metalness = 0.0;
  planets.push(gaia);

  // 2. 테이아 – 카메라 입장에서 "왼쪽·앞쪽 위"에서 날아와
  //    지구 옆(앞쪽 측면)을 비스듬히 들이받도록 설정
  const theia = new Planet(
    scene,
    world,
    loader,
    {
      name: 'Theia',
      textureKey: 'Mars',
      size: 2.8,
      mass: 18,
      position: { x: -140, y: 18, z: 70 }, // 카메라 기준 왼쪽·앞쪽 위
      velocity: { x: 16, y: -4, z: -10 },  // 오른쪽·아래·약간 뒤로 = 지구 옆면 히트
    },
    'giant_impact'
  );

  theia.mesh.material.color.setHex(0xffffff);
  planets.push(theia);

  // 🔭 카메라를 지구 "약간 앞·오른쪽 위"에서 보게 해서
  //    충돌과 파편이 전부 옆에서 잘 보이도록.
  const cameraPosition = { x: 60, y: 35, z: 180 };
  const cameraLookAt = { x: 0, y: 0, z: 0 };

  return { planets, cameraPosition, cameraLookAt };
}