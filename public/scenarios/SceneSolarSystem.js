import * as THREE from 'three';

// ==========================================
// ★ AI 요청에 맞춰 골라 담는 태양계
// ==========================================
export function initSolarSystem(scene, world, loader, aiData) {
    console.log("☀️ [SceneSolarSystem] 시각적 모드 진입");
    console.log("📋 [AI 요청 목록]:", aiData?.objects?.map(o => o.name));

    const solarSystemObjects = []; 
    const texLoader = new THREE.TextureLoader();

    // ---------------------------------------------
    // 1. 전체 행성들의 '스펙(Spec)' 데이터베이스 (메뉴판)
    // ---------------------------------------------
    const allPlanetsConfig = [
        { name: 'Mercury', size: 2,  dist: 20,  speed: 0.02,  tex: '2k_mercury.jpg' },
        { name: 'Venus',   size: 3,  dist: 30,  speed: 0.015, tex: '2k_venus.jpg' },
        { name: 'Earth',   size: 3.2, dist: 45, speed: 0.01,  tex: 'earthmap1k.jpg', moon: true },
        { name: 'Mars',    size: 2.5, dist: 60, speed: 0.008, tex: '2k_mars.jpg' },
        { name: 'Jupiter', size: 8,   dist: 90, speed: 0.004, tex: '2k_jupiter.jpg' },
        { name: 'Saturn',  size: 7,   dist: 130, speed: 0.002, tex: '2k_saturn.jpg', ring: true },
        { name: 'Uranus',  size: 5,   dist: 170, speed: 0.001, tex: 'uranus.jpg', ring: { inner: 6, outer: 10, color: 0x77aaff } },
        { name: 'Neptune', size: 5,   dist: 200, speed: 0.0008, tex: 'neptune.jpg' }
    ];

    // ---------------------------------------------
    // 2. AI가 요청한 행성만 골라내기 (필터링)
    // ---------------------------------------------
    let planetsToCreate = [];
    const requestedObjects = aiData?.objects || [];

    // 만약 AI가 아무것도 안 줬다면? -> 전체 다 보여줌 (기본값)
    if (requestedObjects.length === 0) {
        planetsToCreate = allPlanetsConfig;
    } else {
        // AI가 준 이름들 리스트 (소문자로 변환)
        // 예: ["sun", "earth"]
        const requestedNames = requestedObjects.map(obj => obj.name.toLowerCase());

        // 전체 설정에서 이름이 일치하는 것만 남김
        planetsToCreate = allPlanetsConfig.filter(config => 
            requestedNames.includes(config.name.toLowerCase())
        );
    }

    // ---------------------------------------------
    // 3. 태양(Sun) 처리
    // ---------------------------------------------
    // 태양은 시스템의 중심이라 보통은 항상 그리지만,
    // 사용자가 "지구만 보여줘"라고 했을 때 태양을 뺄지 말지 결정해야 합니다.
    // 여기서는 "Sun"이라는 이름이 요청에 있거나, 혹은 요청이 아예 없을 때만 그립니다.
    
    let sunMesh = null;
    const isSunRequested = requestedObjects.length === 0 || requestedObjects.some(o => o.name.toLowerCase() === 'sun');

    if (isSunRequested) {
        const sunGeo = new THREE.SphereGeometry(10, 64, 64);
        const sunMat = new THREE.MeshBasicMaterial({
            map: texLoader.load('/assets/textures/2k_sun.jpg')
        });
        sunMesh = new THREE.Mesh(sunGeo, sunMat);
        scene.add(sunMesh);

        // 태양빛
        const sunLight = new THREE.PointLight(0xffffff, 2, 400);
        sunMesh.add(sunLight);
    }

    // ---------------------------------------------
    // 4. 필터링된 행성들 생성 (Loop)
    // ---------------------------------------------
    planetsToCreate.forEach(conf => {
        // (1) Pivot 생성
        const pivot = new THREE.Object3D();
        pivot.rotation.y = Math.random() * Math.PI * 2; 
        scene.add(pivot);

        // (2) Mesh 생성
        const geo = new THREE.SphereGeometry(conf.size, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            map: texLoader.load(`/assets/textures/${conf.tex}`)
        });
        const mesh = new THREE.Mesh(geo, mat);
        
        mesh.position.x = conf.dist;
        pivot.add(mesh); 

        // (3) 궤도 선 그리기 (태양이 있을 때만 그리는 게 자연스러움)
        if (isSunRequested) {
            const orbitGeo = new THREE.RingGeometry(conf.dist - 0.4, conf.dist + 0.4, 128);
            const orbitMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.3
            });
            const orbit = new THREE.Mesh(orbitGeo, orbitMat);
            orbit.rotation.x = -Math.PI / 2;
            scene.add(orbit);
        }

        // (4) 고리/달 추가 (기존 코드 유지)
        if (conf.ring === true) {
            const ringGeo = new THREE.RingGeometry(conf.size * 1.4, conf.size * 2.2, 64);
            const ringTex = texLoader.load('/assets/textures/saturn_ring.jpg');
            const ringMat = new THREE.MeshBasicMaterial({
                map: ringTex, side: THREE.DoubleSide, transparent: true, opacity: 0.8
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = -Math.PI / 2;
            mesh.add(ringMesh);
        } else if (conf.ring && conf.ring.inner) {
            const ringGeo = new THREE.RingGeometry(conf.ring.inner, conf.ring.outer, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color: conf.ring.color, side: THREE.DoubleSide, transparent: true, opacity: 0.4
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = -Math.PI / 2;
            mesh.add(ringMesh);
        }

        let moonPivot;
        if (conf.moon) {
            moonPivot = new THREE.Object3D();
            mesh.add(moonPivot); 
            const moonGeo = new THREE.SphereGeometry(0.8, 16, 16);
            const moonMat = new THREE.MeshStandardMaterial({ map: texLoader.load('/assets/textures/2k_moon.jpg') });
            const moonMesh = new THREE.Mesh(moonGeo, moonMat);
            moonMesh.position.x = 6; 
            moonPivot.add(moonMesh);
        }

        solarSystemObjects.push({
            pivot: pivot,
            mesh: mesh,
            speed: conf.speed,
            moonPivot: moonPivot
        });
    });

    // ============================================
    // 애니메이션 업데이트
    // ============================================
    const update = (deltaTime) => {
        if (sunMesh) sunMesh.rotation.y += 0.002;

        solarSystemObjects.forEach(obj => {
            obj.pivot.rotation.y += obj.speed;
            obj.mesh.rotation.y += 0.01;
            if (obj.moonPivot) obj.moonPivot.rotation.y += 0.05;
        });
    };

    return { 
        planets: [], 
        cameraPosition: { x: 0, y: 100, z: 150 }, // 카메라 좀 더 가깝게
        update 
    };
}