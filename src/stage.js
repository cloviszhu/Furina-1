import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';
import { motionFrame, gestureWeight } from './motion.js';

// Small secondary movement in the stage's PMX control space. Keep the root and
// legs planted: this stage applies grants, but does not solve leg IK/physics.
export function softenStageFrame(frame, { time, expression, mode, action, elapsed = 0 }) {
  const quiet = expression === 'sad' ? .45 : expression === 'calm' ? .75 : 1;
  const breath = Math.sin(time * 1.28), settle = Math.sin(time * .39 + .8);
  const rest = quiet * (mode === 'listening' ? .75 : 1);
  const freeArm = rest * (1 - (action === 'greet' ? gestureWeight(elapsed) : 0));
  const add = (name, x = 0, y = 0, z = 0) => {
    const angles = frame.bones[name];
    if (angles) { angles[0] += x; angles[1] += y; angles[2] += z; }
  };
  // Open the resting left arm a little and bring the hand forward, without
  // changing the greeting's existing right-arm choreography.
  add('左腕', -.04, 0, .055);
  add('上半身', .006 * breath * rest, 0, .009 * settle * rest);
  add('上半身2', -.003 * breath * rest, 0, -.005 * settle * rest);
  add('首', 0, 0, -.004 * settle * rest);
  add('右ひじ', .012 * Math.sin(time * 1.28 - .35) * freeArm, .022 * breath * freeArm, 0);
  add('左ひじ', .012 * Math.sin(time * 1.28 + .45) * rest, -.022 * Math.sin(time * 1.28 + .25) * rest, 0);
  add('右手首', .018 * Math.sin(time * 1.28 - .7) * freeArm, .012 * settle * freeArm, 0);
  add('左手首', .018 * Math.sin(time * 1.28 + .9) * rest, -.012 * Math.sin(time * .39 + 1.4) * rest, 0);
  return frame;
}

// Exponential settling alone can rotate a raised elbow by 20 degrees on the
// first cancelled frame. Bound angular travel as well, including when callers
// clear action directly, while retaining the existing small-motion settling.
export function settlePoseOffset(current, target, dt, arm = false) {
  const angle = current.angleTo(target);
  const blend = 1 - Math.exp(-dt * (arm ? 10 : 8));
  const maxStep = dt * (arm ? 4.5 : 2);
  current.slerp(target, angle > 0 ? Math.min(blend, maxStep / angle) : blend);
  return current;
}

export class CharacterStage {
  constructor(element, onState) {
    this.element = element; this.onState = onState; this.mouth = 0; this.action = null; this.expression = 'neutral';
    this.mode = 'idle'; this.lastVoiceAt = -Infinity; this.smoothed = new Map();
    this.offset = new THREE.Quaternion(); this.euler = new THREE.Euler();
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
      this.smoothed.clear(); this.action = null;
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
  trigger(action) {
    if (!['greet', 'nod'].includes(action) || this.action) return false;
    this.action = { name: action, start: performance.now() }; return true;
  }
  cancelAction() { const active = Boolean(this.action); this.action = null; return active; }
  setMode(value) { this.mode = ['idle', 'listening', 'speaking'].includes(value) ? value : 'idle'; }
  setExpression(value) { this.expression = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'].includes(value) ? value : 'neutral'; }
  morph(names, value) { for (const name of names) { const index = this.mesh?.morphTargetDictionary?.[name]; if (index !== undefined) this.mesh.morphTargetInfluences[index] = value; } }
  tick(now = performance.now()) {
    const t = (now - this.start) / 1000;
    const dt = Math.min(.05, Math.max(0, (now - (this.lastTick ?? now - 16.667)) / 1000)); this.lastTick = now;
    if (this.mesh) {
      for (const [bone, quaternion] of this.base) bone.quaternion.copy(quaternion);
      if (this.mouth > .025) this.lastVoiceAt = now;
      const mode = now - this.lastVoiceAt < 450 ? 'speaking' : this.mode;
      if (mode !== this.motionMode) { this.motionMode = mode; this.modeStartedAt = now; }
      const elapsed = this.action ? (now - this.action.start) / 1000 : 0;
      const direction = this.camera.position.clone().sub(this.controls.target);
      const frame = motionFrame({ time: t, mode, modeElapsed: (now - this.modeStartedAt) / 1000, expression: this.expression, action: this.action?.name, elapsed, mouth: this.mouth,
        gazeYaw: Math.atan2(direction.x, direction.z), gazePitch: -Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) * .25 });
      softenStageFrame(frame, { time: t, mode, expression: this.expression, action: this.action?.name, elapsed });
      for (const [name, angles] of Object.entries(frame.bones)) {
        const bone = this.bones[name]; if (!bone) continue;
        const target = this.offset.setFromEuler(this.euler.set(...angles));
        let current = this.smoothed.get(name);
        if (!current) { current = target.clone(); this.smoothed.set(name, current); }
        else settlePoseOffset(current, target, dt, /腕|ひじ|手首/.test(name));
        bone.quaternion.copy(this.base.get(bone)).multiply(current);
      }
      for (const [name, target] of Object.entries(frame.morphs)) {
        const index = this.mesh.morphTargetDictionary?.[name]; if (index === undefined) continue;
        const rate = name === 'まばたき' ? 70 : ['あ', 'い', 'う'].includes(name) ? 24 : 6;
        this.mesh.morphTargetInfluences[index] += (target - this.mesh.morphTargetInfluences[index]) * (1 - Math.exp(-dt * rate));
      }
      if (this.action && elapsed > (this.action.name === 'nod' ? 2 : 3.6)) this.action = null;
      this.grantSolver?.update();
      this.mesh.updateMatrixWorld(true);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
