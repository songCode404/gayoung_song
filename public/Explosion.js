import * as THREE from 'three';

export class Explosion {
    constructor(scene, position, color = 0xffaa00) {
        this.scene = scene;
        this.particles = [];
        this.isFinished = false;

        const particleCount = 50;
        const geometry = new THREE.BufferGeometry();
        const positions = [];

        this.velocities = [];
        this.lifetimes = [];

        for (let i = 0; i < particleCount; i++) {
            positions.push(position.x, position.y, position.z);
            
            this.velocities.push({
                x: (Math.random() - 0.5) * 10, 
                y: (Math.random() - 0.5) * 10,
                z: (Math.random() - 0.5) * 10
            });
            
            this.lifetimes.push(1.0); 
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: color,
            size: 2,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending 
        });

        this.mesh = new THREE.Points(geometry, material);
        scene.add(this.mesh);
    }

    update() {
        if (this.isFinished) return;

        const positions = this.mesh.geometry.attributes.position.array;

        for (let i = 0; i < this.velocities.length; i++) {
            if (this.lifetimes[i] > 0) {
                positions[i * 3] += this.velocities[i].x;
                positions[i * 3 + 1] += this.velocities[i].y;
                positions[i * 3 + 2] += this.velocities[i].z;
                this.lifetimes[i] -= 0.02;
            }
        }

        this.mesh.material.opacity -= 0.01;
        this.mesh.geometry.attributes.position.needsUpdate = true;

        if (this.mesh.material.opacity <= 0) {
            this.isFinished = true;
            this.dispose();
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}