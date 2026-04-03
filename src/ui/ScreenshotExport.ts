import * as THREE from 'three';

export class ScreenshotExport {
  static capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    // Render at high res
    const currentSize = new THREE.Vector2();
    renderer.getSize(currentSize);

    const scale = 2;
    renderer.setSize(currentSize.x * scale, currentSize.y * scale, false);
    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');

    // Restore size
    renderer.setSize(currentSize.x, currentSize.y, false);

    // Download
    const link = document.createElement('a');
    link.download = `terrarium-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }
}
