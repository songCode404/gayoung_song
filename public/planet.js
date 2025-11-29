import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// 숫자 변환 유틸리티
const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

export class Planet {
  constructor(scene, world, loader, data, scenarioType) {
    this.scene = scene;
    this.world = world;
    this.data = data;
    this.isDead = false;

    // 기본 속성
    this.radius = num(data.size, 5);
    this.mass = num(data.mass, 1);
    this.isStar = data.textureKey === 'Sun';

    // 시나리오별 설정
    this.isGrowing = (scenarioType === 'planet_birth'); 
    this.age = 0;
    this.maxAge = 120;

    // ====================================================
    // ★ 1. 메쉬(Mesh) 생성 로직
    // (충돌 오류 방지를 위해 Group 대신 단일 Mesh 사용)
    // ====================================================
    
    // 키값 대소문자 무시 비교 ('Earth', 'earth' 모두 허용)
    const key = data.textureKey ? data.textureKey.toLowerCase() : '';

    if (key === 'earth') {
        // 🌍 지구: 단일 메쉬 (구름 층 제거 -> 충돌 안정성 확보)
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        
        // 경로 수정: /assets/textures/ -> /textures/
        const material = new THREE.MeshPhongMaterial({
            map: loader.load('/assets/textures/earthmap1k.jpg'), 
            bumpMap: loader.load('/assets/textures/earthbump.jpg'),
            bumpScale: 0.15,
            specularMap: loader.load('/assets/textures/specularmap.jpg'),
            specular: new THREE.Color('grey')
        });
        
        this.mesh = new THREE.Mesh(geometry, material);

    } else {
        // 🪐 그 외 행성들
        let material;
        
        // 경로 수정: /assets/textures/ -> /textures/
        // 파일명 패턴: 2k_mars.jpg, 2k_jupiter.jpg 등
        const texturePath = `/assets/textures/2k_${key}.jpg`;

        if (this.isStar) {
            // 태양
            material = new THREE.MeshBasicMaterial({ 
                map: loader.load('/assets/textures/2k_sun.jpg') 
            });
        } else {
            // 일반 행성
            material = new THREE.MeshStandardMaterial({ 
                map: loader.load(texturePath, undefined, undefined, (err) => {
                    console.warn(`텍스처 로드 실패: ${texturePath}`);
                }),
                color: 0xffffff 
            });
        }
        
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 32, 32), material);
    }

    // 성장 애니메이션 초기값 설정
    if (this.isGrowing) {
        this.mesh.scale.set(0.01, 0.01, 0.01);
    } else {
        this.mesh.scale.set(1, 1, 1);
    }
    
    scene.add(this.mesh);

    // ====================================================
    // 2. 물리 엔진 (Body)
    // ====================================================
    const pos = data.position || { x: 0, y: 0, z: 0 };
    const vel = data.velocity || { x: 0, y: 0, z: 0 };

    this.body = new CANNON.Body({
      mass: this.mass,
      shape: new CANNON.Sphere(this.radius),
      position: new CANNON.Vec3(num(pos.x), num(pos.y), num(pos.z)),
      velocity: new CANNON.Vec3(num(vel.x), num(vel.y), num(vel.z)),
      linearDamping: 0,
      angularDamping: 0
    });

    // 자전축 기울기
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 23.5);
    
    world.addBody(this.body);

    // ====================================================
    // 3. 충돌 이벤트
    // ====================================================
    this.body.addEventListener("collide", (e) => {
        if (this.isStar) return; // 태양은 무적
        
        // ★ 충돌 시나리오에서는 이펙트를 위해 즉시 죽이지 않음
        if (scenarioType === 'collision') {
            return; 
        }

        console.log(`💥 ${data.name || 'Planet'} 충돌!`);
        this.isDead = true; 
    });
  } 
  
  update(deltaTime) {
    if (this.body.isMarkedForRemoval) this.isDead = true;

    // 1. 성장 애니메이션
    if (this.isGrowing) {
        this.age += 1;
        const progress = Math.min(this.age / this.maxAge, 1.0);
        const scale = 1.0 * (1 - Math.pow(1 - progress, 3)); 
        this.mesh.scale.set(scale, scale, scale);
        if (progress >= 1.0) this.isGrowing = false;
    }

    // 2. 물리 위치 동기화
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    // 3. 자전 애니메이션 (단순 회전)
    this.mesh.rotation.y += 0.005; 
  }

  dispose() {
    this.world.removeBody(this.body);
    this.scene.remove(this.mesh);
    
    // 메모리 해제
    if (this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.mesh.material) {
        // map이 여러 개일 수 있으므로 체크
        if (this.mesh.material.map) this.mesh.material.map.dispose();
        if (this.mesh.material.bumpMap) this.mesh.material.bumpMap.dispose();
        if (this.mesh.material.specularMap) this.mesh.material.specularMap.dispose();
        this.mesh.material.dispose();
    }
  }
}