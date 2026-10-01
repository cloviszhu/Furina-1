import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';
import { motionFrame, gestureWeight, ease } from './motion.js';
import { MotionIdle } from './motion-idle.js';
import { MotionNod, loadNodSource } from './motion-nod.js';

// Deliberate, held upper-body poses, with gaze leading the body. Both PMX rigs
// have these controls; the sourced idle layer additionally solves planted legs.
export function composeStagePose(frame, { time, mode, action, elapsed = 0, variant = 'auto' }) {
  const add = (name, x = 0, y = 0, z = 0) => {
    const angles = frame.bones[name];
    if (angles) { angles[0] += x; angles[1] += y; angles[2] += z; }
  };
  const slot = ((time % 30) + 30) % 30;
  const variants = ['settled', 'glance', 'attentive'];
  const selected = variant === 'auto' ? variants[Math.floor(slot / 10)] : variant;
  const phase = slot % 10;
  const hold = variant === 'auto' ? ease(phase / 2) * (1 - ease((phase - 7.2) / 2.8)) : 1;
  const active = action ? 1 - gestureWeight(elapsed, action === 'nod' ? 2 : 3.6) : 1;
  const weight = hold * active * (mode === 'idle' ? 1 : mode === 'thinking' ? .55 : .2);
  if (selected === 'settled') {
    add('上半身', -.012 * weight, .025 * weight, .035 * weight);
    add('上半身2', .018 * weight, 0, -.018 * weight);
    add('頭', -.025 * weight, -.035 * weight, -.065 * weight);
    add('右肩', 0, .025 * weight, -.025 * weight);
    add('左肩', 0, -.015 * weight, .025 * weight);
    add('右ひじ', -.07 * weight, .18 * weight, -.28 * weight);
    add('右手首', .05 * weight, -.05 * weight, .04 * weight);
    add('左腕', -.06 * weight, 0, .025 * weight);
  } else if (selected === 'glance') {
    const look = ease(phase / 1.1) * (1 - ease((phase - 5.8) / 2));
    const gaze = variant === 'auto' ? look * active : active;
    add('両目', -.025 * gaze, .09 * gaze, 0);
    add('頭', -.06 * weight, .16 * weight, .04 * weight);
    add('首', 0, .045 * weight, 0);
    add('上半身2', 0, .045 * weight, -.015 * weight);
    add('左肩', 0, .025 * weight, .02 * weight);
    add('左ひじ', -.04 * weight, -.13 * weight, .22 * weight);
    add('左手首', 0, .07 * weight, -.025 * weight);
  } else if (selected === 'attentive') {
    add('上半身', .035 * weight, -.025 * weight, -.025 * weight);
    add('上半身2', .015 * weight, 0, .012 * weight);
    add('頭', .025 * weight, .04 * weight, .065 * weight);
    add('両目', -.018 * weight, -.02 * weight, 0);
    add('右腕', -.09 * weight, 0, -.025 * weight);
    add('左腕', -.075 * weight, 0, .025 * weight);
    add('右ひじ', -.03 * weight, .16 * weight, -.30 * weight);
    add('左ひじ', -.03 * weight, -.14 * weight, .25 * weight);
  }
  if (mode === 'thinking' || mode === 'preparing') {
    const w = gestureWeight(Math.min(time % 8, 3), 5) * .5;
    add('頭', -.035 * w, -.05 * w, .04 * w);
    add('上半身2', -.012 * w, 0, -.012 * w);
  }
  if (action === 'greet') {
    const body = gestureWeight(elapsed - .12), attention = gestureWeight(elapsed + .18);
    add('頭', -.065 * attention, -.055 * body, -.055 * body);
    add('首', .018 * body, .025 * body, 0);
    add('両目', -.035 * attention, .025 * attention, 0);
    add('上半身', .04 * body, -.045 * body, -.03 * body);
    add('上半身2', -.02 * body, -.025 * body, .015 * body);
    add('左肩', 0, .03 * body, .025 * body);
    add('左腕', -.09 * body, .04 * body, .04 * body);
    add('左ひじ', -.05 * body, -.10 * body, .22 * body);
  }
  return frame;
}

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
    this.idleVariant = 'auto';
    this.nodSourceEnabled = true; // Dual-PMX visual/interrupt gate; missing chains keep the procedural fallback.
    this.nodSourcePromise = loadNodSource('/character-assets/animations/overte-headnod.json');
    this.idleSourceEnabled = true; // Dual-PMX visual/interrupt gate; explicit variants keep their original poses.
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
      const nodSource=await this.nodSourcePromise;
      if (sequence !== this.loadSequence) { this.disposeMesh(mesh); return; }
      if (this.mesh) { this.motionIdle?.dispose(); this.scene.remove(this.mesh); this.disposeMesh(this.mesh); }
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
      this.motionIdle = new MotionIdle(mesh, this.grantSolver);
      this.motionNod = new MotionNod(mesh, this.grantSolver,nodSource);
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
  setIdleSourceEnabled(value) { this.idleSourceEnabled = Boolean(value); }
  setNodSourceEnabled(value) { this.nodSourceEnabled = Boolean(value); }
  setIdleVariant(value) { this.idleVariant = ['auto', 'settled', 'glance', 'attentive'].includes(value) ? value : 'auto'; }
  setMode(value) { this.mode = ['idle', 'thinking', 'preparing', 'speaking', 'error'].includes(value) ? value : 'idle'; }
  setExpression(value) { this.expression = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'].includes(value) ? value : 'neutral'; }
  morph(names, value) { for (const name of names) { const index = this.mesh?.morphTargetDictionary?.[name]; if (index !== undefined) this.mesh.morphTargetInfluences[index] = value; } }
  tick(now = performance.now()) {
    const t = (now - this.start) / 1000;
    const dt = Math.min(.05, Math.max(0, (now - (this.lastTick ?? now - 16.667)) / 1000)); this.lastTick = now;
    if (this.mesh) {
      for (const [bone, quaternion] of this.base) bone.quaternion.copy(quaternion);
      const mode = this.mode;
      if (mode !== this.motionMode) { this.motionMode = mode; this.modeStartedAt = now; }
      const elapsed = this.action ? (now - this.action.start) / 1000 : 0;
      const nodPose=this.nodSourceEnabled&&this.action?.name==='nod'?this.motionNod?.sample(elapsed):null;
      const direction = this.camera.position.clone().sub(this.controls.target);
      const frame = motionFrame({ time: t, mode, modeElapsed: (now - this.modeStartedAt) / 1000, expression: this.expression, action: nodPose ? undefined : this.action?.name, elapsed, mouth: this.mouth,
        gazeYaw: Math.atan2(direction.x, direction.z), gazePitch: -Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) * .25 });
      softenStageFrame(frame, { time: t, mode, expression: this.expression, action: this.action?.name, elapsed });
      const poseVariant=this.idleSourceEnabled&&this.motionIdle?.available&&this.idleVariant==='auto'?'source':this.idleVariant;
      composeStagePose(frame, { time: t, mode, action: this.action?.name, elapsed, variant: poseVariant });
      const idleWeight = this.motionIdle?.update(dt, {enabled:this.idleSourceEnabled,time:t,mode,action:this.action,variant:this.idleVariant,expression:this.expression}) || 0;
      let headWorld;
      if(idleWeight > 1e-6) {
        // Preserve the existing gaze/expression target in world space while the
        // sourced torso settles underneath it. Source clips never own morphs.
        for(const [name,angles] of Object.entries(frame.bones)){this.pose(name,...angles);if(nodPose?.[name])this.bones[name]?.quaternion.multiply(nodPose[name]);}
        this.mesh.updateMatrixWorld(true);headWorld=this.bones['頭']?.getWorldQuaternion(new THREE.Quaternion());
        for(const [bone,quaternion] of this.base)bone.quaternion.copy(quaternion);
        this.motionIdle.center.position.addScaledVector(this.motionIdle.centerOffset,idleWeight);
      }
      if(this.motionIdle?.available)for(const name of this.motionIdle.targets.keys())frame.bones[name] ||= [0,0,0];
      for (const [name, angles] of Object.entries(frame.bones)) {
        const bone = this.bones[name]; if (!bone) continue;
        if(headWorld && name === '頭')continue;
        const target = this.offset.setFromEuler(this.euler.set(...angles));
        if(nodPose?.[name])target.multiply(nodPose[name]);
        const sourced=this.motionIdle?.targets.get(name);
        if(sourced && idleWeight > 0)target.slerp(this.base.get(bone).clone().invert().multiply(sourced),idleWeight*this.motionIdle.mask(name));
        let current = this.smoothed.get(name);
        if (!current) { current = target.clone(); this.smoothed.set(name, current); }
        else settlePoseOffset(current, target, dt, /腕|ひじ|手首/.test(name));
        bone.quaternion.copy(this.base.get(bone)).multiply(current);
      }
      if(headWorld) {
        this.mesh.updateMatrixWorld(true);
        const bone=this.bones['頭'];
        const target=this.base.get(bone).clone().invert().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(headWorld));
        let current=this.smoothed.get('頭');
        if(!current){current=target.clone();this.smoothed.set('頭',current);}else settlePoseOffset(current,target,dt);
        bone.quaternion.copy(this.base.get(bone)).multiply(current);
      }
      for (const [name, target] of Object.entries(frame.morphs)) {
        const index = this.mesh.morphTargetDictionary?.[name]; if (index === undefined) continue;
        const rate = name === 'まばたき' ? 70 : ['あ', 'い', 'う'].includes(name) ? 24 : 6;
        this.mesh.morphTargetInfluences[index] += (target - this.mesh.morphTargetInfluences[index]) * (1 - Math.exp(-dt * rate));
      }
      if (this.action && elapsed > (this.action.name === 'nod' ? 2 : 3.6)) this.action = null;
      if(this.motionIdle?.available && (this.idleSourceEnabled || idleWeight > 1e-6))this.motionIdle.plant();
      this.grantSolver?.update();
      this.mesh.updateMatrixWorld(true);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
