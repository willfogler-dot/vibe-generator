// ===== World: a cinematic fantasy landscape that plays along with the music =====
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Tree } from './ez-tree.es.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const World = (() => {
  // ---------------- helpers ----------------
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const R = (a, b) => a + (b - a) * rnd(), pick = a => a[Math.floor(rnd() * a.length)];
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), C = h => new THREE.Color(h);
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const tv = V(), tv2 = V(), tv3 = V(), tq = new THREE.Quaternion(), ts = V(), tm = new THREE.Matrix4(), tc = new THREE.Color(), UP = V(0, 1, 0), te = new THREE.Euler();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------------- terrain math (CPU, exact) ----------------
  function h2(ix, iz) { let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vn(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1); return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz; }
  function fbm(x, z, o) { let v = 0, a = 0.5, s = 0; for (let i = 0; i < o; i++) { v += a * vn(x, z); s += a; const nx = x * 1.6 - z * 1.2 + 17.1, nz = x * 1.2 + z * 1.6 - 9.3; x = nx; z = nz; a *= 0.5; } return v / s * 2 - 1; }
  function ridge(x, z, o) { let v = 0, a = 0.55, w = 1, s = 0; for (let i = 0; i < o; i++) { let n = 1 - Math.abs(vn(x, z) * 2 - 1); n *= n; v += n * a * w; s += a; w = clamp(n * 1.8, 0, 1); const nx = x * 1.7 - z * 1.1 + 5.3, nz = x * 1.1 + z * 1.7 + 2.9; x = nx; z = nz; a *= 0.5; } return v / s; }
  const pathX = d => Math.sin(d * 0.0021) * 140 + Math.sin(d * 0.0057 + 1.3) * 45;

  // ---------------- scenes ----------------
  const SCN = {
    valley: { name: 'River Valley', hill: 26, rough: 2.2, mtn: 300, mtnIn: 170, vw: 85, vfloor: 7, river: 9, rw: 10, water: 0.5, coast: 0, snow: 250, grass: 1, trees: 0.5, conifer: 0.3, ruins: 1, islands: 1, rocks: 0.7, dry: 0.3, flowers: 1, giant: 1, tint: '#ffffff', dryTint: '#d8c890', horse: 1, villages: 1 },
    highlands: { name: 'Highlands', hill: 48, rough: 3.2, mtn: 560, mtnIn: 115, vw: 80, vfloor: 26, river: 7, rw: 16, water: 20, coast: 0, snow: 190, grass: 0.8, trees: 0.4, conifer: 0.85, ruins: 0.6, islands: 0.8, rocks: 1, dry: 0.5, flowers: 0.4, giant: 0.2, tint: '#e8f0d8', dryTint: '#c8b888', horse: 0.6, villages: 0.6 },
    forest: { name: 'Deep Forest', hill: 24, rough: 2, mtn: 220, mtnIn: 150, vw: 70, vfloor: 3, river: 6, rw: 7, water: 0, coast: 0, snow: 400, grass: 0.75, trees: 1, conifer: 0.45, ruins: 0.8, islands: 0.4, rocks: 0.8, dry: 0.1, flowers: 0.6, giant: 1, tint: '#d8e8c8', dryTint: '#a8a070', horse: 0.3, villages: 0.7 },
    coast: { name: 'Coastline', hill: 22, rough: 2.4, mtn: 200, mtnIn: 180, vw: 60, vfloor: 12, river: 0, rw: 1, water: 0, coast: 70, snow: 400, grass: 1, trees: 0.25, conifer: 0.4, ruins: 0.9, islands: 0.6, rocks: 1, dry: 0.6, flowers: 0.8, giant: 0.3, tint: '#f0f0d8', dryTint: '#e0cc90', horse: 1, villages: 1 }
  };
  const SC_ORDER = ['valley', 'highlands', 'forest', 'coast'];
  let SC = SCN.valley, cur = 'valley';
  function heightAt(x, z) {
    const P = SC, d = -z, dx = x - pathX(d), adx = Math.abs(dx);
    let h = fbm(x * 0.0042 + 31.7, z * 0.0042 - 11.3, 5) * P.hill + fbm(x * 0.031, z * 0.031, 3) * P.rough;
    h += ridge(x * 0.0014 + 3.1, z * 0.0014 - 7.7, 6) * P.mtn * sstep(P.mtnIn, P.mtnIn + 320, adx);
    const v = Math.exp(-(dx * dx) / (P.vw * P.vw)); h = mix(h, P.vfloor + h * 0.25, v);
    if (P.river) h -= P.river * Math.exp(-(dx * dx) / (P.rw * P.rw));
    if (P.coast) { const s = sstep(P.coast, P.coast + 30, dx + fbm(z * 0.008, 3.3, 3) * 25); h = mix(h, -16 + fbm(x * 0.01, z * 0.01, 3) * 5, s); }
    return h;
  }
  // a hiking trail that wanders along the valley's east bank
  const trailX = d => pathX(d) + 38 + 16 * Math.sin(d * 0.004 + 0.8) + 8 * Math.sin(d * 0.011 + 2.0);
  const groundAt = (x, z) => Math.max(heightAt(x, z), SC.water + 0.6);
  const slopeAt = (x, z, h) => Math.hypot(heightAt(x + 1, z) - h, heightAt(x, z + 1) - h);

  // ---------------- time of day (linear HDR values) ----------------
  const TOD = {
    dawn:   { name: 'Dawn', el: 8, az: 60, sun: '#ffc09a', si: 2.4, zen: [0.10, 0.16, 0.36], hor: [0.95, 0.66, 0.55], fog: '#b8aec4', aI: 0.95, cl: [1.6, 1.25, 1.1], cd: [0.42, 0.40, 0.55], cover: 0.45, stars: 0.08, moon: 0, exp: 1.05, fogD: 0.0008, env: 1.2, disc: 30 },
    day:    { name: 'Midday', el: 50, az: 30, sun: '#fff3e2', si: 3.4, zen: [0.10, 0.26, 0.70], hor: [0.62, 0.78, 0.95], fog: '#b4c8dc', aI: 0.8, cl: [2.4, 2.4, 2.4], cd: [0.75, 0.80, 0.92], cover: 0.42, stars: 0, moon: 0, exp: 0.95, fogD: 0.00075, env: 1.0, disc: 25 },
    golden: { name: 'Golden Hour', el: 13, az: -22, sun: '#ffae6a', si: 3.2, zen: [0.10, 0.18, 0.42], hor: [1.25, 0.75, 0.48], fog: '#b8a8a4', aI: 1.0, cl: [2.0, 1.35, 0.95], cd: [0.45, 0.40, 0.55], cover: 0.4, stars: 0, moon: 0, exp: 1.0, fogD: 0.0006, env: 1.2, disc: 40 },
    dusk:   { name: 'Dusk', el: 3.5, az: -35, sun: '#ff8a5c', si: 1.7, zen: [0.03, 0.05, 0.15], hor: [0.85, 0.42, 0.32], fog: '#4c4462', aI: 1.15, cl: [1.1, 0.55, 0.45], cd: [0.12, 0.11, 0.2], cover: 0.4, stars: 0.4, moon: 0, exp: 1.25, fogD: 0.0007, env: 1.5, disc: 0 },
    night:  { name: 'Night', el: 34, az: 18, sun: '#a8bcff', si: 0.85, zen: [0.004, 0.008, 0.025], hor: [0.03, 0.045, 0.09], fog: '#141c30', aI: 1.0, cl: [0.06, 0.07, 0.11], cd: [0.01, 0.012, 0.025], cover: 0.3, stars: 1, moon: 1, exp: 1.6, fogD: 0.0006, env: 2.2, disc: 0 }
  };
  const TOD_ORDER = ['dawn', 'day', 'golden', 'dusk', 'night'];
  let TD = TOD.day, curTod = 'day', wantTod = 'auto';
  function clockTod() { const d = new Date(), h = d.getHours() + d.getMinutes() / 60; return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 16.5 ? 'day' : h >= 16.5 && h < 19 ? 'golden' : h >= 19 && h < 20.5 ? 'dusk' : 'night'; }

  // ---------------- shared uniforms ----------------
  const U = {
    time: { value: 0 }, sunDir: { value: V(0, 1, 0) }, sunCol: { value: C(1, 1, 1) }, skyZen: { value: C(0, 0, 0) }, skyHor: { value: C(0, 0, 0) }, fogCol: { value: C(0, 0, 0) },
    cloudLit: { value: C(1, 1, 1) }, cloudDark: { value: C(0, 0, 0) }, cover: { value: 0.4 }, stars: { value: 0 }, moon: { value: 0 }, sunDisc: { value: 20 }, cloudSpeed: { value: 0.015 },
    windDir: { value: new THREE.Vector2(0.6, -0.8) }, windAmp: { value: 0.3 }, gust: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) }, fadeR: { value: 60 }, aurora: { value: 0 }
  };
  const NOISE = `float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float gn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1.0,0.0)), u.x), mix(hsh(i+vec2(0.0,1.0)), hsh(i+vec2(1.0,1.0)), u.x), u.y); }
    float gfbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*gn(p); p = mat2(1.6,1.2,-1.2,1.6)*p + 3.7; a *= 0.5; } return v / 0.9375; }`;
  // wind for any instanced foliage: applied in world space after the instance transform
  const WIND_DECL = `uniform float time, windAmp; uniform vec2 windDir; uniform vec4 gust[4]; uniform float fadeR;
    float windAt(vec2 p){ float ph = dot(p, windDir) * 0.11 - time * 2.0; float w = windAmp * (0.55 + 0.45*sin(ph) + 0.3*sin(ph*2.7 + p.x*0.35));
      for (int i = 0; i < 4; i++){ float age = time - gust[i].z; if (age > 0.0 && age < 5.0) { float dd = length(p - gust[i].xy) - age * 24.0; w += gust[i].w * exp(-dd*dd/40.0) * (1.0 - age/5.0) * 1.4; } } return w; }`;
  function windPatch(mat, mode) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { time: U.time, windAmp: U.windAmp, windDir: U.windDir, gust: U.gust, fadeR: U.fadeR });
      sh.vertexShader = WIND_DECL + "\n" + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wpos = modelMatrix * mvPosition;
        ${mode === 'grass' ? `
          float hh = clamp(transformed.y * 0.55, 0.0, 1.0); float w = windAt(wpos.xz);
          wpos.xz += windDir * w * hh * hh * 0.9; wpos.y -= w * w * hh * 0.15;
          #ifdef USE_INSTANCING
            vec3 base = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz; float fd = 1.0 - smoothstep(fadeR*0.6, fadeR, length(base.xz - cameraPosition.xz)); wpos.xyz = mix(base, wpos.xyz, fd);
          #endif` : mode === 'leaves' ? `
          float w = windAt(wpos.xz * 0.6); float k = 0.06 + uv.y * 0.12; wpos.xz += windDir * w * k * 1.6 + vec2(sin(time*3.1 + wpos.y), cos(time*2.7 + wpos.x)) * 0.04 * (0.5 + w);` : `
          float w = windAt(wpos.xz * 0.6); wpos.xz += windDir * w * max(transformed.y - 2.0, 0.0) * 0.012;`}
        mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
    };
    mat.customProgramCacheKey = () => 'wind-' + mode;
  }

  // ---------------- renderer + scene ----------------
  let Rr, scene, cam, composer, bloom, rays, grade, fxaa, out, canvas, sun, hemi, sky, envScene, envSky, cubeRT, cubeCam, pmrem, envRT = null;
  let ready = false, mode = 'none', want = 'auto', songMood = null, quality = 2, pr = 1;
  const W = { d: 0, speed: 8, level: 0.3, hit: 0, kick: 0, swell: 0, t: 0, flare: 0, chordFlash: 0, chords: 0, calm: false, fade: 1, fadeDir: -1, pending: null, gustI: 0, streakT: 0, lastBig: -99, noRender: false, letterbox: true, ambBird: 25, hue: 0, hueT: 0, orbOn: false, envT: 0, levelSlow: 0.35 };
  const loader = new GLTFLoader(); { const d = new DRACOLoader(); d.setDecoderPath('./js/addons/libs/draco/gltf/'); loader.setDRACOLoader(d); }
  const texL = new THREE.TextureLoader();
  const A = {}; // loaded assets

  function skyMaterial() {
    return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: NOISE + `uniform vec3 sunDir, sunCol, skyZen, skyHor, fogCol, cloudLit, cloudDark; uniform float time, cover, stars, moon, sunDisc, cloudSpeed, aurora; uniform vec2 windDir; varying vec3 vDir;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){ vec3 rd = normalize(vDir); float h = rd.y; float s = max(dot(rd, sunDir), 0.0);
          vec3 c = mix(skyHor, skyZen, pow(clamp(h, 0.0, 1.0), 0.5));
          c += sunCol * (pow(s, 4.0)*0.05 + pow(s, 32.0)*0.18) * (1.0 - moon*0.85);
          c = mix(c, fogCol * 0.9, smoothstep(0.03, -0.12, h));
          if (moon < 0.5) c += sunCol * smoothstep(0.99955, 0.99975, s) * sunDisc;
          if (stars > 0.0 && h > 0.0) { vec3 q = rd * 300.0; float r = h3(floor(q)); float st = step(0.985, r) * smoothstep(0.35, 0.0, length(fract(q) - 0.5)) * (0.55 + 0.45*sin(time*(0.7 + r*2.0) + r*50.0));
            vec3 q2 = rd * 110.0; float r2 = h3(floor(q2) + 3.0); float st2 = step(0.994, r2) * smoothstep(0.3, 0.0, length(fract(q2) - 0.5));
            float mw = smoothstep(0.55, 0.9, gfbm(rd.xz*4.0/(h + 0.6) + 2.0));
            c += (vec3(1.0, 0.96, 0.9) * (st*0.25 + st2*0.6) + vec3(0.02, 0.025, 0.05) * mw) * stars * smoothstep(0.0, 0.2, h); }
          if (moon > 0.5) { vec3 tq = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0))); vec2 uv = vec2(dot(rd, tq), dot(rd, cross(tq, sunDir))) * 70.0;
            float disc = smoothstep(1.0, 0.95, length(uv)) * step(0.0, dot(rd, sunDir)); float cr = gfbm(uv*2.5 + 4.0);
            c = mix(c, vec3(3.2, 3.1, 2.9) * (0.7 + 0.4*cr), disc); c += vec3(0.05, 0.07, 0.12) * pow(s, 60.0); }
          if (aurora > 0.0 && h > 0.0) { float x = rd.x / (h + 0.3); float a = gfbm(vec2(x*1.5, time*0.03)); float fold = gfbm(vec2(x*5.0 + a*3.0, h*4.0 - time*0.05));
            float cur = smoothstep(0.45, 0.75, a) * smoothstep(0.08, 0.3, h + fold*0.08) * smoothstep(0.75, 0.3, h) * (0.6 + 0.6*fold);
            c += mix(vec3(0.05, 0.5, 0.25), vec3(0.25, 0.08, 0.45), smoothstep(0.1, 0.55, h)) * cur * aurora * 0.35; }
          if (h > 0.0) { vec2 uv = rd.xz / (h + 0.1) * 0.9 + windDir * time * cloudSpeed * 0.35; vec2 uv2 = uv + sunDir.xz * 0.05;
            float n = gfbm(uv*1.3 + gfbm(uv*0.6)*0.9), n2 = gfbm(uv2*1.3 + gfbm(uv2*0.6)*0.9);
            float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n) * smoothstep(0.0, 0.16, h);
            float lit = clamp(0.62 + (n - n2) * 5.0, 0.0, 1.0); vec3 cc = mix(cloudDark, cloudLit, lit);
            cc += sunCol * pow(s, 10.0) * 0.25 * (1.0 - smoothstep(0.0, 0.6, dens)) * (1.0 - moon);
            cc = mix(cc, fogCol, (1.0 - smoothstep(0.0, 0.2, h)) * 0.6); c = mix(c, cc, dens * 0.96); }
          gl_FragColor = vec4(c, 1.0); }` });
  }

  function init(cv) {
    canvas = cv;
    Rr = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    pr = Math.min(1.25, window.devicePixelRatio || 1); Rr.setPixelRatio(pr);
    Rr.toneMapping = THREE.ACESFilmicToneMapping; Rr.toneMappingExposure = 0.7;
    Rr.shadowMap.enabled = true; Rr.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x9fb4c8, 0.0009);
    cam = new THREE.PerspectiveCamera(52, 1, 0.5, 6000);
    sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 900; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
    scene.add(sun); scene.add(sun.target);
    hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.4); scene.add(hemi);
    sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMaterial()); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    envScene = new THREE.Scene(); envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky.material); envScene.add(envSky);
    cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }); cubeCam = new THREE.CubeCamera(1, 1000, cubeRT); pmrem = new THREE.PMREMGenerator(Rr);

    composer = new EffectComposer(Rr, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    composer.addPass(new RenderPass(scene, cam));
    rays = new ShaderPass({ uniforms: { tDiffuse: { value: null }, sunUV: { value: new THREE.Vector2(0.5, 0.5) }, amt: { value: 0 }, col: { value: C(1, 0.9, 0.7) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunUV; uniform float amt; uniform vec3 col; varying vec2 vUv;
        void main(){ vec4 base = texture2D(tDiffuse, vUv); if (amt < 0.001) { gl_FragColor = base; return; }
          vec2 d = (sunUV - vUv) / 40.0; vec2 uv = vUv; float il = 0.0, dec = 1.0;
          for (int i = 0; i < 40; i++){ uv += d; vec3 s = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; il += clamp(dot(s, vec3(0.3, 0.59, 0.11)) - 1.6, 0.0, 6.0) * dec; dec *= 0.955; }
          gl_FragColor = vec4(base.rgb + col * il * amt * 0.02, base.a); }` });
    composer.addPass(rays);
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 1.6); composer.addPass(bloom);
    out = new OutputPass(); composer.addPass(out);
    fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
    grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fade: { value: 1 }, grain: { value: 0.025 }, bar: { value: 0.06 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time, fade, grain, bar; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c * vec3(0.95, 0.99, 1.05), c * vec3(1.04, 1.0, 0.94), smoothstep(0.15, 0.75, l));
          c = c + (c*c*(3.0 - 2.0*c) - c) * 0.12;
          vec2 q = vUv - 0.5; c *= mix(0.62, 1.0, smoothstep(0.9, 0.22, length(q*vec2(1.0, 1.25))));
          float n = fract(sin(dot(vUv*(time + 1.0), vec2(12.9898, 78.233))) * 43758.5453); c += (n - 0.5) * grain;
          c *= 1.0 - fade; if (abs(vUv.y - 0.5) > 0.5 - bar) c = vec3(0.0); gl_FragColor = vec4(c, 1.0); }` });
    composer.addPass(grade);
    resize(); addEventListener('resize', resize); bindInput();
    applyTod(wantTod === 'auto' ? clockTod() : wantTod);
    loadAssets().then(() => buildStatic()).then(() => { applyTod(curTod); applyScene(cur); ready = true; }).catch(e => { console.error(e); });
  }
  function resize() {
    if (!Rr) return; const w = innerWidth, h = innerHeight;
    Rr.setPixelRatio(pr); Rr.setSize(w, h, false); composer.setPixelRatio(pr); composer.setSize(w, h);
    bloom.setSize(w * pr / 2, h * pr / 2); cam.aspect = w / h; cam.updateProjectionMatrix();
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    grade.uniforms.bar.value = W.letterbox && w / h > 1.3 ? Math.max(0, (1 - (w / h) / 2.1) / 2) : 0;
  }
  let frames = 0, dtAvg = 16, slowT = 0;
  function perf(dt) {
    frames++; dtAvg += (dt * 1000 - dtAvg) * 0.05;
    if (frames > 120 && dtAvg > 28) { slowT += dt; if (slowT > 2.5) { slowT = 0; frames = 0; if (pr > 0.6) { pr = Math.max(0.6, pr - 0.15); resize(); } else if (quality > 0) setQuality(quality - 1); } } else slowT = 0;
  }
  function setQuality(q) {
    quality = q; Rr.shadowMap.enabled = q > 0; sun.castShadow = q > 0; sun.shadow.mapSize.set(q > 1 ? 2048 : 1024, q > 1 ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    NEAR_TREE = q > 1 ? 150 : q > 0 ? 110 : 70; GR = q > 1 ? 3 : 2; U.fadeR.value = GR * GCH + 4; gKey = ''; bloom.enabled = q > 0;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  // ---------------- assets ----------------
  async function loadAssets() {
    const tex = (f, srgb = true, rep = true) => texL.loadAsync('assets/' + f).then(t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; });
    const glb = f => loader.loadAsync('assets/' + f + '.glb');
    const [grassT, dirtT, dirtN, waterN, rocks, grassM, flowers, horse, stork, fox] = await Promise.all([
      tex('grass.jpg'), tex('dirt_color.jpg'), tex('dirt_normal.jpg', false), tex('waternormals.jpg', false),
      Promise.all(['rock1', 'rock2', 'rock3'].map(glb)), glb('grass'), Promise.all(['flower_white', 'flower_yellow', 'flower_blue'].map(glb)), glb('Horse'), glb('Stork'), glb('Fox')]);
    Object.assign(A, { grassT, dirtT, dirtN, waterN, rocks, grassM, flowers, horse, stork, fox });
    let rockMap = null; rocks[0].scene.traverse(o => { if (o.isMesh && !rockMap) rockMap = o.material.map; });
    if (rockMap) { rockMap.wrapS = rockMap.wrapT = THREE.RepeatWrapping; rockMap.colorSpace = THREE.SRGBColorSpace; }
    A.rockT = rockMap || dirtT;
  }

  // ---------------- terrain ----------------
  const TILE = 256, NR = 6, tiles = new Map(), spare = [], idxCache = {};
  let terrMat, tileKey = '', tileJobs = [];
  function makeTerrainMat() {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { tGrass: { value: A.grassT }, tDirt: { value: A.dirtT }, tDirtN: { value: A.dirtN }, tRock: { value: A.rockT }, gTint: TU.gTint, dTint: TU.dTint, dryAmt: TU.dryAmt, snowLine: TU.snowLine, waterLevel: TU.waterLevel, trailOn: TU.trailOn });
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = 'varying vec3 vWP; varying vec3 vWN; uniform sampler2D tGrass, tDirt, tDirtN, tRock; uniform vec3 gTint, dTint; uniform float dryAmt, snowLine, waterLevel, trailOn;\n' + NOISE + '\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec3 nW = normalize(vWN); float slope = 1.0 - nW.y; vec2 q = mod(vWP.xz, 8192.0);
          float macro = gfbm(q * 0.012), macro2 = gfbm(q * 0.0025 + 7.0), fine = gn(q * 0.6);
          vec3 g1 = texture2D(tGrass, q * 0.16).rgb, g2 = texture2D(tGrass, q * 0.031 + 0.37).rgb;
          vec3 grassC = mix(g1, g2, 0.45) * vec3(0.92, 1.28, 0.62) * gTint * (0.78 + 0.5 * macro); grassC = mix(grassC, grassC * vec3(1.25, 1.15, 0.7), smoothstep(0.55, 0.85, gfbm(q * 0.05 + 3.0)) * 0.6);
          grassC = mix(grassC, grassC * dTint * 1.25, smoothstep(0.5, 0.8, macro2) * dryAmt);
          vec3 dirtC = texture2D(tDirt, q * 0.11).rgb * vec3(1.05, 1.0, 0.95);
          vec3 bw = pow(abs(nW), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 rockC = (texture2D(tRock, vWP.zy * 0.09).rgb * bw.x + texture2D(tRock, q * 0.09).rgb * bw.y + texture2D(tRock, vWP.xy * 0.09).rgb * bw.z) * vec3(1.05, 1.02, 1.0);
          rockC *= 0.8 + 0.4 * gfbm(q * 0.02 + vec2(vWP.y * 0.02));
          vec3 col = mix(grassC, dirtC, smoothstep(0.62, 0.78, macro + fine * 0.15) * 0.55);
          col = mix(col, rockC, smoothstep(0.30, 0.52, slope + (macro - 0.5) * 0.25));
          { float td0 = -vWP.z; float px = sin(td0 * 0.0021) * 140.0 + sin(td0 * 0.0057 + 1.3) * 45.0; float tx = px + 38.0 + 16.0 * sin(td0 * 0.004 + 0.8) + 8.0 * sin(td0 * 0.011 + 2.0);
            float tdist = abs(vWP.x - tx) + (fine - 0.5) * 0.6; float trail = (1.0 - smoothstep(0.8, 1.7, tdist)) * (1.0 - smoothstep(0.3, 0.5, slope)) * trailOn;
            col = mix(col, dirtC * vec3(0.92, 0.86, 0.8), trail * 0.9); }
          float beach = 1.0 - smoothstep(waterLevel + 0.4, waterLevel + 1.6 + fine, vWP.y);
          col = mix(col, mix(dirtC, vec3(0.30, 0.26, 0.19), 0.65), beach); float wet = 1.0 - smoothstep(waterLevel - 0.3, waterLevel + 0.5, vWP.y); col *= 1.0 - wet * 0.5;
          float sn = smoothstep(snowLine - 25.0, snowLine + 5.0, vWP.y + (macro - 0.5) * 50.0) * (1.0 - smoothstep(0.5, 0.75, slope));
          col = mix(col, vec3(0.92, 0.94, 0.98), sn);
          diffuseColor.rgb *= col;`)
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness; roughnessFactor = mix(roughnessFactor, 0.35, wet); roughnessFactor = mix(roughnessFactor, 0.55, sn);`)
        .replace('#include <normal_fragment_maps>', `{ vec3 tn = texture2D(tDirtN, q * 0.11).xyz * 2.0 - 1.0; vec3 nn = normalize(vec3(nW.x + tn.x * 0.35, nW.y, nW.z + tn.y * 0.35)); normal = normalize((viewMatrix * vec4(nn, 0.0)).xyz); }`);
    };
    return m;
  }
  const TU = { trailOn: { value: 1 }, gTint: { value: C(1, 1, 1) }, dTint: { value: C(1, 1, 1) }, dryAmt: { value: 0.3 }, snowLine: { value: 250 }, waterLevel: { value: 0 } };
  function tileIndex(segs) {
    if (idxCache[segs]) return idxCache[segs];
    const n = segs + 1, idx = [];
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    const per = []; for (let i = 0; i < segs; i++) per.push(i); for (let j = 0; j < segs; j++) per.push(j * n + segs); for (let i = segs; i > 0; i--) per.push(segs * n + i); for (let j = segs; j > 0; j--) per.push(j * n);
    const base = n * n, P = per.length; for (let k = 0; k < P; k++) { const a = per[k], b = per[(k + 1) % P], sa = base + k, sb = base + (k + 1) % P; idx.push(a, sa, b, b, sa, sb); }
    return (idxCache[segs] = { idx, per });
  }
  function tileGeo(segs) { const n = segs + 1, cnt = n * n + 4 * segs, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cnt * 3), 3)); g.setIndex(tileIndex(segs).idx); g.boundingSphere = new THREE.Sphere(V(), 1); return g; }
  function fillTile(t) {
    const segs = t.segs, n = segs + 1, st = TILE / segs, x0 = t.ix * TILE, z0 = t.iz * TILE, m = n + 2, H = new Float32Array(m * m);
    for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) H[(j + 1) * m + (i + 1)] = heightAt(x0 + i * st, z0 + j * st);
    const g = t.geos[segs], P = g.attributes.position.array, N = g.attributes.normal.array; let lo = 1e9, hi = -1e9;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i, c = (j + 1) * m + (i + 1), h = H[c]; lo = Math.min(lo, h); hi = Math.max(hi, h);
      P[k * 3] = x0 + i * st; P[k * 3 + 1] = h; P[k * 3 + 2] = z0 + j * st; const nx = H[c - 1] - H[c + 1], ny = 2 * st, nz = H[c - m] - H[c + m], l = Math.hypot(nx, ny, nz); N[k * 3] = nx / l; N[k * 3 + 1] = ny / l; N[k * 3 + 2] = nz / l; }
    const per = tileIndex(segs).per, base = n * n, drop = st * 2 + 6;
    for (let k = 0; k < per.length; k++) { const a = per[k], s = base + k; P[s * 3] = P[a * 3]; P[s * 3 + 1] = P[a * 3 + 1] - drop; P[s * 3 + 2] = P[a * 3 + 2]; N[s * 3] = N[a * 3]; N[s * 3 + 1] = N[a * 3 + 1]; N[s * 3 + 2] = N[a * 3 + 2]; }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.boundingSphere.center.set(x0 + TILE / 2, (lo + hi) / 2, z0 + TILE / 2); g.boundingSphere.radius = Math.hypot(TILE * 0.71, (hi - lo) / 2 + drop);
    t.mesh.geometry = g; t.mesh.visible = true; t.mesh.castShadow = t.segs >= 48;
  }
  function placeTile(w) { const key = w.ix + ',' + w.iz; let t = tiles.get(key);
    if (!t) { t = spare.pop(); if (!t) { t = { geos: {}, mesh: new THREE.Mesh(tileGeo(12), terrMat) }; t.mesh.receiveShadow = true; t.mesh.userData.kind = 'ground'; scene.add(t.mesh); } tiles.set(key, t); }
    t.ix = w.ix; t.iz = w.iz; t.segs = w.segs; if (!t.geos[w.segs]) t.geos[w.segs] = tileGeo(w.segs); fillTile(t); }
  function updateTiles(x, z, budget, force) {
    const cix = Math.floor(x / TILE), ciz = Math.floor(z / TILE), key = cix + ',' + ciz;
    if (key !== tileKey || force) { tileKey = key; const wantT = new Map();
      for (let oz = -NR; oz <= NR; oz++) for (let ox = -NR; ox <= NR; ox++) { const r = Math.max(Math.abs(ox), Math.abs(oz)); wantT.set((cix + ox) + ',' + (ciz + oz), { ix: cix + ox, iz: ciz + oz, r, segs: r <= 1 ? 96 : r === 2 ? 48 : r <= 4 ? 24 : 12 }); }
      for (const [k, t] of tiles) if (!wantT.has(k)) { t.mesh.visible = false; spare.push(t); tiles.delete(k); }
      tileJobs = []; for (const [k, w] of wantT) { const t = tiles.get(k); if (force || !t || t.segs !== w.segs) tileJobs.push(w); } tileJobs.sort((a, b) => a.r - b.r); }
    const t0 = performance.now(); while (tileJobs.length) { const w = tileJobs[0]; if (budget != null && w.r > 1 && performance.now() - t0 > budget) break; tileJobs.shift(); placeTile(w); }
  }

  // ---------------- instanced models with CPU culling / LOD ----------------
  // A "kit" is a list of {geo, mat} parts sharing one transform (e.g. branches + leaves).
  function kitFromScene(root, scale = 1) {
    root.updateMatrixWorld(true); const parts = [];
    root.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale).multiply(o.matrixWorld)); parts.push({ geo: g, mat: o.material }); } });
    return parts;
  }
  function Batch(parts, cap, o = {}) {
    const meshes = parts.map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, cap); m.count = 0; m.userData.kind = o.kind || 'thing'; m.frustumCulled = false; m.castShadow = !!o.shadow; m.receiveShadow = true; if (p.depth) m.customDepthMaterial = p.depth; scene.add(m); return m; });
    let n = 0;
    return { meshes, cap, begin() { n = 0; }, add(mtx) { if (n >= cap) return; for (const m of meshes) m.setMatrixAt(n, mtx); n++; }, end() { for (const m of meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; } },
      dispose() { for (const m of meshes) { scene.remove(m); m.dispose(); } } };
  }
  const frustum = new THREE.Frustum(), pmat = new THREE.Matrix4(), sph = new THREE.Sphere();
  // world items: {x,y,z,yaw,s,v,r} — v = variant, r = bounding radius at s=1
  function ItemSet(kind) { return { kind, items: [], variants: [] }; }
  function cullSet(set, nearD, farD) {
    const cx = cam.position.x, cz = cam.position.z;
    for (const vv of set.variants) { vv.near && vv.near.begin(); vv.far && vv.far.begin(); }
    for (const it of set.items) {
      const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz; if (d2 > farD * farD) continue;
      const vv = set.variants[it.v], r = vv.r * it.s; sph.center.set(it.x, it.y + r * 0.5, it.z); sph.radius = r; if (!frustum.intersectsSphere(sph)) continue;
      tq.setFromAxisAngle(UP, it.yaw); tm.compose(tv.set(it.x, it.y, it.z), tq, ts.set(it.s, it.s, it.s));
      if (d2 < nearD * nearD || !vv.far) vv.near.add(tm); else vv.far.add(tm);
    }
    for (const vv of set.variants) { vv.near && vv.near.end(); vv.far && vv.far.end(); }
  }

  // ---------------- trees (EZ-Tree) ----------------
  let NEAR_TREE = 150; const trees = ItemSet('trees');
  function standardFromPhong(ph, leaves) {
    const m = new THREE.MeshStandardMaterial({ map: ph.map || null, normalMap: ph.normalMap || null, color: ph.color, roughness: leaves ? 0.75 : 0.95, metalness: 0, side: leaves ? THREE.DoubleSide : THREE.FrontSide, alphaTest: leaves ? Math.max(0.4, ph.alphaTest || 0.5) : 0 });
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; windPatch(m, leaves ? 'leaves' : 'branch'); return m;
  }
  function makeImpostor(group, h, w) {
    const res = 256, rt = new THREE.WebGLRenderTarget(res, res * 2, { type: THREE.UnsignedByteType }); rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const s2 = new THREE.Scene(); s2.add(new THREE.AmbientLight(0xffffff, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(0.4, 1, 0.8); s2.add(dl);
    const g2 = group.clone(); g2.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshLambertMaterial({ map: o.material.map, color: o.material.color, alphaTest: o.material.alphaTest || 0, side: THREE.DoubleSide }); } }); s2.add(g2);
    const half = Math.max(w * 0.5, h * 0.25) * 1.05, oc = new THREE.OrthographicCamera(-half, half, half * 2, 0, 0.1, 1000); oc.position.set(0, 0, 400); oc.lookAt(0, 0, 0); oc.position.y = 0; oc.updateProjectionMatrix();
    oc.top = Math.max(h * 1.02, half * 2); oc.bottom = 0; oc.left = -oc.top / 4; oc.right = oc.top / 4; oc.updateProjectionMatrix();
    const prev = Rr.getRenderTarget(), prevTM = Rr.toneMapping; Rr.toneMapping = THREE.NoToneMapping; Rr.setRenderTarget(rt); Rr.setClearColor(0x000000, 0); Rr.clear(); Rr.render(s2, oc); Rr.setRenderTarget(prev); Rr.toneMapping = prevTM; Rr.setClearColor(0x000000, 1);
    const ww = oc.right * 2, hh = oc.top, geo = new THREE.BufferGeometry();
    const q1 = new THREE.PlaneGeometry(ww, hh).translate(0, hh / 2, 0), q2 = q1.clone().rotateY(Math.PI / 2);
    const merged = mergeGeos([q1, q2]); const mat = new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xffffff, fog: true });
    return { geo: merged, mat };
  }
  function mergeGeos(list) { const pos = [], nrm = [], uv = [], idx = []; let off = 0;
    for (const g of list) { const gi = g.index ? g : g; const p = gi.attributes.position.array, n = gi.attributes.normal.array, u = gi.attributes.uv.array; for (let i = 0; i < p.length; i++) pos.push(p[i]); for (let i = 0; i < n.length; i++) nrm.push(n[i]); for (let i = 0; i < u.length; i++) uv.push(u[i]); const ix = gi.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += p.length / 3; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g; }
  const IMP_MATS = [];
  const texReady = t => new Promise(res => { const im = t && t.image; if (!im || (im.complete !== false && (im.width || im.naturalWidth))) return res(); im.addEventListener ? (im.addEventListener('load', () => res(), { once: true }), setTimeout(res, 4000)) : res(); });
  async function buildTrees() {
    const specs = [['Oak Medium', 0.2, 'b', 11], ['Oak Small', 0.22, 'b', 3], ['Ash Medium', 0.18, 'b', 5], ['Ash Small', 0.2, 'b', 9], ['Oak Large', 0.13, 'b', 2], ['Ash Large', 0.12, 'b', 12],
      ['Pine Medium', 0.22, 'c', 4], ['Pine Small', 0.25, 'c', 8], ['Pine Large', 0.2, 'c', 6], ['Bush 1', 0.09, 'bush', 1], ['Bush 2', 0.1, 'bush', 7]];
    for (const [name, s, kind, sd] of specs) {
      const t = new Tree(); t.loadPreset(name); t.options.seed = sd * 1013 + 7; t.generate();
      await Promise.all([t.leavesMesh.material.map, t.branchesMesh.material.map, t.branchesMesh.material.normalMap].map(texReady));
      const bb = new THREE.Box3().setFromObject(t), h = (bb.max.y - bb.min.y) * s, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * s;
      const bm = standardFromPhong(t.branchesMesh.material, false), lm = standardFromPhong(t.leavesMesh.material, true);
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lm.map, alphaTest: lm.alphaTest });
      const sg = new THREE.Matrix4().makeScale(s, s, s), bg = t.branchesMesh.geometry.clone().applyMatrix4(sg), lg = t.leavesMesh.geometry.clone().applyMatrix4(sg);
      const grp = new THREE.Group(); grp.add(new THREE.Mesh(bg, t.branchesMesh.material)); grp.add(new THREE.Mesh(lg, t.leavesMesh.material));
      const imp = makeImpostor(grp, h, w); IMP_MATS.push(imp.mat);
      trees.variants.push({ name, kind, h, r: Math.max(h, w) * 0.6, near: Batch([{ geo: bg, mat: bm }, { geo: lg, mat: lm, depth }], kind === 'bush' ? 300 : 220, { shadow: true, kind: 'tree' }), far: Batch([imp], 2500, { kind: 'tree' }), giant: name === 'Oak Medium' });
    }
  }

  // ---------------- rocks, ruins, islands, giants ----------------
  const rocks = ItemSet('rocks'), props = ItemSet('props');
  function stoneMaterial(tint = '#ffffff', mossy = true) {
    const m = new THREE.MeshStandardMaterial({ color: C(tint), roughness: 0.9 });
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { tRock: { value: A.rockT }, tGrass: { value: A.grassT }, glowAmt: GLOW, clickPos: CLICK.pos, clickAge: CLICK.age, clickBeat: CLICK.beat });
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * transformedNormal);`);
      sh.fragmentShader = 'varying vec3 vWP; varying vec3 vWN; uniform sampler2D tRock, tGrass; uniform float glowAmt, clickAge, clickBeat; uniform vec3 clickPos;\n' + NOISE + '\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec3 nW = normalize((inverse(viewMatrix) * vec4(normalize(vNormal), 0.0)).xyz); vec3 bw = pow(abs(nW), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rc = texture2D(tRock, vWP.zy * 0.25).rgb * bw.x + texture2D(tRock, vWP.xz * 0.25).rgb * bw.y + texture2D(tRock, vWP.xy * 0.25).rgb * bw.z;
        ${mossy ? 'float moss = smoothstep(0.55, 0.85, nW.y + (gfbm(vWP.xz*0.3) - 0.5)*0.4); rc = mix(rc, texture2D(tGrass, vWP.xz*0.3).rgb*0.8, moss);' : ''}
        diffuseColor.rgb *= rc * 1.15;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float rune = step(0.93, fract(vWP.y * 0.9 + gn(vWP.xz * 0.7) * 0.3)) * step(0.4, gn(vWP.xz * 2.1 + vWP.y)); float touch = exp(-length(vWP - clickPos) / 16.0) * exp(-clickAge / 14.0) * step(0.0, clickAge) * smoothstep(0.0, 1.2, clickAge * 3.0 - length(vWP - clickPos) * 0.15);
          totalEmissiveRadiance += vec3(0.3, 0.9, 1.0) * (rune * (glowAmt * 3.0 + touch * (4.0 + clickBeat * 10.0)) + touch * 0.08);`);
    };
    m.customProgramCacheKey = () => 'stone' + (mossy ? 1 : 0); return m;
  }
  const GLOW = { value: 0 }, CLICK = { pos: { value: V(0, -9999, 0) }, age: { value: 999 }, beat: { value: 0 } };
  async function buildStatic() {
    terrMat = makeTerrainMat();
    await buildTrees();
    // rocks
    const rmat = stoneMaterial('#c8c0b4', true);
    for (const g of A.rocks) { const parts = kitFromScene(g.scene, 0.12).map(p => ({ geo: p.geo, mat: rmat })); const bb = new THREE.Box3(); for (const p of parts) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
      rocks.variants.push({ r: bb.getSize(V()).length() * 0.5, near: Batch(parts, 400, { shadow: true, kind: 'rock' }) }); }
    // ruins + floating isles + the giant tree use the props set
    const smat = stoneMaterial('#d8d0c4', true);
    for (let k = 0; k < 3; k++) props.variants.push({ r: 14, near: Batch([{ geo: makeRuin(k), mat: smat }], 20, { shadow: true, kind: 'ruin' }), kind: 'ruin' });
    const imat = stoneMaterial('#b8ac9c', false), igrass = new THREE.MeshStandardMaterial({ map: A.grassT, roughness: 0.95 });
    for (let k = 0; k < 2; k++) { const isl = makeIsland(k * 2.7); props.variants.push({ r: 1.6, near: Batch([{ geo: isl.rock, mat: imat }, { geo: isl.top, mat: igrass }], 12, { shadow: false }), kind: 'island' }); }
    { const gt = trees.variants.find(v => v.giant); props.variants.push({ r: gt.r, near: Batch(gt.near.meshes.map(m => ({ geo: m.geometry, mat: m.material })), 6, { shadow: true }), kind: 'giant' }); }
    // grass + flowers
    buildGrass();
    buildOrb(); buildStreaks(); buildCreatures(); buildVillageKit();
    { const n = 500, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = Math.random();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      motes = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { camPos: { value: V() }, box: { value: V(70, 30, 90) }, amt: { value: 0.4 }, hit: { value: 0 }, col: { value: C(1, 1, 1) }, scale: { value: 500 }, time: U.time, blink: { value: 0 }, size: { value: 0.1 } },
        vertexShader: `uniform vec3 camPos, box; uniform float hit, scale, time, blink, size; varying float vA;
          void main(){ vec3 p = position * box; float ph = position.x*91.0 + position.z*37.0; p += vec3(sin(time*0.3 + ph), sin(time*0.4 + ph*1.3)*0.6 + time*0.2*(0.3 + position.y), cos(time*0.27 + ph)) * 2.0;
            vec3 w = mod(p - camPos, box) - box*0.5 + camPos; vec4 mv = viewMatrix * vec4(w, 1.0); float dist = -mv.z; float bl = mix(1.0, smoothstep(0.6, 1.0, sin(time*1.4 + ph*5.0)), blink);
            vA = smoothstep(box.z*0.5, 8.0, dist) * smoothstep(0.8, 4.0, dist) * (bl + hit*0.4); gl_PointSize = clamp(size * (1.0 + hit*0.5) * scale / max(dist, 1.0), 0.0, 20.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float amt; uniform vec3 col; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); float a = pow(smoothstep(0.5, 0.0, r), 2.0); gl_FragColor = vec4(col * a * vA * amt, 1.0); }` }));
      motes.frustumCulled = false; scene.add(motes); }
    water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C('#0e2a30'), roughness: 0.05, metalness: 0.0, normalMap: A.waterN, normalScale: new THREE.Vector2(0.35, 0.35) }));
    A.waterN.repeat.set(8000 / 14, 8000 / 14); water.receiveShadow = true; water.userData.kind = 'water'; scene.add(water); buildInteract(); buildAvatar();
  }
  let water, motes;
  function makeRuin(k) {
    const parts = [], box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => parts.push(new THREE.BoxGeometry(w, h, d, 2, Math.max(1, Math.round(h)), 2).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1))));
    const cyl = (r1, r2, h, x, y, z, rz = 0, ry = 0) => parts.push(new THREE.CylinderGeometry(r1, r2, h, 14, Math.max(1, Math.round(h / 2))).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), V(1, 1, 1))));
    if (k === 0) { box(1.8, 10, 1.8, -4, 5, 0); box(1.8, 10, 1.8, 4, 5, 0); box(10.5, 1.4, 2.2, 0, 10.6, 0); box(2.2, 0.8, 2.2, -4, 0.4, 0); box(2.2, 0.8, 2.2, 4, 0.4, 0); box(1.6, 1.2, 1.5, 6.2, 0.5, 2.6, 0.2, 0.6, 0.3); }
    else if (k === 1) { for (let i = 0; i < 5; i++) { const h = [8, 6.5, 2.4, 7.8, 3.6][i]; cyl(0.75, 0.85, h, i * 3.4 - 6.8, h / 2, 0); if (h > 5) box(2, 0.5, 2, i * 3.4 - 6.8, h + 0.25, 0); } box(17.5, 0.7, 3.4, 0, 0.35, 0); cyl(0.75, 0.75, 5, 1.6, 0.75, 3.4, Math.PI / 2, 0.4); }
    else { parts.push(new THREE.CylinderGeometry(3.4, 3.9, 12, 16, 6, true).translate(0, 6, 0)); parts.push(new THREE.CylinderGeometry(4.1, 4.4, 1.2, 16).translate(0, 0.6, 0)); for (let i = 0; i < 6; i++) { const a = i * 1.05; box(1.4, 1 + (i % 3) * 0.7, 1.0, Math.cos(a) * 3.5, 12.4, Math.sin(a) * 3.5, 0, -a, 0); } }
    const ng = parts.map(g => g.index ? g.toNonIndexed() : g); const pos = [], nrm = []; for (const g of ng) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); return g;
  }
  function makeIsland(k) {
    const g = new THREE.SphereGeometry(1, 40, 26), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const a = Math.atan2(z, x), wob = 1 + 0.15 * Math.sin(a * 3 + k) + 0.07 * Math.sin(a * 8 - k);
      if (y >= 0) { x *= wob; z *= wob; y = y * 0.1; } else { const t = -y, nar = wob * (1 - 0.72 * Math.pow(t, 1.1)) * (1 + 0.1 * Math.sin(t * 13 + a * 4)); x *= nar; z *= nar; y = -t * (1.3 + 0.4 * Math.sin(a * 2 + k)); } P.setXYZ(i, x, y, z); }
    g.computeVertexNormals(); const ng = g.toNonIndexed(), p = ng.attributes.position.array, n = ng.attributes.normal.array, top = [], tn = [], tuv = [], rock = [], rn = [];
    for (let i = 0; i < p.length; i += 9) { const isTop = p[i + 1] > -0.02 && p[i + 4] > -0.02 && p[i + 7] > -0.02; for (let j = 0; j < 9; j += 3) { (isTop ? top : rock).push(p[i + j], p[i + j + 1], p[i + j + 2]); (isTop ? tn : rn).push(n[i + j], n[i + j + 1], n[i + j + 2]); if (isTop) tuv.push(p[i + j] * 6, p[i + j + 2] * 6); } }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); tg.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rock, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
    return { top: tg, rock: rg };
  }

  // ---------------- grass cards + flowers ----------------
  const GCH = 16; let GR = 3, gchunks = new Map(), gspare = [], gKey = '', gJobs = [], grassParts, flowerParts;
  const GN = 900, FN = 40, GRASS_COL = C(0.42, 0.55, 0.22);
  function buildGrass() {
    const gp = kitFromScene(A.grassM.scene, 0.55); grassParts = gp.map(p => { const m = p.mat.clone(); m.alphaTest = 0.5; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.85; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; m.color = GRASS_COL; windPatch(m, 'grass'); return { geo: p.geo, mat: m }; });
    flowerParts = A.flowers.map(f => kitFromScene(f.scene, 0.35).map(p => { const m = p.mat.clone(); m.side = THREE.DoubleSide; windPatch(m, 'grass'); return { geo: p.geo, mat: m }; }));
    U.fadeR.value = GR * GCH + 4;
  }
  function newChunk() { const g = Batch(grassParts, GN), f = flowerParts.map(fp => Batch(fp, FN)); for (const m of g.meshes) m.castShadow = false; for (const b of f) for (const m of b.meshes) m.castShadow = false; return { g, f }; }
  function fillChunk(c) {
    const x0 = c.ix * GCH, z0 = c.iz * GCH; let s = (Math.imul(c.ix, 73856093) ^ Math.imul(c.iz, 19349663)) >>> 0 || 1;
    const r = () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
    const plots = houses.filter(q => q.x > x0 - 8 && q.x < x0 + GCH + 8 && q.z > z0 - 8 && q.z < z0 + GCH + 8);
    c.g.begin(); for (const b of c.f) b.begin();
    const cnt = Math.round(GN * SC.grass * (c.r <= 1 ? 1 : 0.6));
    for (let i = 0; i < cnt; i++) {
      const x = x0 + r() * GCH, z = z0 + r() * GCH, rot = r() * 6.283, sv = r(), fl = r(), fk = r();
      if (Math.abs(x - trailX(-z)) < 1.6) continue; if (plots.length && plots.some(q => (x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r2)) continue;
      const h = heightAt(x, z); if (h < SC.water + 0.35 || h > SC.snow - 35) continue; if (slopeAt(x, z, h) > 0.75) continue;
      const patch = vn(x * 0.05 + 3.3, z * 0.05 - 1.7); if (patch < 0.25 && sv < 0.7) continue;
      const sc2 = (0.55 + patch * 0.9) * (0.75 + sv * 0.5);
      tq.setFromAxisAngle(UP, rot); tm.compose(tv.set(x, h - 0.05, z), tq, ts.set(sc2, sc2 * (0.8 + patch * 0.6), sc2));
      if (fl < 0.035 * SC.flowers * (patch > 0.5 ? 2 : 0.6)) c.f[Math.floor(fk * c.f.length)].add(tm); else c.g.add(tm);
    }
    c.g.end(); for (const b of c.f) b.end();
  }
  function updateGrass(x, z, budget, force) {
    const cix = Math.floor(x / GCH), ciz = Math.floor(z / GCH), key = cix + ',' + ciz;
    if (key !== gKey || force) { gKey = key; const wantC = new Map();
      for (let oz = -GR; oz <= GR; oz++) for (let ox = -GR; ox <= GR; ox++) wantC.set((cix + ox) + ',' + (ciz + oz), { ix: cix + ox, iz: ciz + oz, r: Math.max(Math.abs(ox), Math.abs(oz)) });
      for (const [k, c] of gchunks) if (!wantC.has(k)) { c.g.begin(); c.g.end(); for (const b of c.f) { b.begin(); b.end(); } gspare.push(c); gchunks.delete(k); }
      gJobs = []; for (const [k, w] of wantC) { const c = gchunks.get(k); if (force || !c || c.dense !== (w.r <= 1)) gJobs.push(w); } gJobs.sort((a, b) => a.r - b.r); }
    const t0 = performance.now();
    while (gJobs.length) { const w = gJobs[0]; if (budget != null && w.r > 1 && performance.now() - t0 > budget) break; gJobs.shift();
      const k2 = w.ix + ',' + w.iz; let c = gchunks.get(k2); if (!c) { c = gspare.pop() || newChunk(); gchunks.set(k2, c); } c.ix = w.ix; c.iz = w.iz; c.r = w.r; c.dense = w.r <= 1; fillChunk(c); }
  }

  // ---------------- villages: cottages, a tower, trail lanterns, lit windows, chimney smoke ----------------
  const LC = h => new THREE.Color(h).convertSRGBToLinear();
  const WIN = { value: 0 }, houses = []; let villages = [], HV = 0, LAMPV = 0;
  const nearVillage = (x, z) => villages.some(v => (x - v.x) * (x - v.x) + (z - v.z) * (z - v.z) < v.r * v.r);
  function HB() { return { p: [], n: [], c: [], e: [] }; }
  function hAdd(b, geo, m4, col, em = 0) { const g = geo.index ? geo.toNonIndexed() : geo; if (m4) g.applyMatrix4(m4); const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length; i += 3) { b.p.push(P[i], P[i + 1], P[i + 2]); b.n.push(N[i], N[i + 1], N[i + 2]); b.c.push(col.r, col.g, col.b); b.e.push(em); } }
  function hBuild(b) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3)); g.setAttribute('aEm', new THREE.Float32BufferAttribute(b.e, 1)); g.computeBoundingSphere(); return g; }
  const MX = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(sx, sy, sz));
  function prism(L, Wd, H) { const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.scale(L, H / 1.5, Wd / 1.732); g.translate(0, H / 3, 0); g.computeVertexNormals(); return g; }
  // k: 0 plaster cottage + thatch, 1 stone cottage + slate, 2 long house + tiles, 3 stone tower
  function makeHouse(k) {
    const b = HB(), stone = LC('#a59c90'), plaster = LC('#d9cfbc'), timber = LC('#4a3a2c'), dark = LC('#2a2622'), glass = LC('#3a3428');
    const roofC = LC(['#8c7650', '#4c5058', '#8e4c3a', '#4c5058'][k]), wallC = k === 1 || k === 3 ? stone : plaster, wallE = k === 1 || k === 3 ? -1 : 0;
    if (k === 3) {
      hAdd(b, new THREE.BoxGeometry(4.6, 15, 4.6), MX(0, 5.5, 0), wallC, -1);
      hAdd(b, new THREE.ConeGeometry(3.9, 4.2, 4, 1), MX(0, 15.1, 0, 1, 1, 1, Math.PI / 4), roofC);
      for (const [x, z, ry] of [[0, 2.32, 0], [2.32, 0, Math.PI / 2], [0, -2.32, 0], [-2.32, 0, Math.PI / 2]]) { hAdd(b, new THREE.BoxGeometry(0.7, 1.2, 0.12), MX(x, 10.5, z, 1, 1, 1, ry), glass, 1); hAdd(b, new THREE.BoxGeometry(0.6, 1.0, 0.12), MX(x, 5.5, z, 1, 1, 1, ry), glass, 1); }
      hAdd(b, new THREE.BoxGeometry(1.3, 2.3, 0.14), MX(0, 1.15, 2.32), dark);
      return { geo: hBuild(b), chim: null, r: 4 };
    }
    const Wd = k === 2 ? 11 : R(6.5, 8.5), D = R(5, 6), H = R(3.2, 3.8), rh = k === 0 ? 3.4 : 2.8;
    hAdd(b, new THREE.BoxGeometry(Wd, H + 2, D), MX(0, (H + 2) / 2 - 2, 0), wallC, wallE);
    hAdd(b, prism(Wd + 0.9, D + 1.1, rh), MX(0, H, 0), roofC);
    if (k !== 1) { for (const x of [-Wd / 2 + 0.12, Wd / 2 - 0.12]) for (const z of [-D / 2 - 0.02, D / 2 + 0.02]) hAdd(b, new THREE.BoxGeometry(0.28, H, 0.12), MX(x, H / 2, z), timber); hAdd(b, new THREE.BoxGeometry(Wd, 0.22, 0.12), MX(0, H * 0.55, D / 2 + 0.03), timber); hAdd(b, new THREE.BoxGeometry(Wd, 0.22, 0.12), MX(0, H * 0.55, -D / 2 - 0.03), timber); }
    const nw = k === 2 ? 4 : 2; for (let i = 0; i < nw; i++) { const x = (i - (nw - 1) / 2) * (Wd / nw); for (const z of [D / 2 + 0.04, -D / 2 - 0.04]) { if (z > 0 && Math.abs(x) < 1.0) continue; hAdd(b, new THREE.BoxGeometry(0.9, 1.0, 0.1), MX(x, H * 0.5, z), glass, 1); } }
    hAdd(b, new THREE.BoxGeometry(0.1, 0.9, 0.8), MX(Wd / 2 + 0.04, H * 0.5, 0), glass, 1);
    hAdd(b, new THREE.BoxGeometry(1.1, 2.1, 0.12), MX(0, 1.05, D / 2 + 0.05), dark);
    const cx = Wd * 0.28, cz = -D * 0.18; hAdd(b, new THREE.BoxGeometry(0.75, rh + 1.6, 0.75), MX(cx, H + (rh + 1.6) / 2 - 0.3, cz), stone, -1);
    return { geo: hBuild(b), chim: V(cx, H + rh + 1.3, cz), r: Math.max(Wd, D) * 0.6 };
  }
  function makeLamp() { const b = HB(), wood = LC('#3a2e24'); hAdd(b, new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), MX(0, 1.3, 0), wood); hAdd(b, new THREE.BoxGeometry(0.06, 0.06, 0.55), MX(0, 2.5, 0.25), wood);
    hAdd(b, new THREE.BoxGeometry(0.26, 0.34, 0.26), MX(0, 2.25, 0.5), LC('#5a4a30'), 1); return { geo: hBuild(b), chim: null, r: 1 }; }
  function houseMaterial() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    m.onBeforeCompile = sh => { sh.uniforms.winGlow = WIN; sh.uniforms.tRock = { value: A.rockT };
      sh.vertexShader = 'attribute float aEm; varying float vEm; varying vec3 vHP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEm = aEm;').replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 hp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hp4 = instanceMatrix * hp4;
        #endif
        vHP = (modelMatrix * hp4).xyz;`);
      sh.fragmentShader = 'varying float vEm; varying vec3 vHP; uniform float winGlow; uniform sampler2D tRock;\n' + NOISE + '\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float grime = gfbm(vHP.xz * 0.4 + vHP.y * 0.7); vec3 rt = texture2D(tRock, vHP.xy * 0.2 + vHP.zy * 0.2).rgb;
          diffuseColor.rgb *= mix(0.72, 1.08, grime) * mix(1.0, 0.45 + dot(rt, vec3(0.6)), step(vEm, -0.5)) * mix(1.0, 0.82, smoothstep(1.2, -0.5, vHP.y - 0.0) * 0.0);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.58, 0.24) * max(vEm, 0.0) * winGlow * (0.85 + 0.15 * sin(vHP.x * 3.1 + vHP.z * 2.3 + vHP.y));`);
    };
    m.customProgramCacheKey = () => 'house'; return m;
  }
  const HOUSE_DEF = [];
  function buildVillageKit() {
    const mat = houseMaterial(); HV = props.variants.length;
    for (let k = 0; k < 4; k++) { const h = makeHouse(k); HOUSE_DEF.push(h); props.variants.push({ r: h.r * 2.2 + 6, near: Batch([{ geo: h.geo, mat }], 40, { shadow: true, kind: 'house' }), kind: 'house' }); }
    const l = makeLamp(); LAMPV = props.variants.length; props.variants.push({ r: 3, near: Batch([{ geo: l.geo, mat }], 160, { shadow: false, kind: 'lamp' }), kind: 'lamp' });
    buildSmoke();
  }
  function makeVillage(D) {
    if (SC.villages === 0) return;
    const cx = trailX(D) + R(-6, 16), cz = -D, ch = heightAt(cx, cz); if (ch < SC.water + 1.5 || slopeAt(cx, cz, ch) > 0.3) return;
    const V0 = { x: cx, z: cz, r: 42, d: D }; villages.push(V0); landmarks.push({ d: D, x: cx, z: cz, y: ch + 7 });
    const placed = [], n = 5 + Math.floor(rnd() * 6), tower = rnd() < 0.4;
    for (let i = 0, tries = 0; i < n + (tower ? 1 : 0) && tries < 60; tries++) {
      const k = tower && i === 0 ? 3 : Math.floor(rnd() * 3), def = HOUSE_DEF[k], a = rnd() * 6.283, rr = R(6, 36), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const h = heightAt(x, z); if (h < SC.water + 1 || slopeAt(x, z, h) > 0.35) continue; if (Math.abs(x - trailX(-z)) < def.r + 2.5) continue;
      if (placed.some(q => Math.hypot(q.x - x, q.z - z) < q.r + def.r + 3)) continue;
      const toTrail = Math.atan2(trailX(-z) - x, 0) , yaw = (Math.abs(trailX(-z) - x) > 0 ? (trailX(-z) > x ? Math.PI / 2 : -Math.PI / 2) : 0) + R(-0.35, 0.35), s = R(0.92, 1.12);
      const it = { x, y: h - 0.15, z, yaw, s, v: HV + k }; props.items.push(it); placed.push({ x, z, r: def.r });
      houses.push({ x, z, r2: (def.r * s + 1.5) * (def.r * s + 1.5), d: D });
      if (def.chim) { const c = Math.cos(yaw), sn = Math.sin(yaw); it.chim = V(x + (def.chim.x * c + def.chim.z * sn) * s, h - 0.15 + def.chim.y * s, z + (-def.chim.x * sn + def.chim.z * c) * s); }
      i++;
    }
    for (let dd = D - 60; dd <= D + 60; dd += R(13, 18)) { const x = trailX(dd) + 1.7, z = -dd, h = heightAt(x, z); if (h < SC.water + 0.5) continue; props.items.push({ x, y: h - 0.05, z, yaw: Math.PI / 2, s: 1, v: LAMPV }); }
  }
  // chimney smoke: soft puffs that rise and drift with the wind
  const SMOKE = { pts: null, mat: null, n: 420, k: 0, chims: [], acc: 0 };
  function buildSmoke() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const g = new THREE.BufferGeometry(), n = SMOKE.n, A3 = (k, d) => { const a = new Float32Array(n * d); g.setAttribute(k, new THREE.BufferAttribute(a, d)); return a; };
    A3('position', 3); const born = A3('born', 1); A3('seed', 1); born.fill(-1e4);
    SMOKE.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { tex: { value: new THREE.CanvasTexture(c) }, time: U.time, windDir: U.windDir, scale: { value: 500 }, col: { value: C('#b8b4b0') } },
      vertexShader: `attribute float born, seed; uniform float time, scale; uniform vec2 windDir; varying float vA;
        void main(){ float age = time - born; float t = age / 7.0; vec3 p = position + vec3(windDir.x * age * (0.6 + age * 0.12), age * 0.9 - age * age * 0.03, windDir.y * age * (0.6 + age * 0.12)) + vec3(sin(age * 0.9 + seed * 6.0), 0.0, cos(age * 0.7 + seed * 4.0)) * 0.3 * age;
          vA = (t < 0.0 || t > 1.0) ? 0.0 : smoothstep(0.0, 0.08, t) * (1.0 - t); vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = vA > 0.0 ? clamp((0.9 + age * 0.7) * scale / max(-mv.z, 1.0), 0.0, 220.0) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D tex; uniform vec3 col; varying float vA; void main(){ vec4 t = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(col, t.a * vA * 0.75); }` });
    SMOKE.pts = new THREE.Points(g, SMOKE.mat); SMOKE.pts.frustumCulled = false; scene.add(SMOKE.pts);
  }
  function updateSmoke(dt) {
    if (!SMOKE.pts || !SMOKE.chims.length) return; SMOKE.acc += dt * SMOKE.chims.length * 1.6; const g = SMOKE.pts.geometry, P = g.attributes.position.array, B = g.attributes.born.array, Sd = g.attributes.seed.array;
    while (SMOKE.acc > 1) { SMOKE.acc -= 1; const c = pick(SMOKE.chims), i = SMOKE.k; SMOKE.k = (SMOKE.k + 1) % SMOKE.n; P[i * 3] = c.x + R(-0.15, 0.15); P[i * 3 + 1] = c.y; P[i * 3 + 2] = c.z + R(-0.15, 0.15); B[i] = W.t; Sd[i] = rnd(); g.attributes.position.needsUpdate = true; g.attributes.born.needsUpdate = true; g.attributes.seed.needsUpdate = true; }
  }
  function gatherChimneys() { const cx = cam.position.x, cz = cam.position.z; SMOKE.chims = []; for (const it of props.items) if (it.chim) { const dx = it.x - cx, dz = it.z - cz; if (dx * dx + dz * dz < 380 * 380) SMOKE.chims.push(it.chim); if (SMOKE.chims.length > 14) break; } }

  // ---------------- content along the journey ----------------
  let lay = [], landmarks = [];
  function resetContent() {
    trees.items = []; rocks.items = []; props.items = []; landmarks = []; villages = []; houses.length = 0; seed = 101 + SC_ORDER.indexOf(cur) * 37;
    const L = (gap, fn) => ({ gap, fn, next: W.d - 300 });
    const forestMask = (x, z) => sstep(-0.15, 0.3, fbm(x * 0.0035 + 5.1, z * 0.0035 - 2.7, 3));
    const nb = trees.variants.map((v, i) => i), broad = nb.filter(i => trees.variants[i].kind === 'b'), con = nb.filter(i => trees.variants[i].kind === 'c'), bush = nb.filter(i => trees.variants[i].kind === 'bush');
    const tryTree = (x, z) => { const h = heightAt(x, z); if (h < SC.water + 0.8 || h > SC.snow - 25) return; const sl = slopeAt(x, z, h); if (sl > 1.15) return;
      if (Math.abs(x - trailX(-z)) < 4) return; if (nearVillage(x, z)) return;
      const hill = clamp((h - SC.vfloor - 10) / 60, 0, 0.6), fm = Math.min(1, forestMask(x, z) + hill); if (rnd() > SC.trees * (0.05 + 0.95 * fm * fm)) return;
      const isB = rnd() < 0.18, isC = rnd() < SC.conifer + clamp((h - 40) / 140, 0, 0.6) + (sl > 0.6 ? 0.4 : 0); const v = isB ? pick(bush) : isC ? pick(con) : pick(broad);
      trees.items.push({ x, y: h - 0.2, z, yaw: R(0, 6.28), s: R(0.8, 1.25), v }); };
    lay = [
      L([550, 950], D => makeVillage(D)),
      L([0.2, 0.45], D => { const lat = (rnd() < 0.5 ? -1 : 1) * R(14, 220); tryTree(pathX(D) + lat, -D + R(-2, 2)); }),
      L([0.28, 0.65], D => { const lat = (rnd() < 0.5 ? -1 : 1) * R(220, 760); tryTree(pathX(D) + lat, -D + R(-2, 2)); }),
      L([2.5, 7], D => { if (rnd() > SC.rocks) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(7, 140), z = -D, h = heightAt(x, z); if (h < SC.water - 0.5) return; rocks.items.push({ x, y: h - 0.3, z, yaw: R(0, 6.28), s: R(0.35, 2.2) * (rnd() < 0.1 ? 3 : 1), v: Math.floor(rnd() * 3) }); }),
      L([180, 360], D => { if (rnd() > SC.ruins) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(22, 70), z = -D, h = heightAt(x, z); if (h < SC.water + 1) return; const s = R(0.9, 1.4);
        props.items.push({ x, y: h - 0.5, z, yaw: R(0, 6.28), s, v: Math.floor(rnd() * 3) }); landmarks.push({ d: D, x, z, y: h + 6 * s }); }),
      L([300, 600], D => { if (rnd() > SC.islands) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(260, 800), z = -D, s = R(30, 75); props.items.push({ x, y: heightAt(x, z) + R(160, 360), z, yaw: R(0, 6.28), s, v: 3 + Math.floor(rnd() * 2) }); }),
      L([500, 900], D => { if (rnd() > SC.giant) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(45, 110), z = -D, h = heightAt(x, z); if (h < SC.water + 1) return; props.items.push({ x, y: h - 1, z, yaw: R(0, 6.28), s: R(3.2, 4.2), v: 5 }); landmarks.push({ d: D, x, z, y: h + 25 }); })
    ];
    pumpContent(true);
  }
  function pumpContent(all) {
    for (const l of lay) { let n = 0; while (l.next < W.d + 900 && (all || n++ < 300)) { l.fn(l.next); l.next += R(l.gap[0], l.gap[1]); } }
    const zc = -W.d + 450; // forget things well behind the journey
    for (const set of [trees, rocks, props]) if (set.items.length && set.items[0].z > zc) set.items = set.items.filter(it => it.z <= zc);
    landmarks = landmarks.filter(l => l.d > W.d - 200); villages = villages.filter(v => v.d > W.d - 600); if (houses.length && houses[0].d < W.d - 600) { const keep = houses.filter(q => q.d >= W.d - 600); houses.length = 0; houses.push(...keep); }
  }

  // ---------------- the note orb: it lands on a stone on every note ----------------
  const ORB = { mesh: null, light: null, stones: null, glowAttr: null, land: [], free: [], pos: V(), vel: V(), last: null, ripples: [], sparks: null, cap: 72 };
  function buildOrb() {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: C(1, 1, 1), fog: false }));
    core.material.color.setRGB(4, 3.4, 2.4); ORB.mesh = core; scene.add(core);
    ORB.light = new THREE.PointLight(0xffd9a0, 40, 30, 2); core.add(ORB.light);
    const rk = kitFromScene(A.rocks[1].scene, 0.12)[0], g = rk.geo; g.computeBoundingBox(); const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.max.y, -(bb.min.z + bb.max.z) / 2); g.scale(1, 0.55, 1);
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(ORB.cap), 1); g.setAttribute('aGlow', glow); ORB.glowAttr = glow;
    const m = new THREE.MeshStandardMaterial({ map: A.rockT, roughness: 0.8, color: C('#b8b0a8') });
    m.onBeforeCompile = sh => { sh.uniforms.glowCol = { value: C(1.0, 0.75, 0.4) };
      sh.vertexShader = 'attribute float aGlow; varying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = aGlow;');
      sh.fragmentShader = 'varying float vGlow; uniform vec3 glowCol;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += glowCol * vGlow * (0.4 + 0.6 * smoothstep(-0.3, 0.0, vViewPosition.y * 0.0)) * 6.0;'); };
    m.customProgramCacheKey = () => 'orbstone';
    ORB.stones = new THREE.InstancedMesh(g, m, ORB.cap); ORB.stones.frustumCulled = false; ORB.stones.castShadow = true; ORB.stones.receiveShadow = true; scene.add(ORB.stones);
    for (let i = 0; i < ORB.cap; i++) { ORB.stones.setMatrixAt(i, ZERO); ORB.free.push(i); }
    const rg = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: C(2.5, 1.9, 1.1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); r.visible = false; scene.add(r); ORB.ripples.push({ m: r, age: 9 }); }
    ORB.sparks = Sparks(900); scene.add(ORB.sparks.pts);
    ORB.pos.set(0, 10, 0);
  }
  function Sparks(n) {
    const g = new THREE.BufferGeometry(), Aa = (k, s) => { const a = new Float32Array(n * s); g.setAttribute(k, new THREE.BufferAttribute(a, s)); return a; };
    const pos = Aa('position', 3), vel = Aa('vel', 3), col = Aa('pcol', 3), born = Aa('born', 1), life = Aa('life', 1), size = Aa('size', 1); born.fill(-1e4); life.fill(1);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, scale: { value: 500 } },
      vertexShader: `attribute vec3 vel, pcol; attribute float born, life, size; uniform float time, scale; varying vec3 vC; varying float vA;
        void main(){ float age = time - born; float t = age / life; vec3 p = position + vel*age; p.y -= 0.6*age*age;
          vA = (t < 0.0 || t > 1.0) ? 0.0 : smoothstep(0.0, 0.08, t) * pow(1.0 - t, 1.4); vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = vA > 0.0 ? clamp(size * scale / max(-mv.z, 0.5), 0.0, 60.0) : 0.0; vC = pcol; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); float core = pow(smoothstep(0.5, 0.0, r), 3.0);
        float cr = (max(0.0, 1.0 - abs(q.x)*16.0)*max(0.0, 1.0 - abs(q.y)*2.2) + max(0.0, 1.0 - abs(q.y)*16.0)*max(0.0, 1.0 - abs(q.x)*2.2)) * 0.3; gl_FragColor = vec4(vC * (core*1.4 + cr) * vA, 1.0); }` });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; let k = 0;
    return { pts, mat, emit(x, y, z, vx, vy, vz, lf, sz, c) { const i = k; k = (k + 1) % n; pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); col.set([c.r, c.g, c.b], i * 3); born[i] = mat.uniforms.time.value; life[i] = lf; size[i] = sz; for (const a of ['position', 'vel', 'pcol', 'born', 'life', 'size']) g.attributes[a].needsUpdate = true; },
      clear() { born.fill(-1e4); g.attributes.born.needsUpdate = true; } };
  }
  // schedule a landing at absolute world time t (seconds) with pitch 0..1
  function scheduleLanding(t, pitch, vel = 0.8) {
    if (!ORB.free.length || !W.orbOn) return;
    const prev = ORB.land.length ? ORB.land[ORB.land.length - 1] : null; if (prev && t - prev.t < 0.11) return;
    const D = W.d + W.speed * (t - W.t) + 26 + (prev ? 0 : 0);
    const sw = Math.sin(D * 0.035) * 5 + Math.sin(D * 0.011) * 4;
    let x = pathX(D) + sw + (pitch - 0.5) * 3, z = -D; const g = groundAt(x, z), y = Math.max(g + 2.2, (prev ? prev.ground : g) * 0.6 + g * 0.4 + 3.5) + (pitch - 0.5) * 7 + 1.5;
    const k = ORB.free.shift(); const L = { t, x, y: Math.max(y, g + 1.8), z, ground: g, k, pitch, vel, done: false, born: W.t, spin: R(0, 6.28), s: R(0.85, 1.25) };
    ORB.land.push(L);
  }
  function updateOrb(dt) {
    const now = W.t, glow = ORB.glowAttr.array;
    ORB.mesh.visible = W.orbOn;
    // stones: grow in, flash on landing, sink away later
    for (let i = ORB.land.length - 1; i >= 0; i--) {
      const L = ORB.land[i], age = now - L.born, after = now - L.t;
      if (after > 3.5) { ORB.stones.setMatrixAt(L.k, ZERO); glow[L.k] = 0; ORB.free.push(L.k); ORB.land.splice(i, 1); continue; }
      const grow = sstep(0, 0.7, age), sink = after > 2 ? sstep(2, 3.5, after) : 0, dip = after > 0 && after < 0.35 ? Math.sin(after / 0.35 * Math.PI) * 0.18 : 0;
      const s = L.s * grow * (1 - sink);
      tq.setFromAxisAngle(UP, L.spin + age * 0.05); tm.compose(tv.set(L.x, L.y - 0.32 - dip - sink * 1.5 + Math.sin(now * 1.3 + L.k) * 0.06 * (after < 0 ? 1 : 0), L.z), tq, ts.set(s, s, s)); ORB.stones.setMatrixAt(L.k, tm);
      glow[L.k] = after >= 0 ? Math.exp(-after * 2.2) * (0.6 + L.vel * 0.6) : 0.03 * grow;
    }
    ORB.stones.instanceMatrix.needsUpdate = true; ORB.glowAttr.needsUpdate = true;
    // landed stones become the start of the next arc; long gaps hover, then hop
    for (const L of ORB.land) { if (L.t > now) break; if (!L.done) { L.done = true; onLand(L); ORB.from = { p: V(L.x, L.y, L.z), t: L.t }; } }
    const B = ORB.land.find(L => L.t > now);
    const hoverP = tv2; onPath(W.d + 26, Math.sin((W.d + 26) * 0.035) * 5, hoverP); hoverP.y = groundAt(hoverP.x, hoverP.z) + 5 + Math.sin(now * 1.7) * 0.4;
    const hovering = !B || !ORB.from || (B.t - now > 1.1 && B.t - ORB.from.t > 2.2);
    if (hovering) { ORB.pos.lerp(B ? tv3.set(B.x, B.y + 2.5, B.z).lerp(hoverP, 0.5) : hoverP, Math.min(1, dt * 1.6)); ORB.from = { p: ORB.pos.clone(), t: now }; }
    else { const F = ORB.from, span = Math.max(0.08, B.t - F.t), u = clamp((now - F.t) / span, 0, 1), arcH = clamp(9.8 * 1.8 * span * span / 8, 0.25, 7);
      ORB.pos.set(mix(F.p.x, B.x, u), mix(F.p.y, B.y, u) + arcH * 4 * u * (1 - u), mix(F.p.z, B.z, u)); }
    ORB.mesh.position.copy(ORB.pos);
    const sq = ORB.squash || 0; ORB.squash = sq * Math.exp(-dt * 10); ORB.mesh.scale.set(1 + sq * 0.35, 1 - sq * 0.4, 1 + sq * 0.35);
    ORB.light.intensity = (W.orbOn ? 1 : 0) * (curTod === 'night' || curTod === 'dusk' ? 60 : 25) * (1 + ORB.flash * 2); ORB.flash = (ORB.flash || 0) * Math.exp(-dt * 4);
    if (W.orbOn && Math.random() < 0.7) ORB.sparks.emit(ORB.pos.x + R(-0.1, 0.1), ORB.pos.y + R(-0.1, 0.1), ORB.pos.z + R(-0.1, 0.1), R(-0.3, 0.3), R(-0.2, 0.3), R(-0.3, 0.3), R(0.6, 1.2), R(0.06, 0.12), tc.setRGB(2.5, 1.9, 1.2));
    for (const r of ORB.ripples) { if (r.age > 2) { r.m.visible = false; continue; } r.age += dt; const s = 0.6 + r.age * 3.2; r.m.scale.set(s, 1, s); r.m.material.opacity = Math.max(0, 1 - r.age / 1.2); r.m.visible = true; }
    ORB.sparks.mat.uniforms.time.value = now;
  }
  let ripK = 0;
  function onLand(L) {
    ORB.squash = 1; ORB.flash = 1;
    const r = ORB.ripples[ripK]; ripK = (ripK + 1) % ORB.ripples.length; r.age = 0; r.m.position.set(L.x, L.y - 0.3, L.z);
    const n = W.calm ? 6 : 14; for (let i = 0; i < n; i++) { const a = rnd() * 6.283, sp = R(0.8, 2.6); ORB.sparks.emit(L.x, L.y - 0.2, L.z, Math.cos(a) * sp, R(0.6, 2.2), Math.sin(a) * sp, R(0.6, 1.3), R(0.05, 0.1), tc.setRGB(2.6, 1.8, 0.9)); }
  }

  // ---------------- wind streaks (melody) ----------------
  const NS = 16, SP = 26; let streakMesh, streaks = [], streakK = 0;
  function buildStreaks() {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(NS * SP * 2 * 3), al = new Float32Array(NS * SP * 2), idx = [];
    for (let s = 0; s < NS; s++) for (let i = 0; i < SP - 1; i++) { const a = (s * SP + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('al', new THREE.BufferAttribute(al, 1)); g.setIndex(idx);
    streakMesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { col: { value: C(1, 1, 1) } },
      vertexShader: `attribute float al; varying float vA; void main(){ vA = al; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col * vA, 1.0); }` }));
    streakMesh.frustumCulled = false; scene.add(streakMesh);
    for (let s = 0; s < NS; s++) streaks.push({ on: false, pts: [], p: V(), v: V(), age: 0, life: 3, spin: 0, w: 0.05, acc: 0 });
  }
  function spawnStreak(pitch) {
    const s = streaks[streakK]; streakK = (streakK + 1) % NS; cam.getWorldDirection(tv); const right = tv2.crossVectors(tv, UP).normalize(), dist = R(16, 34);
    s.p.copy(cam.position).addScaledVector(tv, dist).addScaledVector(right, R(-0.6, 0.6) * dist * 0.7); s.p.y += (pitch - 0.5) * dist * 0.5 + R(-1, 2);
    const wd = U.windDir.value; s.v.set(wd.x, 0, wd.y).multiplyScalar(R(5, 9)).addScaledVector(right, R(-3, 3)); s.v.y = R(-0.5, 1);
    s.on = true; s.age = 0; s.life = R(2.2, 3.6); s.spin = (rnd() < 0.5 ? -1 : 1) * R(1.2, 3.2) * (rnd() < 0.55 ? 1 : 0.15); s.w = R(0.018, 0.035); s.pts.length = 0; s.acc = 0; s.ph = rnd() * 6;
  }
  function updateStreaks(dt) {
    const g = streakMesh.geometry, P = g.attributes.position.array, Al = g.attributes.al.array; cam.getWorldDirection(tv);
    for (let k = 0; k < NS; k++) { const s = streaks[k], base = k * SP * 2;
      if (s.on) { s.age += dt; if (s.age > s.life + 1.2) s.on = false; }
      if (!s.on) { for (let i = 0; i < SP * 2; i++) Al[base + i] = 0; continue; }
      if (s.age < s.life) { const a = s.spin * dt * (0.5 + 0.5 * Math.sin(s.age * 2 + s.ph)), c = Math.cos(a), sn = Math.sin(a), vx = s.v.x * c - s.v.z * sn, vz = s.v.x * sn + s.v.z * c; s.v.x = vx; s.v.z = vz;
        s.v.y += Math.cos(s.age * 2.4 + s.ph) * dt * 2.2 * Math.abs(s.spin) * 0.4; s.p.addScaledVector(s.v, dt); s.acc += dt; if (s.acc > 0.035 || !s.pts.length) { s.acc = 0; s.pts.unshift(s.p.clone()); if (s.pts.length > SP) s.pts.pop(); } }
      else if (s.pts.length > 1) { s.acc += dt; if (s.acc > 0.035) { s.acc = 0; s.pts.pop(); } }
      const n = s.pts.length, life = Math.min(1, s.age / 0.4);
      for (let i = 0; i < SP; i++) { const p = s.pts[Math.min(i, n - 1)] || s.p, q = s.pts[Math.min(i + 1, n - 1)] || p; tv2.subVectors(p, q); if (tv2.lengthSq() < 1e-6) tv2.set(1, 0, 0);
        const side = tv2.cross(tv).normalize(), t = i / (SP - 1), w = s.w * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.4 + 0.6 * (1 - t)), o = (base + i * 2) * 3;
        P[o] = p.x + side.x * w; P[o + 1] = p.y + side.y * w; P[o + 2] = p.z + side.z * w; P[o + 3] = p.x - side.x * w; P[o + 4] = p.y - side.y * w; P[o + 5] = p.z - side.z * w;
        const al = i < n ? (1 - t) * life * 0.9 : 0; Al[base + i * 2] = al; Al[base + i * 2 + 1] = al; } }
    g.attributes.position.needsUpdate = true; g.attributes.al.needsUpdate = true;
  }

  // ---------------- creatures: a wild horse, birds ----------------
  const HORSE = { on: false, obj: { position: V() } }, BIRDS = [];
  const HERD = { on: false, list: [], t: 0, c: V(), head: 0, speed: 8.5, lastEnd: -30 }, FOXES = [];
  function buildCreatures() {
    for (let i = 0; i < 7; i++) { const h = A.horse.scene.clone(); h.scale.setScalar(0.0034 * R(0.9, 1.08)); h.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.roughness = 0.75; o.material.color.multiplyScalar(R(0.55, 1.0)); } });
      const mx = new THREE.AnimationMixer(h), act = mx.clipAction(A.horse.animations[0]); act.play(); act.time = R(0, 1.5); h.visible = false; scene.add(h);
      HERD.list.push({ obj: h, mx, off: V(R(-6, 6), 0, (i - 3) * R(2.5, 4)), wob: R(0, 6.28) }); }
    for (let i = 0; i < 7; i++) { const b = A.stork.scene.clone(); b.scale.setScalar(0.005); b.traverse(o => { if (o.isMesh) { o.castShadow = false; o.material = o.material.clone(); o.material.color.setRGB(0.35, 0.33, 0.32); } });
      const mx = new THREE.AnimationMixer(b); const act = mx.clipAction(A.stork.animations[0]); act.play(); act.time = Math.random(); b.visible = false; scene.add(b); BIRDS.push({ obj: b, mx, on: false, p: V(), v: V(), life: 0 }); }
    const fbb = new THREE.Box3().setFromObject(A.fox.scene), flen = Math.max(fbb.max.x - fbb.min.x, fbb.max.z - fbb.min.z) || 1;
    for (let i = 0; i < 5; i++) { const f = SkeletonUtils.clone(A.fox.scene); f.scale.setScalar(1.05 / flen); f.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      const mx = new THREE.AnimationMixer(f), acts = {}; for (const a of A.fox.animations) acts[a.name.toLowerCase()] = mx.clipAction(a); f.visible = false; scene.add(f);
      FOXES.push({ obj: f, mx, acts, on: false, mode: 'survey', timer: 0, head: 0, speed: 0, cur: null }); }
  }
  function flock(from) {
    if (curTod === 'night') return; cam.getWorldDirection(tv); const side = rnd() < 0.5 ? -1 : 1, base = from ? from.clone() : V(cam.position.x + tv.x * 80 + side * 60, cam.position.y + R(12, 35), cam.position.z + tv.z * 80), vel = from ? V(R(-1, 1) * 8, R(2.5, 4), R(-1, 1) * 8) : V(-side * R(7, 9), R(0, 0.8), R(-3, 1));
    BIRDS.forEach((b, k) => { const row = Math.ceil(k / 2), s = k % 2 ? 1 : -1; b.p.set(base.x + side * row * 2.2, base.y + R(-0.5, 0.5), base.z + s * row * 2); b.v.copy(vel); b.on = true; b.life = 22; b.obj.visible = true; b.obj.rotation.y = Math.atan2(vel.x, vel.z); });
  }
  function foxMode(F, m) { if (F.mode === m && F.cur) return; F.mode = m; const a = F.acts[m] || F.acts.walk; if (!a) return; a.reset().fadeIn(0.35).play(); if (F.cur && F.cur !== a) F.cur.fadeOut(0.35); F.cur = a; F.timer = m === 'survey' ? R(2.5, 6) : m === 'walk' ? R(5, 11) : 3; }
  function okGround(x, z) { const h = heightAt(x, z); return h > SC.water + 0.5 && slopeAt(x, z, h) < 0.5 && !nearVillage(x, z) ? h : null; }
  function updateCreatures(dt) {
    for (const b of BIRDS) { if (!b.on) continue; b.life -= dt; if (b.life < 0) { b.on = false; b.obj.visible = false; continue; } b.p.addScaledVector(b.v, dt); b.obj.position.copy(b.p); b.mx.update(dt); }
    cam.getWorldDirection(tv); const fx = tv.x, fz = tv.z, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    // a wild herd crosses the meadows now and then
    if (HERD.on) {
      HERD.t += dt; const hx = Math.sin(HERD.head), hz = Math.cos(HERD.head);
      const ahead = heightAt(HERD.c.x + hx * 14, HERD.c.z + hz * 14); if (ahead < SC.water + 0.6 || slopeAt(HERD.c.x + hx * 14, HERD.c.z + hz * 14, ahead) > 0.55) HERD.head += dt * 1.3; else HERD.head += Math.sin(HERD.t * 0.3) * dt * 0.12;
      HERD.c.x += hx * HERD.speed * dt; HERD.c.z += hz * HERD.speed * dt;
      const far = Math.hypot(HERD.c.x - cam.position.x, HERD.c.z - cam.position.z) > 420;
      for (const H of HERD.list) { const c = Math.cos(HERD.head), sn = Math.sin(HERD.head), ox = H.off.x + Math.sin(HERD.t * 0.7 + H.wob) * 0.8, oz = H.off.z;
        const x = HERD.c.x + ox * c + oz * sn, z = HERD.c.z - ox * sn + oz * c; H.obj.position.set(x, heightAt(x, z), z); H.obj.rotation.y = HERD.head; H.mx.timeScale = HERD.speed / 9; H.mx.update(dt); H.obj.visible = !far; }
      if (HERD.t > 50 || (far && HERD.t > 8)) { HERD.on = false; HERD.lastEnd = W.t; for (const H of HERD.list) H.obj.visible = false; }
    } else if (SC.horse && curTod !== 'night' && W.t - HERD.lastEnd > 35 && rnd() < dt * 0.06 * SC.horse) {
      for (let tries = 0; tries < 8; tries++) { const dist = R(70, 150), lat = R(-90, 90), x = cam.position.x + ux * dist - uz * lat, z = cam.position.z + uz * dist + ux * lat; if (okGround(x, z) == null) continue;
        HERD.on = true; HERD.t = 0; HERD.c.set(x, 0, z); HERD.head = Math.atan2(ux, uz) + (rnd() < 0.5 ? 1 : -1) * R(1.1, 1.9); HERD.speed = R(7, 10); break; }
    }
    // foxes wander the meadows; swoop close and they bolt
    for (const F of FOXES) {
      const o = F.obj, dx = o.position.x - cam.position.x, dz = o.position.z - cam.position.z;
      if (!F.on || dx * dx + dz * dz > 240 * 240 || (dx * ux + dz * uz) < -60) {
        F.on = false; o.visible = false; if (rnd() > dt * 0.8) continue;
        const dist = R(25, 140), lat = R(-55, 55), x = cam.position.x + ux * dist - uz * lat, z = cam.position.z + uz * dist + ux * lat, h = okGround(x, z); if (h == null) continue;
        o.position.set(x, h, z); F.head = R(0, 6.28); F.on = true; o.visible = true; foxMode(F, rnd() < 0.5 ? 'walk' : 'survey'); continue;
      }
      const ad = Math.hypot(o.position.x - AV.pos.x, o.position.z - AV.pos.z, (o.position.y - AV.pos.y) * 0.5);
      if (ad < 16 && F.mode !== 'run') { foxMode(F, 'run'); F.head = Math.atan2(o.position.x - AV.pos.x, o.position.z - AV.pos.z); }
      F.timer -= dt; if (F.timer < 0) foxMode(F, F.mode === 'survey' ? 'walk' : 'survey');
      const sp = F.mode === 'run' ? 7 : F.mode === 'walk' ? 1.3 : 0; F.speed += (sp - F.speed) * Math.min(1, dt * 3);
      const nx = o.position.x + Math.sin(F.head) * 2.5, nz = o.position.z + Math.cos(F.head) * 2.5; if (okGround(nx, nz) == null) F.head += dt * 2.5; else if (F.mode === 'walk') F.head += Math.sin(W.t * 0.5 + o.id) * dt * 0.4;
      o.position.x += Math.sin(F.head) * F.speed * dt; o.position.z += Math.cos(F.head) * F.speed * dt; o.position.y = heightAt(o.position.x, o.position.z); o.rotation.y = F.head; F.mx.update(dt);
    }
  }

  // ---------------- time of day + scenes ----------------
  function applyTod(k) {
    curTod = k; TD = TOD[k]; const el = TD.el * Math.PI / 180, az = TD.az * Math.PI / 180;
    U.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    U.stars.value = TD.stars; U.moon.value = TD.moon; U.sunDisc.value = TD.disc; U.cover.value = TD.cover; U.aurora.value = k === 'night' ? 1 : 0;
    U.skyZen.value.setRGB(...TD.zen); U.skyHor.value.setRGB(...TD.hor); U.cloudLit.value.setRGB(...TD.cl); U.cloudDark.value.setRGB(...TD.cd);
    U.sunCol.value.set(TD.sun).multiplyScalar(TD.si); U.fogCol.value.set(TD.fog);
    if (scene) { scene.fog.color.set(TD.fog); scene.fog.density = TD.fogD; sun.color.set(TD.sun); sun.intensity = TD.si * (k === 'night' ? 1.2 : 1); const fill = { dawn: ['#b4b4d8', '#4a4040'], day: ['#cfe0f8', '#5a5440'], golden: ['#a8b8e8', '#5a4834'], dusk: ['#8a88cc', '#3a3044'], night: ['#6c84d0', '#1a1e2c'] }[k];
      hemi.intensity = TD.aI; hemi.color.set(fill[0]); hemi.groundColor.set(fill[1]); WIN.value = { day: 0, dawn: 0.5, golden: 0.9, dusk: 3.2, night: 4.5 }[k]; if (SMOKE.mat) SMOKE.mat.uniforms.col.value.set(k === 'night' ? '#3a4058' : k === 'dusk' ? '#7a7088' : '#b8b4b0');
      Rr.toneMappingExposure = TD.exp; scene.environmentIntensity = TD.env; GLOW.value = k === 'night' || k === 'dusk' ? 1 : 0;
      for (const m of IMP_MATS) m.color.setScalar(k === 'night' ? 0.3 : k === 'dusk' ? 0.5 : k === 'dawn' ? 0.75 : 0.85);
      if (motes) { const mu = motes.material.uniforms; mu.col.value.set(k === 'night' || k === 'dusk' ? '#d8ff9a' : '#fff4d8'); mu.blink.value = k === 'night' || k === 'dusk' ? 1 : 0; mu.size.value = k === 'night' ? 0.22 : 0.08; mu.amt.value = k === 'night' ? 1.6 : k === 'dusk' ? 1 : 0.3; }
      W.envT = 999; }
  }
  function updateEnv() {
    envSky.position.set(0, 0, 0); cubeCam.update(Rr, envScene);
    const next = pmrem.fromCubemap(cubeRT.texture); if (envRT) envRT.dispose(); envRT = next; scene.environment = envRT.texture;
  }
  function applyScene(k) {
    cur = k; SC = SCN[k];
    TU.gTint.value.set(SC.tint); GRASS_COL.set(SC.card || '#7c9a48'); TU.dTint.value.set(SC.dryTint); TU.dryAmt.value = SC.dry; TU.snowLine.value = SC.snow; TU.waterLevel.value = SC.water;
    water.position.y = SC.water; resetContent();
    AV.inited = false; AV.camInit = false; moodTickCam(0.016); flight(0.016); followCam(0.016);
    updateTiles(cam.position.x, cam.position.z, null, true); updateGrass(cam.position.x, cam.position.z, null, true);
    ORB.land.forEach(L => { ORB.stones.setMatrixAt(L.k, ZERO); ORB.free.push(L.k); }); ORB.land = []; ORB.from = null;
    HERD.on = false; for (const H of HERD.list) H.obj.visible = false; for (const F of FOXES) { F.on = false; F.obj.visible = false; }
  }

  // ---------------- camera director ----------------
  const CAM = { shot: null, t: 0, len: 10, o: {}, ys: null, lastShot: '', look: V(), lookS: null };
  const camP = V(), look = V();
  const onPath = (d, lat, out) => out.set(pathX(d) + lat, 0, -d);
  function groundMax(x, z, r) { let m = groundAt(x, z); if (r) m = Math.max(m, groundAt(x + r, z), groundAt(x - r, z), groundAt(x, z + r), groundAt(x, z - r)); return m; }
  function pickShot(big) {
    const lv = W.level; let opts;
    if (big) opts = ['reveal', 'drone', 'reveal'];
    else if (lv < 0.32) opts = ['still', 'grass', 'side', 'track', 'orbit', 'still'];
    else if (lv < 0.6) opts = ['track', 'side', 'orbit', 'drone', 'grass', 'still'];
    else opts = ['drone', 'track', 'reveal', 'side', 'orbit'];
    if (W.orbOn && !big) opts = opts.concat(['orb', 'orb', 'orb']);
    if (HORSE.on && !big) opts = opts.concat(['horse', 'horse', 'horse']);
    if (W.calm) opts = opts.filter(o => o !== 'reveal').concat(['still', 'still']);
    let k = pick(opts), tries = 0; while (k === CAM.lastShot && tries++ < 6) k = pick(opts); return k;
  }
  function directorStart(big, force) {
    const kind = force || pickShot(big); CAM.shot = kind; CAM.lastShot = kind; CAM.t = 0; CAM.ys = null; CAM.lookS = null;
    const o = CAM.o = { side: rnd() < 0.5 ? -1 : 1, d0: W.d };
    if (kind === 'track') Object.assign(o, { lat: R(-12, 12), h: R(3.5, 8), len: R(9, 15) });
    else if (kind === 'drone') Object.assign(o, { lat: R(-60, 60), h: R(45, 110), len: R(10, 16) });
    else if (kind === 'reveal') Object.assign(o, { lat: R(-14, 14), h0: 1.4, h1: R(55, 95), len: R(10, 14) });
    else if (kind === 'side') Object.assign(o, { lat: o.side * R(20, 40), h: R(3, 10), len: R(9, 14) });
    else if (kind === 'grass') Object.assign(o, { lat: R(-8, 8), h: 0.7, len: R(8, 12) });
    else if (kind === 'orb') Object.assign(o, { off: V(o.side * R(5, 9), R(1, 3.5), R(5, 10)), len: R(10, 16) });
    else if (kind === 'horse') Object.assign(o, { off: R(7, 11), h: R(1.2, 2.8), ahead: R(-4, 6), len: R(9, 14) });
    else if (kind === 'still') { const d = W.d + R(50, 110), lat = o.side * R(20, 55), h = R(3, 12); onPath(d, lat, tv); o.cam = V(tv.x, groundMax(tv.x, tv.z, 3) + h, tv.z); const ld = d + R(110, 260); onPath(ld, -lat * R(0.2, 0.9), tv); o.look = V(tv.x, groundAt(tv.x, tv.z) + R(4, 20), tv.z); o.len = R(8, 13); }
    else if (kind === 'orbit') { const lm = landmarks.find(l => l.d > W.d + 30 && l.d < W.d + 260); let tx, tz, ty;
      if (lm) { tx = lm.x; tz = lm.z; ty = lm.y; } else { onPath(W.d + R(60, 110), R(-30, 30), tv); tx = tv.x; tz = tv.z; ty = groundAt(tx, tz) + 6; }
      Object.assign(o, { tgt: V(tx, ty, tz), r: R(28, 50), h: R(6, 20), a0: R(0, 6.28), w: o.side * R(0.05, 0.085), len: R(10, 15) }); }
    if (W.calm) o.len *= 1.5; CAM.len = o.len;
  }
  function directorCam(dt) {
    const o = CAM.o, t = CAM.t, d = W.d; let targetY, smooth = 2.2, lookSmooth = 0;
    if (CAM.shot === 'track') { onPath(d, o.lat, camP); targetY = groundMax(camP.x, camP.z, 6) + o.h; onPath(d + 45, o.lat * 0.4, look); look.y = groundAt(look.x, look.z) + o.h * 0.75; }
    else if (CAM.shot === 'drone') { onPath(d, o.lat, camP); targetY = groundMax(camP.x, camP.z, 30) + o.h; onPath(d + 190, o.lat * 0.3, look); look.y = groundAt(look.x, look.z) + 8; smooth = 0.8; }
    else if (CAM.shot === 'reveal') { const dc = o.d0 + (d - o.d0) * 0.35, e = sstep(0.05, 0.95, t / o.len); onPath(dc, o.lat, camP); targetY = groundMax(camP.x, camP.z, 4) + mix(o.h0, o.h1, e); onPath(dc + 130, o.lat * 0.4, look); look.y = groundAt(look.x, look.z) + mix(2.5, 10, e) + mix(o.h0, o.h1, e) * 0.25; smooth = 6; }
    else if (CAM.shot === 'side') { onPath(d, o.lat, camP); targetY = groundMax(camP.x, camP.z, 4) + o.h; onPath(d + 22, o.lat - o.side * 90, look); look.y = groundAt(look.x, look.z) + o.h * 0.8 + 3; }
    else if (CAM.shot === 'grass') { const dc = o.d0 + (d - o.d0) * 0.45; onPath(dc, o.lat, camP); targetY = groundAt(camP.x, camP.z) + o.h; onPath(dc + 30, o.lat, look); look.y = groundAt(look.x, look.z) + 2.2; smooth = 8; }
    else if (CAM.shot === 'still') { camP.copy(o.cam); targetY = o.cam.y; look.copy(o.look); }
    else if (CAM.shot === 'orbit') { const a = o.a0 + o.w * t; camP.set(o.tgt.x + Math.cos(a) * o.r, 0, o.tgt.z + Math.sin(a) * o.r); targetY = Math.max(groundMax(camP.x, camP.z, 3) + 2, o.tgt.y) + o.h * 0.5; look.copy(o.tgt); }
    else if (CAM.shot === 'orb') { const P = ORB.pos; camP.set(P.x + o.off.x, 0, P.z + o.off.z); targetY = Math.max(P.y + o.off.y, groundAt(camP.x, camP.z) + 1.2); look.copy(P); look.z -= 4; smooth = 3; lookSmooth = 5; }
    else if (CAM.shot === 'horse') { if (!HORSE.on) { directorStart(false); return directorCam(dt); } const H = HORSE.obj.position; onPath(-H.z + o.ahead, H.x - pathX(-H.z) - o.off * Math.sign(HORSE.lat || 1), camP); targetY = groundAt(camP.x, camP.z) + o.h; look.set(H.x, H.y + 1.2, H.z - 1); smooth = 4; lookSmooth = 6; }
    if (CAM.ys == null) CAM.ys = targetY; else CAM.ys += (targetY - CAM.ys) * Math.min(1, dt * smooth);
    camP.y = Math.max(CAM.ys, groundAt(camP.x, camP.z) + 0.6);
    const sway = W.calm ? 0.3 : 1, hand = CAM.shot === 'still' ? 0.12 : CAM.shot === 'drone' ? 0.6 : 0.35;
    camP.x += Math.sin(W.t * 0.37) * hand * sway; camP.y += Math.sin(W.t * 0.53) * hand * 0.6 * sway;
    if (lookSmooth) { if (!CAM.lookS) CAM.lookS = look.clone(); else CAM.lookS.lerp(look, Math.min(1, dt * lookSmooth)); look.copy(CAM.lookS); }
    cam.position.copy(camP); cam.lookAt(look);
    const bank = CAM.shot === 'drone' || CAM.shot === 'track' ? -(pathX(d + 40) - pathX(d)) * 0.004 : 0; cam.rotateZ(bank);
    const fov = (CAM.shot === 'still' ? 40 : CAM.shot === 'drone' ? 55 : CAM.shot === 'grass' ? 58 : CAM.shot === 'orb' || CAM.shot === 'horse' ? 46 : 50) + (W.calm ? 0 : W.kick * 0.6);
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
  // ---------------- cinematic camera: one continuous glide, no cuts ----------------
  // A slow "altitude mood" (0 = gliding just above the grass, 1 = high vista) drifts on its own over minutes;
  // the song's long-term energy nudges it. Everything is spring/exponentially smoothed so nothing ever jumps.
  const GL = { lat: 0, y: null, vy: 0, look: V(), lookInit: false, roll: 0, mood: 0.35, fov: 50 };
  function glideReset() { GL.y = null; GL.vy = 0; GL.lookInit = false; }
  function glideCam(dt) {
    const d = W.d, t = W.t;
    const drift = 0.42 + 0.3 * Math.sin(t * 0.019 + 1.3) + 0.16 * Math.sin(t * 0.0071 + 4.1);
    const moodT = clamp(drift + (W.levelSlow - 0.4) * 0.6, 0, 1);
    GL.mood += (moodT - GL.mood) * Math.min(1, dt * 0.06);
    const m = GL.mood, hT = mix(2.0, 55, m * m * (3 - 2 * m));
    const latT = Math.sin(d * 0.0043 + 0.7) * 16 + Math.sin(d * 0.0011 + 2.0) * 34 * m;
    GL.lat += (latT - GL.lat) * Math.min(1, dt * 0.25);
    onPath(d, GL.lat, camP);
    let g = groundAt(camP.x, camP.z); for (const a of [6, 14, 26, 40]) { onPath(d + a, GL.lat, tv); g = Math.max(g, groundAt(tv.x, tv.z) - a * 0.05); }
    const yT = g + hT; if (GL.y == null) GL.y = yT;
    const k = 0.9; GL.vy += ((yT - GL.y) * k * k - 2 * k * GL.vy) * dt; GL.y += GL.vy * dt;
    camP.y = Math.max(GL.y, groundAt(camP.x, camP.z) + 0.9);
    // look ahead down the valley, with slow scenic pans to the side
    const pan = Math.sin(t * 0.013 + 2.0) * (0.15 + 0.35 * m) + Math.sin(t * 0.031) * 0.06;
    onPath(d + mix(45, 170, m), GL.lat * 0.5, look);
    const dx = look.x - camP.x, dz = look.z - camP.z, c = Math.cos(pan), sn = Math.sin(pan); look.x = camP.x + dx * c - dz * sn; look.z = camP.z + dx * sn + dz * c;
    look.y = groundAt(look.x, look.z) + mix(1.8, 4, m) + (camP.y - groundAt(camP.x, camP.z)) * mix(0.55, 0.2, m);
    if (!GL.lookInit) { GL.look.copy(look); GL.lookInit = true; } else GL.look.lerp(look, Math.min(1, dt * 0.7));
    cam.position.copy(camP); cam.position.x += Math.sin(t * 0.23) * 0.25; cam.position.y += Math.sin(t * 0.31) * 0.12;
    cam.lookAt(GL.look);
    const turn = pathX(d + 70) - 2 * pathX(d + 35) + pathX(d); GL.roll += (clamp(-turn * 0.004, -0.06, 0.06) - GL.roll) * Math.min(1, dt * 0.4); cam.rotateZ(GL.roll);
    const fov = mix(46, 56, m); GL.fov += (fov - GL.fov) * Math.min(1, dt * 0.3); if (Math.abs(cam.fov - GL.fov) > 0.01) { cam.fov = GL.fov; cam.updateProjectionMatrix(); }
  }
  // ---------------- you: a creature that flies the valley; autopilot whenever you let go ----------------
  const AV = { kind: 'bird', bird: null, mx: null, spirit: null, pos: V(), yaw: 0, pitch: 0, roll: 0, speed: 9, ctl: 0, lastInput: -99, inited: false, boost: 0,
    orbYaw: 0, orbPitch: 0, camDist: 6.5, camP: V(), camL: V(), camInit: false, drag: null, steer: { yaw: 0, pitch: 0 }, f: V(0, 0, -1) };
  const KEYS = {}, FLY_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const latAt = d => Math.sin(d * 0.0043 + 0.7) * 16 + Math.sin(d * 0.0011 + 2.0) * 34 * GL.mood;
  const pathYaw = d => Math.atan2(pathX(d + 10) - pathX(d), 10);
  function moodTickCam(dt) {
    const t = W.t, drift = 0.42 + 0.3 * Math.sin(t * 0.019 + 1.3) + 0.16 * Math.sin(t * 0.0071 + 4.1);
    GL.mood += (clamp(drift + (W.levelSlow - 0.4) * 0.6, 0, 1) - GL.mood) * Math.min(1, dt * 0.06);
  }
  function lineY(x, z, fx, fz) { let g = groundAt(x, z); for (const a of [8, 20, 36]) g = Math.max(g, groundAt(x + fx * a, z + fz * a) - a * 0.05); const m = GL.mood; return g + mix(3.0, 55, m * m * (3 - 2 * m)); }
  function buildAvatar() {
    const b = A.stork.scene.clone(); b.scale.setScalar(0.009); b.rotation.order = 'YXZ';
    b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.color.setRGB(0.92, 0.9, 0.86); o.material.roughness = 0.8; } });
    AV.mx = new THREE.AnimationMixer(b); AV.mx.clipAction(A.stork.animations[0]).play(); AV.bird = b; scene.add(b);
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: C(5, 4.2, 2.8), fog: false }));
    sp.add(new THREE.PointLight(0xffd9a0, 18, 24, 2)); AV.spirit = sp; scene.add(sp);
    setAvatar(AV.kind);
  }
  function setAvatar(k) { AV.kind = k; if (AV.bird) { AV.bird.visible = k === 'bird'; AV.spirit.visible = k === 'spirit'; } AV.camInit = false; }
  function flight(dt) {
    const p = AV.pos;
    if (!AV.inited) { const d = W.d; onPath(d, latAt(d), p); AV.yaw = pathYaw(d); AV.pitch = 0; p.y = lineY(p.x, p.z, Math.sin(AV.yaw), -Math.cos(AV.yaw)); AV.inited = true; }
    let iy = 0, ip = 0; if (KEYS.a || KEYS.arrowleft) iy -= 1; if (KEYS.d || KEYS.arrowright) iy += 1; if (KEYS.w || KEYS.arrowup) ip += 1; if (KEYS.s || KEYS.arrowdown) ip -= 1;
    iy += AV.steer.yaw; ip += AV.steer.pitch; const boost = KEYS.shift ? 1 : 0; if (iy || ip || boost) AV.lastInput = W.t;
    const idle = W.t - AV.lastInput, ctlT = idle < 4.5 ? 1 : 0; AV.ctl += (ctlT - AV.ctl) * Math.min(1, dt * (ctlT ? 5 : 0.35));
    const fx = Math.sin(AV.yaw), fz = -Math.cos(AV.yaw), dB = -p.z;
    // autopilot: steer toward the scenic line ahead
    onPath(dB + 45, latAt(dB + 45), tv); tv.y = lineY(tv.x, tv.z, fx, fz);
    const aYaw = clamp(wrapA(Math.atan2(tv.x - p.x, -(tv.z - p.z)) - AV.yaw) * 0.7, -0.4, 0.4);
    const aPitch = (clamp(Math.atan2(tv.y - p.y, Math.hypot(tv.x - p.x, tv.z - p.z)), -0.3, 0.3) - AV.pitch) * 1.1;
    let yawRate = mix(aYaw, iy * 1.05, AV.ctl), pitchRate = mix(aPitch, ip ? ip * 0.85 : -AV.pitch * 0.7, AV.ctl);
    // stay in the valley and keep heading broadly downstream (gentle, also while you steer)
    const off = p.x - pathX(dB); if (Math.abs(off) > 170) yawRate += wrapA(Math.atan2(-Math.sign(off), 0.6) - AV.yaw) * 0.5 * clamp((Math.abs(off) - 170) / 80, 0, 1);
    const fwd = Math.cos(wrapA(AV.yaw - pathYaw(dB))); if (fwd < 0.35) yawRate += wrapA(pathYaw(dB) - AV.yaw) * 0.8 * (0.35 - fwd);
    // never fly into the ground
    let g = groundAt(p.x, p.z); for (const a of [6, 14, 28]) g = Math.max(g, groundAt(p.x + fx * a, p.z + fz * a) - a * 0.06);
    const clr = p.y - g; if (clr < 4) pitchRate += (4 - clr) * 0.45; if (clr > 170) pitchRate -= 0.25;
    AV.yaw = wrapA(AV.yaw + yawRate * dt); AV.pitch = clamp(AV.pitch + pitchRate * dt, -0.5, 0.55);
    AV.roll += (clamp(-yawRate * 0.9, -0.55, 0.55) - AV.roll) * Math.min(1, dt * 2.5);
    AV.boost += (boost - AV.boost) * Math.min(1, dt * 2);
    const sT = 7.5 + 4.5 * W.levelSlow + AV.boost * 10 - Math.sin(AV.pitch) * 6; AV.speed += (sT - AV.speed) * Math.min(1, dt * 0.7);
    const cp = Math.cos(AV.pitch); AV.f.set(Math.sin(AV.yaw) * cp, Math.sin(AV.pitch), -Math.cos(AV.yaw) * cp);
    p.addScaledVector(AV.f, AV.speed * dt); p.y = Math.max(p.y, groundAt(p.x, p.z) + 1.4);
    W.speed = AV.speed * cp; W.d = -p.z;
    if (AV.bird && AV.kind === 'bird') { const b = AV.bird; b.position.copy(p); b.rotation.set(-AV.pitch, Math.atan2(AV.f.x, AV.f.z), -AV.roll);
      AV.mx.timeScale = clamp(0.3 + AV.pitch * 2.2 + AV.boost * 0.9 + (AV.speed < 8 ? 0.3 : 0), 0.08, 1.7); AV.mx.update(dt); }
    if (AV.spirit && AV.kind === 'spirit') { AV.spirit.position.copy(p); AV.spirit.position.y += Math.sin(W.t * 1.7) * 0.15; if (Math.random() < 0.8) ORB.sparks.emit(p.x, p.y, p.z, R(-0.2, 0.2), R(-0.1, 0.2), R(-0.2, 0.2), R(0.8, 1.6), R(0.05, 0.1), tc.setRGB(2.4, 1.9, 1.2)); }
  }
  function followCam(dt) {
    const p = AV.pos, f = AV.f, m = GL.mood, t = W.t; let tgt = tv2, lk = tv3;
    if (AV.kind === 'none') { tgt.copy(p); lk.copy(p).addScaledVector(f, 35); lk.y -= 2; }
    else {
      const autoAng = Math.sin(t * 0.021) * 0.95 + Math.sin(t * 0.0067 + 1) * 0.45;
      const ang = mix(autoAng, 0, AV.ctl) + AV.orbYaw, elev = clamp(mix(0.1 + 0.22 * m + 0.08 * Math.sin(t * 0.017), 0.16, AV.ctl) + AV.orbPitch, -0.3, 1.2);
      const dist = AV.camDist * mix(1 + 0.45 * m, 1, AV.ctl), by = AV.yaw + Math.PI + ang;
      tgt.set(p.x + Math.sin(by) * Math.cos(elev) * dist, p.y + Math.sin(elev) * dist, p.z - Math.cos(by) * Math.cos(elev) * dist);
      lk.copy(p).addScaledVector(f, 4);
    }
    tgt.y = Math.max(tgt.y, groundAt(tgt.x, tgt.z) + 0.8);
    if (!AV.camInit) { AV.camP.copy(tgt); AV.camL.copy(lk); AV.camInit = true; }
    AV.camP.lerp(tgt, 1 - Math.exp(-dt * (AV.kind === 'none' ? 8 : 4))); AV.camL.lerp(lk, 1 - Math.exp(-dt * 5));
    cam.position.copy(AV.camP); cam.lookAt(AV.camL); if (AV.kind === 'none') cam.rotateZ(AV.roll * 0.4);
    if (!AV.drag && W.t - AV.lastInput > 1.5) { AV.orbYaw *= Math.exp(-dt * 0.5); AV.orbPitch *= Math.exp(-dt * 0.5); }
    const fov = mix(48, 56, m); GL.fov += (fov - GL.fov) * Math.min(1, dt * 0.3); if (Math.abs(cam.fov - GL.fov) > 0.01) { cam.fov = GL.fov; cam.updateProjectionMatrix(); }
  }
  // ---- touch the world: things react, and with a beat locked they land on the next beat ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), FXQ = [], RIP = []; let ripI = 0, hintEl = null;
  function buildInteract() {
    const rg = new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: C(1.4, 1.5, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); r.visible = false; scene.add(r); RIP.push({ m: r, age: 99, size: 1 }); }
  }
  function atBeat(fn) { if (W.beatPer > 0.2 && W.nextBeat > W.t && W.nextBeat - W.t < 1.2) FXQ.push({ t: W.nextBeat, fn }); else fn(); }
  function ripple(P, size) { const r = RIP[ripI]; ripI = (ripI + 1) % RIP.length; r.age = 0; r.size = size; r.m.position.set(P.x, SC.water + 0.06, P.z); }
  function burst(P, n, col, up, spread, life) { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, sp = R(0.3, 1) * spread; ORB.sparks.emit(P.x + R(-0.5, 0.5), P.y + R(-0.3, 0.6), P.z + R(-0.5, 0.5), Math.cos(a) * sp, R(0.2, 1) * up, Math.sin(a) * sp, R(life * 0.6, life * 1.3), R(0.05, 0.11), col); } }
  function gustAt(P, amp) { const g = U.gust.value[W.gustI]; W.gustI = (W.gustI + 1) % 4; g.set(P.x, P.z, W.t, amp); }
  function interact(cx, cy) {
    const rc = canvas.getBoundingClientRect(); ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, cam); ray.far = 900;
    const objs = []; for (const t of tiles.values()) if (t.mesh.visible) objs.push(t.mesh); if (water.visible) objs.push(water);
    for (const set of [trees, rocks, props]) for (const v of set.variants) for (const b of [v.near, v.far]) if (b) for (const mm of b.meshes) if (mm.count) objs.push(mm);
    const hits = ray.intersectObjects(objs, false); if (!hits.length) return;
    const h = hits[0], P = h.point.clone(); let kind = h.object.userData.kind || 'ground'; if (kind === 'ground' && P.y < SC.water + 0.05) kind = 'water';
    atBeat(() => react(kind, P)); return kind;
  }
  function react(kind, P) {
    const lv = 0.7 + W.level * 0.6, gap = W.beatPer > 0.2 ? W.beatPer / 2 : 0.28;
    if (kind === 'water') { for (let i = 0; i < 3; i++) FXQ.push({ t: W.t + i * gap, fn: () => ripple(P, 1 + i * 0.35) }); burst(V(P.x, SC.water + 0.1, P.z), 14, tc.setRGB(1.2, 1.3, 1.4), 2.2, 0.9, 0.9); }
    else if (kind === 'tree') { gustAt(P, 1.0 * lv); burst(P, 34, tc.setRGB(1.1, 1.25, 0.35), 0.4, 1.4, 2.6); if (rnd() < 0.65) flock(P); }
    else if (kind === 'ruin') { CLICK.pos.value.copy(P); CLICK.age.value = 0; burst(P, 26, tc.setRGB(0.6, 1.6, 2.0), 2.4, 1.0, 2.2); }
    else { gustAt(P, 0.85 * lv); burst(P, 22, tc.setRGB(1.6, 1.4, 0.8), 1.4, 1.2, 1.8); }
  }
  function updateInteract(dt) {
    for (let i = FXQ.length - 1; i >= 0; i--) if (FXQ[i].t <= W.t) { const q = FXQ.splice(i, 1)[0]; q.fn(); }
    for (const r of RIP) { if (r.age > 3) { r.m.visible = false; continue; } r.age += dt; const s = (0.4 + r.age * 3.2) * r.size; r.m.scale.set(s, 1, s); r.m.material.opacity = Math.max(0, 1 - r.age / 2.4) * 0.55; r.m.visible = true; }
    CLICK.age.value += dt; CLICK.beat.value = W.kick;
  }
  function hideHint() { if (hintEl && !hintEl.dataset.gone) { hintEl.dataset.gone = 1; hintEl.style.opacity = 0; try { localStorage.setItem('vg.flyhint', String(+(localStorage.getItem('vg.flyhint') || 0) + 1)); } catch (e) {} } }
  function bindInput() {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
    addEventListener('keydown', e => { if (typing()) return; const k = e.key.toLowerCase(); if (FLY_KEYS.has(k)) { KEYS[k] = true; AV.lastInput = W.t; hideHint(); if (k.startsWith('arrow')) e.preventDefault(); } });
    addEventListener('keyup', e => { KEYS[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => { AV.drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), touch: e.pointerType === 'touch', moved: 0 }; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
    canvas.addEventListener('pointermove', e => { const D = AV.drag; if (!D) return; const dx = e.clientX - D.x, dy = e.clientY - D.y; D.x = e.clientX; D.y = e.clientY; D.moved += Math.abs(dx) + Math.abs(dy); if (D.moved < 6) return; AV.lastInput = W.t; hideHint();
      if (D.touch) { AV.steer.yaw = clamp((e.clientX - D.x0) / 110, -1, 1); AV.steer.pitch = clamp(-(e.clientY - D.y0) / 110, -1, 1); }
      else { AV.orbYaw -= dx * 0.005; AV.orbPitch = clamp(AV.orbPitch + dy * 0.004, -0.4, 1.0); } });
    const end = e => { const D = AV.drag; AV.drag = null; AV.steer.yaw = AV.steer.pitch = 0; if (D && D.moved < 6 && performance.now() - D.t < 500) { interact(e.clientX, e.clientY); hideHint(); } };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', () => { AV.drag = null; AV.steer.yaw = AV.steer.pitch = 0; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); AV.camDist = clamp(AV.camDist * Math.exp(e.deltaY * 0.001), 4, 40); AV.lastInput = W.t; }, { passive: false });
    let seen = 0; try { seen = +(localStorage.getItem('vg.flyhint') || 0); } catch (e) {}
    if (seen < 3) { hintEl = document.createElement('div'); hintEl.textContent = 'Drag to look  ·  WASD or arrows to fly, Shift to soar  ·  Click the world';
      hintEl.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);font:500 13px/1.4 "Instrument Sans",system-ui,sans-serif;color:#f3e8d6;background:rgba(13,8,16,.55);border:1px solid rgba(241,228,207,.18);padding:9px 16px;border-radius:999px;pointer-events:none;transition:opacity 1.2s;z-index:5;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(hintEl); setTimeout(hideHint, 14000); }
  }
  function directorTick(dt, M) {
    CAM.t += dt;
    if (M.big && CAM.t > 2.5 && W.t - W.lastBig > 14) { W.lastBig = W.t; directorStart(true); return; }
    if (CAM.t > CAM.len && (M.downbeat || CAM.t > CAM.len + 5)) directorStart(false);
  }

  // ---------------- music hooks ----------------
  function onNote(pitch, vel = 0.8) { W.flare = Math.min(1.6, W.flare + 0.5 * vel); }
  function onBass(v = 0.7) { const g = U.gust.value[W.gustI]; W.gustI = (W.gustI + 1) % 4; cam.getWorldDirection(tv); g.set(cam.position.x + tv.x * R(6, 30) + R(-10, 10), cam.position.z + tv.z * R(6, 30) + R(-10, 10), W.t, (W.calm ? 0.25 : 0.45) * v); }
  function onChord(c) { W.chords++; W.chordFlash = 1; if (W.chords % 8 === 0) flock(); }
  function onBig() { if (rnd() < 0.6) flock(); }

  // ---------------- per frame ----------------
  function step(dt, M) {
    if (!Rr) return;
    if (!ready) { W.t += dt; Rr.setClearColor(0x000000); Rr.clear(); return; }
    W.t += dt; W.calm = M.calm; U.time.value = W.t; perf(dt);
    if (wantTod === 'auto' && Math.floor(W.t) % 30 === 0 && Math.floor(W.t - dt) % 30 !== 0) { const k = clockTod(); if (k !== curTod) applyTod(k); }
    if (W.fadeDir > 0) { W.fade = Math.min(1, W.fade + dt / 0.6); if (W.fade >= 1) { if (W.pending) { applyScene(W.pending); W.pending = null; } W.fadeDir = -1; } }
    else if (W.fadeDir < 0) { W.fade = Math.max(0, W.fade - dt / 1.4); if (W.fade <= 0) W.fadeDir = 0; }
    grade.uniforms.fade.value = Math.max(W.fade, M.ending || 0);
    W.level += (M.level - W.level) * Math.min(1, dt * 0.6); W.levelSlow += (M.level - W.levelSlow) * Math.min(1, dt * 0.05);
    W.hit *= Math.exp(-dt * 5); W.kick *= Math.exp(-dt * 6); W.flare *= Math.exp(-dt * 3); W.chordFlash *= Math.exp(-dt * 1.2); W.swell *= Math.exp(-dt * 0.7);
    U.windAmp.value = (M.calm ? 0.12 : 0.18) + W.level * (M.calm ? 0.2 : 0.45); U.cloudSpeed.value = 0.01 + W.level * 0.015;
    moodTickCam(dt); flight(dt); followCam(dt); updateOrb(dt); updateInteract(dt); updateCreatures(dt); updateSmoke(dt); if (SMOKE.mat) SMOKE.mat.uniforms.scale.value = (innerHeight * pr) / (2 * Math.tan(cam.fov * Math.PI / 360));
    updateTiles(cam.position.x, cam.position.z, 6); updateGrass(cam.position.x, cam.position.z, W.t < 0.3 ? null : 4);
    pumpContent(false);
    if (frames % 3 === 0 || W.t < 0.3) { cam.updateMatrixWorld(); pmat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pmat); cullSet(trees, NEAR_TREE, 1700); cullSet(rocks, 600, 600); cullSet(props, 3000, 3000); if (frames % 30 === 0) gatherChimneys(); }
    W.ambBird -= dt; if (W.ambBird < 0) { W.ambBird = R(30, 60); flock(); }
    updateStreaks(dt); streakMesh.material.uniforms.col.value.setScalar(curTod === 'night' ? 0.25 : 0.9);
    // shadow box follows what the camera looks at, snapped to texels to avoid shimmer
    cam.getWorldDirection(tv); const fx = cam.position.x + tv.x * 45, fz = cam.position.z + tv.z * 45, step2 = 160 / 2048, sx = Math.round(fx / step2) * step2, sz = Math.round(fz / step2) * step2, fy = groundAt(sx, sz);
    sun.target.position.set(sx, fy, sz); sun.position.copy(U.sunDir.value).multiplyScalar(400).add(sun.target.position);
    if (TD.el < 2 && curTod !== 'night') sun.intensity = TD.si * 0.6;
    sky.position.copy(cam.position);
    const ws = 14; water.position.set(Math.round(cam.position.x / ws) * ws, SC.water, Math.round(cam.position.z / ws) * ws); water.visible = SC.water > -100;
    A.waterN.offset.set((W.t * 0.004) % 1, (W.t * 0.007) % 1);
    W.envT += dt; if (W.envT > 20) { W.envT = 0; updateEnv(); }
    const mu = motes.material.uniforms; mu.camPos.value.copy(cam.position); mu.hit.value = W.hit; const scl = (innerHeight * pr) / (2 * Math.tan(cam.fov * Math.PI / 360)); mu.scale.value = scl; ORB.sparks.mat.uniforms.scale.value = scl;
    tv.copy(U.sunDir.value).multiplyScalar(1000).add(cam.position).project(cam); cam.getWorldDirection(tv2); const facing = tv2.dot(U.sunDir.value);
    rays.uniforms.sunUV.value.set(tv.x * 0.5 + 0.5, tv.y * 0.5 + 0.5); rays.uniforms.amt.value = tv.z < 1 && facing > 0 && TD.el > -1 && curTod !== 'night' ? sstep(0.2, 0.8, facing) * (curTod === 'day' ? 0.5 : 1) * (1 + W.chordFlash * 0.4 + W.swell * 0.5) : 0;
    rays.uniforms.col.value.copy(U.sunCol.value).multiplyScalar(1 / Math.max(0.5, TD.si));
    bloom.strength = 0.2 + W.level * 0.06 + W.swell * 0.12 + (curTod === 'night' ? 0.15 : 0);
    grade.uniforms.time.value = W.t % 100;
    if (!W.noRender) composer.render();
  }

  // ---------------- drivers ----------------
  let S = null;
  function chordIdx(chords, t) { let lo = 0, hi = chords.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (chords[m].s <= t + 1e-6) lo = m; else hi = m - 1; } return lo; }
  function firstAfter(ev, t) { let lo = 0, hi = ev.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t < t) lo = m + 1; else hi = m; } return lo; }
  function resolveAuto() {
    const m = songMood; if (!m) return cur || 'valley';
    const e = m.energy, b = m.bright ?? 0.5, fast = clamp(((m.bpm || 95) - 95) / 40, 0, 1), slow = clamp((95 - (m.bpm || 95)) / 30, 0, 1), mi = m.minor ? 1 : 0;
    const sc = { valley: 0.6 + 0.3 * (1 - Math.abs(e - 0.45) * 2) + 0.2 * slow, highlands: 0.9 * e + 0.3 * fast, forest: 0.6 * mi + 0.4 * (1 - b), coast: 0.5 * b + 0.4 * (1 - mi) + 0.3 * fast };
    let best = 'valley'; for (const k of SC_ORDER) if (sc[k] > sc[best]) best = k; return best;
  }
  function setTheme(k) { want = k; const key = k === 'auto' ? resolveAuto() : k; if (key === cur) return; if (!ready) { cur = key; SC = SCN[key]; return; } W.pending = key; W.fadeDir = 1; }
  function setTime(k) { wantTod = k; if (Rr) applyTod(k === 'auto' ? clockTod() : k); }
  function load(song, arr) {
    if (!Rr) return; mode = 'timeline';
    const ch = song.chart, E = ch.energy.length ? ch.energy : [0.5];
    const sm = E.map((_, i) => { let a = 0, n = 0; for (let j = i - 2; j <= i + 2; j++) if (E[j] != null) { a += E[j]; n++; } return a / n; });
    S = { E: sm, chords: arr.chords, lenJb: ch.lenJb, endJb: arr.endJb, lead: arr.events.filter(e => e.k === 'lead' && e.d > 0.09), bass: arr.events.filter(e => e.k === 'bass'), drums: arr.events.filter(e => e.k === 'drum'), pL: 0, pB: 0, pD: 0, pO: 0, last: -1, ci: -1, bar: -1, spj: 60 / (ch.bpm || 90) };
    const ld = S.lead, avgN = ld.length ? ld.reduce((a, e) => a + e.n, 0) / ld.length : 70;
    songMood = { minor: !!ch.key.minor, energy: E.reduce((a, b) => a + b, 0) / E.length, bpm: ch.bpm, bright: clamp((avgN - 58) / 24, 0, 1) };
    ORB.land.forEach(L => { ORB.stones && ORB.stones.setMatrixAt(L.k, ZERO); ORB.free.push(L.k); }); ORB.land = []; ORB.from = null;
    if (want === 'auto') setTheme('auto');
  }
  function frame(jb, dt, opts) {
    if (!Rr || !S || mode !== 'timeline') return;
    if (opts.spj) S.spj = opts.spj;
    if (jb < S.last - 0.5 || jb > S.last + 8) { S.pL = firstAfter(S.lead, jb - 0.01); S.pB = firstAfter(S.bass, jb - 0.01); S.pD = firstAfter(S.drums, jb - 0.01); S.pO = firstAfter(S.lead, jb + 0.05); ORB.land.forEach(L => { ORB.stones && ORB.stones.setMatrixAt(L.k, ZERO); ORB.free.push(L.k); }); ORB.land = []; ORB.from = null; }
    // the orb sees the future: schedule stones for notes up to 3.2 s ahead
    if (ready && opts.playing !== false) while (S.pO < S.lead.length && (S.lead[S.pO].t - jb) * S.spj < 3.2) { const e = S.lead[S.pO++]; if (e.t >= jb) scheduleLanding(W.t + (e.t - jb) * S.spj, clamp((e.n - 58) / 28, 0, 1), e.v ?? 0.8); }
    while (S.pL < S.lead.length && S.lead[S.pL].t <= jb) { const e = S.lead[S.pL++]; if (jb - e.t < 1) onNote(clamp((e.n - 58) / 28, 0, 1), e.v ?? 0.8); }
    while (S.pB < S.bass.length && S.bass[S.pB].t <= jb) { const e = S.bass[S.pB++]; if (jb - e.t < 1) onBass(0.7); }
    let big = false;
    while (S.pD < S.drums.length && S.drums[S.pD].t <= jb) { const e = S.drums[S.pD++]; if (jb - e.t > 1) continue; if (e.n === 'ride' || e.n === 'tap') W.hit = Math.min(1.2, W.hit + (e.v || 0.6) * 0.5); else if (e.n === 'kick') W.kick = Math.min(1, W.kick + (e.v || 0.6) * 0.8); else if (e.n === 'swell') { W.swell = 1; big = true; onBig(); } }
    S.last = jb; W.beatPer = S.spj; W.nextBeat = W.t + (Math.ceil(jb + 1e-3) - jb) * S.spj;
    const ci = chordIdx(S.chords, Math.min(jb, S.lenJb)); if (ci !== S.ci) { onChord(S.chords[ci]); S.ci = ci; }
    const bar = Math.max(0, Math.floor(jb / 4)); const downbeat = bar !== S.bar && bar % 4 === 0; S.bar = bar;
    const E = S.E[Math.min(S.E.length - 1, bar)] ?? 0.4, prevE = S.E[Math.max(0, Math.min(S.E.length - 1, bar - 4))] ?? E; if (downbeat && E - prevE > 0.22) big = true;
    const ending = clamp((jb - (S.endJb - 4)) / 4, 0, 1) * 0.9;
    step(dt, { calm: !!opts.calm, level: (E * 0.75 + (opts.level || 0) * 0.4) * (1 - ending * 0.6), downbeat, big, ending });
  }
  const LV = { chordKey: null, onT: 0, lvSlow: 0, beatT: -1 };
  const MD = { t: 0, lv: 0, br: 0, on: 0, quiet: 0, bpm: 0, minor: false, decided: false, lastSwitch: -1e9 };
  function moodTick(dt, f) {
    if (!f.active) return; const lv = f.level || 0;
    if (lv < 0.04) { MD.quiet += dt; if (MD.quiet > 2 && MD.t > 0) { MD.t = MD.lv = MD.br = MD.on = MD.bpm = 0; MD.decided = false; } return; }
    MD.quiet = 0; MD.t += dt; MD.lv += lv * dt; MD.br += (f.pitch ?? 0.5) * dt; MD.on += (f.onsets || []).length; if ((f.tempoConf || 0) > 0.35) MD.bpm = f.bpm; if (f.keyRoot != null) MD.minor = !!f.keyMinor;
    if (!MD.decided && MD.t > 18) { MD.decided = true; songMood = { energy: Math.min(1, MD.lv / MD.t * 1.3), bright: MD.br / MD.t, busy: Math.min(1, MD.on / MD.t / 4), bpm: MD.bpm || 95, minor: MD.minor }; if (want === 'auto' && W.t - MD.lastSwitch > 40) { MD.lastSwitch = W.t; setTheme('auto'); } }
  }
  function live() { if (!Rr) return; mode = 'live'; S = null; songMood = null; LV.chordKey = null; }
  function frameLive(dt, f, opts) {
    if (!Rr || mode !== 'live') return;
    moodTick(dt, f);
    W.hit = Math.max(W.hit, f.hit || 0); W.kick = Math.max(W.kick, f.kick || 0); W.swell = Math.max(W.swell, f.swell || 0);
    let big = false; if ((f.swell || 0) > 0.8) { big = true; onBig(); }
    LV.lvSlow += ((f.level || 0) - LV.lvSlow) * Math.min(1, dt * 0.15); if ((f.level || 0) - LV.lvSlow > 0.3) big = true;
    LV.onT -= dt; for (const o of (f.onsets || [])) { if (LV.onT > 0) break; LV.onT = 0.12; onNote(o, 0.7); }
    if ((f.kickHit || 0) > 0) onBass(Math.min(1, f.kickHit));
    const ck = f.chord ? f.chord.root + f.chord.q : null; if (ck !== LV.chordKey) { if (ck) onChord(f.chord); LV.chordKey = ck; }
    // live audio can't see ahead, so the orb lands on the predicted beat grid
    if (ready && f.active && (f.tempoConf || 0) > 0.4 && f.barDur > 0.6) {
      const per = f.barDur / 4, nextIn = ((f.downbeatIn % per) + per) % per; const busy = (MD.on / Math.max(1, MD.t)) > 3.5 && per > 0.45;
      const stepT = busy ? per / 2 : per;
      for (let k = 0; k < 8; k++) { const t = W.t + nextIn + k * stepT; if (t - W.t > 2.6) break; const lastT = ORB.land.length ? ORB.land[ORB.land.length - 1].t : -1; if (t > lastT + stepT * 0.6) scheduleLanding(t, clamp(f.pitch ?? 0.5, 0, 1), 0.7); }
    }
    if (f.active && (f.tempoConf || 0) > 0.4 && f.barDur > 0.6) { const per = f.barDur / 4; W.beatPer = per; W.nextBeat = W.t + (((f.downbeatIn % per) + per) % per); } else W.beatPer = 0;
    const downbeat = (f.tempoConf || 0) > 0.4 && f.downbeatIn != null && f.downbeatIn < dt * 1.5;
    step(dt, { calm: !!opts.calm, level: f.active ? (f.level || 0) : 0.35, downbeat, big });
  }

  return { init, load, frame, live, frameLive, setBaseHue() {}, setTheme, setTime,
    set orb(v) { W.orbOn = !!v; }, get orb() { return W.orbOn; },
    set avatar(v) { setAvatar(v); }, get avatar() { return AV.kind; },
    _fly(keys, secs) { for (const k of keys) KEYS[k] = true; W.noRender = true; for (let i = 0; i < secs * 30; i++) frameLive(1 / 30, { level: 0.5, active: false, onsets: [] }, {}); for (const k of keys) KEYS[k] = false; W.noRender = false; composer.render(); return { pos: AV.pos.toArray().map(Math.round), yaw: +AV.yaw.toFixed(2), ctl: +AV.ctl.toFixed(2) }; },
    _click(x, y) { return interact(x, y); },
    get themes() { return [{ key: 'auto', name: 'Auto' }].concat(SC_ORDER.map(k => ({ key: k, name: SCN[k].name }))); },
    get times() { return [{ key: 'auto', name: 'Auto' }].concat(TOD_ORDER.map(k => ({ key: k, name: TOD[k].name }))); },
    get theme() { return cur; }, get themeName() { return SCN[cur].name + ' · ' + TD.name; }, get want() { return want; },
    set letterbox(v) { W.letterbox = !!v; resize(); }, get mode() { return mode; }, get ok() { return !!Rr; }, get ready() { return ready; },
    _villages() { return villages.map(v => ({ x: v.x, z: v.z, d: v.d })); },
    _goto(x, y, z, yaw) { AV.pos.set(x, y, z); AV.yaw = yaw; AV.pitch = 0; W.d = -z; AV.camInit = false; AV.lastInput = W.t; pumpContent(true); updateTiles(x, z, null, true); updateGrass(x, z, null, true); },
    _dbg() { return { AV, GL, W, CAM, cam, U, ORB, trees, rocks, props, tiles, gchunks, HORSE, Rr, scene }; },
    _shot(k) { const m = { low: 0.02, mid: 0.45, high: 0.98 }[k]; if (m != null) { GL.mood = m; W.levelSlow = 0.4; glideReset(); } },
    _ff(n, dt, f) { W.noRender = true; for (let i = 0; i < n; i++) frameLive(dt, Object.assign({ level: 0.5, pitch: 0.5, active: true, tempoConf: 0.9, barDur: 2, downbeatIn: 2 - ((W.t % 2) + 2) % 2 }, f || {}, { onsets: i % 7 === 0 ? [Math.random()] : [], kickHit: i % 15 === 0 ? 1 : 0 }), {}); W.noRender = false; composer.render(); } };
})();
window.World = World;
export default World;
