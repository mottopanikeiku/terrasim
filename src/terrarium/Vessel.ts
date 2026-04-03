import * as THREE from 'three';
import { glassVertexShader, glassFragmentShader } from '../shaders/glass';
import { VESSEL_RADIUS, VESSEL_HEIGHT } from '../utils/MathUtils';

export class Vessel {
  public glassMesh: THREE.Mesh;
  public corkMesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    // Jar profile points — classic terrarium jar shape
    const profilePoints: THREE.Vector2[] = [
      new THREE.Vector2(0, 0),                                    // bottom center
      new THREE.Vector2(VESSEL_RADIUS * 0.85, 0),                // bottom flat
      new THREE.Vector2(VESSEL_RADIUS * 0.92, VESSEL_HEIGHT * 0.03), // bottom curve
      new THREE.Vector2(VESSEL_RADIUS * 0.97, VESSEL_HEIGHT * 0.08),
      new THREE.Vector2(VESSEL_RADIUS * 1.00, VESSEL_HEIGHT * 0.20), // widest
      new THREE.Vector2(VESSEL_RADIUS * 0.98, VESSEL_HEIGHT * 0.35),
      new THREE.Vector2(VESSEL_RADIUS * 0.95, VESSEL_HEIGHT * 0.50),
      new THREE.Vector2(VESSEL_RADIUS * 0.88, VESSEL_HEIGHT * 0.62),
      new THREE.Vector2(VESSEL_RADIUS * 0.75, VESSEL_HEIGHT * 0.72), // shoulder
      new THREE.Vector2(VESSEL_RADIUS * 0.58, VESSEL_HEIGHT * 0.80), // neck start
      new THREE.Vector2(VESSEL_RADIUS * 0.52, VESSEL_HEIGHT * 0.85), // neck
      new THREE.Vector2(VESSEL_RADIUS * 0.50, VESSEL_HEIGHT * 0.88), // narrowest
      new THREE.Vector2(VESSEL_RADIUS * 0.53, VESSEL_HEIGHT * 0.91), // lip flare
      new THREE.Vector2(VESSEL_RADIUS * 0.56, VESSEL_HEIGHT * 0.93), // lip
      new THREE.Vector2(VESSEL_RADIUS * 0.57, VESSEL_HEIGHT * 0.95), // lip top
      new THREE.Vector2(VESSEL_RADIUS * 0.55, VESSEL_HEIGHT * 0.96), // inner lip
      new THREE.Vector2(VESSEL_RADIUS * 0.50, VESSEL_HEIGHT * 0.95), // inner
    ];

    const glassGeo = new THREE.LatheGeometry(profilePoints, 64);
    glassGeo.computeVertexNormals();

    this.material = new THREE.ShaderMaterial({
      vertexShader: glassVertexShader,
      fragmentShader: glassFragmentShader,
      uniforms: {
        uTint: { value: new THREE.Color(0xC8E6FF).multiplyScalar(0.15) },
        uOpacity: { value: 0.18 },
        uRimPower: { value: 3.0 },
        uRimColor: { value: new THREE.Color(0xE0F0FF) },
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.glassMesh = new THREE.Mesh(glassGeo, this.material);
    this.glassMesh.renderOrder = 999;
    scene.add(this.glassMesh);

    // Cork lid
    const corkGeo = new THREE.CylinderGeometry(
      VESSEL_RADIUS * 0.52,
      VESSEL_RADIUS * 0.54,
      VESSEL_HEIGHT * 0.06,
      32
    );
    const corkMat = new THREE.MeshStandardMaterial({
      color: 0xB8956A,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.corkMesh = new THREE.Mesh(corkGeo, corkMat);
    this.corkMesh.position.y = VESSEL_HEIGHT * 0.95;
    this.corkMesh.castShadow = true;
    scene.add(this.corkMesh);

    // Inner glass surface (slight darker tint for depth)
    const innerGeo = new THREE.LatheGeometry(
      profilePoints.map(p => new THREE.Vector2(p.x * 0.97, p.y)),
      48
    );
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xE8F4FF,
      transparent: true,
      opacity: 0.03,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.renderOrder = 998;
    scene.add(innerMesh);

    // Glass base/floor (visible through bottom)
    const baseGeo = new THREE.CircleGeometry(VESSEL_RADIUS * 0.84, 48);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xD0E8F0,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = 0.05;
    baseMesh.renderOrder = 997;
    scene.add(baseMesh);
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }
}
