import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';

export class CharacterStage {
  constructor(element, onState) {
    this.element = element; this.onState = onState; this.mouth = 0; this.action = null; this.expression = 'neutral';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    element.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minPolarAngle = Math.PI * 0.2; this.controls.maxPolarAngle = Math.PI * 0.64;
    this.scene.add(new THREE.HemisphereLight(0xecf5ff, 0x62739a, 1.1));
    const key = new THREE.DirectionalLight(0xfff3db, 1.6); key.position.set(8, 14, 12); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x66bdff, .65); rim.position.set(-9, 10, -9); this.scene.add(rim);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.25, 96), new THREE.MeshStandardMaterial({ color: 0x13283f, metalness: .55, roughness: .6 }));
    platform.position.y = -.2; this.scene.add(platform);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.15, .025, 8, 100), new THREE.MeshBasicMaterial({ color: 0xa7b5bd, transparent: true, opacity: .5 })); ring.rotation.x = Math.PI / 2; ring.position.y = -.05; this.scene.add(ring);
    this.loader = new MMDLoader(); this.height = 20;
    this.resetCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(element);
    this.resize(); this.start = performance.now(); this.loadSequence = 0;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() { const width = this.element.clientWidth, height = this.element.clientHeight; this.renderer.setSize(width, height, false); this.camera.aspect = width / Math.max(height, 1); this.camera.updateProjectionMatrix(); }
  resetCamera() { this.camera.position.set(0, this.height * .58, this.height * 2.1); this.controls.target.set(0, this.height * .48, 0); this.controls.minDistance = this.height * .6; this.controls.maxDistance = this.height * 3.5; this.controls.update(); }

  async load(url) {
    const sequence = ++this.loadSequence; this.onState('正在加载本地模型…');
    const manager = new THREE.LoadingManager(); let missingTexture = false;
    manager.onError = () => { missingTexture = true; this.onState('部分贴图加载失败，请检查资产目录。'); };
    const loader = new MMDLoader(manager);
    try {
      const mesh = await loader.loadAsync(url);
      if (sequence !== this.loadSequence) { this.disposeMesh(mesh); return; }
      if (this.mesh) { this.scene.remove(this.mesh); this.disposeMesh(this.mesh); }
      this.mesh = mesh;
      const box = new THREE.Box3().setFromObject(mesh);
      this.height = box.max.y - box.min.y;
      mesh.position.y = -box.min.y;
      mesh.frustumCulled = false;
      this.bones = Object.fromEntries(mesh.skeleton.bones.map(b => [b.name, b]));
      this.base = new Map(mesh.skeleton.bones.map(b => [b, b.quaternion.clone()]));
      // PMX deformation bones can inherit rotation through grants rather than
      // hierarchy. Controllers alone move while the mesh stays in T-pose unless
      // those grants are applied. Use Three's PMX solver, without physics/Ammo.
      this.grantSolver = new MMDAnimationHelper().createGrantSolver(mesh);
      this.scene.add(mesh); this.resetCamera();
      this.onState(`模型已就绪 · ${mesh.skeleton.bones.length} 骨骼${missingTexture ? ' · 贴图异常' : ''}`);
      window.__exoStage = this; // Local inspection/test hook, contains no credentials.
    } catch { if (sequence === this.loadSequence) this.onState('模型未能加载。请按 README 放入 PMX 与贴图。'); }
  }
  disposeMesh(mesh) { mesh.geometry.dispose(); for (const material of [].concat(mesh.material)) { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); } }
  pose(name, x = 0, y = 0, z = 0) {
    const bone = this.bones?.[name]; if (!bone) return;
    const base = this.base?.get(bone);
    if (base) bone.quaternion.copy(base);
    bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  }
  trigger(action) { this.action = { name: action, start: performance.now() }; }
  setExpression(value) { this.expression = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'].includes(value) ? value : 'neutral'; }
  morph(names, value) { for (const name of names) { const index = this.mesh?.morphTargetDictionary?.[name]; if (index !== undefined) this.mesh.morphTargetInfluences[index] = value; } }
  tick() {
    const t = (performance.now() - this.start) / 1000;
    if (this.mesh) {
      for (const [bone, quaternion] of this.base) bone.quaternion.copy(quaternion);
      this.pose('上半身', Math.sin(t * 1.4) * .012, Math.sin(t * .45) * .02, 0);
      this.pose('頭', Math.sin(t * .7) * .02, Math.sin(t * .33) * .03, 0);
      this.pose('右腕', 0, 0, 1.05); this.pose('右ひじ', 0, .1, .12); this.pose('左腕', 0, 0, -1.05);
      const blinkPhase = t % 4.8;
      const blink = blinkPhase < .2 ? Math.sin(blinkPhase / .2 * Math.PI) : 0;
      this.morph(['まばたき'], blink);
      this.morph(['あ'], this.mouth * .65);
      this.morph(['い'], this.mouth * .12);
      this.morph(['う'], this.mouth * .1);
      this.morph(['にこり'], this.expression === 'happy' ? .35 : this.expression === 'calm' ? .12 : 0);
      this.morph(['悲しむ', '困る'], this.expression === 'sad' ? .25 : 0);
      this.morph(['怒り目', '怒り'], this.expression === 'angry' ? .28 : 0);
      this.morph(['びっくり'], this.expression === 'surprised' ? .3 : 0);
      if (this.action) {
        const elapsed = (performance.now() - this.action.start) / 1000;
        const envelope = Math.min(1, elapsed * 3) * Math.max(0, Math.min(1, (2.5 - elapsed) * 3));
        if (this.action.name === 'greet') {
          this.pose('右腕', -.2 * envelope, -.2 * envelope, 1.05 - 1.9 * envelope);
          this.pose('右ひじ', 0, .6 * envelope, -.65 * envelope + Math.sin(elapsed * 9) * .2 * envelope);
          this.morph(['笑い'], .25 * envelope);
        } else this.pose('頭', Math.sin(elapsed * 5) * .13 * envelope, 0, 0);
        if (elapsed > 2.5) { this.action = null; this.morph(['笑い'], 0); }
      }
      this.grantSolver?.update();
      this.mesh.updateMatrixWorld(true);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
