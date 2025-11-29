import * as THREE from 'three';
import { Planet } from '../planet.js';

// ==========================================
// 1. [Effect] 에너지 충격파 (Shockwave)
// ==========================================
class Shockwave {
    constructor(scene, position) {
        this.scene = scene;
        this.isFinished = false;

        // 고리 모양 기하 구조
        const geometry = new THREE.RingGeometry(1, 1.5, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending // 빛나는 효과
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        
        // 충돌 방향(X축)에 수직으로 서게 회전
        this.mesh.rotation.y = Math.PI / 2;
        
        scene.add(this.mesh);
    }

    update(deltaTime) {
        // 엄청 빠르게 커짐
        const expansionSpeed = 80 * deltaTime;
        this.mesh.scale.addScalar(expansionSpeed);

        // 투명도 감소
        this.mesh.material.opacity -= deltaTime * 0.5;

        if (this.mesh.material.opacity <= 0) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.isFinished = true;
        }
    }
}

// ==========================================
// 2. [Effect] 암석 파편 (Debris)
// ==========================================
class DebrisEffect {
    constructor(scene, position, color) {
        this.scene = scene;
        this.isFinished = false;
        
        const particleCount = 200; // 파편 개수
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];
        const sizes = [];

        for (let i = 0; i < particleCount; i++) {
            positions.push(position.x, position.y, position.z);

            // 사방으로 튀는 속도
            const speed = Math.random() * 40 + 10;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            velocities.push(
                speed * Math.sin(phi) * Math.cos(theta),
                speed * Math.sin(phi) * Math.sin(theta),
                speed * Math.cos(phi)
            );
            
            // 파편 크기 랜덤
            sizes.push(Math.random() * 1.5);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        this.material = new THREE.PointsMaterial({
            color: color,
            size: 1,
            transparent: true,
            opacity: 1,
        });

        this.mesh = new THREE.Points(geometry, this.material);
        this.velocities = velocities;
        scene.add(this.mesh);
    }

    update(deltaTime) {
        const positions = this.mesh.geometry.attributes.position.array;
        
        for (let i = 0; i < positions.length / 3; i++) {
            // 중력 없이 관성으로 날아감
            positions[i * 3] += this.velocities[i * 3] * deltaTime;
            positions[i * 3 + 1] += this.velocities[i * 3 + 1] * deltaTime;
            positions[i * 3 + 2] += this.velocities[i * 3 + 2] * deltaTime;
        }
        
        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.material.opacity -= deltaTime * 0.3; // 천천히 사라짐

        if (this.material.opacity <= 0) {
            this.scene.remove(this.mesh);
            this.isFinished = true;
        }
    }
}

// ==========================================
// 3. [Utility] 메쉬 찌그러트리기
// ==========================================
function distortMesh(mesh, intensity) {
    if (!mesh || !mesh.geometry) return;

    // Group인 경우 자식들까지 처리
    if (mesh.isGroup) {
        mesh.traverse(child => {
            if (child.isMesh) distortMesh(child, intensity);
        });
        return;
    }

    const positions = mesh.geometry.attributes.position.array;
    const count = positions.length / 3;

    // 지진 효과
    for (let i = 0; i < count; i++) {
        const shake = (Math.random() - 0.5) * intensity;
        positions[i * 3] += shake;
        positions[i * 3 + 1] += shake;
        positions[i * 3 + 2] += shake;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
}

// ==========================================
// 4. 메인 시나리오 로직
// ==========================================
export function initCollisionScene(scene, world, loader, aiData) {
    console.log("💥 [SceneCollision] 시네마틱 충돌 모드");

    const planets = [];
    const effects = []; // 각종 이펙트(충격파, 파편 등) 관리
    
    let collisionState = 'approaching'; 
    let crumbleTimer = 0;
    const crumbleDuration = 2.0; // 찌그러지는 시간 (초)

    // AI 데이터 없으면 기본값
    const objects = aiData?.objects || [];
    const p1Data = objects[0] || { name: 'Mars', textureKey: 'Mars', size: 3 };
    const p2Data = objects[1] || { name: 'Earth', textureKey: 'Earth', size: 3.2 };

    // 행성 생성
    const p1 = new Planet(scene, world, loader, {
        ...p1Data, position: { x: -40, y: 0, z: 0 }, velocity: { x: 15, y: 0, z: 0 }
    }, 'collision');

    const p2 = new Planet(scene, world, loader, {
        ...p2Data, position: { x: 40, y: 0, z: 0 }, velocity: { x: -15, y: 0, z: 0 }
    }, 'collision');

    planets.push(p1, p2);

    // 충돌 지점 조명 (폭발 섬광용)
    const flashLight = new THREE.PointLight(0xffaa00, 0, 100);
    scene.add(flashLight);

    // ===========================
    // 애니메이션 업데이트 함수
    // ===========================
    const update = (deltaTime) => {
        // 이펙트 업데이트
        for (let i = effects.length - 1; i >= 0; i--) {
            effects[i].update(deltaTime);
            if (effects[i].isFinished) effects.splice(i, 1);
        }

        // 1. 접근 단계
        if (collisionState === 'approaching') {
            const dist = p1.mesh.position.distanceTo(p2.mesh.position);
            const rSum = p1.radius + p2.radius;

            if (dist < rSum * 0.8) { 
                console.log("⚡ 충돌 임팩트!");
                collisionState = 'crumbling';
                
                // 물리 정지
                p1.body.velocity.set(0,0,0);
                p2.body.velocity.set(0,0,0);

                // ★ 충격파 생성 (고리)
                effects.push(new Shockwave(scene, new THREE.Vector3(0,0,0)));
                
                // ★ 섬광 (Flash) 켜기
                flashLight.intensity = 50; 
            }
        } 
        // 2. 붕괴 단계
        else if (collisionState === 'crumbling') {
            crumbleTimer += deltaTime;
            const progress = Math.min(crumbleTimer / crumbleDuration, 1.0);

            // 섬광 서서히 줄이기
            flashLight.intensity = THREE.MathUtils.lerp(50, 0, progress);

            // 행성 찌그러트리기 & 가열
            [p1, p2].forEach(p => {
                distortMesh(p.mesh, 0.4); // 지진 강도

                // 마그마 효과 (붉게 변함)
                p.mesh.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.color.lerp(new THREE.Color(0x220000), deltaTime); // 검게 탐
                        if (child.material.emissive) {
                            child.material.emissive = new THREE.Color(0xff4400); // 붉은 빛
                            child.material.emissiveIntensity = progress * 10; // 점점 밝게
                        }
                    }
                });
            });

            // 3. 최종 폭발
            if (progress >= 1.0) {
                collisionState = 'destroyed';
                p1.mesh.visible = false;
                p2.mesh.visible = false;
                scene.remove(flashLight);

                // ★ 대량 파편 생성
                effects.push(new DebrisEffect(scene, new THREE.Vector3(0,0,0), 0xffaa00)); // 불타는 파편
                effects.push(new DebrisEffect(scene, new THREE.Vector3(0,0,0), 0x888888)); // 연기 파편
            }
        }
    };

    return { 
        planets, 
        cameraPosition: { x: 0, y: 40, z: 90 }, 
        update 
    };
}