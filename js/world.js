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
    dawn:   { name: 'Dawn', el: 8, az: 60, sun: '#ffc09a', si: 2.4, zen: [0.10, 0.16, 0.36], hor: [1.0, 0.72, 0.6], fog: '#d0bcc0', aI: 0.95, cl: [1.6, 1.25, 1.1], cd: [0.42, 0.40, 0.55], cover: 0.45, stars: 0.08, moon: 0, exp: 1.05, fogD: 0.0008, env: 1.2, disc: 30 },
    day:    { name: 'Midday', el: 42, az: 38, sun: '#fff0d4', si: 3.5, zen: [0.13, 0.29, 0.62], hor: [0.80, 0.84, 0.86], fog: '#d6d9cf', aI: 0.8, cl: [2.5, 2.42, 2.3], cd: [0.80, 0.80, 0.86], cover: 0.42, stars: 0, moon: 0, exp: 0.95, fogD: 0.00075, env: 1.0, disc: 25 },
    golden: { name: 'Golden Hour', el: 13, az: -22, sun: '#ffb274', si: 4.3, zen: [0.10, 0.18, 0.42], hor: [1.35, 0.84, 0.52], fog: '#dcb48e', aI: 1.0, cl: [2.2, 1.5, 1.0], cd: [0.55, 0.45, 0.55], cover: 0.4, stars: 0, moon: 0, exp: 1.0, fogD: 0.0006, env: 1.2, disc: 40 },
    dusk:   { name: 'Dusk', el: 3.5, az: -35, sun: '#ff8a5c', si: 1.7, zen: [0.03, 0.05, 0.15], hor: [0.95, 0.48, 0.34], fog: '#5c4c68', aI: 1.15, cl: [1.1, 0.55, 0.45], cd: [0.12, 0.11, 0.2], cover: 0.4, stars: 0.4, moon: 0, exp: 1.25, fogD: 0.0007, env: 1.5, disc: 0 },
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
  const JSNOISE = `float h2j(int ix, int iz){ uint h = uint(ix) * 374761393u + uint(iz) * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; h ^= h >> 16u; return float(h) / 4294967296.0; }
    float vnj(vec2 p){ vec2 fl = floor(p), f = p - fl; ivec2 i = ivec2(fl); vec2 u = f * f * (3.0 - 2.0 * f); float a = h2j(i.x, i.y), b = h2j(i.x + 1, i.y), c = h2j(i.x, i.y + 1), d = h2j(i.x + 1, i.y + 1); return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y; }
    float fbmj3(vec2 p){ float v = 0.0, a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ v += a * vnj(p); s += a; p = vec2(p.x * 1.6 - p.y * 1.2 + 17.1, p.x * 1.2 + p.y * 1.6 - 9.3); a *= 0.5; } return v / s * 2.0 - 1.0; }`;
  const WIND_DECL = `uniform float time, windAmp; uniform vec2 windDir; uniform vec4 gust[4]; uniform float fadeR;
    float windAt(vec2 p){ float ph = dot(p, windDir) * 0.11 - time * 2.0; float w = windAmp * (0.55 + 0.45*sin(ph) + 0.3*sin(ph*2.7 + p.x*0.35));
      for (int i = 0; i < 4; i++){ float age = time - gust[i].z; if (age > 0.0 && age < 5.0) { float dd = length(p - gust[i].xy) - age * 24.0; w += gust[i].w * exp(-dd*dd/40.0) * (1.0 - age/5.0) * 1.4; } } return w; }`;
  function windPatch(mat, mode, shade) {
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
            ${shade ? 'vGH = hh; vGV = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453); vGW = w;' : ''}
          #endif` : mode === 'leaves' ? `
          float w = windAt(wpos.xz * 0.6); float k = 0.06 + uv.y * 0.12; wpos.xz += windDir * w * k * 1.6 + vec2(sin(time*3.1 + wpos.y), cos(time*2.7 + wpos.x)) * 0.04 * (0.5 + w);` : `
          float w = windAt(wpos.xz * 0.6); wpos.xz += windDir * w * max(transformed.y - 2.0, 0.0) * 0.012;`}
        mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
      if (shade) { sh.vertexShader = 'varying float vGH, vGV, vGW;\n' + sh.vertexShader;
        sh.fragmentShader = 'varying float vGH, vGV, vGW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(0.42, 1.12, smoothstep(0.0, 0.9, vGH)) * (0.82 + 0.36 * vGV); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 1.08, 0.55), smoothstep(0.65, 1.0, vGV) * 0.7);
          diffuseColor.rgb *= 1.0 + vGW * 0.25 * vGH;`); }
    };
    mat.customProgramCacheKey = () => 'wind-' + mode + (shade ? 's' : '');
  }

  // ---------------- renderer + scene ----------------
  let atm, Rr, scene, cam, composer, bloom, rays, grade, fxaa, out, canvas, sun, hemi, sky, envScene, envSky, cubeRT, cubeCam, pmrem, envRT = null;
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

    { const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }); rt.depthTexture = new THREE.DepthTexture(1, 1); composer = new EffectComposer(Rr, rt); composer.renderTarget2.depthTexture = new THREE.DepthTexture(1, 1); composer.renderTarget2.setSize(1, 1); }
    composer.addPass(new RenderPass(scene, cam));
    // atmosphere: aerial perspective that glows toward the sun, valley mist that pools low, and cloud shadows drifting over everything
    atm = new ShaderPass({ uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, viewInv: { value: new THREE.Matrix4() }, camPos: { value: V() }, sunDir: U.sunDir, sunCol: U.sunCol, fogCol: U.fogCol, time: U.time, cover: U.cover, windDir: U.windDir,
        density: { value: 0.0004 }, mistH: { value: 10 }, mistAmt: { value: 0.3 }, csAmt: { value: 0.5 }, on: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NOISE + `uniform sampler2D tDiffuse, tDepth; uniform mat4 projInv, viewInv; uniform vec3 camPos, sunDir, sunCol, fogCol; uniform vec2 windDir; uniform float time, cover, density, mistH, mistAmt, csAmt, on; varying vec2 vUv;
        void main(){ vec4 base = texture2D(tDiffuse, vUv); float d = texture2D(tDepth, vUv).x; if (on < 0.5 || d >= 0.99999) { gl_FragColor = base; return; }
          vec4 vp = projInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w; vec3 P = (viewInv * vp).xyz; vec3 rd = P - camPos; float dist = length(rd); rd /= max(dist, 1e-3);
          vec2 q = P.xz + sunDir.xz / max(sunDir.y, 0.2) * (520.0 - P.y) - windDir * time * 7.0;
          float cl = gfbm(q * 0.0017 + gfbm(q * 0.0006) * 0.8); float cs = smoothstep(1.0 - cover - 0.02, 1.0 - cover + 0.22, cl) * csAmt * smoothstep(0.0, 0.15, sunDir.y);
          vec3 c = base.rgb * (1.0 - cs * 0.5);
          float sunA = pow(max(dot(rd, sunDir), 0.0), 6.0); vec3 haze = fogCol * (1.0 + sunA * 0.6) + sunCol * sunA * 0.05;
          float a = 1.0 - exp(-dist * density);
          float lowY = min(P.y, camPos.y), hm = mistAmt * (1.0 - exp(-dist * 0.006)) * exp(-max(lowY - mistH, 0.0) * 0.07);
          gl_FragColor = vec4(mix(c, haze, clamp(a + hm, 0.0, 0.92)), base.a); }` });
    atm.render = function (r, w, rb, dt, m) { this.uniforms.tDepth.value = rb.depthTexture; this.uniforms.projInv.value.copy(cam.projectionMatrixInverse); this.uniforms.viewInv.value.copy(cam.matrixWorld); this.uniforms.camPos.value.copy(cam.position); ShaderPass.prototype.render.call(this, r, w, rb, dt, m); };
    composer.addPass(atm);
    rays = new ShaderPass({ uniforms: { tDiffuse: { value: null }, sunUV: { value: new THREE.Vector2(0.5, 0.5) }, amt: { value: 0 }, col: { value: C(1, 0.9, 0.7) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunUV; uniform float amt; uniform vec3 col; varying vec2 vUv;
        void main(){ vec4 base = texture2D(tDiffuse, vUv); if (any(isnan(base.rgb)) || any(isinf(base.rgb))) base = vec4(0.0, 0.0, 0.0, 1.0); base.rgb = min(base.rgb, vec3(16.0)); if (amt < 0.001) { gl_FragColor = base; return; }
          vec2 d = (sunUV - vUv) / 40.0; vec2 uv = vUv; float il = 0.0, dec = 1.0;
          for (int i = 0; i < 40; i++){ uv += d; vec3 s = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; il += clamp(dot(s, vec3(0.3, 0.59, 0.11)) - 1.6, 0.0, 6.0) * dec; dec *= 0.955; }
          gl_FragColor = vec4(base.rgb + col * il * amt * 0.02, base.a); }` });
    composer.addPass(rays);
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 1.6); composer.addPass(bloom);
    out = new OutputPass(); composer.addPass(out);
    fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
    grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fade: { value: 1 }, grain: { value: 0.025 }, bar: { value: 0.06 }, pump: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time, fade, grain, bar, pump; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * (1.0 + pump); float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c * vec3(0.97, 1.0, 1.02), c * vec3(1.07, 1.01, 0.9), smoothstep(0.1, 0.8, l)); { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); c = mix(vec3(l), c, 1.0 + 0.18 * (1.0 - (mx - mn))); }
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
    NEAR_TREE = q > 1 ? 150 : q > 0 ? 110 : 70; GR = q > 1 ? 3 : 2; BL.R = q > 1 ? 4 : q > 0 ? 3 : 2; U.fadeR.value = GR * GCH + 4; gKey = ''; bloom.enabled = q > 0;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  // ---------------- assets ----------------
  async function loadAssets() {
    const tex = (f, srgb = true, rep = true) => texL.loadAsync('assets/' + f).then(t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; });
    const glb = f => loader.loadAsync('assets/' + f + '.glb');
    const [grassT, dirtT, dirtN, waterN, rocks, grassM, flowers, horse, stork, fox, parrot] = await Promise.all([
      tex('grass.jpg'), tex('dirt_color.jpg'), tex('dirt_normal.jpg', false), tex('waternormals.jpg', false),
      Promise.all(['rock1', 'rock2', 'rock3'].map(glb)), glb('grass'), Promise.all(['flower_white', 'flower_yellow', 'flower_blue'].map(glb)), glb('Horse'), glb('Stork'), glb('Fox'), glb('Parrot')]);
    Object.assign(A, { grassT, dirtT, dirtN, waterN, rocks, grassM, flowers, horse, stork, fox, parrot });
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
      Object.assign(sh.uniforms, { tGrass: { value: A.grassT }, tDirt: { value: A.dirtT }, tDirtN: { value: A.dirtN }, tRock: { value: A.rockT }, gTint: TU.gTint, dTint: TU.dTint, dryAmt: TU.dryAmt, snowLine: TU.snowLine, waterLevel: TU.waterLevel, trailOn: TU.trailOn, time: U.time }, BL.U, { rRing: RU.rings, ringGlow: RINGG, ringCol: { value: CIRC.chord } });
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = 'varying vec3 vWP; varying vec3 vWN; uniform sampler2D tGrass, tDirt, tDirtN, tRock; uniform vec3 gTint, dTint; uniform float dryAmt, snowLine, waterLevel, trailOn, time, ringGlow; uniform vec3 ringCol; uniform vec4 rRing[4]; uniform vec4 bW[6];\n' + JSNOISE + '\n uniform vec3 bC[6]; uniform vec3 bBase; uniform float bSpeed, bGlow;\n' + NOISE + '\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          float mtrail = 0.0; vec3 nW = normalize(vWN); float slope = 1.0 - nW.y; vec2 q = mod(vWP.xz, 8192.0);
          float macro = gfbm(q * 0.012), macro2 = gfbm(q * 0.0025 + 7.0), fine = gn(q * 0.6);
          vec3 g1 = texture2D(tGrass, q * 0.16).rgb, g2 = texture2D(tGrass, q * 0.031 + 0.37).rgb;
          vec3 grassC = mix(g1, g2, 0.45) * vec3(0.94, 1.36, 0.5) * gTint * (0.78 + 0.5 * macro); grassC = mix(grassC, grassC * vec3(1.25, 1.15, 0.7), smoothstep(0.55, 0.85, gfbm(q * 0.05 + 3.0)) * 0.6);
          grassC = mix(grassC, grassC * dTint * 1.25, smoothstep(0.5, 0.8, macro2) * dryAmt);
          vec3 dirtC = texture2D(tDirt, q * 0.11).rgb * vec3(1.05, 1.0, 0.95);
          vec3 bw = pow(abs(nW), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 rockC = (texture2D(tRock, vWP.zy * 0.09).rgb * bw.x + texture2D(tRock, q * 0.09).rgb * bw.y + texture2D(tRock, vWP.xy * 0.09).rgb * bw.z) * vec3(1.05, 1.02, 1.0);
          rockC *= 0.8 + 0.4 * gfbm(q * 0.02 + vec2(vWP.y * 0.02));
          vec3 col = mix(grassC, dirtC, smoothstep(0.62, 0.78, macro + fine * 0.15) * 0.55);
          col = mix(col, rockC, smoothstep(0.30, 0.52, slope + (macro - 0.5) * 0.25));
          { float fm = smoothstep(-0.15, 0.3, fbmj3(vWP.xz * 0.0035 + vec2(5.1, -2.7))), vdF = length(vWP - cameraPosition), fo = fm * (1.0 - smoothstep(0.4, 0.65, slope));
            float crowns = smoothstep(0.42, 0.78, gn(vWP.xz * 0.11) * 0.7 + gn(vWP.xz * 0.37) * 0.3);
            col = mix(col, col * vec3(0.55, 0.64, 0.46), fo * 0.5);
            col = mix(col, mix(vec3(0.05, 0.085, 0.04), vec3(0.11, 0.15, 0.07), gn(vWP.xz * 0.05)), fo * crowns * smoothstep(140.0, 380.0, vdF) * 0.7); }
          { float td0 = -vWP.z; float px = sin(td0 * 0.0021) * 140.0 + sin(td0 * 0.0057 + 1.3) * 45.0; float tx = px + 38.0 + 16.0 * sin(td0 * 0.004 + 0.8) + 8.0 * sin(td0 * 0.011 + 2.0);
            float tdist = abs(vWP.x - tx) + (fine - 0.5) * 0.6; float trail = (1.0 - smoothstep(0.8, 1.7, tdist)) * (1.0 - smoothstep(0.3, 0.5, slope)) * trailOn;
            col = mix(col, dirtC * vec3(0.92, 0.86, 0.8), trail * 0.9); mtrail = abs(vWP.x - tx) < 9.0 ? 0.35 : 0.0; }
          // flower carpet in the meadows (matches where the bloom flowers grow) + the chord wave sweeping through it
          float mdw = (smoothstep(0.3, 0.56, gn(vWP.xz * 0.017 + vec2(7.7, -3.1))) * (0.5 + 0.5 * gn(vWP.xz * 0.08 + vec2(1.3, 0.0))) + mtrail) * (1.0 - smoothstep(0.25, 0.45, slope)) * step(waterLevel + 0.5, vWP.y);
          vec3 wcol = bBase; float wenv = 0.0, wgp = 0.0, wband = 0.0, wla = 99.0;
          for (int i = 0; i < 6; i++) { float dd = length(vWP.xz - bW[i].xy); float age = time - bW[i].z - dd / bSpeed; float am = bW[i].w;
            if (age > 0.0) { wenv = max(wenv, (1.0 - exp(-age * 6.0)) * exp(-age * 0.3) * am); wgp = max(wgp, exp(-age * 1.7) * am); wcol = bC[i]; wla = age; }
            float ag2 = time - bW[i].z; wband = max(wband, exp(-pow((dd - ag2 * bSpeed) / 4.0, 2.0)) * exp(-ag2 * 0.45) * am); }
          float vd = length(vWP - cameraPosition), farF = smoothstep(25.0, 110.0, vd), farB = farF * (1.0 - smoothstep(170.0, 280.0, vd));
          vec2 fc = floor(vWP.xz * 2.2); float fh = hsh(fc + 17.0); vec2 fo = vec2(hsh(fc + 3.1), hsh(fc + 9.7)) * 0.6 + 0.2;
          float fdot = step(fh, mdw * 0.55) * smoothstep(0.24, 0.12, length(fract(vWP.xz * 2.2) - fo)) * (1.0 - farF);
          float winfl = wla > 90.0 ? 0.0 : smoothstep(0.0, 0.5, wla) * mix(1.0, 0.3, smoothstep(2.5, 10.0, wla)); float fs2 = hsh(fc + 5.0);
          vec3 fown = fs2 < 0.3 ? vec3(1.0, 0.33, 0.42) : fs2 < 0.5 ? vec3(1.0, 0.75, 0.25) : fs2 < 0.68 ? vec3(0.6, 0.45, 1.0) : fs2 < 0.85 ? vec3(1.0, 0.92, 0.85) : vec3(1.0, 0.45, 0.25);
          vec3 fcol = mix(fown, wcol, winfl) * (0.8 + 0.4 * hsh(fc + 8.0)) * (0.55 + 0.6 * (0.36 + 0.64 * wenv));
          float mcl = clamp(mdw, 0.0, 1.0); col = mix(col, fcol, fdot * 0.9); col = mix(col, wcol * dot(col, vec3(0.3, 0.59, 0.11)) * 2.0, mcl * farB * 0.1 * winfl);
          col += wcol * wband * 0.035 * mcl;
          vec3 bloomEm = bGlow * (fcol * fdot * (0.08 + wgp * 1.4) + wcol * wband * 0.05 * mcl * winfl);
          float rb = 0.0; for (int i = 0; i < 4; i++) { float ra = time - rRing[i].z; if (ra > 0.0 && ra < 3.0) { float dd2 = length(vWP.xz - rRing[i].xy) - ra * 20.0; rb += exp(-dd2 * dd2 / 10.0) * exp(-ra * 0.9) * rRing[i].w; } }
          rb = min(rb, 1.0) * (1.0 - smoothstep(0.3, 0.6, slope)) * step(waterLevel + 0.2, vWP.y);
          vec3 rc = mix(vec3(1.0, 0.78, 0.42), ringCol, 0.6); col += rc * rb * 0.5; bloomEm += rc * rb * ringGlow;
          float beach = 1.0 - smoothstep(waterLevel + 0.4, waterLevel + 1.6 + fine, vWP.y);
          col = mix(col, mix(dirtC, vec3(0.30, 0.26, 0.19), 0.65), beach); float wet = 1.0 - smoothstep(waterLevel - 0.3, waterLevel + 0.5, vWP.y); col *= 1.0 - wet * 0.5;
          float sn = smoothstep(snowLine - 25.0, snowLine + 5.0, vWP.y + (macro - 0.5) * 50.0) * (1.0 - smoothstep(0.5, 0.75, slope));
          col = mix(col, vec3(0.92, 0.94, 0.98), sn);
          diffuseColor.rgb *= col;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += bloomEm * (1.0 - sn);')
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
      for (let oz = -NR; oz <= NR; oz++) for (let ox = -NR; ox <= NR; ox++) { const r = Math.max(Math.abs(ox), Math.abs(oz)); wantT.set((cix + ox) + ',' + (ciz + oz), { ix: cix + ox, iz: ciz + oz, r, segs: r <= 1 ? 128 : r === 2 ? 64 : r <= 4 ? 24 : 12 }); }
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
    return { meshes, cap, begin() { n = 0; }, add(mtx) { if (n >= cap) return; for (const m of meshes) m.setMatrixAt(n, mtx); n++; }, end() { for (const m of meshes) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; } },
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
  function stoneMaterial(tint = '#ffffff', mossy = true, runes = false) {
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
          ${runes ? '' : 'rune = 0.0;'} totalEmissiveRadiance += vec3(0.35, 0.85, 1.0) * (rune * (glowAmt * 1.1 + touch * (4.0 + clickBeat * 10.0)) + touch * 0.08);`);
    };
    m.customProgramCacheKey = () => 'stone' + (mossy ? 1 : 0) + (runes ? 'r' : ''); return m;
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
    const smat = stoneMaterial('#d8d0c4', true, true);
    for (let k = 0; k < 3; k++) props.variants.push({ r: 14, near: Batch([{ geo: makeRuin(k), mat: smat }], 20, { shadow: true, kind: 'ruin' }), kind: 'ruin' });
    const imat = stoneMaterial('#b8ac9c', false), igrass = new THREE.MeshStandardMaterial({ map: A.grassT, roughness: 0.95 });
    for (let k = 0; k < 2; k++) { const isl = makeIsland(k * 2.7); props.variants.push({ r: 1.6, near: Batch([{ geo: isl.rock, mat: imat }, { geo: isl.top, mat: igrass }], 12, { shadow: false }), kind: 'island' }); }
    { const gt = trees.variants.find(v => v.giant); props.variants.push({ r: gt.r, near: Batch(gt.near.meshes.map(m => ({ geo: m.geometry, mat: m.material })), 6, { shadow: true }), kind: 'giant' }); }
    // grass + flowers
    buildExtras(); buildGrass(); buildBloom();
    buildOrb(); buildStreaks(); buildCreatures(); buildVillageKit(); buildFish(); buildLampLights(); buildCircles(); buildSkyLanterns(); buildShrooms(); buildFolk(); buildFlutter(); buildBalloons(); buildCrystals(); DECO_STONE = stoneMaterial('#d0c6b4', true);
    { const n = 500, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = Math.random();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      motes = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { camPos: { value: V() }, box: { value: V(70, 30, 90) }, amt: { value: 0.4 }, hit: { value: 0 }, col: { value: C(1, 1, 1) }, scale: { value: 500 }, time: U.time, blink: { value: 0 }, size: { value: 0.1 } },
        vertexShader: `uniform vec3 camPos, box; uniform float hit, scale, time, blink, size; varying float vA;
          void main(){ vec3 p = position * box; float ph = position.x*91.0 + position.z*37.0; p += vec3(sin(time*0.3 + ph), sin(time*0.4 + ph*1.3)*0.6 + time*0.2*(0.3 + position.y), cos(time*0.27 + ph)) * 2.0;
            vec3 w = mod(p - camPos, box) - box*0.5 + camPos; vec4 mv = viewMatrix * vec4(w, 1.0); float dist = -mv.z; float bl = mix(1.0, smoothstep(0.6, 1.0, sin(time*1.4 + ph*5.0)), blink);
            vA = smoothstep(box.z*0.5, 8.0, dist) * smoothstep(0.8, 4.0, dist) * (bl + hit*0.4); gl_PointSize = clamp(size * (1.0 + hit*0.5) * scale / max(dist, 1.0), 0.0, 20.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float amt; uniform vec3 col; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); float a = pow(smoothstep(0.5, 0.0, r), 2.0); gl_FragColor = vec4(col * a * vA * amt, 1.0); }` }));
      motes.frustumCulled = false; scene.add(motes); }
    buildHeightMap();
    water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2), waterMaterial());
    water.renderOrder = 2; water.userData.kind = 'water'; scene.add(water); buildInteract(); buildAvatar();
  }
  let water, motes;
  // ---- water: a toroidal heightmap around the camera lets the shader know the depth everywhere ----
  const HM = { N: 256, cell: 2.5, tex: null, data: null, wx: null, wz: null };
  function buildHeightMap() {
    HM.data = new Uint16Array(HM.N * HM.N); HM.tex = new THREE.DataTexture(HM.data, HM.N, HM.N, THREE.RedFormat, THREE.HalfFloatType);
    HM.tex.wrapS = HM.tex.wrapT = THREE.RepeatWrapping; HM.tex.magFilter = HM.tex.minFilter = THREE.LinearFilter; HM.tex.needsUpdate = true;
  }
  const toHalf = THREE.DataUtils.toHalfFloat, imod = (a, n) => ((a % n) + n) % n;
  function hmColumn(cx) { const N = HM.N, cs = HM.cell, i = imod(cx, N); for (let cz = HM.wz; cz < HM.wz + N; cz++) HM.data[imod(cz, N) * N + i] = toHalf(heightAt(cx * cs, cz * cs)); }
  function hmRow(cz) { const N = HM.N, cs = HM.cell, j = imod(cz, N) * N; for (let cx = HM.wx; cx < HM.wx + N; cx++) HM.data[j + imod(cx, N)] = toHalf(heightAt(cx * cs, cz * cs)); }
  function updateHeightMap(force) {
    const N = HM.N, cs = HM.cell, tx = Math.floor(cam.position.x / cs) - N / 2, tz = Math.floor(cam.position.z / cs) - N / 2; let dirty = false;
    if (force || HM.wx == null || Math.abs(tx - HM.wx) >= N || Math.abs(tz - HM.wz) >= N) { HM.wx = tx; HM.wz = tz; for (let cx = tx; cx < tx + N; cx++) hmColumn(cx); HM.tex.needsUpdate = true; return; }
    const t0 = performance.now();
    while (performance.now() - t0 < 3) {
      if (HM.wx < tx) { HM.wx++; hmColumn(HM.wx + N - 1); } else if (HM.wx > tx) { HM.wx--; hmColumn(HM.wx); }
      else if (HM.wz < tz) { HM.wz++; hmRow(HM.wz + N - 1); } else if (HM.wz > tz) { HM.wz--; hmRow(HM.wz); } else break;
      dirty = true;
    }
    if (dirty) HM.tex.needsUpdate = true;
  }
  const WU = { hmTex: { value: null }, nTex: { value: null }, hmCell: { value: 2.5 }, hmN: { value: 256 }, hmMin: { value: new THREE.Vector2() }, hmMax: { value: new THREE.Vector2() },
    wLevel: { value: 0 }, fogColor: { value: C(0, 0, 0) }, fogDensity: { value: 0.001 }, shallowC: { value: C(0, 0, 0) }, deepC: { value: C(0, 0, 0) }, ambC: { value: C(0, 0, 0) }, kick: { value: 0 }, nightGlow: { value: 0 } };
  function waterMaterial() {
    Object.assign(WU, { time: U.time, sunDir: U.sunDir, sunCol: U.sunCol, skyZen: U.skyZen, skyHor: U.skyHor, cloudLit: U.cloudLit, cloudDark: U.cloudDark, cover: U.cover });
    WU.hmTex.value = HM.tex; WU.nTex.value = A.waterN;
    return new THREE.ShaderMaterial({ uniforms: WU, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: NOISE + `
        uniform sampler2D hmTex, nTex; uniform float hmCell, hmN, wLevel, time, fogDensity, cover, kick, nightGlow; uniform vec2 hmMin, hmMax;
        uniform vec3 fogColor, sunDir, sunCol, skyZen, skyHor, cloudLit, cloudDark, shallowC, deepC, ambC; varying vec3 vW;
        float terrainH(vec2 p){ if (p.x < hmMin.x || p.y < hmMin.y || p.x > hmMax.x || p.y > hmMax.y) return wLevel - 8.0; return texture2D(hmTex, (p / hmCell + 0.5) / hmN).r; }
        void main(){
          vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 v = toC / dist; vec2 uv = mod(vW.xz, 4096.0);
          float depth = max(wLevel - terrainH(vW.xz), 0.0);
          vec3 n1 = texture2D(nTex, uv * 0.045 + vec2(time * 0.010, time * 0.007)).rgb * 2.0 - 1.0;
          vec3 n2 = texture2D(nTex, uv * 0.13 - vec2(time * 0.016, -time * 0.012)).rgb * 2.0 - 1.0;
          vec3 n3 = texture2D(nTex, uv * 0.012 + vec2(-time * 0.003, time * 0.005)).rgb * 2.0 - 1.0;
          float att = 1.0 / (1.0 + dist * 0.015);
          vec2 g = (n1.xy * 0.45 + n2.xy * 0.3 * att + n3.xy * 0.55) * (0.32 + kick * 0.12) * mix(0.35, 1.0, att) * smoothstep(0.0, 0.8, depth + 0.1);
          vec3 n = normalize(vec3(g.x, 1.0, g.y));
          vec3 r = reflect(-v, n); r.y = abs(r.y) + 0.015; r = normalize(r);
          vec3 sky = mix(skyHor, skyZen, pow(clamp(r.y, 0.0, 1.0), 0.5));
          float cl = smoothstep(1.0 - cover, 1.32 - cover, gfbm(r.xz / (max(r.y, 0.0) + 0.1) * 0.9 + time * 0.003)) * smoothstep(0.0, 0.2, r.y);
          sky = mix(sky, mix(cloudDark, cloudLit, 0.65), cl * 0.75);
          sky = mix(sky, fogColor * 0.55 + ambC * 0.35, smoothstep(0.22, 0.0, r.y) * 0.7);
          float fr = 0.025 + 0.975 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          float dk = smoothstep(0.15, 4.0, depth);
          vec3 body = mix(shallowC, deepC, dk) * (ambC + sunCol * max(sunDir.y, 0.05) * 0.35);
          float caus = pow(gn(uv * 1.7 + n.xz * 3.0 + time * 0.4) * gn(uv * 2.3 - time * 0.3 + 4.0), 2.0) * (1.0 - dk) * 1.4;
          body += sunCol * caus * 0.08 * max(sunDir.y, 0.0);
          vec3 c = mix(body, sky, fr);
          float sd = max(dot(r, sunDir), 0.0); c += sunCol * (pow(sd, 900.0) * 7.0 + pow(sd, 90.0) * 0.35);
          float fn = gn(uv * 0.9 + time * 0.25) * 0.6 + gn(uv * 3.1 - time * 0.3) * 0.4;
          float foam = smoothstep(0.32, 0.0, depth + (fn - 0.5) * 0.28) * smoothstep(0.0, 0.04, depth);
          c = mix(c, vec3(0.92, 0.94, 0.93) * (ambC * 1.3 + sunCol * 0.22), foam * 0.75);
          c += vec3(0.25, 0.7, 0.8) * caus * nightGlow * 0.15;
          float alpha = mix(0.2, 0.95, smoothstep(0.0, 1.6, depth)); alpha = max(alpha, fr * 0.92); alpha = max(alpha, foam * 0.85);
          float fogF = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
          gl_FragColor = vec4(mix(c, fogColor, fogF), alpha);
        }` });
  }
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
    const gp = kitFromScene(A.grassM.scene, 0.55); grassParts = gp.map(p => { const m = p.mat.clone(); m.alphaTest = 0.5; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.85; if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; m.color = GRASS_COL; windPatch(m, 'grass', true); return { geo: p.geo, mat: m }; });
    flowerParts = A.flowers.map(f => kitFromScene(f.scene, 0.35).map(p => { const m = p.mat.clone(); m.side = THREE.DoubleSide; windPatch(m, 'grass'); return { geo: p.geo, mat: m }; }));
    U.fadeR.value = GR * GCH + 4;
  }
  // shore + forest-floor plants that ride along with the grass chunks: reeds, lily pads, ferns
  const forestMaskAt = (x, z) => sstep(-0.15, 0.3, fbm(x * 0.0035 + 5.1, z * 0.0035 - 2.7, 3));
  let extraParts = null;
  function fernTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
    x.strokeStyle = '#3d5a22'; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 256); x.quadraticCurveTo(60, 120, 64, 6); x.stroke();
    for (let i = 0; i < 26; i++) { const t = i / 26, y = 250 - t * 240, len = 56 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (1 - t * 0.35);
      for (const s of [-1, 1]) { for (let k = 0; k < 5; k++) { const u = (k + 0.5) / 5; x.fillStyle = `hsl(${88 + (i + k) % 4 * 5}, 42%, ${20 + t * 10 + k * 1.5}%)`; x.beginPath(); x.ellipse(64 + s * len * u, y - 3 - u * 6, len * 0.13, 3.2, s * -0.5, 0, 6.283); x.fill(); } } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function buildExtras() {
    // reeds: a clump of tall thin blades with a few cattails
    const rb = HB(), green = LC('#6f8a3c'), brown = LC('#5a3a22');
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, r = rnd() * 0.25, h = R(1.0, 1.8), bl = new THREE.PlaneGeometry(0.035, h, 1, 3).translate(0, h / 2, 0); const p = bl.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k) / h; p.setX(k, p.getX(k) * (1 - y * 0.8)); p.setZ(k, y * y * R(0.1, 0.35)); }
      bl.computeVertexNormals(); hAdd(rb, bl, MR(Math.cos(a) * r, 0, Math.sin(a) * r, 0, rnd() * 6.283, 0), green); if (i % 3 === 0) hAdd(rb, new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), MR(Math.cos(a) * r, h * 0.92, Math.sin(a) * r), brown); }
    const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }); windPatch(reedMat, 'grass');
    // lily pads: a notched disc, some with a flower
    const pb = HB(), pad = new THREE.CircleGeometry(0.42, 14, 0.25, 6.0).rotateX(-Math.PI / 2); hAdd(pb, pad, null, LC('#4f7a30'));
    const pb2 = HB(); hAdd(pb2, new THREE.CircleGeometry(0.42, 14, 0.25, 6.0).rotateX(-Math.PI / 2), null, LC('#5a8434')); for (let i = 0; i < 7; i++) hAdd(pb2, new THREE.SphereGeometry(1, 6, 4), MR(0.05, 0.08, 0.05, 0.6, i / 7 * 6.283, 0, 0.05, 0.03, 0.14).premultiply(new THREE.Matrix4().makeRotationY(i / 7 * 6.283)), LC(i % 2 ? '#ffc0d8' : '#fff0f4')); hAdd(pb2, new THREE.SphereGeometry(0.045, 6, 4), MR(0.05, 0.09, 0.05), LC('#ffd040'));
    const padMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
    // fern: crossed fronds from a canvas texture
    const fm = new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }); windPatch(fm, 'grass');
    const fg = []; for (let i = 0; i < 7; i++) { const g = new THREE.PlaneGeometry(0.45, 1.1, 1, 4).translate(0, 0.55, 0); const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, y * 0.75); p.setY(k, y * 0.75 - y * y * 0.35); }
      g.rotateY(i / 7 * 6.283 + R(-0.2, 0.2)); g.computeVertexNormals(); fg.push(g.toNonIndexed()); }
    const fernGeo = new THREE.BufferGeometry(); const fp = [], fn = [], fu = []; for (const g of fg) { fp.push(...g.attributes.position.array); fn.push(...g.attributes.normal.array); fu.push(...g.attributes.uv.array); }
    fernGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fernGeo.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3)); fernGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    extraParts = [[{ geo: hBuild(rb), mat: reedMat }], [{ geo: hBuild(pb), mat: padMat }], [{ geo: hBuild(pb2), mat: padMat }], [{ geo: fernGeo, mat: fm }]];
  }
  // all grass chunks share one instanced mesh per part; each chunk owns a fixed range (its slot), so the whole
  // field is a handful of draw calls instead of one per chunk per part
  const GS = 7, GSLOTS = GS * GS; let GB = null, FB = null, XB = null; const gSlotKey = [], gSlotDense = [], gViews = [];
  // each slot keeps its own matrices; flush() packs the filled ones contiguously so no empty instances are drawn
  function SlotBatch(parts, cap) {
    const total = cap * GSLOTS, attr = new THREE.InstancedBufferAttribute(new Float32Array(total * 16), 16); attr.setUsage(THREE.DynamicDrawUsage);
    const meshes = parts.map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, 1); m.instanceMatrix = attr; m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.userData.kind = 'thing'; scene.add(m); return m; });
    const data = [], cnt = new Int32Array(GSLOTS); let dirty = false;
    return { meshes, cap, view(slot) { let n = 0; const d = data[slot] || (data[slot] = new Float32Array(cap * 16)); return { begin() { n = 0; }, add(mtx) { if (n >= cap) return; mtx.toArray(d, n * 16); n++; }, end() { cnt[slot] = n; dirty = true; } }; },
      flush() { if (!dirty) return; dirty = false; const arr = attr.array; let off = 0; for (let sl = 0; sl < GSLOTS; sl++) { const n = cnt[sl]; if (!n) continue; arr.set(data[sl].subarray(0, n * 16), off * 16); off += n; }
        attr.clearUpdateRanges(); attr.addUpdateRange(0, Math.max(16, off * 16)); attr.needsUpdate = true; for (const m of meshes) { m.count = off; m.visible = off > 0; } } };
  }
  function slotView(slot) { if (!GB) { GB = SlotBatch(grassParts, GN); FB = flowerParts.map(fp => SlotBatch(fp, FN)); XB = extraParts.map((ep, i) => SlotBatch(ep, i === 0 ? 120 : 90)); }
    return gViews[slot] || (gViews[slot] = { g: GB.view(slot), f: FB.map(b => b.view(slot)), x: XB.map(b => b.view(slot)) }); }
  function fillChunk(c) {
    const x0 = c.ix * GCH, z0 = c.iz * GCH; let s = (Math.imul(c.ix, 73856093) ^ Math.imul(c.iz, 19349663)) >>> 0 || 1;
    const r = () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
    const plots = houses.filter(q => q.x > x0 - 8 && q.x < x0 + GCH + 8 && q.z > z0 - 8 && q.z < z0 + GCH + 8);
    c.g.begin(); for (const b of c.f) b.begin(); for (const b of c.x) b.begin();
    const cnt = Math.round(GN * SC.grass * (c.r <= 1 ? 1 : 0.6));
    for (let i = 0; i < cnt; i++) {
      const x = x0 + r() * GCH, z = z0 + r() * GCH, rot = r() * 6.283, sv = r(), fl = r(), fk = r();
      if (Math.abs(x - trailX(-z)) < 1.6) continue; if (nearFire(x, z, 4.2)) continue; if (plots.length && plots.some(q => (x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r2)) continue;
      const h = heightAt(x, z), ex = r();
      if (SC.water > -100 && h < SC.water + 0.7 && h > SC.water - 1.6) { // shoreline: reeds in the shallows, pads further out
        if (h > SC.water - 0.35 && ex < 0.22) { tq.setFromAxisAngle(UP, rot); tm.compose(tv.set(x, h - 0.1, z), tq, ts.setScalar(0.8 + sv * 0.6)); c.x[0].add(tm); continue; }
        if (h < SC.water - 0.45 && ex < 0.16) { tq.setFromAxisAngle(UP, rot); tm.compose(tv.set(x, SC.water + 0.03, z), tq, ts.setScalar(0.7 + sv * 0.8)); c.x[fl < 0.2 ? 2 : 1].add(tm); continue; } }
      if (h < SC.water + 0.35 || h > SC.snow - 35) continue; if (slopeAt(x, z, h) > 0.75) continue;
      if (ex < 0.06 && forestMaskAt(x, z) > 0.45) { tq.setFromAxisAngle(UP, rot); tm.compose(tv.set(x, h - 0.05, z), tq, ts.setScalar(0.6 + sv * 0.6)); c.x[3].add(tm); continue; }
      const patch = vn(x * 0.05 + 3.3, z * 0.05 - 1.7); if (patch < 0.25 && sv < 0.7) continue;
      const sc2 = (0.55 + patch * 0.9) * (0.75 + sv * 0.5);
      tq.setFromAxisAngle(UP, rot); tm.compose(tv.set(x, h - 0.05, z), tq, ts.set(sc2, sc2 * (0.8 + patch * 0.6), sc2));
      if (fl < 0.035 * SC.flowers * (patch > 0.5 ? 2 : 0.6)) c.f[Math.floor(fk * c.f.length)].add(tm); else c.g.add(tm);
    }
    c.g.end(); for (const b of c.f) b.end(); for (const b of c.x) b.end();
  }
  function updateGrass(x, z, budget, force) {
    const cix = Math.floor(x / GCH), ciz = Math.floor(z / GCH), key = cix + ',' + ciz;
    if (key !== gKey || force) { gKey = key; const wantC = new Map();
      for (let oz = -GR; oz <= GR; oz++) for (let ox = -GR; ox <= GR; ox++) wantC.set((cix + ox) + ',' + (ciz + oz), { ix: cix + ox, iz: ciz + oz, r: Math.max(Math.abs(ox), Math.abs(oz)) });
      const used = new Set(); gJobs = [];
      for (const [k, w] of wantC) { const slot = imod(w.ix, GS) * GS + imod(w.iz, GS); w.slot = slot; w.key = k; used.add(slot); if (force || gSlotKey[slot] !== k || gSlotDense[slot] !== (w.r <= 1)) gJobs.push(w); }
      for (let sl = 0; sl < GSLOTS; sl++) if (!used.has(sl) && gSlotKey[sl]) { const v = slotView(sl); for (const b of [v.g, ...v.f, ...v.x]) { b.begin(); b.end(); } gSlotKey[sl] = null; }
      gJobs.sort((a, b) => a.r - b.r); }
    const t0 = performance.now();
    while (gJobs.length) { const w = gJobs[0]; if (budget != null && w.r > 1 && performance.now() - t0 > budget) break; gJobs.shift();
      const v = slotView(w.slot); fillChunk({ ix: w.ix, iz: w.iz, r: w.r, g: v.g, f: v.f, x: v.x }); gSlotKey[w.slot] = w.key; gSlotDense[w.slot] = w.r <= 1; }
    if (GB) { GB.flush(); for (const b of FB) b.flush(); for (const b of XB) b.flush(); }
  }

  // ---------------- bloom meadows: fantasy flowers that open in a wave on every chord ----------------
  // Each chord change sends a ring outward through the meadows. As it passes, buds burst open, take on the
  // chord's colour (minor chords lean cooler), glow, then slowly fold closed again until the next chord.
  const BLOOM_PAL = ['#ff5a7a', '#ff8a3d', '#ffd23f', '#ff6fb5', '#ffb347', '#e070ff', '#ff4d4d', '#fff0d0', '#ff9ec7', '#ff9a6a', '#b48cff', '#ffe066'];
  const BLOOM_SP = [
    { H: 0.62, cap: 28, s: [1.0, 2.1], rings: [{ n: 8, off: 0, L: 0.2, W: 0.055, phi: -0.08, dl: 0 }, { n: 7, off: 0.5, L: 0.15, W: 0.05, phi: 0.3, dl: 0.12 }], cr: 0.05, ccol: '#ffae28' },
    { H: 0.74, cap: 18, s: [1.0, 2.0], rings: [{ n: 3, off: 0, L: 0.2, W: 0.12, phi: 0.5, dl: 0 }, { n: 3, off: 0.5, L: 0.19, W: 0.12, phi: 0.72, dl: 0.08 }], cr: 0.035, ccol: '#ffe070' },
    { H: 1.35, cap: 8, s: [1.1, 2.2], rings: [{ n: 6, off: 0, L: 0.42, W: 0.1, phi: -0.38, dl: 0 }], cr: 0.04, ccol: '#fff2b0', stamens: 6 }
  ];
  const BL = { meshes: [], aI: [], R: 4, CH: 20, key: '', jobs: [], slotKey: [], pos: [], lastWave: -99, ambT: 5, front: null, ambK: 0,
    U: { bW: { value: [...Array(6)].map(() => new THREE.Vector4(0, 0, -999, 0)) }, bC: { value: [...Array(6)].map(() => C('#ff8fa0')) }, bBase: { value: C('#ff8fa0') }, bSpeed: { value: 24 }, bGlow: { value: 0.1 }, bRest: { value: 0.28 }, bKick: { value: 0 } } };
  function bloomGeo(sp) {
    const P = [], N = [], Cc = [], AP = [], AQ = [], I = [];
    const vert = (x, y, z, nx, ny, nz, c, ap, aq) => { P.push(x, y, z); N.push(nx, ny, nz); Cc.push(c.r, c.g, c.b); AP.push(...ap); AQ.push(...aq); };
    const addGeo = (g, col, kind, aq) => { const base = P.length / 3, pa = g.attributes.position.array, na = g.attributes.normal.array;
      for (let i = 0; i < pa.length; i += 3) vert(pa[i], pa[i + 1], pa[i + 2], na[i], na[i + 1], na[i + 2], col, [kind, 0, 0, 0], aq);
      const ix = g.index ? g.index.array : [...Array(pa.length / 3).keys()]; for (const k of ix) I.push(base + k); };
    const green = LC('#3d6a28'), H = sp.H;
    addGeo(new THREE.CylinderGeometry(0.011, 0.02, H, 5, 1, true).translate(0, H / 2, 0), green, 0, [0, 0, 0, 0]);
    for (const [a, y] of [[0.3, 0.22], [3.6, 0.36]]) { const lf = new THREE.PlaneGeometry(0.075, 0.28, 1, 2); const p = lf.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(p.getY(i) + 0.14, 2) * 0.6);
      lf.computeVertexNormals(); lf.translate(0, 0.14, 0); lf.rotateX(-0.9); lf.rotateY(a); lf.translate(0, y * H / 0.62, 0); addGeo(lf, LC('#4a7a30'), 0, [0, 0, 0, 0]); }
    const W1 = C(1, 1, 1);
    for (const ring of sp.rings) for (let i = 0; i < ring.n; i++) { const a = (i + ring.off) / ring.n * 6.2832, base = P.length / 3;
      for (let iu = 0; iu <= 3; iu++) for (let iv = 0; iv <= 2; iv++) vert(0, H, 0, 0, 1, 0, W1, [1, a, iu / 3, iv - 1], [ring.L, ring.W, ring.phi, ring.dl]);
      for (let iu = 0; iu < 3; iu++) for (let iv = 0; iv < 2; iv++) { const q = base + iu * 3 + iv; I.push(q, q + 3, q + 1, q + 1, q + 3, q + 4); } }
    addGeo(new THREE.SphereGeometry(sp.cr, 8, 5).scale(1, 0.65, 1).translate(0, H + 0.01, 0), LC(sp.ccol), 2, [H, 0, 0, 0]);
    if (sp.stamens) for (let i = 0; i < sp.stamens; i++) { const a = i / sp.stamens * 6.2832, st = new THREE.CylinderGeometry(0.004, 0.004, 0.2, 3, 1, true).translate(0, 0.1, 0).rotateZ(0.35).rotateY(a).translate(0, H, 0);
      addGeo(st, LC('#ffe8a0'), 2, [H, 0, 0, 0]); addGeo(new THREE.SphereGeometry(0.014, 5, 3).translate(Math.cos(-a) * 0.068, H + 0.188, Math.sin(-a) * 0.068), LC('#ffd060'), 2, [H, 0, 0, 0]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute('aP', new THREE.Float32BufferAttribute(AP, 4)); g.setAttribute('aQ', new THREE.Float32BufferAttribute(AQ, 4)); g.setIndex(I);
    g.boundingSphere = new THREE.Sphere(V(0, H / 2, 0), H + 0.5); return g;
  }
  function bloomMaterial() {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, BL.U, RU, { time: U.time, windAmp: U.windAmp, windDir: U.windDir, gust: U.gust, fadeR: U.fadeR });
      sh.vertexShader = WIND_DECL + `\nattribute vec4 aP, aQ, aI; attribute vec3 aCol; uniform vec4 bW[6]; uniform vec3 bC[6]; uniform vec3 bBase; uniform float bSpeed, bGlow, bRest, bKick, kEnv, sEnv, hEnv, bEnv, bPar; uniform vec4 rings[4]; varying vec3 vBc, vBe;\n` + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `
          vec3 ip = instanceMatrix[3].xyz; float sd = aI.x; float env = 0.0, gp = 0.0, la = 99.0; vec3 wc = bBase;
          for (int i = 0; i < 6; i++) { float age = time - bW[i].z - length(ip.xz - bW[i].xy) / bSpeed - sd * 0.22;
            if (age > 0.0) { float am = bW[i].w; env = max(env, (1.0 - exp(-age * 6.0)) * exp(-age * 0.3) * am); gp = max(gp, exp(-age * 1.7) * am); wc = bC[i]; la = age; } }
          float fsel = fract(sd * 7.13); vec3 own = fsel < 0.3 ? vec3(1.0, 0.33, 0.42) : fsel < 0.5 ? vec3(1.0, 0.75, 0.25) : fsel < 0.68 ? vec3(0.6, 0.45, 1.0) : fsel < 0.85 ? vec3(1.0, 0.92, 0.85) : vec3(1.0, 0.45, 0.25);
          float infl = la > 90.0 ? 0.0 : smoothstep(0.0, 0.5, la) * mix(1.0, 0.3, smoothstep(2.5, 10.0, la)); wc = mix(own, wc, infl);
          float rp = 0.0; for (int i = 0; i < 4; i++) { float ra = time - rings[i].z; if (ra > 0.0 && ra < 3.0) { float dd2 = length(ip.xz - rings[i].xy) - ra * 20.0; rp = max(rp, exp(-dd2 * dd2 / 6.0) * exp(-ra * 0.9) * rings[i].w); } }
          float kh = kEnv * (abs(mod(floor(sd * 97.0), 2.0) - bPar) < 0.5 ? 1.0 : 0.4);
          float op = clamp(bRest + (1.0 - bRest) * env + 0.06 * sin(time * 0.8 + sd * 40.0) + rp * 0.45 + sEnv * 0.2, 0.0, 1.0);
          vec3 objectNormal = normal; vec3 bp = position;
          if (aP.x > 0.5 && aP.x < 1.5) { float a = aP.y, u = aP.z, v = aP.w; float o = clamp((op - aQ.w) / (1.0 - aQ.w), 0.0, 1.0); o = o * o * (3.0 - 2.0 * o);
            float phi = mix(1.42, aQ.z, o); vec3 dr = vec3(cos(a), 0.0, sin(a)), sv = vec3(-sin(a), 0.0, cos(a));
            vec3 fw = dr * cos(phi) + vec3(0.0, sin(phi), 0.0), nr = -dr * sin(phi) + vec3(0.0, cos(phi), 0.0);
            float L = aQ.x * (1.0 + 0.15 * gp), wd = aQ.y * sin(3.1416 * pow(u, 0.65)) * (0.55 + 0.45 * o);
            bp = position + fw * (u * L + 0.012) + sv * (v * wd) + nr * ((u * u * 0.3 - v * v * 0.1) * L); objectNormal = nr; }
          else if (aP.x > 1.5) { vec3 hc = vec3(0.0, aQ.x, 0.0); bp = hc + (position - hc) * (0.8 + 0.3 * op + 0.25 * gp); }
          bp.y *= 1.0 + 0.3 * kh + 0.3 * rp; bp.xz *= 1.0 - 0.06 * kh + 0.2 * rp;
          bp *= 1.0 - smoothstep(78.0, 98.0, length(ip.xz - cameraPosition.xz));
          vec3 pc = wc * (0.8 + 0.4 * fract(sd * 13.7));
          bool isP = aP.x > 0.5 && aP.x < 1.5;
          vBc = isP ? mix(pc * 0.45, pc * 1.1 + 0.03, smoothstep(0.0, 0.9, aP.z)) : aCol;
          vBe = isP ? (pc * (bGlow * (0.1 + gp * 1.6) + rp * (0.25 + bGlow * 0.8)) + vec3(sEnv * 0.12)) * (0.35 + aP.z) : aP.x > 1.5 ? aCol * bGlow * (0.6 + gp * 2.5) : vec3(0.0);`)
        .replace('#include <begin_vertex>', 'vec3 transformed = bp;')
        .replace('#include <project_vertex>', `
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0); vec4 wpos = modelMatrix * mvPosition;
          float hh = clamp(transformed.y * 0.9, 0.0, 1.6); float w = windAt(wpos.xz);
          wpos.xz += windDir * w * hh * hh * 0.35 + vec2(sin(time * 1.7 + sd * 30.0), cos(time * 1.3 + sd * 20.0)) * 0.035 * hh * (1.0 + bKick * 2.5);
          mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = 'varying vec3 vBc, vBe;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = vBc;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vBe;');
    };
    m.customProgramCacheKey = () => 'bloom'; return m;
  }
  function buildBloom() {
    const mat = bloomMaterial(), slots = 81;
    for (const sp of BLOOM_SP) { const geo = bloomGeo(sp), n = sp.cap * slots, aI = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); geo.setAttribute('aI', aI);
      const M = new THREE.InstancedMesh(geo, mat, n); M.count = 0; M.userData.sd = []; M.userData.sm = []; M.userData.sn = new Int32Array(81); M.frustumCulled = false; M.receiveShadow = true; M.userData.kind = 'flower'; scene.add(M); BL.meshes.push(M); BL.aI.push(aI); }
  }
  const fr = x => x - Math.floor(x);
  function hshJ(x, y) { let a = fr(x * 0.1031), b = fr(y * 0.1031), c = fr(x * 0.1031); const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33); a += d; b += d; c += d; return fr((a + b) * c); }
  function gnJ(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return mix(mix(hshJ(ix, iy), hshJ(ix + 1, iy), ux), mix(hshJ(ix, iy + 1), hshJ(ix + 1, iy + 1), ux), uy); }
  const meadowAt = (x, z) => sstep(0.3, 0.56, gnJ(x * 0.017 + 7.7, z * 0.017 - 3.1)) * (0.5 + 0.5 * gnJ(x * 0.08 + 1.3, z * 0.08)) + (Math.abs(x - trailX(-z)) < 9 ? 0.35 : 0);
  function bloomFill(ix, iz, slot) {
    const CH = BL.CH, x0 = ix * CH, z0 = iz * CH; let s = (Math.imul(ix, 2654435761) ^ Math.imul(iz, 40503) ^ 0x5bd1e995) >>> 0 || 1;
    const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const plots = houses.filter(q => q.x > x0 - 8 && q.x < x0 + CH + 8 && q.z > z0 - 8 && q.z < z0 + CH + 8), dens = Math.min(1, SC.flowers + 0.25), pl = [];
    BLOOM_SP.forEach((sp, si) => { const M = BL.meshes[si], aI = BL.aI[si], cap = sp.cap; let n = 0;
      for (let tries = 0; tries < cap * 3 && n < cap; tries++) { const x = x0 + r() * CH, z = z0 + r() * CH, k = r(), yaw = r() * 6.283, sv = r(), l1 = r() - 0.5, l2 = r() - 0.5, sd = r();
        if (k > meadowAt(x, z) * dens * (si === 2 ? 0.55 : 1) * (nearVillage(x, z) ? 0.3 : 1)) continue; if (nearFire(x, z, 7)) continue; if (Math.abs(x - trailX(-z)) < 1.5) continue;
        const h = heightAt(x, z); if (h < SC.water + 0.4 || h > SC.snow - 40 || slopeAt(x, z, h) > 0.55) continue;
        if (plots.length && plots.some(q => (x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r2)) continue;
        const sc = mix(sp.s[0], sp.s[1], sv * sv); te.set(l1 * 0.3, yaw, l2 * 0.3); tq.setFromEuler(te); tm.compose(tv.set(x, h - 0.03, z), tq, ts.set(sc, sc, sc));
        const U_ = M.userData, dm = U_.sm[slot] || (U_.sm[slot] = new Float32Array(cap * 16)), ds = U_.sd[slot] || (U_.sd[slot] = new Float32Array(cap)); tm.toArray(dm, n * 16); ds[n] = sd; n++; pl.push(x, h + sp.H * sc, z); }
      M.userData.sn[slot] = n; BL.dirty = true; });
    BL.pos[slot] = new Float32Array(pl);
  }
  function updateBloom(dt, force) {
    if (!BL.meshes.length) return; const CH = BL.CH, Rb = BL.R, S = 2 * Rb + 1, x = cam.position.x, z = cam.position.z, ix = Math.floor(x / CH), iz = Math.floor(z / CH), key = ix + ',' + iz + ',' + Rb;
    if (BL.lastR !== Rb) { BL.lastR = Rb; force = true; }
    if (force) { BL.slotKey = []; BL.pos = []; for (const M of BL.meshes) M.userData.sn.fill(0); BL.dirty = true; }
    if (key !== BL.key || force) { BL.key = key; BL.jobs = [];
      for (let oz = -Rb; oz <= Rb; oz++) for (let ox = -Rb; ox <= Rb; ox++) { const cx = ix + ox, cz = iz + oz, slot = imod(cx, S) * S + imod(cz, S); if (BL.slotKey[slot] !== cx + ',' + cz) BL.jobs.push({ cx, cz, slot, r: Math.max(Math.abs(ox), Math.abs(oz)) }); }
      BL.jobs.sort((a, b) => a.r - b.r); }
    const t0 = performance.now(); while (BL.jobs.length && (force || W.t < 0.3 || performance.now() - t0 < 2.5)) { const j = BL.jobs.shift(); bloomFill(j.cx, j.cz, j.slot); BL.slotKey[j.slot] = j.cx + ',' + j.cz; }
    if (BL.dirty) { BL.dirty = false; BL.meshes.forEach((M, si) => { const aI = BL.aI[si], U_ = M.userData, am = M.instanceMatrix.array, as = aI.array; let off = 0;
      for (let sl = 0; sl < 81; sl++) { const n = U_.sn[sl]; if (!n) continue; am.set(U_.sm[sl].subarray(0, n * 16), off * 16); const sd = U_.sd[sl]; for (let k = 0; k < n; k++) as[(off + k) * 4] = sd[k]; off += n; }
      M.count = off; M.instanceMatrix.needsUpdate = true; aI.needsUpdate = true; }); }
    BL.U.bKick.value = W.kick; BL.U.bRest.value = BL.restFix ?? (TOY.flowers ? 0.36 : 0.6);
    // no chords for a while (idle, or a drone): the meadow still breathes on its own
    BL.ambT -= dt; if (TOY.flowers && BL.ambT < 0 && W.t - BL.lastWave > 9) { BL.ambT = R(7, 11); const p = waveOrigin(); bloomWave(p.x, p.z, C(BLOOM_PAL[(BL.ambK = (BL.ambK + 5) % 12)]), 0.7); }
    // pollen rises where the wavefront passes
    const F = BL.front; if (F && W.t - F.t0 < 8) { const r1 = (W.t - F.t0) * BL.U.bSpeed.value, r0 = r1 - BL.U.bSpeed.value * dt, night = curTod === 'night' || curTod === 'dusk'; let em = 0;
      for (const pl of BL.pos) { if (!pl) continue; for (let i = 0; i < pl.length && em < 26; i += 3) { const dx = pl[i] - F.x, dz = pl[i + 2] - F.z, d2 = dx * dx + dz * dz; if (d2 > r1 * r1 || d2 <= r0 * r0) continue;
        if (Math.random() > 0.35) continue; const ex = pl[i] - x, ez = pl[i + 2] - z; if (ex * ex + ez * ez > 75 * 75) continue; em++;
        ORB.sparks.emit(pl[i], pl[i + 1] + 0.05, pl[i + 2], (Math.random() - 0.5) * 0.5, 0.6 + Math.random(), (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 1.2, 0.04 + Math.random() * 0.04, tc.copy(F.col).multiplyScalar((night ? 2.4 : 1.3) * F.amp)); } } }
  }
  function waveOrigin() { if (AV.kind !== 'none' && AV.pos) return { x: AV.pos.x, z: AV.pos.z }; cam.getWorldDirection(tv); return { x: cam.position.x + tv.x * 35, z: cam.position.z + tv.z * 35 }; }
  function chordColor(c) { const col = C(BLOOM_PAL[c && c.root != null ? ((c.root % 12) + 12) % 12 : Math.floor(Math.random() * 12)]); const q = (c && c.q) || ''; if (/^m(?!aj)|dim|ø/.test(q)) col.lerp(C('#7c8cff'), 0.42); return col; }
  function bloomWave(x, z, col, amp = 1) {
    const Wv = BL.U.bW.value, Cv = BL.U.bC.value; BL.U.bBase.value.copy(Cv[0]);
    for (let i = 0; i < 5; i++) { Wv[i].copy(Wv[i + 1]); Cv[i].copy(Cv[i + 1]); }
    Wv[5].set(x, z, W.t, amp); Cv[5].copy(col); BL.front = { x, z, t0: W.t, col: col.clone(), amp }; BL.lastWave = W.t;
  }

  // ---------------- chime circles: twelve standing stones, one per step of the scale ----------------
  const CIRC = { list: [], runes: null, beams: null, lv: new Float32Array(36), hue: [...Array(36)].map(() => C(1, 1, 1)), near: [], MV: 0, chord: C('#ffd8a0'), chordA: 0, t: 0 };
  function makeMenhir() {
    const g = new THREE.CylinderGeometry(0.5, 0.68, 3.6, 10, 8), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 1.8) / 3.6, tp = 1 - t * t * 0.3, n = vn(x * 2.6 + y * 1.3 + 4, z * 2.4 + y * 0.9) - 0.5, top = t > 0.99 ? 0.75 + n * 0.5 : 1;
      p.setXYZ(i, x * tp * (1 + n * 0.35) * top, y + (t > 0.99 ? n * 0.5 - 0.15 : 0), z * tp * 0.62 * (1 + n * 0.3) * top); }
    g.translate(0, 1.6, 0); g.computeVertexNormals(); return g;
  }
  function runeTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineCap = 'round'; x.shadowColor = '#fff'; x.shadowBlur = 10;
    x.beginPath(); x.moveTo(32, 14); x.lineTo(32, 114); x.moveTo(32, 30); x.lineTo(52, 50); x.moveTo(32, 54); x.lineTo(12, 74); x.moveTo(32, 80); x.lineTo(50, 98); x.stroke();
    x.beginPath(); x.arc(32, 66, 22, 0, 6.283); x.lineWidth = 2.5; x.stroke(); return new THREE.CanvasTexture(c);
  }
  function buildCircles() {
    CIRC.MV = props.variants.length; props.variants.push({ r: 4.5, near: Batch([{ geo: makeMenhir(), mat: stoneMaterial('#cfc6b8', true) }], 140, { shadow: true, kind: 'menhir' }), kind: 'menhir' });
    const rm = new THREE.MeshBasicMaterial({ map: runeTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    CIRC.runes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 1.24), rm, 36); CIRC.runes.frustumCulled = false; CIRC.runes.count = 0; scene.add(CIRC.runes);
    const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying float vY; varying vec3 vC; void main(){ vY = position.y; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vY; varying vec3 vC; void main(){ float a = pow(1.0 - vY, 2.2) * smoothstep(0.0, 0.04, vY); gl_FragColor = vec4(vC * a, 1.0); }` });
    CIRC.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.2, 1, 10, 1, true).translate(0, 0.5, 0), bm, 36); CIRC.beams.frustumCulled = false; CIRC.beams.count = 0; scene.add(CIRC.beams);
    for (let i = 0; i < 36; i++) { CIRC.runes.setColorAt(i, tc.setRGB(0, 0, 0)); CIRC.beams.setColorAt(i, tc.setRGB(0, 0, 0)); }
  }
  function makeCircle(D) {
    let cx, cz, ch, ok = false;
    for (let t = 0; t < 14 && !ok; t++) { const dd = D + R(-80, 80); cx = trailX(dd) + (rnd() < 0.5 ? -1 : 1) * R(20, 70); cz = -dd; ch = heightAt(cx, cz);
      if (ch < SC.water + 1.2 || nearVillage(cx, cz) || Math.abs(cx - trailX(-cz)) < 16) continue; ok = true;
      for (const [ox, oz] of [[9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, -6]]) if (Math.abs(heightAt(cx + ox, cz + oz) - ch) > 3 || heightAt(cx + ox, cz + oz) < SC.water + 0.5) ok = false; }
    if (!ok) return; D = -cz;
    const C0 = { x: cx, z: cz, y: ch, d: D, stones: [] };
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.2832, x = cx + Math.sin(a) * 8.5, z = cz + Math.cos(a) * 8.5, h = heightAt(x, z), s = R(0.8, 1.15) * (i === 0 ? 1.3 : 1);
      props.items.push({ x, y: h - 0.35, z, yaw: a + R(-0.08, 0.08), s, v: CIRC.MV }); C0.stones.push({ x, y: h - 0.35, z, a, s }); }
    CIRC.list.push(C0); landmarks.push({ d: D, x: cx, z: cz, y: ch + 4, pass: 20, pull: 0.9 });
  }
  function circleNote(e) {
    const C0 = CIRC.near[0]; if (!C0) return; const k = Math.min(11, Math.floor(e.p * 12)), st = C0.stones[k];
    CIRC.lv[k] = Math.min(1.6, CIRC.lv[k] + 0.7 + e.v * 0.5); CIRC.hue[k].copy(hueOf(e.p)).lerp(C(1, 0.85, 0.6), 0.25);
    const ix = st.x - Math.sin(st.a) * 0.45 * st.s, iz = st.z - Math.cos(st.a) * 0.45 * st.s;
    burst(V(ix, st.y + 2.4 * st.s, iz), 8, tc.copy(CIRC.hue[k]).multiplyScalar(1.6), 1.6, 0.4, 1.2);
  }
  function updateCircles(dt) {
    if (!CIRC.runes) return; CIRC.t -= dt;
    if (CIRC.t < 0) { CIRC.t = 0.5; const cx = cam.position.x, cz = cam.position.z; CIRC.list = CIRC.list.filter(c => c.d > W.d - 500);
      CIRC.near = CIRC.list.map(c => ({ c, d: Math.hypot(c.x - cx, c.z - cz) })).filter(o => o.d < 320).sort((a, b) => a.d - b.d).slice(0, 3).map(o => o.c); }
    const night = curTod === 'night' ? 1 : curTod === 'dusk' ? 0.8 : curTod === 'golden' || curTod === 'dawn' ? 0.35 : 0.12; CIRC.chordA *= Math.exp(-dt * 0.8);
    let n = 0;
    CIRC.near.forEach((C0, ci) => C0.stones.forEach((st, k) => { const j = ci * 12 + k, lv = ci === 0 ? CIRC.lv[k] : 0; const ix = st.x - Math.sin(st.a) * 0.36 * st.s, iz = st.z - Math.cos(st.a) * 0.36 * st.s;
      te.set(0, st.a, 0); tq.setFromEuler(te); tm.compose(tv.set(ix, st.y + 1.9 * st.s, iz), tq, ts.set(st.s * 0.8 * (k % 2 ? -1 : 1), st.s * 0.8, st.s)); CIRC.runes.setMatrixAt(n, tm);
      tc.copy(lv > 0.02 ? CIRC.hue[k] : CIRC.chord).multiplyScalar(lv * 2.2 + 0.05 * night + CIRC.chordA * 0.35 * (0.4 + night)); CIRC.runes.setColorAt(n, tc);
      tm.compose(tv.set(st.x, st.y + 0.3, st.z), tq.identity(), ts.set(st.s, 2 + lv * 16 * st.s, st.s)); CIRC.beams.setMatrixAt(n, tm); tc.copy(CIRC.hue[k]).multiplyScalar(lv * lv * (0.12 + night * 0.3)); CIRC.beams.setColorAt(n, tc); n++; }));
    for (let k = 0; k < 12; k++) CIRC.lv[k] *= Math.exp(-dt * 2.2);
    CIRC.runes.count = CIRC.beams.count = n; for (const m of [CIRC.runes, CIRC.beams]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ---------------- sky lanterns: villages send paper lanterns up on chord changes and big moments (evening + night) ----------------
  const SKYL = { mesh: null, n: 120, k: 0, list: [] };
  function buildSkyLanterns() {
    const g = new THREE.CylinderGeometry(0.42, 0.3, 0.8, 8, 1, false); g.translate(0, 0.4, 0);
    SKYL.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: C(1, 1, 1) }), SKYL.n); SKYL.mesh.frustumCulled = false; SKYL.mesh.count = 0; scene.add(SKYL.mesh);
    for (let i = 0; i < SKYL.n; i++) { SKYL.list.push({ on: false, p: V(), t0: 0, rise: 1, ph: 0 }); SKYL.mesh.setColorAt(i, tc.setRGB(0, 0, 0)); }
  }
  function releaseLanterns(n, x, z, spread = 8) {
    for (let i = 0; i < n; i++) { const L = SKYL.list[SKYL.k]; SKYL.k = (SKYL.k + 1) % SKYL.n; const lx = x + R(-spread, spread), lz = z + R(-spread, spread);
      L.on = true; L.p.set(lx, groundAt(lx, lz) + R(1, 3), lz); L.t0 = W.t + i * R(0.1, 0.5); L.rise = R(0.8, 1.6); L.ph = rnd() * 6.28; L.s = R(0.85, 1.25); }
  }
  function lanternSource() { const cx = cam.position.x, cz = cam.position.z; let best = null, bd = 420;
    for (const v of villages) { const d = Math.hypot(v.x - cx, v.z - cz); if (d < bd) { bd = d; best = v; } } return best; }
  function lanternsOnChord(big) {
    const evening = curTod === 'night' || curTod === 'dusk' ? 1 : curTod === 'golden' ? 0.4 : 0; if (!evening || !TOY.lanterns) return;
    const v = lanternSource(); if (!v) return; if (big) releaseLanterns(Math.round(10 * evening + 4), v.x, v.z, 26); else if (rnd() < 0.55 * evening) releaseLanterns(1 + Math.floor(rnd() * 3), v.x, v.z, 24);
  }
  function updateSkyLanterns(dt) {
    if (!SKYL.mesh) return; let n = 0; const wx = U.windDir.value.x, wz = U.windDir.value.y, night = curTod === 'night' || curTod === 'dusk';
    for (const L of SKYL.list) { if (!L.on) continue; const age = W.t - L.t0; if (age < 0) continue; if (age > 90) { L.on = false; continue; }
      L.p.y += L.rise * dt * Math.min(1, age / 2.5); L.p.x += (wx * 0.9 + Math.sin(W.t * 0.4 + L.ph) * 0.25) * dt; L.p.z += (wz * 0.9 + Math.cos(W.t * 0.33 + L.ph) * 0.25) * dt;
      te.set(Math.sin(W.t * 0.9 + L.ph) * 0.08, L.ph, Math.cos(W.t * 0.7 + L.ph) * 0.08); tq.setFromEuler(te); tm.compose(L.p, tq, ts.setScalar(L.s)); SKYL.mesh.setMatrixAt(n, tm);
      const fl = (0.85 + 0.15 * Math.sin(W.t * 9 + L.ph * 3) * Math.sin(W.t * 5.3 + L.ph)) * Math.min(1, age / 1.5) * (1 - sstep(70, 90, age)) * (1 + W.kick * 0.35);
      tc.setRGB(4.2, 1.9, 0.6).multiplyScalar(fl * (night ? 1 : 0.55)); SKYL.mesh.setColorAt(n, tc); n++; }
    SKYL.mesh.count = n; SKYL.mesh.instanceMatrix.needsUpdate = true; if (SKYL.mesh.instanceColor) SKYL.mesh.instanceColor.needsUpdate = true;
  }

  // ---------------- fairy rings: glowing mushrooms in the woods that pulse as the bass rolls through ----------------
  const SHR = { items: [], mesh: null, t: 0, cap: 900, glow: { value: 0 }, kick: { value: 0 } };
  function buildShrooms() {
    const P = [], N = [], K = [], add = (g, k) => { const gg = g.index ? g.toNonIndexed() : g; P.push(...gg.attributes.position.array); N.push(...gg.attributes.normal.array); for (let i = 0; i < gg.attributes.position.count; i++) K.push(k); };
    add(new THREE.CylinderGeometry(0.035, 0.055, 0.26, 7, 1, true).translate(0, 0.13, 0), 0);
    add(new THREE.SphereGeometry(0.15, 10, 6, 0, 6.2832, 0, 1.75).scale(1, 0.62, 1).translate(0, 0.22, 0), 1);
    add(new THREE.CircleGeometry(0.12, 10).rotateX(Math.PI / 2).translate(0, 0.205, 0), 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 1));
    const m = new THREE.MeshStandardMaterial({ roughness: 0.6, color: C(1, 1, 1) });
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { time: U.time, gust: U.gust, shGlow: SHR.glow, shKick: SHR.kick });
      sh.vertexShader = 'attribute float aK; uniform float time, shGlow, shKick; uniform vec4 gust[4]; varying float vK; varying vec3 vIC; varying float vPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vK = aK; vIC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vIC = instanceColor;
        #endif
        vec3 ip = instanceMatrix[3].xyz; float pu = 0.0; for (int i = 0; i < 4; i++) { float age = time - gust[i].z; if (age > 0.0 && age < 6.0) { float dd = length(ip.xz - gust[i].xy) - age * 24.0; pu += exp(-dd * dd / 30.0) * (1.0 - age / 6.0) * 2.0; } }
        vPulse = pu + shKick * 0.6 + 0.5 + 0.5 * sin(time * 1.3 + ip.x * 0.7 + ip.z);`);
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '');
      sh.fragmentShader = 'varying float vK; varying vec3 vIC; varying float vPulse; uniform float shGlow;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vK < 0.5 ? vec3(0.8, 0.76, 0.68) : vK < 1.5 ? mix(vIC, vec3(0.5, 0.3, 0.25), 0.35) * 0.8 : vec3(0.85, 0.8, 0.72);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += (vK > 0.5 && vK < 1.5 ? vIC * 0.55 : vK > 1.5 ? vIC * 0.3 : vIC * 0.05) * shGlow * (0.3 + vPulse * 0.7);');
    };
    m.customProgramCacheKey = () => 'shroom';
    SHR.mesh = new THREE.InstancedMesh(g, m, SHR.cap); SHR.mesh.frustumCulled = false; SHR.mesh.count = 0; SHR.mesh.castShadow = false; scene.add(SHR.mesh);
    SHR.mesh.setColorAt(0, tc.setRGB(1, 1, 1));
  }
  const SHROOM_COL = ['#36e0ff', '#7a6cff', '#3dffa8', '#ff6ad5', '#ffb04a'];
  function makeShroomRing(D, forestMask) {
    const side = rnd() < 0.5 ? -1 : 1, x = pathX(D) + side * R(10, 200), z = -D + R(-4, 4); if (Math.abs(x - trailX(-z)) < 3 || nearVillage(x, z)) return;
    if (forestMask(x, z) < 0.35 && rnd() < 0.75) return; const h = heightAt(x, z); if (h < SC.water + 0.6 || slopeAt(x, z, h) > 0.5) return;
    const n = 7 + Math.floor(rnd() * 8), rr = R(1.0, 3.0), col = C(pick(SHROOM_COL)), D0 = D;
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + R(-0.2, 0.2), r = rr * R(0.85, 1.15), mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r;
      SHR.items.push({ x: mx, y: heightAt(mx, mz) - 0.02, z: mz, s: R(0.7, 1.6) * (rnd() < 0.15 ? 1.8 : 1), yaw: rnd() * 6.28, c: col, d: D0 }); }
  }
  function updateShrooms(dt) {
    if (!SHR.mesh) return; SHR.glow.value = curTod === 'night' ? 1.6 : curTod === 'dusk' ? 1 : curTod === 'dawn' ? 0.35 : 0.12; SHR.kick.value = W.kick;
    SHR.t -= dt; if (SHR.t > 0) return; SHR.t = 0.4; const cx = cam.position.x, cz = cam.position.z; let n = 0;
    for (const it of SHR.items) { const dx = it.x - cx, dz = it.z - cz; if (dx * dx + dz * dz > 170 * 170) continue; if (n >= SHR.cap) break;
      tq.setFromAxisAngle(UP, it.yaw); tm.compose(tv.set(it.x, it.y, it.z), tq, ts.setScalar(it.s)); SHR.mesh.setMatrixAt(n, tm); SHR.mesh.setColorAt(n, it.c); n++; }
    SHR.mesh.count = n; SHR.mesh.instanceMatrix.needsUpdate = true; if (SHR.mesh.instanceColor) SHR.mesh.instanceColor.needsUpdate = true;
  }

  // ---------------- villages: cottages, a tower, trail lanterns, lit windows, chimney smoke ----------------
  const LC = h => new THREE.Color(h).convertSRGBToLinear();
  const FIRES = []; const nearFire = (x, z, r) => FIRES.some(f => (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z) < r * r);
  const WIN = { value: 0 }, houses = []; let villages = [], HV = 0, LAMPV = 0;
  const nearVillage = (x, z) => villages.some(v => (x - v.x) * (x - v.x) + (z - v.z) * (z - v.z) < v.r * v.r);
  const WHITE_C = new THREE.Color(1, 1, 1);
  function HB() { return { p: [], n: [], c: [], e: [] }; }
  function hAdd(b, geo, m4, col = WHITE_C, em = 0) { const g = geo.index ? geo.toNonIndexed() : geo; if (m4) g.applyMatrix4(m4); const P = g.attributes.position.array, N = g.attributes.normal.array;
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
    const V0 = { x: cx, z: cz, r: 42, d: D }; villages.push(V0); landmarks.push({ d: D, x: cx, z: cz, y: ch + 7, pass: 34, pull: 1 });
    const placed = [], n = 5 + Math.floor(rnd() * 6), tower = rnd() < 0.4;
    for (let i = 0, tries = 0; i < n + (tower ? 1 : 0) && tries < 60; tries++) {
      const k = tower && i === 0 ? 3 : Math.floor(rnd() * 3), def = HOUSE_DEF[k], a = rnd() * 6.283, rr = R(6, 36), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const h = heightAt(x, z); if (h < SC.water + 1 || slopeAt(x, z, h) > 0.35) continue; if (Math.abs(x - trailX(-z)) < def.r + 2.5) continue;
      if (placed.some(q => Math.hypot(q.x - x, q.z - z) < q.r + def.r + 3)) continue;
      const toTrail = Math.atan2(trailX(-z) - x, 0) , yaw = (Math.abs(trailX(-z) - x) > 0 ? (trailX(-z) > x ? Math.PI / 2 : -Math.PI / 2) : 0) + R(-0.35, 0.35), s = R(0.92, 1.12);
      const it = { x, y: h - 0.15, z, yaw, s, v: HV + k }; props.items.push(it); placed.push({ x, z, r: def.r }); V0.hs = V0.hs || []; V0.hs.push(it);
      houses.push({ x, z, r2: (def.r * s + 1.5) * (def.r * s + 1.5), d: D });
      if (def.chim) { const c = Math.cos(yaw), sn = Math.sin(yaw); it.chim = V(x + (def.chim.x * c + def.chim.z * sn) * s, h - 0.15 + def.chim.y * s, z + (-def.chim.x * sn + def.chim.z * c) * s); }
      i++;
    }
    { const tx = trailX(D); let fx = cx, fz = cz; if (Math.abs(fx - tx) < 8) fx = tx + (fx >= tx ? 9 : -9);
      for (let k = 0; k < 10 && placed.some(q => Math.hypot(q.x - fx, q.z - fz) < q.r + 5); k++) fz += 4; V0.fx = fx; V0.fz = fz; FIRES.push({ x: fx, z: fz }); }
    if (FOLK.mat) dressVillage(V0, V0.hs || []);
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
    trees.items = []; rocks.items = []; props.items = []; FIRES.length = 0; CRYS.items = []; CRYS.clusters = []; CRYS.near = []; pruneDeco(true); CIRC.list = []; CIRC.near = []; SHR.items = []; FOLK.trollSpots = []; FOLK.vill = null; FOLK.tree = null; if (FOLK.troll) FOLK.troll.spot = null; landmarks = []; villages = []; houses.length = 0; seed = 101 + SC_ORDER.indexOf(cur) * 37;
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
      L([500, 900], D => makeCircle(D)),
      L([320, 620], D => makeBridge(D)),
      L([380, 700], D => makeDock(D)),
      L([900, 1500], D => trollSpot(D)),
      L([22, 55], D => makeShroomRing(D, forestMask)),
      L([0.2, 0.45], D => { const lat = (rnd() < 0.5 ? -1 : 1) * R(14, 220); tryTree(pathX(D) + lat, -D + R(-2, 2)); }),
      L([0.3, 0.7], D => { const lat = (rnd() < 0.5 ? -1 : 1) * R(220, 760), x0 = pathX(D) + lat, z0 = -D + R(-2, 2); const n = forestMask(x0, z0) > 0.4 ? 5 : 2; for (let i = 0; i < n; i++) tryTree(x0 + R(-11, 11), z0 + R(-11, 11)); }),
      L([2.5, 7], D => { if (rnd() > SC.rocks) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(7, 140), z = -D, h = heightAt(x, z); if (h < SC.water - 0.5) return; rocks.items.push({ x, y: h - 0.3, z, yaw: R(0, 6.28), s: R(0.35, 2.2) * (rnd() < 0.1 ? 3 : 1), v: Math.floor(rnd() * 3) }); }),
      L([180, 360], D => { if (rnd() > SC.ruins) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(22, 70), z = -D, h = heightAt(x, z); if (h < SC.water + 1) return; const s = R(0.9, 1.4);
        props.items.push({ x, y: h - 0.5, z, yaw: R(0, 6.28), s, v: Math.floor(rnd() * 3) }); landmarks.push({ d: D, x, z, y: h + 6 * s }); }),
      L([300, 600], D => { if (rnd() > SC.islands) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(220, 700), z = -D, s = R(30, 75), gy = heightAt(x, z), y = gy + R(110, 300); props.items.push({ x, y, z, yaw: R(0, 6.28), s, v: 3 + Math.floor(rnd() * 2) });
        // a little forest on top and a waterfall that pours off the edge and dissolves into mist
        for (let i = 0, n = 5 + Math.floor(rnd() * 8); i < n; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * s * 0.6; trees.items.push({ x: x + Math.cos(a) * r, y: y + s * 0.07 * (1 - r / s) - 0.5, z: z + Math.sin(a) * r, yaw: R(0, 6.28), s: R(0.9, 1.4), v: rnd() < 0.6 ? pick(con) : pick(broad) }); }
        if (rnd() < 0.85) addWaterfall(x, y, z, s, gy, D); for (let i = 0; i < 3; i++) { const a = rnd() * 6.283, r = rnd() * s * 0.4; addCrystalCluster(x + Math.cos(a) * r, y - s * R(0.5, 1.0), z + Math.sin(a) * r, s * 0.12, true, D); } }),
      L([140, 280], D => { const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(60, 420), z = -D, h = heightAt(x, z); if (h < SC.water + 2 || nearVillage(x, z) || Math.abs(x - trailX(D)) < 10) return; addCrystalCluster(x, h, z, R(2.2, 4.5), false, D); }),
      L([500, 900], D => { if (rnd() > SC.giant) return; const x = pathX(D) + (rnd() < 0.5 ? -1 : 1) * R(45, 110), z = -D, h = heightAt(x, z); if (h < SC.water + 1) return; props.items.push({ x, y: h - 1, z, yaw: R(0, 6.28), s: R(3.2, 4.2), v: 5 }); landmarks.push({ d: D, x, z, y: h + 25, pass: 34, pull: 0.9 }); })
    ];
    pumpContent(true);
  }
  function pumpContent(all) {
    for (const l of lay) { let n = 0; while (l.next < W.d + 900 && (all || n++ < 300)) { l.fn(l.next); l.next += R(l.gap[0], l.gap[1]); } }
    const zc = -W.d + 450; // forget things well behind the journey
    for (const set of [trees, rocks, props]) if (set.items.length && set.items[0].z > zc) set.items = set.items.filter(it => it.z <= zc);
    landmarks = landmarks.filter(l => l.d > W.d - 200); pruneDeco(false); if (SHR.items.length && SHR.items[0].d < W.d - 300) SHR.items = SHR.items.filter(it => it.d >= W.d - 300); villages = villages.filter(v => v.d > W.d - 600); if (houses.length && houses[0].d < W.d - 600) { const keep = houses.filter(q => q.d >= W.d - 600); houses.length = 0; houses.push(...keep); }
  }

  // ---------------- the note orb: it lands on a stone on every note ----------------
  const ORB = { mesh: null, light: null, stones: null, glowAttr: null, land: [], free: [], pos: V(), vel: V(), last: null, ripples: [], sparks: null, cap: 72 };
  function buildOrb() {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), new THREE.MeshBasicMaterial({ color: C(1, 1, 1), fog: false }));
    core.material.color.setRGB(4, 3.4, 2.4); ORB.mesh = core; scene.add(core);
    ORB.light = new THREE.PointLight(0xffd9a0, 40, 30, 2); core.add(ORB.light);
    const rk = kitFromScene(A.rocks[1].scene, 0.19)[0], g = rk.geo; g.computeBoundingBox(); const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.max.y, -(bb.min.z + bb.max.z) / 2); g.scale(1, 0.55, 1);
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(ORB.cap), 1); g.setAttribute('aGlow', glow); ORB.glowAttr = glow;
    const hue = new THREE.InstancedBufferAttribute(new Float32Array(ORB.cap * 3).fill(1), 3); g.setAttribute('aHue', hue); ORB.hueAttr = hue;
    const m = new THREE.MeshStandardMaterial({ map: A.rockT, roughness: 0.8, color: C('#b8b0a8') });
    m.onBeforeCompile = sh => { sh.uniforms.glowCol = { value: C(1.0, 0.75, 0.4) };
      sh.vertexShader = 'attribute float aGlow; attribute vec3 aHue; varying float vGlow; varying vec3 vHue;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = aGlow; vHue = aHue;');
      sh.fragmentShader = 'varying float vGlow; varying vec3 vHue; uniform vec3 glowCol;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vHue * vGlow * 1.5;'); };
    m.customProgramCacheKey = () => 'orbstone';
    ORB.stones = new THREE.InstancedMesh(g, m, ORB.cap); ORB.stones.frustumCulled = false; ORB.stones.castShadow = true; ORB.stones.receiveShadow = true; scene.add(ORB.stones);
    for (let i = 0; i < ORB.cap; i++) { ORB.stones.setMatrixAt(i, ZERO); ORB.free.push(i); }
    const rg = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
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
    const sw = Math.sin(D * 0.035) * 4 + Math.sin(D * 0.011) * 3;
    let x = pathX(D) + latAt(D) + sw + (pitch - 0.5) * 3, z = -D; const g = groundAt(x, z), fly = lineY(x, z, 0, -1);
    const y = Math.max(g + 2.2, Math.min(mix(g + 4, fly, 0.75), g + 11)) + (pitch - 0.5) * 5;
    const k = ORB.free.shift(); { const hc = hueOf(pitch); ORB.hueAttr.setXYZ(k, hc.r, hc.g, hc.b); ORB.hueAttr.needsUpdate = true; }
    const L = { t, x, y: Math.max(y, g + 1.8), z, ground: g, k, pitch, vel, done: false, born: W.t, spin: R(0, 6.28), s: R(0.85, 1.25) };
    ORB.land.push(L);
  }
  function updateOrb(dt) {
    const now = W.t, glow = ORB.glowAttr.array;
    ORB.mesh.visible = W.orbOn && TOY.stones && (ORB.land.length > 0 || W.t - (ORB.lastLand || -99) < 4);
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
    const hoverP = tv2; onPath(W.d + 26, latAt(W.d + 26), hoverP); hoverP.y = mix(groundAt(hoverP.x, hoverP.z) + 4, lineY(hoverP.x, hoverP.z, 0, -1), 0.75) + Math.sin(now * 1.7) * 0.4;
    const hovering = !B || !ORB.from || (B.t - now > 1.1 && B.t - ORB.from.t > 2.2);
    if (hovering) { ORB.pos.lerp(B ? tv3.set(B.x, B.y + 2.5, B.z).lerp(hoverP, 0.5) : hoverP, Math.min(1, dt * 1.6)); ORB.from = { p: ORB.pos.clone(), t: now }; }
    else { const F = ORB.from, span = Math.max(0.08, B.t - F.t), u = clamp((now - F.t) / span, 0, 1), arcH = clamp(9.8 * 1.8 * span * span / 8, 0.25, 7);
      ORB.pos.set(mix(F.p.x, B.x, u), mix(F.p.y, B.y, u) + arcH * 4 * u * (1 - u), mix(F.p.z, B.z, u)); }
    ORB.mesh.position.copy(ORB.pos);
    const sq = ORB.squash || 0; ORB.squash = sq * Math.exp(-dt * 10); ORB.mesh.scale.set(1 + sq * 0.35, 1 - sq * 0.4, 1 + sq * 0.35);
    ORB.light.intensity = (W.orbOn ? 1 : 0) * (curTod === 'night' || curTod === 'dusk' ? 60 : 25) * (1 + ORB.flash * 2); ORB.flash = (ORB.flash || 0) * Math.exp(-dt * 4);
    if (W.orbOn && Math.random() < 0.7) ORB.sparks.emit(ORB.pos.x + R(-0.1, 0.1), ORB.pos.y + R(-0.1, 0.1), ORB.pos.z + R(-0.1, 0.1), R(-0.3, 0.3), R(-0.2, 0.3), R(-0.3, 0.3), R(0.6, 1.2), R(0.06, 0.12), tc.setRGB(2.5, 1.9, 1.2));
    for (const r of ORB.ripples) { if (r.age > 2) { r.m.visible = false; continue; } r.age += dt; const s = 0.5 + r.age * 2.6; r.m.scale.set(s, 1, s); r.m.material.opacity = Math.max(0, 1 - r.age / 0.9) * 0.55; r.m.visible = true; }
    ORB.sparks.mat.uniforms.time.value = now;
  }
  let ripK = 0;
  function onLand(L) {
    ORB.lastLand = W.t;
    ORB.squash = 1; ORB.flash = 1;
    const r = ORB.ripples[ripK]; ripK = (ripK + 1) % ORB.ripples.length; r.age = 0; r.m.position.set(L.x, L.y - 0.3, L.z);
    const hc = hueOf(L.pitch); r.m.material.color.copy(hc).multiplyScalar(1.4); ORB.mesh.material.color.copy(hc).lerp(C(1, 1, 1), 0.5).multiplyScalar(4); ORB.light.color.copy(hc).lerp(C(1, 0.9, 0.7), 0.4);
    const n = W.calm ? 6 : 14; for (let i = 0; i < n; i++) { const a = rnd() * 6.283, sp = R(0.8, 2.6); ORB.sparks.emit(L.x, L.y - 0.2, L.z, Math.cos(a) * sp, R(0.6, 2.2), Math.sin(a) * sp, R(0.6, 1.3), R(0.05, 0.1), tc.copy(hc).multiplyScalar(2.4)); }
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

  // ---------------- folk: hobbit villagers round a campfire, a witch, a stone troll, elves, rabbits ----------------
  const FOLK = { mat: null, glow: { value: 0 }, hob: [], vill: null, fire: null, witch: null, troll: null, trollSpots: [], elves: [], tree: null, rabbits: [], pick: [], t: 0, energy: 0 };
  const MR = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
  const geoOf = fn => { const b = HB(); fn(b); return hBuild(b); };
  const SPH = (r = 1, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
  function charMaterial() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
    m.onBeforeCompile = sh => { sh.uniforms.chGlow = FOLK.glow; sh.uniforms.bEnv = RU.bEnv;
      sh.vertexShader = 'attribute float aEm; varying float vEm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEm = aEm;');
      sh.fragmentShader = 'varying float vEm; uniform float chGlow, bEnv;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * max(vEm, 0.0) * (0.5 + chGlow * 3.0) * (1.0 + bEnv * 1.6);');
    }; m.customProgramCacheKey = () => 'char'; return m;
  }
  function cmesh(geo, parent, kind, mat) { const m = new THREE.Mesh(geo, mat || FOLK.mat); m.castShadow = true; m.receiveShadow = true; m.userData.kind = kind; parent.add(m); FOLK.pick.push(m); return m; }
  function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  function makeHobbit() {
    const skin = LC(pick(['#f2c9a2', '#e8b890', '#d9a27a', '#b88058', '#8a5a3a'])), hair = LC(pick(['#5a3a20', '#8a4a22', '#3a2a1c', '#b07038', '#2a2018', '#c89048'])),
      vest = LC(pick(['#3f6b3a', '#a8792c', '#8c3a2c', '#3a5a8c', '#6a4a7a', '#b85a3a', '#2f5a52'])), shirt = LC(pick(['#efe6d0', '#e8dcc0', '#d8c8a0', '#e0d0b8'])), pants = LC(pick(['#6a4a30', '#5a4a3a', '#7a6040', '#4a5a3a', '#6a5a48'])), dark = LC('#2a1e14');
    const root = new THREE.Group(), lady = rnd() < 0.45, cloak = rnd() < 0.3;
    const body = cmesh(geoOf(b => {
      hAdd(b, SPH(), MR(0, 0.66, 0, 0, 0, 0, 0.21, 0.25, 0.18), vest);
      hAdd(b, SPH(1, 10, 8), MR(0, 0.6, 0.055, 0, 0, 0, 0.17, 0.19, 0.15), shirt);
      hAdd(b, new THREE.CylinderGeometry(0.205, 0.215, 0.05, 14), MR(0, 0.52, 0), dark);
      if (lady) hAdd(b, new THREE.CylinderGeometry(0.17, 0.3, 0.36, 14, 1, true), MR(0, 0.36, 0), pants.clone().lerp(vest, 0.5));
      if (cloak) hAdd(b, new THREE.CylinderGeometry(0.12, 0.3, 0.72, 14, 1, true, Math.PI * 0.6, Math.PI * 1.8), MR(0, 0.5, -0.02), LC(pick(['#4a5a34', '#5a3a2a', '#3a4458'])));
      hAdd(b, SPH(0.15, 16, 12), MR(0, 1.0, 0), skin);
      hAdd(b, SPH(0.032, 8, 6), MR(0, 0.985, 0.152), skin.clone().multiplyScalar(0.9));
      for (const s of [-1, 1]) { hAdd(b, new THREE.ConeGeometry(0.035, 0.1, 6), MR(s * 0.15, 1.04, -0.01, 0, 0, -s * 1.15), skin); hAdd(b, SPH(0.018, 6, 4), MR(s * 0.05, 1.03, 0.135), dark); hAdd(b, SPH(0.03, 6, 4), MR(s * 0.075, 0.97, 0.12, 0, 0, 0, 1, 0.6, 0.5), skin.clone().lerp(LC('#ff8070'), 0.25)); }
      const nh = lady ? 16 : 11; for (let k = 0; k < nh; k++) { const a = k / nh * 6.283, up = 0.4 + (k % 3) * 0.25; const x = Math.sin(a) * 0.13 * Math.cos(up), z = Math.cos(a) * 0.13 * Math.cos(up) - 0.02, y = 1.0 + 0.13 * Math.sin(up);
        if (z > 0.09 && y < 1.1) continue; hAdd(b, SPH(lady ? 0.065 : 0.058, 7, 5), MR(x, y, z), hair); }
      hAdd(b, SPH(0.12, 10, 6), MR(0, 1.1, -0.02, 0, 0, 0, 1, 0.55, 1), hair);
      if (lady) hAdd(b, SPH(0.09, 8, 6), MR(0, 0.86, -0.12, 0, 0, 0, 1, 1.6, 0.7), hair);
    }), root, 'folk');
    const arms = [-1, 1].map(s => { const p = pivot(root, s * 0.215, 0.82, 0); cmesh(geoOf(b => { hAdd(b, new THREE.CapsuleGeometry(0.048, 0.2, 4, 8), MR(0, -0.15, 0), shirt); hAdd(b, SPH(0.05, 8, 6), MR(0, -0.31, 0), skin); }), p, 'folk'); return p; });
    const legs = [-1, 1].map(s => { const p = pivot(root, s * 0.09, 0.44, 0); cmesh(geoOf(b => { hAdd(b, new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), MR(0, -0.17, 0), pants); hAdd(b, SPH(1, 10, 7), MR(0, -0.39, 0.045, 0, 0, 0, 0.085, 0.055, 0.15), skin.clone().multiplyScalar(0.88)); hAdd(b, SPH(0.05, 6, 4), MR(0, -0.35, 0.05, 0, 0, 0, 1.4, 0.7, 1.6), hair); }), p, 'folk'); return p; });
    const lantern = pivot(arms[1], 0, -0.36, 0.05); cmesh(geoOf(b => { hAdd(b, new THREE.BoxGeometry(0.09, 0.12, 0.09), MR(0, -0.09, 0), LC('#ffb050'), 1); hAdd(b, new THREE.BoxGeometry(0.11, 0.02, 0.11), MR(0, -0.02, 0), dark); hAdd(b, new THREE.BoxGeometry(0.11, 0.02, 0.11), MR(0, -0.16, 0), dark); hAdd(b, new THREE.TorusGeometry(0.03, 0.005, 4, 8), MR(0, 0.01, 0), dark); }), lantern, 'folk');
    root.scale.setScalar(R(1.1, 1.3)); root.visible = false; scene.add(root);
    return { root, body, arms, legs, lantern, ph: rnd() * 6.28, mode: 'idle', a: 0, d: 0, dir: 1, lane: 0, y0: 0, jump: -9, speed: R(1.0, 1.4) };
  }
  function makeCampfire() {
    const g = new THREE.Group(), wood = LC('#4a3424'), stone = LC('#8a847a');
    cmesh(geoOf(b => { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; hAdd(b, new THREE.CylinderGeometry(0.07, 0.09, 1.0, 7), MR(Math.cos(a) * 0.28, 0.22, Math.sin(a) * 0.28, 0, -a, 1.1), wood); }
      for (let i = 0; i < 11; i++) { const a = i / 11 * 6.283; hAdd(b, SPH(0.16, 7, 5), MR(Math.cos(a) * 0.75, 0.05, Math.sin(a) * 0.75, 0, a, 0, 1, 0.7, 1.2), stone); }
      for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283 + 0.5; hAdd(b, new THREE.CylinderGeometry(0.16, 0.18, 1.8, 8), MR(Math.cos(a) * 3.2, 0.16, Math.sin(a) * 3.2, Math.PI / 2, 0, 0).premultiply(new THREE.Matrix4().makeRotationY(-a)), LC('#5a4430')); }
      hAdd(b, SPH(0.45, 8, 4), MR(0, 0.0, 0, 0, 0, 0, 1, 0.15, 1), LC('#ff7a30'), 1); }), g, 'fire');
    const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { time: U.time, amt: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: NOISE + `uniform float time, amt; varying vec2 vUv; void main(){ vec2 uv = vUv; float n = gfbm(vec2(uv.x * 4.0, uv.y * 2.5 - time * 2.6)); float w = 1.0 - abs(uv.x - 0.5) * 2.0 * (1.0 + uv.y * 1.8);
        float f = smoothstep(0.0, 0.35, w * (1.0 - uv.y * (1.1 - amt * 0.25)) + n * 0.5 - 0.32); vec3 c = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.85, 0.45), f * f) * f * amt * 2.6; gl_FragColor = vec4(c, 1.0); }` });
    for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7).translate(0, 0.85, 0), fm); pl.rotation.y = i * Math.PI / 3; g.add(pl); }
    const light = new THREE.PointLight(0xff8a40, 0, 24, 1.6); light.position.y = 1.2; g.add(light);
    g.visible = false; scene.add(g); return { g, fm, light, flare: 0, x: 0, z: 0, y: 0, emb: 0 };
  }
  function makeWitch() {
    const g = new THREE.Group(), robe = LC('#2a1a3a'), skin = LC('#b8d08a'), straw = LC('#c8a050'), wood = LC('#4a3020'), hatC = LC('#1e1428'), hairC = LC('#e0582a');
    cmesh(geoOf(b => {
      hAdd(b, new THREE.CylinderGeometry(0.03, 0.035, 2.0, 6), MR(0, 0, 0, Math.PI / 2), wood);
      hAdd(b, new THREE.ConeGeometry(0.18, 0.6, 10, 1, true), MR(0, 0, -1.2, -Math.PI / 2), straw);
      hAdd(b, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), MR(0, 0, -0.92, Math.PI / 2), LC('#7a2a2a'));
      hAdd(b, new THREE.ConeGeometry(0.3, 0.75, 10), MR(0, 0.3, -0.15, -0.25), robe);
      hAdd(b, SPH(0.13, 12, 9), MR(0, 0.78, -0.05), skin);
      hAdd(b, new THREE.ConeGeometry(0.035, 0.14, 6), MR(0, 0.76, 0.14, Math.PI / 2 + 0.3), skin);
      hAdd(b, new THREE.CylinderGeometry(0.32, 0.32, 0.02, 16), MR(0, 0.88, -0.06, -0.3), hatC);
      hAdd(b, new THREE.ConeGeometry(0.15, 0.55, 12), MR(0, 1.13, -0.16, -0.55), hatC);
      hAdd(b, new THREE.CylinderGeometry(0.152, 0.152, 0.05, 12), MR(0, 0.92, -0.07, -0.3), LC('#8a3aa0'), 0.6);
      for (let i = 0; i < 7; i++) hAdd(b, new THREE.BoxGeometry(0.03, 0.3, 0.02), MR(R(-0.12, 0.12), 0.66, -0.15 - i * 0.012, R(-0.6, -0.2), 0, R(-0.3, 0.3)), hairC);
      for (const s of [-1, 1]) { hAdd(b, new THREE.CapsuleGeometry(0.045, 0.3, 4, 6), MR(s * 0.13, 0.32, 0.2, 1.3, 0, s * 0.15), robe); hAdd(b, SPH(0.045, 6, 4), MR(s * 0.06, 0.08, 0.38), skin); hAdd(b, SPH(0.018, 5, 4), MR(s * 0.045, 0.8, 0.11), LC('#ffd040'), 1.5); }
    }), g, 'witch');
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9, 1, 4).translate(0, -0.45, 0), new THREE.MeshStandardMaterial({ color: LC('#3a1a4a'), side: THREE.DoubleSide, roughness: 0.8 }));
    cape.position.set(0, 0.62, -0.18); cape.rotation.x = 1.0; g.add(cape); g.scale.setScalar(1.7); g.visible = false; scene.add(g);
    return { g, cape, on: false, t: 0, dur: 1, a: V(), b: V(), next: 20 };
  }
  function makeTroll() {
    const g = new THREE.Group(), sm = stoneMaterial('#cfcab4', true), moss = LC('#5a7a3a'), eyeC = LC('#ffcc55'), tusk = LC('#e8dcc0');
    const body = new THREE.Mesh(geoOf(b => {
      hAdd(b, SPH(1, 18, 14), MR(0, 1.9, 0, 0, 0, 0, 1.55, 1.55, 1.25));
      hAdd(b, SPH(1, 14, 10), MR(0, 1.4, 0.55, 0, 0, 0, 1.15, 0.95, 0.85));
      for (const s of [-1, 1]) { hAdd(b, new THREE.CapsuleGeometry(0.45, 1.2, 4, 10), MR(s * 0.95, 0.65, 0.9, Math.PI / 2 - 0.2, 0, s * 0.25)); hAdd(b, SPH(1, 10, 8), MR(s * 1.05, 0.25, 1.75, 0, 0, 0, 0.5, 0.32, 0.75)); }
      for (let i = 0; i < 9; i++) hAdd(b, SPH(R(0.25, 0.5), 7, 5), MR(R(-1.2, 1.2), R(2.6, 3.3), R(-0.9, 0.3)));
    }), sm); body.castShadow = true; body.receiveShadow = true; body.userData.kind = 'troll'; g.add(body); FOLK.pick.push(body);
    cmesh(geoOf(b => { for (let i = 0; i < 26; i++) { const a = rnd() * 6.283, r = R(0.4, 1.3); hAdd(b, new THREE.ConeGeometry(0.05, R(0.25, 0.5), 4), MR(Math.cos(a) * r, 3.3 + R(-0.25, 0.1), Math.sin(a) * r * 0.8 - 0.3, R(-0.4, 0.4), 0, R(-0.4, 0.4)), moss); }
      hAdd(b, new THREE.CylinderGeometry(0.06, 0.09, 0.9, 6), MR(0.7, 3.55, -0.3, 0, 0, -0.2), LC('#4a3424')); hAdd(b, new THREE.ConeGeometry(0.45, 1.1, 7), MR(0.82, 4.3, -0.3, 0, 0, -0.2), LC('#3e6a34')); }), g, 'troll');
    const head = pivot(g, 0, 3.35, 0.65);
    const hm = new THREE.Mesh(geoOf(b => { hAdd(b, SPH(0.8, 16, 12), MR(0, 0.35, 0.15, 0, 0, 0, 1, 0.9, 0.95)); hAdd(b, SPH(0.35, 10, 8), MR(0, 0.25, 0.95, 0, 0, 0, 0.9, 1.1, 1.3)); hAdd(b, SPH(0.7, 10, 6), MR(0, 0.62, 0.45, 0, 0, 0, 1.1, 0.35, 0.6));
      for (const s of [-1, 1]) hAdd(b, new THREE.ConeGeometry(0.22, 0.6, 6), MR(s * 0.82, 0.45, 0, 0, 0, -s * 1.3)); }), sm); hm.castShadow = true; hm.userData.kind = 'troll'; head.add(hm); FOLK.pick.push(hm);
    cmesh(geoOf(b => { for (const s of [-1, 1]) { hAdd(b, SPH(0.075, 8, 6), MR(s * 0.28, 0.48, 0.82), eyeC, 1); hAdd(b, new THREE.ConeGeometry(0.06, 0.22, 6), MR(s * 0.25, -0.02, 0.78, 0.3), tusk); } }), head, 'troll');
    const arm = pivot(g, 1.35, 2.5, 0.2); const am = new THREE.Mesh(geoOf(b => { hAdd(b, new THREE.CapsuleGeometry(0.38, 1.3, 4, 10), MR(0, -0.85, 0.15)); hAdd(b, SPH(0.48, 10, 8), MR(0, -1.85, 0.25)); }), sm); am.castShadow = true; am.userData.kind = 'troll'; arm.add(am); FOLK.pick.push(am);
    const arm2 = pivot(g, -1.35, 2.5, 0.2); const am2 = am.clone(); arm2.add(am2); FOLK.pick.push(am2);
    g.visible = false; scene.add(g); return { g, head, arm, arm2, spot: null, wave: -9, thump: -9, look: 0 };
  }
  function makeElf() {
    const g = new THREE.Group(), robe = LC(pick(['#e8eef0', '#d8e8d8', '#e0e4f0', '#c8d8c0'])), skin = LC('#f0dcc8'), hairC = LC(pick(['#f0e8c8', '#e8e0d8', '#d8c090'])), orbC = LC('#a8e8ff');
    cmesh(geoOf(b => { hAdd(b, new THREE.CylinderGeometry(0.13, 0.36, 1.3, 16, 1, true), MR(0, 0.65, 0), robe); hAdd(b, new THREE.CylinderGeometry(0.11, 0.14, 0.45, 12), MR(0, 1.45, 0), robe); hAdd(b, new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12), MR(0, 1.27, 0), LC('#c8a85a'), 0.3);
      hAdd(b, SPH(0.105, 14, 10), MR(0, 1.8, 0, 0, 0, 0, 0.9, 1.1, 1), skin); hAdd(b, new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8), MR(0, 1.66, 0), skin);
      for (const s of [-1, 1]) { hAdd(b, new THREE.ConeGeometry(0.025, 0.18, 5), MR(s * 0.11, 1.84, -0.02, 0, 0, -s * 1.0), skin); hAdd(b, SPH(0.012, 5, 4), MR(s * 0.035, 1.82, 0.09), LC('#3a6a8a')); }
      hAdd(b, SPH(0.115, 12, 8), MR(0, 1.86, -0.03, 0, 0, 0, 1, 0.8, 1.05), hairC, 0.15); hAdd(b, new THREE.CylinderGeometry(0.1, 0.06, 0.6, 10, 1, true), MR(0, 1.55, -0.06), hairC, 0.15);
      hAdd(b, new THREE.TorusGeometry(0.105, 0.012, 5, 16), MR(0, 1.9, 0, Math.PI / 2 - 0.15), LC('#e8c860'), 0.4); }), g, 'elf');
    const arm = pivot(g, 0.16, 1.55, 0); cmesh(geoOf(b => { hAdd(b, new THREE.CapsuleGeometry(0.035, 0.42, 4, 6), MR(0, -0.25, 0), robe); hAdd(b, SPH(0.035, 6, 4), MR(0, -0.5, 0), skin); hAdd(b, SPH(0.08, 10, 8), MR(0, -0.6, 0.02), orbC, 2.2); }), arm, 'elf');
    const arm2 = pivot(g, -0.16, 1.55, 0); cmesh(geoOf(b => { hAdd(b, new THREE.CapsuleGeometry(0.035, 0.42, 4, 6), MR(0, -0.25, 0), robe); hAdd(b, SPH(0.035, 6, 4), MR(0, -0.5, 0), skin); }), arm2, 'elf');
    g.scale.setScalar(1.05); g.visible = false; scene.add(g); return { g, arm, arm2, ph: rnd() * 6.28, a: 0, lift: 0 };
  }
  function makeRabbit() {
    const g = new THREE.Group(), fur = LC(pick(['#8a6a4a', '#9a8068', '#6a5a4a', '#b8a088', '#d8d0c4'])), dark = LC('#1a1410');
    cmesh(geoOf(b => { hAdd(b, SPH(1, 10, 8), MR(0, 0.14, 0, 0, 0, 0, 0.12, 0.12, 0.17), fur); hAdd(b, SPH(0.075, 10, 8), MR(0, 0.25, 0.14), fur); hAdd(b, SPH(0.045, 6, 4), MR(0, 0.16, -0.17), LC('#f0ece4'));
      for (const s of [-1, 1]) { hAdd(b, SPH(1, 6, 4), MR(s * 0.03, 0.37, 0.11, -0.25, 0, s * 0.18, 0.022, 0.1, 0.012), fur); hAdd(b, SPH(0.012, 5, 4), MR(s * 0.045, 0.27, 0.2), dark); hAdd(b, SPH(1, 6, 4), MR(s * 0.07, 0.05, -0.04, 0, 0, 0, 0.04, 0.04, 0.09), fur); } }), g, 'rabbit');
    g.visible = false; scene.add(g); return { g, on: false, hop: -9, hopDur: 0.35, from: V(), to: V(), head: 0, next: 0 };
  }
  function buildFolk() {
    FOLK.mat = charMaterial();
    for (let i = 0; i < 14; i++) FOLK.hob.push(makeHobbit());
    FOLK.fire = makeCampfire(); FOLK.witch = makeWitch(); FOLK.troll = makeTroll();
    for (let i = 0; i < 4; i++) FOLK.elves.push(makeElf());
    for (let i = 0; i < 8; i++) FOLK.rabbits.push(makeRabbit());
  }
  function trollSpot(D) {
    for (let t = 0; t < 10; t++) { const dd = D + R(-60, 60), side = rnd() < 0.5 ? -1 : 1, x = trailX(dd) + side * R(9, 22), z = -dd, h = heightAt(x, z);
      if (h < SC.water + 0.8 || nearVillage(x, z) || slopeAt(x, z, h) > 0.35) continue; FOLK.trollSpots.push({ x, z, y: h, d: dd, yaw: Math.atan2(trailX(dd) - x, 0) }); landmarks.push({ d: dd, x, z, y: h + 4, pass: 16, pull: 0.7 }); return; }
  }
  const beatPhase = () => W.beatPer > 0.2 ? clamp(1 - (W.nextBeat - W.t) / W.beatPer, 0, 1) : (W.t * 0.8) % 1;
  function poseHobbit(F, dt) {
    const o = F.root, L = F.legs, A = F.arms; let bob = 0;
    if (F.mode === 'walk') { F.ph += dt * F.speed * 5.2; const s = Math.sin(F.ph); L[0].rotation.x = s * 0.6; L[1].rotation.x = -s * 0.6; A[0].rotation.set(-s * 0.5, 0, 0.08); A[1].rotation.set(F.lit ? -0.5 : s * 0.5, 0, -0.08); bob = Math.abs(Math.cos(F.ph)) * 0.035; }
    else if (F.mode === 'dance') { const bp = beatPhase(), e = 0.4 + FOLK.energy * 0.8, hop = Math.pow(Math.sin(bp * Math.PI), 2) * 0.13 * e, k = Math.floor(W.t / Math.max(0.3, W.beatPer || 0.6)) % 2;
      L[0].rotation.x = k ? -0.5 * e * Math.sin(bp * Math.PI) : 0.1; L[1].rotation.x = k ? 0.1 : -0.5 * e * Math.sin(bp * Math.PI);
      const wave = Math.sin(W.t * 6 + F.ph) * 0.3; A[0].rotation.set(0, 0, -2.5 - wave * e); A[1].rotation.set(0, 0, 2.5 + wave * e); bob = hop; }
    else if (F.mode === 'sit') { L[0].rotation.x = L[1].rotation.x = -1.45; A[0].rotation.set(-0.5, 0, 0.1); A[1].rotation.set(-0.5 + Math.sin(W.t * 1.3 + F.ph) * 0.15, 0, -0.1); bob = -0.3; }
    else { const s = Math.sin(W.t * 1.4 + F.ph); L[0].rotation.x = L[1].rotation.x = 0; A[0].rotation.set(0, 0, 0.12 + s * 0.05); A[1].rotation.set(F.lit ? -0.5 : 0, 0, -0.12 - s * 0.05); bob = 0; }
    const jt = W.t - F.jump; if (jt < 0.7) { bob += Math.sin(jt / 0.7 * Math.PI) * 0.6; A[0].rotation.set(0, 0, -2.8); A[1].rotation.set(0, 0, 2.8); }
    F.body.position.y = bob; for (const p of [...L, ...A]) p.position.y = (p === L[0] || p === L[1] ? 0.44 : 0.82) + bob;
  }
  function updateFolk(dt) {
    if (!FOLK.mat) return; FOLK.t -= dt; const night = curTod === 'night' || curTod === 'dusk', cx = cam.position.x, cz = cam.position.z;
    FOLK.glow.value = curTod === 'night' ? 1 : curTod === 'dusk' ? 0.7 : curTod === 'golden' ? 0.2 : 0;
    FOLK.energy += ((W.beatPer > 0.2 ? clamp(W.level * 1.4, 0.2, 1) : 0) - FOLK.energy) * Math.min(1, dt * 0.5);
    if (FOLK.t < 0) { FOLK.t = 1;
      // village folk: pick the nearest village and gather round its fire
      let best = null, bd = 380; for (const v of villages) { const d = Math.hypot(v.x - cx, v.z - cz); if (d < bd) { bd = d; best = v; } }
      if (best !== FOLK.vill) { FOLK.vill = best; const Fi = FOLK.fire;
        if (best) { const fx = best.fx, fz = best.fz;
          Fi.x = fx; Fi.z = fz; Fi.y = heightAt(fx, fz); Fi.g.position.set(fx, Fi.y - 0.05, fz); Fi.g.visible = true;
          FOLK.hob.forEach((F, i) => { F.root.visible = true; F.dancer = i < 7; F.a = i / 7 * 6.283; F.d = best.d + R(-70, 70); F.dir = rnd() < 0.5 ? 1 : -1; F.lane = R(-0.7, 0.7); F.sitA = i / 7 * 6.283; });
        } else { Fi.g.visible = false; for (const F of FOLK.hob) F.root.visible = false; } }
      // the troll: nearest spot within reach
      const ts = FOLK.trollSpots.filter(s => s.d > W.d - 400); FOLK.trollSpots = ts; let tb = null, td = 360; for (const s of ts) { const d = Math.hypot(s.x - cx, s.z - cz); if (d < td) { td = d; tb = s; } }
      const T = FOLK.troll; if (tb !== T.spot) { T.spot = tb; T.g.visible = !!tb; if (tb) { T.g.position.set(tb.x, tb.y - 0.3, tb.z); T.g.rotation.y = tb.yaw; T.g.scale.setScalar(1.15); } }
      // elves keep watch at the nearest great tree
      let gb = null, gd = 340; for (const it of props.items) if (it.v === 5) { const d = Math.hypot(it.x - cx, it.z - cz); if (d < gd) { gd = d; gb = it; } }
      if (gb !== FOLK.tree) { FOLK.tree = gb; FOLK.elves.forEach((E, i) => { E.g.visible = !!gb; if (!gb) return; const a = i / FOLK.elves.length * 6.283 + 0.4, r = 4.5 * gb.s * 0.55 + 2.5, x = gb.x + Math.cos(a) * r, z = gb.z + Math.sin(a) * r; E.g.position.set(x, heightAt(x, z), z); E.g.rotation.y = Math.atan2(x - gb.x, z - gb.z); E.a = a; }); }
    }
    const Fi = FOLK.fire, vill = FOLK.vill;
    if (vill) {
      const dancing = W.beatPer > 0.2 && FOLK.energy > 0.15;
      Fi.flare *= Math.exp(-dt * 1.5); const amt = (night ? 1 : 0.75) * (0.9 + W.kick * 0.35 + Fi.flare * 0.8 + Math.sin(W.t * 13) * 0.04 + Math.sin(W.t * 7.3) * 0.05);
      Fi.fm.uniforms.amt.value = amt; Fi.light.intensity = (night ? 45 : curTod === 'golden' ? 12 : 3) * amt; Fi.g.scale.setScalar(1 + Fi.flare * 0.35);
      Fi.emb -= dt * (night ? 6 : 3) * (1 + Fi.flare * 4); while (Fi.emb < 0) { Fi.emb += 1; ORB.sparks.emit(Fi.x + R(-0.3, 0.3), Fi.y + 0.9, Fi.z + R(-0.3, 0.3), R(-0.3, 0.3), R(1.2, 2.6), R(-0.3, 0.3), R(1.2, 2.4), R(0.03, 0.06), tc.setRGB(2.4, 0.9, 0.25)); }
      FOLK.hob.forEach((F, i) => { const o = F.root; F.lit = night && !F.dancer; F.lantern.visible = F.lit;
        if (F.dancer) { const ring = dancing ? 2.3 : 3.2; if (dancing) F.a += dt * (0.35 + FOLK.energy * 0.25); const a = dancing ? F.a : F.sitA;
          const x = Fi.x + Math.cos(a) * ring, z = Fi.z + Math.sin(a) * ring; o.position.set(x, heightAt(x, z), z);
          o.rotation.y = dancing ? Math.atan2(-Math.sin(a), Math.cos(a)) + Math.sin(W.t * 2 + i) * 0.5 : Math.atan2(Fi.x - x, Fi.z - z); F.mode = dancing ? 'dance' : (i % 3 === 0 ? 'idle' : 'sit'); if (F.mode === 'sit') o.position.y += 0.05; }
        else { F.d += F.dir * F.speed * dt * 0.75; if (Math.abs(F.d - vill.d) > 90) { F.dir = -Math.sign(F.d - vill.d); } const x = trailX(F.d) + F.lane, z = -F.d;
          o.position.set(x, heightAt(x, z), z); const nx = trailX(F.d + F.dir) + F.lane - x; o.rotation.y = Math.atan2(nx, -F.dir); F.mode = 'walk'; }
        const dx = o.position.x - cx, dz = o.position.z - cz; o.visible = dx * dx + dz * dz < 300 * 300; if (o.visible) poseHobbit(F, dt); });
    }
    // troll: breathes, watches you, drums his belly on big moments
    const T = FOLK.troll; if (T.spot) { const br = Math.sin(W.t * 0.8); T.g.children[0].scale.set(1 + br * 0.012, 1 + br * 0.018, 1 + br * 0.012);
      const ax = AV.pos.x - T.g.position.x, az = AV.pos.z - T.g.position.z, ad = Math.hypot(ax, az); const want = ad < 70 ? clamp(Math.atan2(ax, az) - T.g.rotation.y, -0.9, 0.9) : Math.sin(W.t * 0.15) * 0.3;
      T.look += (((want + Math.PI) % (2 * Math.PI) - Math.PI) - T.look) * Math.min(1, dt * 1.5); T.head.rotation.y = T.look; T.head.rotation.x = ad < 70 ? -0.15 : 0.05;
      const wt = W.t - T.wave, tt = W.t - T.thump; T.arm.rotation.set(0, 0, wt < 3 ? -(2.2 + Math.sin(wt * 9) * 0.35) * Math.sin(Math.min(1, wt / 0.5) * Math.PI / 2) * (wt > 2.5 ? (3 - wt) * 2 : 1) : tt < 1.2 ? -Math.sin(tt / 1.2 * Math.PI) * 1.1 : 0.05 * Math.sin(W.t + 1));
      T.arm2.rotation.set(0, 0, tt < 1.2 ? Math.sin(tt / 1.2 * Math.PI) * 1.1 : -0.05); }
    // elves: sway, raise their light on chords
    if (FOLK.tree) for (const E of FOLK.elves) { E.lift *= Math.exp(-dt * 0.8); E.g.rotation.z = Math.sin(W.t * 0.7 + E.ph) * 0.03; E.arm.rotation.set(-0.3 - E.lift * 2.2 - Math.sin(W.t * 0.9 + E.ph) * 0.1, 0, 0.15); E.arm2.rotation.set(Math.sin(W.t * 0.6 + E.ph) * 0.1, 0, -0.12); }
    updateWitch(dt, night); updateRabbits(dt);
  }
  function updateWitch(dt, night) {
    const Wi = FOLK.witch;
    if (!Wi.on) { Wi.next -= dt; if (Wi.next > 0 || !(night || (curTod === 'golden' && rnd() < 0.3))) { if (Wi.next < 0) Wi.next = R(20, 40); return; }
      cam.getWorldDirection(tv); const fl = Math.hypot(tv.x, tv.z) || 1, fx = tv.x / fl, fz = tv.z / fl, rx = -fz, rz = fx, side = rnd() < 0.5 ? -1 : 1, ahead = R(70, 140), up = R(18, 45);
      Wi.a.set(cam.position.x + fx * ahead - rx * 230 * side, 0, cam.position.z + fz * ahead - rz * 230 * side); Wi.b.set(cam.position.x + fx * (ahead + R(-30, 60)) + rx * 230 * side, 0, cam.position.z + fz * (ahead + R(-30, 60)) + rz * 230 * side);
      Wi.a.y = groundAt(Wi.a.x, Wi.a.z) + up; Wi.b.y = groundAt(Wi.b.x, Wi.b.z) + up + R(-10, 10); Wi.t = 0; Wi.dur = Wi.a.distanceTo(Wi.b) / R(15, 20); Wi.on = true; Wi.g.visible = true; Wi.next = R(35, 70); }
    Wi.t += dt; const u = Wi.t / Wi.dur; if (u > 1) { Wi.on = false; Wi.g.visible = false; return; }
    const p = tv.copy(Wi.a).lerp(Wi.b, u); p.y += Math.sin(u * Math.PI) * 12 + Math.sin(W.t * 1.7) * 1.2 + Math.sin(u * 20) * 0.8; p.y = Math.max(p.y, groundAt(p.x, p.z) + 8);
    Wi.g.position.copy(p); Wi.g.rotation.set(Math.sin(W.t * 1.7) * 0.08, Math.atan2(Wi.b.x - Wi.a.x, Wi.b.z - Wi.a.z), Math.sin(W.t * 0.9) * 0.15, 'YXZ'); Wi.cape.rotation.x = 1.15 + Math.sin(W.t * 11) * 0.18;
    if (rnd() < dt * 30) { const bk = tv2.set(0, 0, -2.4).applyQuaternion(Wi.g.quaternion).add(p); ORB.sparks.emit(bk.x, bk.y, bk.z, R(-0.3, 0.3), R(-0.6, 0.2), R(-0.3, 0.3), R(0.8, 1.6), R(0.04, 0.08), tc.setHSL(0.75 + R(-0.12, 0.2), 0.9, 0.6).multiplyScalar(night ? 2.2 : 1.2)); }
  }
  function updateRabbits(dt) {
    const cx = cam.position.x, cz = cam.position.z; cam.getWorldDirection(tv3); const fl = Math.hypot(tv3.x, tv3.z) || 1, ux = tv3.x / fl, uz = tv3.z / fl, onBeat = W.beatPer > 0.2;
    for (const Rb of FOLK.rabbits) { const o = Rb.g;
      if (!Rb.on) { if (curTod === 'night' || rnd() > dt * 0.5) continue; const dist = R(14, 60), lat = R(-30, 30), x = cx + ux * dist - uz * lat, z = cz + uz * dist + ux * lat, h = okGround(x, z); if (h == null || meadowAt(x, z) < 0.15) continue;
        Rb.on = true; o.visible = true; o.position.set(x, h, z); Rb.head = rnd() * 6.28; Rb.next = W.t + R(0.3, 2); Rb.hop = -9; o.scale.setScalar(R(1.3, 1.7)); continue; }
      const dx = o.position.x - cx, dz = o.position.z - cz; if (dx * dx + dz * dz > 110 * 110 || curTod === 'night') { Rb.on = false; o.visible = false; continue; }
      const ht = W.t - Rb.hop;
      if (ht >= Rb.hopDur && W.t > Rb.next) { const scared = Math.hypot(o.position.x - AV.pos.x, o.position.z - AV.pos.z) < 10; if (scared) Rb.head = Math.atan2(o.position.x - AV.pos.x, o.position.z - AV.pos.z) + R(-0.4, 0.4); else Rb.head += R(-0.9, 0.9);
        const len = scared ? R(1.4, 2.2) : R(0.4, 0.9), tx = o.position.x + Math.sin(Rb.head) * len, tz = o.position.z + Math.cos(Rb.head) * len; if (okGround(tx, tz) == null) { Rb.head += 2; Rb.next = W.t + 0.2; continue; }
        Rb.from.copy(o.position); Rb.to.set(tx, heightAt(tx, tz), tz); Rb.hopDur = scared ? 0.28 : 0.36; Rb.hop = W.t; o.rotation.y = Rb.head;
        Rb.next = onBeat && !scared ? W.nextBeat + (rnd() < 0.5 ? 0 : W.beatPer) - Rb.hopDur * 0.5 : W.t + (scared ? 0.05 : R(0.4, 2.5)); }
      if (ht < Rb.hopDur) { const u = ht / Rb.hopDur; o.position.lerpVectors(Rb.from, Rb.to, u); o.position.y += Math.sin(u * Math.PI) * 0.35; o.rotation.x = -Math.cos(u * Math.PI) * 0.35; } else o.rotation.x = 0;
    }
  }

  // ---------------- detail: village dressing, windmills, bridges, docks + boats, fallen logs ----------------
  const DECO = [], MILLS = [], BOATS = [];
  function addDeco(geo, mat, d, kind = 'house', shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; m.userData.kind = kind; scene.add(m); DECO.push({ m, d }); return m; }
  function pruneDeco(all) { for (let i = DECO.length - 1; i >= 0; i--) if (all || DECO[i].d < W.d - 650) { scene.remove(DECO[i].m); DECO[i].m.geometry.dispose(); DECO.splice(i, 1); }
    for (const L of [MILLS, BOATS]) for (let i = L.length - 1; i >= 0; i--) if (all || L[i].d < W.d - 650) L.splice(i, 1); }
  const BULB = ['#ffd890', '#ffb060', '#ff8a7a', '#9ad8ff', '#c8a0ff', '#a8f090'], FLAG = ['#e8473c', '#f2b630', '#3f8fd8', '#5ab04a', '#e86aa8', '#f08a30', '#8a5ad8', '#f4eee0'];
  function stringLights(b, A, B, flags) {
    const n = Math.max(6, Math.round(A.distanceTo(B) / 1.1)), sag = A.distanceTo(B) * 0.07, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(V(mix(A.x, B.x, t), mix(A.y, B.y, t) - sag * 4 * t * (1 - t), mix(A.z, B.z, t))); }
    const rope = LC('#3a2e24'), k0 = Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[i + 1], len = p.distanceTo(q), mid = tv.copy(p).add(q).multiplyScalar(0.5);
      const m = new THREE.Matrix4().lookAt(p, q, UP); m.setPosition(mid); hAdd(b, new THREE.BoxGeometry(0.025, 0.025, len), m, rope);
      if (flags) { const tri = new THREE.BufferGeometry(); const dx = q.x - p.x, dz = q.z - p.z; tri.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, p.z, q.x, q.y, q.z, mid.x, mid.y - 0.42, mid.z, q.x, q.y, q.z, p.x, p.y, p.z, mid.x, mid.y - 0.42, mid.z], 3));
        tri.computeVertexNormals(); hAdd(b, tri, null, LC(FLAG[(i + k0) % FLAG.length])); }
      else hAdd(b, new THREE.SphereGeometry(0.075, 6, 4), MX(p.x, p.y - 0.06, p.z), LC(BULB[(i + k0) % BULB.length]), 1.4); }
  }
  function dressVillage(V0, hs) {
    const b = HB(), st = HB(), wood = LC('#6a4a30'), dwood = LC('#4a3424'), hay = LC('#d8b85a'), soil = LC('#4a3424'), D = V0.d;
    const gy = (x, z) => heightAt(x, z);
    // festival lights + bunting from a tall pole by the fire out to the nearest houses
    const pole = V(V0.fx + 2.2, 0, V0.fz + 2.2); pole.y = gy(pole.x, pole.z); hAdd(b, new THREE.CylinderGeometry(0.08, 0.11, 6, 7), MX(pole.x, pole.y + 3, pole.z), dwood); const top = V(pole.x, pole.y + 5.8, pole.z);
    const near = hs.map(h => ({ h, d: Math.hypot(h.x - pole.x, h.z - pole.z) })).filter(o => o.d < 30).sort((a, c) => a.d - c.d).slice(0, 5);
    near.forEach((o, i) => { const h = o.h, a = Math.atan2(pole.x - h.x, pole.z - h.z), e = V(h.x + Math.sin(a) * 3, gy(h.x, h.z) + 3.3, h.z + Math.cos(a) * 3); stringLights(b, top, e, i % 2 === 1); });
    for (let i = 0; i + 1 < hs.length && i < 6; i++) { const A = hs[i], B = hs[i + 1]; if (Math.hypot(A.x - B.x, A.z - B.z) > 22) continue; stringLights(b, V(A.x, gy(A.x, A.z) + 3.4, A.z), V(B.x, gy(B.x, B.z) + 3.4, B.z), i % 2 === 0); }
    // a well by the green
    { const wx = V0.fx - 6, wz = V0.fz + 3, wy = gy(wx, wz); hAdd(st, new THREE.CylinderGeometry(0.85, 0.9, 0.9, 14, 1, true), MX(wx, wy + 0.45, wz)); hAdd(st, new THREE.TorusGeometry(0.87, 0.1, 6, 16), MR(wx, wy + 0.9, wz, Math.PI / 2));
      for (const s of [-1, 1]) hAdd(b, new THREE.BoxGeometry(0.12, 2.1, 0.12), MX(wx + s * 0.8, wy + 1.05, wz), dwood); hAdd(b, prism(2.2, 1.8, 0.8), MX(wx, wy + 2.05, wz, 1, 1, 1, Math.PI / 2), LC('#8e4c3a'));
      hAdd(b, new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), MR(wx, wy + 1.6, wz, 0, 0, Math.PI / 2), wood); hAdd(b, new THREE.CylinderGeometry(0.16, 0.13, 0.25, 8), MX(wx + 0.2, wy + 1.15, wz), LC('#6a5038')); }
    // a market stall with a striped awning
    { const mx = V0.fx + 7, mz = V0.fz - 4, my = gy(mx, mz), ry = Math.atan2(V0.fx - mx, V0.fz - mz), rot = new THREE.Matrix4().makeRotationY(ry), at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z).premultiply(rot).premultiply(new THREE.Matrix4().makeTranslation(mx, my, mz));
      for (const [x, z] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]]) hAdd(b, new THREE.BoxGeometry(0.09, 2.3, 0.09), at(x, 1.15, z), dwood);
      hAdd(b, new THREE.BoxGeometry(2.6, 0.08, 1.2), at(0, 0.9, 0.2), wood); const ac = LC(pick(['#d8473c', '#3f7fd0', '#4a9a4a', '#e0a030'])), wc = LC('#f4ece0');
      for (let i = 0; i < 8; i++) hAdd(b, new THREE.BoxGeometry(0.34, 0.04, 1.8), new THREE.Matrix4().makeRotationX(-0.25).premultiply(at(-1.19 + i * 0.34, 2.35, 0.1)), i % 2 ? ac : wc);
      for (let i = 0; i < 14; i++) hAdd(b, new THREE.SphereGeometry(0.09, 6, 4), at(R(-1.1, 1.1), 1.0, R(-0.1, 0.6)), LC(pick(['#e84a2a', '#f0a020', '#8ac040', '#c03050', '#f4d040']))); }
    // gardens, fences, barrels, benches by each house
    hs.forEach((h, i) => { const sy = Math.sin(h.yaw), cy = Math.cos(h.yaw), rot = new THREE.Matrix4().makeRotationY(h.yaw), at = (x, y, z) => { const wx = h.x + (x * cy + z * sy) * h.s, wz = h.z + (-x * sy + z * cy) * h.s; return new THREE.Matrix4().makeTranslation(wx, gy(wx, wz) + y, wz).multiply(rot); };
      if (h.v === HV + 3) return;
      for (const s of [-1, 1]) if (rnd() < 0.7) { const k = rnd(); if (k < 0.4) { hAdd(b, new THREE.CylinderGeometry(0.28, 0.3, 0.75, 10), at(s * 1.6, 0.37, 3.6), LC('#7a5434')); hAdd(b, new THREE.TorusGeometry(0.29, 0.025, 4, 12), new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(at(s * 1.6, 0.6, 3.6)), dwood); }
        else if (k < 0.7) { hAdd(b, new THREE.BoxGeometry(0.5, 0.3, 0.4), at(s * 1.7, 0.15, 3.5), LC('#8a6a48')); for (let f = 0; f < 6; f++) hAdd(b, new THREE.SphereGeometry(0.08, 5, 4), at(s * 1.7 + R(-0.2, 0.2), 0.35, 3.5 + R(-0.12, 0.12)), LC(pick(BULB.concat(FLAG)))); }
        else { hAdd(b, new THREE.BoxGeometry(1.4, 0.08, 0.38), at(s * 1.9, 0.45, 3.5), wood); for (const e of [-0.6, 0.6]) hAdd(b, new THREE.BoxGeometry(0.08, 0.45, 0.32), at(s * 1.9 + e, 0.22, 3.5), dwood); } }
      if (rnd() < 0.6) { // fenced vegetable garden behind the house
        const gw = R(4, 6), gd = R(3, 4.5), z0 = -3.8 - gd; hAdd(b, new THREE.BoxGeometry(gw - 0.4, 0.15, gd - 0.4), at(0, 0.02, z0 + gd / 2), soil);
        for (let rr = 0; rr < Math.floor(gd / 0.7); rr++) for (let cc = 0; cc < Math.floor(gw / 0.6); cc++) { const pump = rnd() < 0.08; hAdd(b, new THREE.SphereGeometry(pump ? 0.2 : 0.15, 6, 4), at(-gw / 2 + 0.5 + cc * 0.6, pump ? 0.2 : 0.17, z0 + 0.4 + rr * 0.7).multiply(new THREE.Matrix4().makeScale(1, pump ? 0.75 : 0.8, 1)), pump ? LC('#e8801c') : LC(rr % 2 ? '#5a9a3a' : '#7ab84a')); }
        const post = (x, z) => hAdd(b, new THREE.BoxGeometry(0.08, 0.9, 0.08), at(x, 0.45, z), wood);
        const rail = (x0, z0_, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0_); for (const y of [0.35, 0.7]) hAdd(b, new THREE.BoxGeometry(len, 0.05, 0.04), at((x0 + x1) / 2, y, (z0_ + z1) / 2).multiply(new THREE.Matrix4().makeRotationY(-Math.atan2(z1 - z0_, x1 - x0))), wood); };
        for (let x = -gw / 2; x <= gw / 2 + 0.01; x += gw / Math.round(gw / 1.2)) { post(x, z0); } for (let z = z0; z <= -3.8; z += gd / Math.round(gd / 1.2)) { post(-gw / 2, z); post(gw / 2, z); }
        rail(-gw / 2, z0, gw / 2, z0); rail(-gw / 2, z0, -gw / 2, -3.8); rail(gw / 2, z0, gw / 2, -3.8); }
    });
    // haystacks and a cart on the edge of the village
    for (let i = 0; i < 3; i++) { const a = rnd() * 6.283, rr = R(30, 46), x = V0.x + Math.cos(a) * rr, z = V0.z + Math.sin(a) * rr, h = gy(x, z); if (h < SC.water + 0.8 || Math.abs(x - trailX(-z)) < 4) continue;
      hAdd(b, new THREE.SphereGeometry(1, 12, 8, 0, 6.283, 0, 1.75), MX(x, h - 0.2, z, R(1.2, 1.6), R(1.3, 1.8), R(1.2, 1.6)), hay); }
    { const a = rnd() * 6.283, x = V0.fx + Math.cos(a) * 12, z = V0.fz + Math.sin(a) * 12, h = gy(x, z), ry = rnd() * 6.283; const rot = new THREE.Matrix4().makeRotationY(ry), at = (px, py, pz) => new THREE.Matrix4().makeTranslation(px, py, pz).premultiply(rot).premultiply(new THREE.Matrix4().makeTranslation(x, h, z));
      if (!houses.some(q => (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < q.r2)) { hAdd(b, new THREE.BoxGeometry(1.2, 0.5, 2.0), at(0, 0.75, 0), wood); for (const s of [-1, 1]) hAdd(b, new THREE.CylinderGeometry(0.48, 0.48, 0.08, 14), new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(at(s * 0.66, 0.48, 0)), dwood);
        hAdd(b, new THREE.BoxGeometry(0.06, 0.06, 1.8), at(-0.3, 0.6, 1.8).multiply(new THREE.Matrix4().makeRotationX(0.25)), dwood); hAdd(b, new THREE.BoxGeometry(0.06, 0.06, 1.8), at(0.3, 0.6, 1.8).multiply(new THREE.Matrix4().makeRotationX(0.25)), dwood);
        hAdd(b, new THREE.SphereGeometry(0.75, 10, 6, 0, 6.283, 0, 1.6), at(0, 1.0, 0).multiply(new THREE.Matrix4().makeScale(0.75, 0.6, 1.2)), hay); } }
    // signpost where the trail enters
    { const dd = D - 48, x = trailX(dd) + 2.2, z = -dd, h = gy(x, z); hAdd(b, new THREE.BoxGeometry(0.12, 2.4, 0.12), MX(x, h + 1.2, z), dwood);
      hAdd(b, new THREE.BoxGeometry(1.1, 0.24, 0.05), MR(x + 0.45, h + 2.05, z, 0, 0.15, 0.05), wood); hAdd(b, new THREE.BoxGeometry(1.0, 0.22, 0.05), MR(x - 0.4, h + 1.7, z, 0, -0.3, -0.04), wood); }
    addDeco(hBuild(b), FOLK.mat, D, 'house'); if (st.p.length) addDeco(hBuild(st), DECO_STONE, D, 'ruin');
    // a windmill on a rise outside some villages; its sails turn a quarter turn every bar
    if (rnd() < 0.6) for (let t = 0; t < 8; t++) { const a = rnd() * 6.283, rr = R(48, 75), x = V0.x + Math.cos(a) * rr, z = V0.z + Math.sin(a) * rr, h = gy(x, z); if (h < SC.water + 1.5 || slopeAt(x, z, h) > 0.3 || Math.abs(x - trailX(-z)) < 8) continue;
      const mb = HB(), face = Math.atan2(V0.x - x, V0.z - z); hAdd(mb, new THREE.CylinderGeometry(2.0, 2.9, 9, 12), MX(x, h + 4.3, z), LC('#e8e0d0')); hAdd(mb, new THREE.ConeGeometry(2.5, 3, 12), MX(x, h + 10.2, z), LC('#8e4c3a'));
      hAdd(mb, new THREE.BoxGeometry(1.0, 1.9, 0.12), MR(x + Math.sin(face) * 2.85, h + 0.95, z + Math.cos(face) * 2.85, 0, face, 0), LC('#3a2a1e')); for (const yy of [3.5, 6.5]) hAdd(mb, new THREE.BoxGeometry(0.7, 0.8, 0.12), MR(x + Math.sin(face) * (2.7 - yy * 0.08), h + yy, z + Math.cos(face) * (2.7 - yy * 0.08), 0, face, 0), LC('#4a3a28'), 1);
      addDeco(hBuild(mb), FOLK.mat, D, 'house');
      const sb = HB(); hAdd(sb, new THREE.CylinderGeometry(0.25, 0.25, 0.6, 8), MR(0, 0, 0, Math.PI / 2), dwood);
      for (let k = 0; k < 4; k++) { const rk = new THREE.Matrix4().makeRotationZ(k * Math.PI / 2); hAdd(sb, new THREE.BoxGeometry(0.16, 5.6, 0.1), new THREE.Matrix4().makeTranslation(0, 2.9, 0.3).premultiply(rk), wood);
        hAdd(sb, new THREE.BoxGeometry(1.1, 4.2, 0.04), new THREE.Matrix4().makeTranslation(0.62, 3.4, 0.33).premultiply(rk), LC('#efe6d4')); }
      const sails = addDeco(hBuild(sb), FOLK.mat, D, 'mill'); sails.position.set(x + Math.sin(face) * 3.0, h + 8.6, z + Math.cos(face) * 3.0); sails.rotation.set(0, face, 0, 'YXZ'); MILLS.push({ m: sails, d: D, a: rnd() * 6.283 }); break; }
  }
  let DECO_STONE = null, FALL_MAT = null;
  function addWaterfall(x, y, z, s, gy, D) {
    if (!FALL_MAT) FALL_MAT = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: U.time, col: { value: C(0.85, 0.92, 1.0) }, lit: U.sunCol, fogCol: U.fogCol },
      vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: NOISE + `uniform float time; uniform vec3 col, lit, fogCol; varying vec2 vUv; varying float vD;
        void main(){ float y = vUv.y; float st = gn(vec2(vUv.x * 18.0, y * 6.0 + time * 2.2)) * 0.6 + gn(vec2(vUv.x * 40.0, y * 14.0 + time * 3.5)) * 0.4;
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x); float spread = mix(1.0, 0.45, 1.0 - y);
          float a = smoothstep(0.3, 0.75, st) * edge * smoothstep(0.0, 0.55, y) * 0.85 + edge * smoothstep(0.5, 0.0, y) * 0.35 * gn(vec2(vUv.x * 6.0, y * 3.0 + time * 0.6));
          vec3 c = col * (0.35 + 0.25 * lit.r) + vec3(0.06); c = mix(c, fogCol, smoothstep(300.0, 1400.0, vD) * 0.8); gl_FragColor = vec4(c, a); }` });
    const a = rnd() * 6.283, ex = x + Math.cos(a) * s * 0.93, ez = z + Math.sin(a) * s * 0.93, L = Math.max(30, (y - gy) * 0.75), w = s * 0.16;
    const g = new THREE.BufferGeometry(), P = [], UV = [], I = []; const seg = 14;
    for (const rot of [0, Math.PI / 2]) { const base = P.length / 3, dx = Math.cos(a + Math.PI / 2 + rot), dz = Math.sin(a + Math.PI / 2 + rot);
      for (let j = 0; j <= seg; j++) { const t = j / seg, yy = y + 0.5 - t * L, out = Math.sqrt(t) * s * 0.12, ww = w * (1 + t * 1.6); for (const side of [-1, 1]) { P.push(ex + Math.cos(a) * out + dx * side * ww * 0.5, yy, ez + Math.sin(a) * out + dz * side * ww * 0.5); UV.push(side < 0 ? 0 : 1, 1 - t); } }
      for (let j = 0; j < seg; j++) { const q = base + j * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeBoundingSphere();
    const m = addDeco(g, FALL_MAT, D, 'water', false); m.renderOrder = 3;
  }
  function makeBridge(D) {
    if (!SC.river || SC.water < -50) return; const x0 = pathX(D), z0 = -D; if (heightAt(x0, z0) > SC.water - 0.5) return;
    let xl = x0, xr = x0; while (heightAt(xl, z0) < SC.water + 0.6 && x0 - xl < 30) xl -= 0.5; while (heightAt(xr, z0) < SC.water + 0.6 && xr - x0 < 30) xr += 0.5; if (xr - xl > 40) return;
    xl -= 2.5; xr += 2.5; const b = HB(), span = xr - xl, n = Math.ceil(span / 0.9), top = SC.water + 2.6, yl = heightAt(xl, z0), yr = heightAt(xr, z0);
    const deckY = t => mix(yl + 0.1, yr + 0.1, t) + (top - mix(yl, yr, t)) * Math.pow(Math.sin(Math.PI * t), 0.7);
    for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, xa = mix(xl, xr, t0), xb = mix(xl, xr, t1), ya = deckY(t0), yb = deckY(t1), len = Math.hypot(xb - xa, yb - ya) + 0.05, ang = Math.atan2(yb - ya, xb - xa), xm = (xa + xb) / 2, ym = (ya + yb) / 2;
      hAdd(b, new THREE.BoxGeometry(len, 0.45, 3.2), MR(xm, ym - 0.22, z0, 0, 0, ang));
      for (const s of [-1, 1]) hAdd(b, new THREE.BoxGeometry(len, 0.75, 0.3), MR(xm, ym + 0.35, z0 + s * 1.5, 0, 0, ang));
      const tm2 = (t0 + t1) / 2, archY = SC.water - 0.6 + (top - 1.2 - SC.water) * Math.sin(Math.PI * clamp((tm2 - 0.12) / 0.76, 0, 1)), fillH = Math.max(0.2, ym - 0.45 - archY);
      if (tm2 > 0.12 && tm2 < 0.88) hAdd(b, new THREE.BoxGeometry(len, fillH, 3.0), MX(xm, archY + fillH / 2, z0)); else hAdd(b, new THREE.BoxGeometry(len, Math.max(0.5, ym - heightAt(xm, z0) + 0.5), 3.0), MX(xm, (ym + heightAt(xm, z0) - 0.5) / 2, z0)); }
    for (const x of [xl + 0.3, xr - 0.3]) for (const s of [-1, 1]) hAdd(b, new THREE.BoxGeometry(0.5, 1.4, 0.5), MX(x, heightAt(x, z0) + 0.7, z0 + s * 1.5));
    addDeco(hBuild(b), DECO_STONE, D, 'ruin');
  }
  function makeDock(D) {
    if (SC.water < -50) return;
    for (let t = 0; t < 30; t++) { const x = pathX(D) + R(-260, 260), z = -D + R(-40, 40), h = heightAt(x, z); if (h < SC.water + 0.2 || h > SC.water + 1.2) continue;
      let best = null; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283, ex = x + Math.sin(a) * 9, ez = z + Math.cos(a) * 9; if (heightAt(ex, ez) < SC.water - 1.2 && heightAt(x + Math.sin(a) * 4, z + Math.cos(a) * 4) < SC.water) { best = a; break; } }
      if (best == null || nearVillage(x, z)) continue; const a = best, b = HB(), wood = LC('#7a5a3c'), dwood = LC('#4a3424'), L = 9, rot = new THREE.Matrix4().makeRotationY(a), at = (px, py, pz) => new THREE.Matrix4().makeTranslation(px, py, pz).premultiply(rot).premultiply(new THREE.Matrix4().makeTranslation(x, 0, z));
      for (let i = 0; i < 18; i++) hAdd(b, new THREE.BoxGeometry(2.0, 0.08, 0.46), at(R(-0.04, 0.04), SC.water + 0.65, -1 + i * 0.52).multiply(new THREE.Matrix4().makeRotationY(R(-0.03, 0.03))), wood.clone().multiplyScalar(R(0.85, 1.1)));
      for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) hAdd(b, new THREE.CylinderGeometry(0.1, 0.11, 2.4, 6), at(s * 0.95, SC.water - 0.3, -1 + i * (L / 4)), dwood);
      hAdd(b, new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), at(0.95, SC.water + 1.3, L - 0.6), dwood); hAdd(b, new THREE.BoxGeometry(0.22, 0.3, 0.22), at(0.95, SC.water + 2.0, L - 0.6), LC('#ffb050'), 1);
      addDeco(hBuild(b), FOLK.mat, D, 'house');
      const bb = HB(), hull = new THREE.SphereGeometry(1, 14, 8, 0, 6.283, Math.PI / 2, Math.PI / 2); hAdd(bb, hull, MX(0, 0.45, 0, 0.75, 0.5, 2.1), LC(pick(['#a8442e', '#3a6a8a', '#e8e0cc', '#4a7a4a'])));
      hAdd(bb, new THREE.TorusGeometry(1, 0.05, 4, 20), MR(0, 0.45, 0, Math.PI / 2, 0, 0, 0.75, 2.1, 1), LC('#5a3a22')); for (const zz of [-0.6, 0.5]) hAdd(bb, new THREE.BoxGeometry(1.3, 0.06, 0.3), MX(0, 0.3, zz), LC('#8a6a48'));
      hAdd(bb, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), MR(0.25, 0.4, 0.2, 0.3, 0, 1.2), LC('#5a3a22'));
      const boat = addDeco(hBuild(bb), FOLK.mat, D, 'boat'); const bx = x + Math.sin(a) * 5 + Math.cos(a) * 2.1, bz = z + Math.cos(a) * 5 - Math.sin(a) * 2.1; boat.position.set(bx, SC.water - 0.2, bz); boat.rotation.y = a + R(-0.15, 0.15);
      BOATS.push({ m: boat, d: D, ph: rnd() * 6.28, y0: SC.water - 0.2, r0: boat.rotation.y }); return; }
  }
  function updateDeco(dt) {
    const spin = W.beatPer > 0.2 ? (Math.PI / 2) / (W.beatPer * 4) : 0.35;
    for (const M of MILLS) { M.a += spin * dt * (1 + W.kick * 0.2); M.m.rotation.z = M.a; }
    for (const B of BOATS) { B.m.position.y = B.y0 + Math.sin(W.t * 1.1 + B.ph) * 0.06 + W.kick * 0.03; B.m.rotation.x = Math.sin(W.t * 0.9 + B.ph) * 0.04; B.m.rotation.z = Math.sin(W.t * 0.7 + B.ph * 2) * 0.05; B.m.rotation.y = B.r0 + Math.sin(W.t * 0.2 + B.ph) * 0.08; }
  }

  // ---------------- butterflies by day, fireflies by night; hot-air balloons drifting overhead ----------------
  const FLUT = { mesh: null, n: 90, list: [], mat: null };
  function buildFlutter() {
    const P = [], S = [];
    for (const s of [-1, 1]) { const q = [[0, 0, -0.05], [s * 0.16, 0.02, -0.12], [s * 0.2, 0.0, 0.06], [0, 0, -0.05], [s * 0.2, 0.0, 0.06], [0, 0, 0.05], [0, 0, 0.0], [s * 0.12, -0.01, 0.1], [s * 0.05, 0, 0.14]];
      for (const v of q) { P.push(...v); S.push(s); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 1));
    FLUT.mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { time: U.time, night: { value: 0 }, sunCol: U.sunCol, fogCol: U.fogCol },
      vertexShader: `attribute float aSide; uniform float time, night; varying vec3 vC; varying float vW;
        void main(){ vec3 p = position; float sd = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71; float fl = sin(time * (night > 0.5 ? 9.0 : 15.0) + sd) * 1.05;
          float ax = abs(p.x); p.y += ax * sin(fl) * aSide * aSide; p.x = sign(p.x) * ax * cos(fl);
          vC = vec3(1.0); 
          #ifdef USE_INSTANCING_COLOR
            vC = instanceColor;
          #endif
          vW = ax; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float night; varying vec3 vC; varying float vW; void main(){ vec3 c = night > 0.5 ? vC * (1.0 - vW * 3.0) * 3.0 : vC * (0.55 + vW * 2.5); gl_FragColor = vec4(c, 1.0); }` });
    FLUT.mesh = new THREE.InstancedMesh(g, FLUT.mat, FLUT.n); FLUT.mesh.frustumCulled = false; FLUT.mesh.count = 0; scene.add(FLUT.mesh); FLUT.mesh.setColorAt(0, tc.setRGB(1, 1, 1));
    for (let i = 0; i < FLUT.n; i++) FLUT.list.push({ on: false, home: V(), p: V(), ph: rnd() * 6.28, col: C(1, 1, 1), up: 0, lastWave: -9 });
  }
  const BFLY = ['#ffb030', '#ff6a3a', '#ffe9a0', '#6ab0ff', '#f2f2ff', '#c070ff', '#ff70a8'];
  function updateFlutter(dt) {
    if (!FLUT.mesh) return; const night = curTod === 'night' || curTod === 'dusk'; FLUT.mat.uniforms.night.value = night ? 1 : 0;
    const cx = cam.position.x, cz = cam.position.z; cam.getWorldDirection(tv3); const fl = Math.hypot(tv3.x, tv3.z) || 1, ux = tv3.x / fl, uz = tv3.z / fl;
    const want = night ? FLUT.n : curTod === 'day' || curTod === 'golden' ? 46 : 20; let n = 0; const Wv = BL.U.bW.value[5], wR = (W.t - Wv.z) * BL.U.bSpeed.value;
    FLUT.list.forEach((B, i) => {
      if (i >= want) { B.on = false; return; }
      const dx = B.home.x - cx, dz = B.home.z - cz;
      if (!B.on || dx * dx + dz * dz > 55 * 55) { const dist = R(4, 45), lat = R(-28, 28), x = cx + ux * dist - uz * lat, z = cz + uz * dist + ux * lat, h = heightAt(x, z);
        if (h < SC.water + 0.3 || (!night && meadowAt(x, z) < 0.15 && rnd() < 0.8)) return; B.home.set(x, h, z); B.on = true; B.col.set(night ? (rnd() < 0.8 ? '#c8ff60' : '#ffd060') : pick(BFLY)); if (night) B.col.multiplyScalar(0.9); }
      const t = W.t * (night ? 0.35 : 0.6) + B.ph, ox = Math.sin(t * 1.3) * 2.2 + Math.sin(t * 2.9) * 0.6, oz = Math.cos(t * 1.1) * 2.2 + Math.sin(t * 3.3 + 1) * 0.6;
      const wd = Math.hypot(B.home.x - Wv.x, B.home.z - Wv.y); if (W.t - Wv.z < 8 && Math.abs(wd - wR) < 1.5 && B.lastWave !== Wv.z) { B.lastWave = Wv.z; B.up = 1; if (!night) B.col.copy(BL.U.bC.value[5]).lerp(C(1, 1, 1), 0.15); }
      B.up *= Math.exp(-dt * 0.9);
      const y = B.home.y + (night ? 1.2 + Math.sin(t * 0.7) * 0.8 : 0.6 + Math.abs(Math.sin(t * 2.1)) * 0.5) + B.up * 2.2;
      const nx = B.home.x + ox, nz = B.home.z + oz, vx = nx - B.p.x, vz = nz - B.p.z; B.p.set(nx, Math.max(y, heightAt(nx, nz) + 0.3), nz);
      te.set(0, Math.atan2(vx, vz), Math.sin(t * 4) * 0.2); tq.setFromEuler(te); tm.compose(B.p, tq, ts.setScalar(night ? 0.55 : 1.5)); FLUT.mesh.setMatrixAt(n, tm);
      const blink = night ? (W.beatPer > 0.2 ? 0.15 + 1.6 * RU.bEnv.value * (i % 2 === BT.n % 2 ? 1 : 0.35) : 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(W.t * 2.2 + B.ph * 5)), 6)) : 1; tc.copy(B.col).multiplyScalar(blink); FLUT.mesh.setColorAt(n, tc); n++; });
    FLUT.mesh.count = n; FLUT.mesh.instanceMatrix.needsUpdate = true; if (FLUT.mesh.instanceColor) FLUT.mesh.instanceColor.needsUpdate = true;
  }
  const BALL = { list: [] };
  function makeBalloon() {
    const g = new THREE.Group(), b = HB(), cols = [pick(['#c8503c', '#e0a838', '#4a78a8', '#5a9a52', '#c86a9a', '#7a5ab0']), pick(['#f2eadb', '#e8c060'])].map(LC);
    for (let k = 0; k < 12; k++) hAdd(b, new THREE.SphereGeometry(6, 3, 14, k / 12 * 6.283, 6.283 / 12 + 0.002, 0, 2.75), MX(0, 0, 0, 1, 1.22, 1), cols[k % 2]);
    hAdd(b, new THREE.CylinderGeometry(2.29, 1.3, 1.3, 12, 1, true), MX(0, -7.38, 0), cols[0]);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; hAdd(b, new THREE.CylinderGeometry(0.03, 0.03, 3.4, 4), MR(Math.cos(a) * 1.0, -8.7, Math.sin(a) * 1.0, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12), LC('#3a2e24')); }
    hAdd(b, new THREE.BoxGeometry(1.5, 1.1, 1.5), MX(0, -10.6, 0), LC('#8a6440')); hAdd(b, new THREE.BoxGeometry(1.6, 0.12, 1.6), MX(0, -10.05, 0), LC('#5a3e28'));
    hAdd(b, new THREE.SphereGeometry(0.35, 8, 6), MX(0, -8.2, 0), LC('#ffb050'), 1.5);
    const m = new THREE.Mesh(hBuild(b), FOLK.mat); m.castShadow = true; m.userData.kind = 'balloon'; g.add(m); FOLK.pick.push(m);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8).translate(0, 0.7, 0), new THREE.MeshBasicMaterial({ color: C(3, 1.5, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.y = -8.6; g.add(flame); g.visible = false; scene.add(g); return { g, flame, on: false, burn: 0, ph: rnd() * 6.28 };
  }
  function buildBalloons() { for (let i = 0; i < 3; i++) BALL.list.push(makeBalloon()); }
  function updateBalloons(dt) {
    const show = curTod !== 'night', cx = cam.position.x, cz = cam.position.z; cam.getWorldDirection(tv3); const fl = Math.hypot(tv3.x, tv3.z) || 1, ux = tv3.x / fl, uz = tv3.z / fl;
    for (const B of BALL.list) { const g = B.g;
      if (!show) { g.visible = false; B.on = false; continue; }
      const dx = g.position.x - cx, dz = g.position.z - cz;
      if (!B.on || dx * dx + dz * dz > 800 * 800 || (dx * ux + dz * uz) < -250) { const dist = R(180, 520), lat = R(-260, 260), x = cx + ux * dist - uz * lat, z = cz + uz * dist + ux * lat; g.position.set(x, groundAt(x, z) + R(55, 130), z); B.on = true; g.visible = true; g.scale.setScalar(R(0.9, 1.3)); }
      B.burn = Math.max(B.burn * Math.exp(-dt * 3), W.kick > 0.6 && rnd() < 0.3 ? 1 : 0);
      g.position.x += U.windDir.value.x * 2.2 * dt; g.position.z += U.windDir.value.y * 2.2 * dt; g.position.y += (Math.sin(W.t * 0.13 + B.ph) * 0.4 + B.burn * 0.8) * dt; g.position.y = Math.max(g.position.y, groundAt(g.position.x, g.position.z) + 40);
      g.rotation.y += dt * 0.03; B.flame.scale.set(1, 0.3 + B.burn * 1.4, 1); B.flame.visible = B.burn > 0.05; }
  }

  // ---------------- rhythm: one beat bus that the whole world dances to ----------------
  // Audio files: beats + drum hits come from the whole-song scan (exact). Jazz covers: from the arrangement.
  // Live audio: from the predicted beat grid and live kick detection.
  const RINGG = { value: 0.2 };
  const RU = { rings: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) }, kEnv: { value: 0 }, sEnv: { value: 0 }, hEnv: { value: 0 }, bEnv: { value: 0 }, bPar: { value: 0 } };
  const BT = { n: 0, t: -9, k: -9, s: -9, h: -9, ri: 0, down: false, lastFire: -9 };
  function onBeat(b) {
    if (W.t - BT.lastFire < 0.18) return; BT.lastFire = W.t; BT.n++; BT.t = W.t; BT.down = !!b.d; RU.bPar.value = BT.n % 2;
    const o = waveOrigin(), R4 = RU.rings.value[BT.ri]; BT.ri = (BT.ri + 1) % 4; R4.set(o.x, o.z, W.t, b.d ? 1.2 : 0.7);
    gustAt(V(o.x, 0, o.z), (W.calm ? 0.3 : 0.6) * (b.d ? 1.2 : 0.8));
    W.kick = Math.max(W.kick, b.d ? 0.9 : 0.55); crystalBeat(b);
    if (b.d && TOY.flowers && W.t - BL.lastWave > 6 && !NT.chords) { /* no chord changes for a while: the downbeat refreshes the meadow */ bloomWave(o.x, o.z, C(BLOOM_PAL[(BL.ambK = (BL.ambK + 7) % 12)]), 0.6); }
    if (AV.kind !== 'none' && b.d) { const p = AV.pos; for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; ORB.sparks.emit(p.x, p.y, p.z, Math.cos(a) * 3, R(-0.3, 0.6), Math.sin(a) * 3, 0.6, 0.035, tc.copy(BIRD_COL).multiplyScalar(1.1)); } }
  }
  function onHit(k, v = 0.8) {
    if (k === 'k') { BT.k = W.t; W.kick = Math.max(W.kick, 0.6 + v * 0.4); }
    else if (k === 's') { BT.s = W.t; if (FOLK.fire) FOLK.fire.flare = Math.max(FOLK.fire.flare, 0.5); const p = AV.pos; if (AV.kind !== 'none') for (let i = 0; i < 6; i++) ORB.sparks.emit(p.x + R(-4, 4), p.y + R(-1, 2), p.z + R(-4, 4), R(-0.5, 0.5), R(0.5, 1.5), R(-0.5, 0.5), 0.5, 0.035, tc.setRGB(1.3, 1.2, 1.1)); }
    else { BT.h = W.t; W.hit = Math.min(1.2, W.hit + 0.5 * v); }
  }
  const BIRD_COL = new THREE.Color(1.0, 0.62, 0.25);
  function updateRhythm(dt) {
    RU.kEnv.value = Math.exp(-(W.t - BT.k) * 7); RU.sEnv.value = Math.exp(-(W.t - BT.s) * 9); RU.hEnv.value = Math.exp(-(W.t - BT.h) * 14); RU.bEnv.value = Math.exp(-(W.t - BT.t) * 6) * (BT.down ? 1 : 0.65);
    grade.uniforms.pump.value = RU.kEnv.value * 0.05 + RU.bEnv.value * 0.035;
    // live audio: fire beats off the predicted grid (files and covers fire their own)
    if (mode === 'live' && !(NT.kind === 'file' && NT.beats)) {
      if (W.beatPer > 0.25) { if (BT.next == null || BT.next < W.t - W.beatPer) BT.next = W.nextBeat; if (W.t >= BT.next) { const bi = W.barDur ? Math.round(((W.barDur - (W.downIn || 0)) % W.barDur) / W.beatPer) % 4 : BT.n % 4; onBeat({ d: bi === 0 }); BT.next = W.nextBeat > W.t + W.beatPer * 0.5 ? W.nextBeat : W.t + W.beatPer; } }
      else BT.next = null;
    }
  }

  // ---------------- crystals: clusters on the hillsides and hanging under the sky islands; they chase the beat across the valley ----------------
  const CRYS = { items: [], clusters: [], mesh: null, cap: 700, t: 0, near: [], lv: new Float32Array(4096) };
  function buildCrystals() {
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.35, 1.6, 0.35); g.translate(0, 1.3, 0); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: C('#bfe4ff'), roughness: 0.18, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.92 });
    m.onBeforeCompile = sh => { sh.vertexShader = 'varying vec3 vCI;\n' + sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
        vCI = vec3(0.0);
        #ifdef USE_INSTANCING_COLOR
          vCI = instanceColor;
        #endif`);
      sh.fragmentShader = 'varying vec3 vCI;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = mix(vec3(0.62, 0.8, 1.0), vec3(0.85, 0.7, 1.0), vViewPosition.y * 0.0 + 0.3);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vCI;'); };
    m.customProgramCacheKey = () => 'crystal';
    CRYS.mesh = new THREE.InstancedMesh(g, m, CRYS.cap); CRYS.mesh.frustumCulled = false; CRYS.mesh.count = 0; CRYS.mesh.castShadow = true; CRYS.mesh.userData.kind = 'crystal'; CRYS.mesh.setColorAt(0, tc.setRGB(0, 0, 0)); scene.add(CRYS.mesh);
  }
  function addCrystalCluster(x, y, z, size, hang, D) {
    const ci = CRYS.clusters.length, n = 5 + Math.floor(rnd() * 6), cl = { x, y, z, d: D, i0: CRYS.items.length, n, hang };
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = rnd() * size * 0.6, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, py = hang ? y : heightAt(px, pz) - 0.3;
      CRYS.items.push({ x: px, y: py, z: pz, s: size * R(0.35, 1.0) * (i === 0 ? 1.4 : 1), tx: R(-0.45, 0.45), tz: R(-0.45, 0.45), yaw: rnd() * 6.28, hang, c: ci }); }
    CRYS.clusters.push(cl);
  }
  function crystalBeat(b) { if (!CRYS.near.length) return; const k = BT.n % CRYS.near.length, cl = CRYS.near[k]; cl.flash = b.d ? 1.6 : 1.0; if (b.d) for (const c of CRYS.near) c.flash = Math.max(c.flash || 0, 0.45); }
  function updateCrystals(dt) {
    if (!CRYS.mesh) return; const cx = cam.position.x, cz = cam.position.z, night = curTod === 'night' ? 1 : curTod === 'dusk' ? 0.8 : curTod === 'golden' || curTod === 'dawn' ? 0.45 : 0.25;
    CRYS.t -= dt; if (CRYS.t < 0) { CRYS.t = 0.5; const keep = W.d - 500; if (CRYS.clusters.some(c => c.d < keep)) { const items = []; CRYS.clusters = CRYS.clusters.filter(c => c.d >= keep).map(c => { const i0 = items.length; for (let i = c.i0; i < c.i0 + c.n; i++) items.push(CRYS.items[i]); c.i0 = i0; return c; }); CRYS.items = items; }
      cam.getWorldDirection(tv); CRYS.near = CRYS.clusters.filter(c => { const dx = c.x - cx, dz = c.z - cz; return dx * dx + dz * dz < 900 * 900; }).sort((a, b) => Math.atan2(a.x - cx, a.z - cz) - Math.atan2(b.x - cx, b.z - cz)); }
    let n = 0; const col = CIRC.chord;
    for (const c of CRYS.clusters) { c.flash = (c.flash || 0) * Math.exp(-dt * 3.5); const dx = c.x - cx, dz = c.z - cz; if (dx * dx + dz * dz > 1000 * 1000) continue;
      const glow = (0.08 + night * 0.35) * (1 + 0.15 * Math.sin(W.t * 1.3 + c.x)) + c.flash * (0.45 + night * 0.9);
      for (let i = c.i0; i < c.i0 + c.n && n < CRYS.cap; i++) { const it = CRYS.items[i]; te.set(it.hang ? Math.PI + it.tx : it.tx, it.yaw, it.tz); tq.setFromEuler(te); tm.compose(tv.set(it.x, it.y, it.z), tq, ts.setScalar(it.s)); CRYS.mesh.setMatrixAt(n, tm);
        tc.setRGB(0.45, 0.75, 1.0).lerp(col, 0.55).multiplyScalar(glow); CRYS.mesh.setColorAt(n, tc); n++; } }
    CRYS.mesh.count = n; CRYS.mesh.instanceMatrix.needsUpdate = true; if (CRYS.mesh.instanceColor) CRYS.mesh.instanceColor.needsUpdate = true;
  }

  // ---------------- time of day + scenes ----------------
  function applyTod(k) {
    curTod = k; TD = TOD[k]; const el = TD.el * Math.PI / 180, az = TD.az * Math.PI / 180;
    U.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    U.stars.value = TD.stars; U.moon.value = TD.moon; U.sunDisc.value = TD.disc; U.cover.value = TD.cover; U.aurora.value = k === 'night' ? 1 : 0;
    U.skyZen.value.setRGB(...TD.zen); U.skyHor.value.setRGB(...TD.hor); U.cloudLit.value.setRGB(...TD.cl); U.cloudDark.value.setRGB(...TD.cd);
    U.sunCol.value.set(TD.sun).multiplyScalar(TD.si); U.fogCol.value.set(TD.fog);
    if (scene) { scene.fog.color.set(TD.fog); scene.fog.density = TD.fogD * 0.75; if (atm) { atm.uniforms.density.value = TD.fogD * 0.55; atm.uniforms.mistAmt.value = { dawn: 0.45, day: 0.12, golden: 0.25, dusk: 0.35, night: 0.3 }[k]; atm.uniforms.csAmt.value = { dawn: 0.3, day: 0.55, golden: 0.45, dusk: 0.1, night: 0.0 }[k]; } sun.color.set(TD.sun); sun.intensity = TD.si * (k === 'night' ? 1.2 : 1); const fill = { dawn: ['#b4b4d8', '#4a4040'], day: ['#d8e2ee', '#625a40'], golden: ['#c4c0d8', '#5a5634'], dusk: ['#8a88cc', '#3a3044'], night: ['#6c84d0', '#1a1e2c'] }[k];
      hemi.intensity = TD.aI; hemi.color.set(fill[0]); hemi.groundColor.set(fill[1]); WU.shallowC.value.set(k === 'night' ? '#1c4a58' : k === 'dusk' ? '#3a6a72' : '#48b0a0'); WU.deepC.value.set(k === 'night' ? '#04121c' : '#0b3442'); WU.nightGlow.value = k === 'night' || k === 'dusk' ? 1 : 0; WIN.value = WIN.base = { day: 0, dawn: 0.5, golden: 0.9, dusk: 3.2, night: 4.5 }[k]; if (SMOKE.mat) SMOKE.mat.uniforms.col.value.set(k === 'night' ? '#3a4058' : k === 'dusk' ? '#7a7088' : '#b8b4b0');
      Rr.toneMappingExposure = TD.exp; scene.environmentIntensity = TD.env; GLOW.value = k === 'night' || k === 'dusk' ? 1 : 0;
      for (const m of IMP_MATS) m.color.setScalar(k === 'night' ? 0.3 : k === 'dusk' ? 0.5 : k === 'dawn' ? 0.75 : 0.85);
      if (motes) { const mu = motes.material.uniforms; mu.col.value.set(k === 'night' || k === 'dusk' ? '#d8ff9a' : '#fff4d8'); mu.blink.value = k === 'night' || k === 'dusk' ? 1 : 0; mu.size.value = k === 'night' ? 0.22 : 0.08; mu.amt.value = k === 'night' ? 1.6 : k === 'dusk' ? 1 : 0.3; }
      BL.U.bGlow.value = { day: 0.1, dawn: 0.3, golden: 0.3, dusk: 1.0, night: 1.5 }[k]; RINGG.value = { day: 0.4, dawn: 0.4, golden: 0.4, dusk: 0.4, night: 0.35 }[k];
      W.envT = 999; }
  }
  function updateEnv() {
    envSky.position.set(0, 0, 0); cubeCam.update(Rr, envScene);
    const next = pmrem.fromCubemap(cubeRT.texture); if (envRT) envRT.dispose(); envRT = next; scene.environment = envRT.texture;
  }
  function applyScene(k) {
    cur = k; SC = SCN[k]; if (atm) atm.uniforms.mistH.value = Math.max(SC.vfloor, SC.water) + 7;
    TU.gTint.value.set(SC.tint); GRASS_COL.set(SC.card || '#8fae48'); TU.dTint.value.set(SC.dryTint); TU.dryAmt.value = SC.dry; TU.snowLine.value = SC.snow; TU.waterLevel.value = SC.water;
    water.position.y = SC.water; resetContent();
    AV.inited = false; AV.camInit = false; moodTickCam(0.016); flight(0.016); followCam(0.016);
    updateTiles(cam.position.x, cam.position.z, null, true); updateGrass(cam.position.x, cam.position.z, null, true); updateBloom(0, true); updateHeightMap(true);
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
  // the glide drifts over to pass beside villages, stone circles, the great tree and the troll as they come up
  const latBase = d => Math.sin(d * 0.0043 + 0.7) * 16 + Math.sin(d * 0.0011 + 2.0) * 34 * GL.mood;
  const latAt = d => { const base = latBase(d); let wsum = 0, acc = 0;
    for (const l of landmarks) { const dd = l.d - d; if (dd < -200 || dd > 300) continue; const w = Math.exp(-(dd * dd) / (2 * 95 * 95)) * (l.pull ?? 0.85), lx = l.x - pathX(l.d), side = lx > base ? -1 : 1; acc += w * (lx + side * (l.pass ?? 20)); wsum += w; }
    return wsum > 0.001 ? mix(base, acc / wsum, Math.min(1, wsum)) : base; };
  const pathYaw = d => Math.atan2(pathX(d + 10) - pathX(d), 10);
  function moodTickCam(dt) {
    const t = W.t, drift = 0.42 + 0.3 * Math.sin(t * 0.019 + 1.3) + 0.16 * Math.sin(t * 0.0071 + 4.1);
    GL.mood += (clamp(drift + (W.levelSlow - 0.4) * 0.6, 0, 1) - GL.mood) * Math.min(1, dt * 0.06);
  }
  const obsAt = (x, z) => { let v = 0; for (const vl of villages) { const d = Math.hypot(x - vl.x, z - vl.z); if (d < vl.r + 15) v = Math.max(v, sstep(vl.r + 15, vl.r - 5, d)); } return groundAt(x, z) + v * 9; };
  function lineY(x, z, fx, fz) { let g = obsAt(x, z); for (const a of [8, 20, 36]) g = Math.max(g, obsAt(x + fx * a, z + fz * a) - a * 0.05); const m = GL.mood; return g + mix(3.0, 55, m * m * (3 - 2 * m)); }
  // ---------------- the phoenix: a glowing firebird with ribbon trails that flare on the beat ----------------
  const PHX = { trails: [], mat: null, span: 1 };
  function Trail(n, width, colA, colB, glow) {
    const pos = new Float32Array(n * 2 * 3), uvs = new Float32Array(n * 2 * 2), idx = [];
    for (let i = 0; i < n; i++) { uvs.set([i / (n - 1), 0, i / (n - 1), 1], i * 4); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { colA: { value: C(colA) }, colB: { value: C(colB) }, glow: { value: glow }, beat: RU.bEnv, time: U.time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 colA, colB; uniform float glow, beat, time; varying vec2 vUv;
        void main(){ float u = vUv.x, e = 1.0 - abs(vUv.y - 0.5) * 2.0; float a = pow(1.0 - u, 1.6) * smoothstep(0.0, 0.5, e) * smoothstep(0.0, 0.04, u);
          float sh = 0.75 + 0.25 * sin(u * 40.0 - time * 9.0); vec3 c = mix(colA, colB, u) * a * sh * glow * (1.0 + beat * 2.2); gl_FragColor = vec4(c, 1.0); }` });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; scene.add(mesh);
    const hist = []; for (let i = 0; i < n; i++) hist.push(V());
    return { mesh, mat, hist, n, width, inited: false, g0: glow,
      update(p, side, w) { if (!this.inited) { for (const h of hist) h.copy(p); this.inited = true; }
        if (p.distanceTo(hist[1]) > 0.3) { for (let i = n - 1; i > 0; i--) hist[i].copy(hist[i - 1]); } hist[0].copy(p);
        cam.getWorldDirection(tv); for (let i = 0; i < n; i++) { const a = hist[i], b = hist[Math.min(n - 1, i + 1)], d = tv2.subVectors(a, b); if (d.lengthSq() < 1e-6) d.copy(side);
          const s = tv3.crossVectors(d, tv).normalize().multiplyScalar(w * (1 - i / n * 0.7)); pos[i * 6] = a.x + s.x; pos[i * 6 + 1] = a.y + s.y; pos[i * 6 + 2] = a.z + s.z; pos[i * 6 + 3] = a.x - s.x; pos[i * 6 + 4] = a.y - s.y; pos[i * 6 + 5] = a.z - s.z; }
        g.attributes.position.needsUpdate = true; },
      reset() { this.inited = false; } };
  }
  function phoenixMaterial(src) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, color: C(1, 1, 1), flatShading: true, envMapIntensity: 0.4 });
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { bEnv: RU.bEnv, time: U.time, glowN: PHX.glowN });
      sh.vertexShader = 'varying vec3 vLP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLP = position;');
      sh.fragmentShader = 'varying vec3 vLP; uniform float bEnv, time, glowN;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `float sp = clamp(abs(vLP.x) / ${PHX.half.toFixed(3)}, 0.0, 1.0);
          vec3 fire = mix(vec3(0.32, 0.02, 0.03), vec3(0.75, 0.2, 0.02), smoothstep(0.1, 0.6, sp)); fire = mix(fire, vec3(0.95, 0.6, 0.1), smoothstep(0.65, 1.0, sp));
          diffuseColor.rgb = fire;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 vN = normalize(normal); float rim = pow(1.0 - abs(dot(vN, normalize(vViewPosition))), 2.5);
          float fl = 0.5 + 0.5 * sin(vLP.x * 0.4 + time * 6.0 + vLP.z * 0.3);
          totalEmissiveRadiance += diffuseColor.rgb * (0.25 + glowN * 1.2 + fl * 0.2 + bEnv * 2.0) + vec3(1.0, 0.55, 0.15) * rim * (0.2 + glowN * 0.5 + bEnv * 1.2);`);
    }; m.customProgramCacheKey = () => 'phoenix'; return m;
  }
  function buildAvatar() {
    const b = A.parrot.scene.clone(); b.rotation.order = 'YXZ'; const bb = new THREE.Box3().setFromObject(b), sz = bb.getSize(V()); PHX.half = Math.max(sz.x, sz.z) / 2; PHX.glowN = { value: 0 };
    b.scale.setScalar(2.6 / Math.max(sz.x, sz.z)); PHX.span = 1.3;
    b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = phoenixMaterial(o.material); o.frustumCulled = false; } });
    AV.mx = new THREE.AnimationMixer(b); AV.act = AV.mx.clipAction(A.parrot.animations[0]); AV.act.play(); AV.bird = b; scene.add(b);
    PHX.trails = [Trail(12, 0.14, '#ffd27a', '#ff3a20', 0.9), Trail(12, 0.14, '#ffd27a', '#ff3a20', 0.9), Trail(9, 0.1, '#fff2c0', '#ff8040', 0.8), Trail(9, 0.1, '#fff2c0', '#ff8040', 0.8), Trail(20, 0.08, '#fff0b0', '#ff6a30', 0.6)];
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: C(5, 4.2, 2.8), fog: false }));
    sp.add(new THREE.PointLight(0xffd9a0, 18, 24, 2)); AV.spirit = sp; scene.add(sp);
    AV.walker = makeHobbit(); AV.walker.root.scale.setScalar(1.35); AV.walker.body.userData.kind = 'me';
    setAvatar(AV.kind);
  }
  function setAvatar(k) { const was = AV.kind; AV.kind = k; if (AV.bird) { AV.bird.visible = k === 'bird'; for (const T of PHX.trails) { T.mesh.visible = k === 'bird'; T.reset(); } AV.spirit.visible = k === 'spirit'; AV.walker.root.visible = k === 'walk'; } if ((was === 'walk') !== (k === 'walk')) AV.inited = false; AV.camInit = false; }
  // on foot: a little adventurer that strolls the trail by itself, or goes wherever you steer
  function walkStep(dt) {
    const p = AV.pos, F = AV.walker;
    if (!AV.inited) { const d = W.d; p.set(trailX(d), 0, -d); p.y = heightAt(p.x, p.z); AV.yaw = Math.atan2(trailX(d + 5) - trailX(d), 5); AV.speed = 0; AV.inited = true; }
    let iy = 0, ip = 0; if (KEYS.a || KEYS.arrowleft) iy -= 1; if (KEYS.d || KEYS.arrowright) iy += 1; if (KEYS.w || KEYS.arrowup) ip += 1; if (KEYS.s || KEYS.arrowdown) ip -= 1;
    iy += AV.steer.yaw; ip += AV.steer.pitch; const run = KEYS.shift ? 1 : 0; if (iy || ip || run) AV.lastInput = W.t;
    const idle = W.t - AV.lastInput, ctlT = idle < 6 ? 1 : 0; AV.ctl += (ctlT - AV.ctl) * Math.min(1, dt * (ctlT ? 5 : 0.5));
    const dB = -p.z, tx = trailX(dB + 7) - p.x, tz = -(dB + 7) - p.z, aYaw = clamp(wrapA(Math.atan2(tx, -tz) - AV.yaw) * 1.4, -0.9, 0.9);
    AV.yaw = wrapA(AV.yaw + mix(aYaw, iy * 1.9, AV.ctl) * dt);
    const sT = AV.ctl > 0.5 ? ip * (run ? 5.5 : 2.3) : 1.6; AV.speed += (sT - AV.speed) * Math.min(1, dt * 4);
    const fx = Math.sin(AV.yaw), fz = -Math.cos(AV.yaw), nx = p.x + fx * AV.speed * dt, nz = p.z + fz * AV.speed * dt, nh = heightAt(nx, nz);
    const blocked = nh < SC.water - 0.7 || houses.some(q => (q.x - nx) * (q.x - nx) + (q.z - nz) * (q.z - nz) < q.r2 * 0.7) || slopeAt(nx, nz, nh) > 1.1;
    if (!blocked) { p.x = nx; p.z = nz; } else AV.speed *= 0.5; p.y = Math.max(heightAt(p.x, p.z), SC.water - 0.7);
    AV.f.set(fx, 0, fz); W.speed = Math.abs(AV.speed); W.d = Math.max(W.d, -p.z); AV.pitch = 0; AV.roll = 0;
    const o = F.root; o.position.copy(p); o.rotation.y = Math.atan2(fx, fz); F.lit = curTod === 'night' || curTod === 'dusk'; F.lantern.visible = F.lit;
    const still = Math.abs(AV.speed) < 0.15; F.stillT = still ? (F.stillT || 0) + dt : 0;
    F.mode = !still ? 'walk' : F.stillT > 2.5 && W.beatPer > 0.2 ? 'dance' : 'idle'; F.speed = Math.max(0.6, Math.abs(AV.speed) / (run ? 1.6 : 1.25)); poseHobbit(F, dt);
  }
  function flight(dt) {
    if (AV.kind === 'walk') return walkStep(dt);
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
    let g = obsAt(p.x, p.z); for (const a of [6, 14, 28]) g = Math.max(g, obsAt(p.x + fx * a, p.z + fz * a) - a * 0.06);
    const clr = p.y - g; if (clr < 4) pitchRate += (4 - clr) * 0.45; if (clr > 170) pitchRate -= 0.25;
    AV.yaw = wrapA(AV.yaw + yawRate * dt); AV.pitch = clamp(AV.pitch + pitchRate * dt, -0.5, 0.55);
    AV.roll += (clamp(-yawRate * 0.9, -0.55, 0.55) - AV.roll) * Math.min(1, dt * 2.5);
    AV.boost += (boost - AV.boost) * Math.min(1, dt * 2);
    const sT = 7.5 + 4.5 * W.levelSlow + AV.boost * 10 - Math.sin(AV.pitch) * 6; AV.speed += (sT - AV.speed) * Math.min(1, dt * 0.7);
    const cp = Math.cos(AV.pitch); AV.f.set(Math.sin(AV.yaw) * cp, Math.sin(AV.pitch), -Math.cos(AV.yaw) * cp);
    p.addScaledVector(AV.f, AV.speed * dt); p.y = Math.max(p.y, groundAt(p.x, p.z) + 1.4);
    W.speed = AV.speed * cp; W.d = -p.z;
    if (AV.bird && AV.kind === 'bird') { const b = AV.bird; b.position.copy(p); b.rotation.set(-AV.pitch, Math.atan2(AV.f.x, AV.f.z), -AV.roll);
      AV.mx.timeScale = clamp(0.55 + AV.pitch * 2.2 + AV.boost * 0.9 + (AV.speed < 8 ? 0.3 : 0), 0.15, 1.9); AV.mx.update(dt);
      PHX.glowN.value = curTod === 'night' ? 1 : curTod === 'dusk' ? 0.7 : curTod === 'golden' || curTod === 'dawn' ? 0.35 : 0.15;
      const f = AV.f, r = PHX.r || (PHX.r = V()), u = PHX.u || (PHX.u = V()); r.crossVectors(f, UP).normalize(); u.crossVectors(r, f).normalize();
      const ph = AV.act ? AV.act.time / AV.act.getClip().duration : 0, flap = Math.sin(ph * 6.283 + 1.2), wb = 1 + RU.bEnv.value * 0.9, sw = Math.sin(W.t * 3.1) * 0.12;
      const P_ = (a, b2, c) => tv.copy(p).addScaledVector(r, a).addScaledVector(u, b2).addScaledVector(f, c);
      PHX.trails[0].update(P_(0.14 + sw, 0.02, -0.8), r, 0.13 * wb); PHX.trails[1].update(P_(-0.14 + sw, 0.02, -0.8), r, 0.13 * wb);
      PHX.trails[2].update(P_(1.25, flap * 0.55, -0.15), r, 0.08 * wb); PHX.trails[3].update(P_(-1.25, flap * 0.55, -0.15), r, 0.08 * wb);
      PHX.trails[4].update(P_(0, 0.28, 0.45), r, 0.1 * wb); const tg = curTod === 'night' || curTod === 'dusk' ? 1 : 0.55; for (const T of PHX.trails) T.mat.uniforms.glow.value = T.g0 * tg;
      if (Math.random() < 0.5) { const q = P_(R(-0.3, 0.3), R(-0.1, 0.2), -0.6); ORB.sparks.emit(q.x, q.y, q.z, R(-0.3, 0.3), R(-0.4, 0.3), R(-0.3, 0.3), R(0.6, 1.4), R(0.025, 0.045), tc.setRGB(1.6, 0.8, 0.25)); } }
    if (AV.spirit && AV.kind === 'spirit') { AV.spirit.position.copy(p); AV.spirit.position.y += Math.sin(W.t * 1.7) * 0.15; if (Math.random() < 0.8) ORB.sparks.emit(p.x, p.y, p.z, R(-0.2, 0.2), R(-0.1, 0.2), R(-0.2, 0.2), R(0.8, 1.6), R(0.05, 0.1), tc.setRGB(2.4, 1.9, 1.2)); }
  }
  function followCam(dt) {
    const p = AV.pos, f = AV.f, m = GL.mood, t = W.t; let tgt = tv2, lk = tv3;
    if (AV.kind === 'none') { tgt.copy(p); lk.copy(p).addScaledVector(f, 35); lk.y -= 2; }
    else if (AV.kind === 'walk') { const autoAng = Math.sin(t * 0.03) * 0.6, ang = mix(autoAng, 0, AV.ctl) + AV.orbYaw, elev = clamp(0.28 + AV.orbPitch, -0.1, 1.2), dist = AV.camDist * 0.85, by = AV.yaw + Math.PI + ang;
      tgt.set(p.x + Math.sin(by) * Math.cos(elev) * dist, p.y + 1.3 + Math.sin(elev) * dist, p.z - Math.cos(by) * Math.cos(elev) * dist); lk.copy(p).addScaledVector(f, 3); lk.y += 1.3; }
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
    const fov = AV.kind === 'walk' ? 55 : mix(48, 56, m); GL.fov += (fov - GL.fov) * Math.min(1, dt * 0.3); if (Math.abs(cam.fov - GL.fov) > 0.01) { cam.fov = GL.fov; cam.updateProjectionMatrix(); }
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
    const objs = []; for (const t of tiles.values()) if (t.mesh.visible) objs.push(t.mesh); for (const o of DECO) objs.push(o.m); if (CRYS.mesh && CRYS.mesh.count) objs.push(CRYS.mesh); for (const m of FOLK.pick) { let v = true; for (let o = m; o; o = o.parent) if (!o.visible) { v = false; break; } if (v) objs.push(m); } if (water.visible) objs.push(water);
    for (const set of [trees, rocks, props]) for (const v of set.variants) for (const b of [v.near, v.far]) if (b) for (const mm of b.meshes) if (mm.count) objs.push(mm);
    const hits = ray.intersectObjects(objs, false); if (!hits.length) return;
    const h = hits[0], P = h.point.clone(); let kind = h.object.userData.kind || 'ground'; if (kind === 'ground' && P.y < SC.water + 0.05) kind = 'water';
    atBeat(() => react(kind, P)); return kind;
  }
  function react(kind, P) {
    const lv = 0.7 + W.level * 0.6, gap = W.beatPer > 0.2 ? W.beatPer / 2 : 0.28;
    if (kind === 'water') { for (let i = 0; i < 3; i++) FXQ.push({ t: W.t + i * gap, fn: () => ripple(P, 1 + i * 0.35) }); burst(V(P.x, SC.water + 0.1, P.z), 14, tc.setRGB(1.2, 1.3, 1.4), 2.2, 0.9, 0.9); }
    else if (kind === 'tree') { gustAt(P, 1.0 * lv); burst(P, 34, tc.setRGB(1.1, 1.25, 0.35), 0.4, 1.4, 2.6); if (rnd() < 0.65) flock(P); }
    else if (kind === 'folk') { for (const F of FOLK.hob) if (F.root.visible && F.root.position.distanceTo(P) < 12) F.jump = W.t + R(0, 0.25); burst(P, 16, tc.setRGB(1.6, 1.3, 0.6), 1.8, 0.8, 1.2); }
    else if (kind === 'fire') { FOLK.fire.flare = 1.5; for (const F of FOLK.hob) if (F.dancer) F.jump = W.t + R(0, 0.3); }
    else if (kind === 'troll') { FOLK.troll.wave = W.t; gustAt(P, 1.2); burst(P, 20, tc.setRGB(1.2, 1.1, 0.9), 1.0, 1.2, 1.6); }
    else if (kind === 'mill') { gustAt(P, 1.2); for (const M of MILLS) M.a += 1.2; burst(P, 20, tc.setRGB(1.5, 1.4, 1.1), 1.0, 1.5, 1.8); }
    else if (kind === 'boat') { for (let i = 0; i < 3; i++) FXQ.push({ t: W.t + i * 0.25, fn: () => ripple(P, 1 + i * 0.4) }); }
    else if (kind === 'balloon') { for (const B of BALL.list) B.burn = 1.5; burst(P, 24, tc.setRGB(2.2, 1.2, 0.4), 1.5, 1.2, 1.4); }
    else if (kind === 'crystal') { for (const c of CRYS.near) c.flash = 1.5; burst(P, 30, tc.setRGB(0.8, 1.4, 2.4), 2.0, 1.4, 1.8); }
    else if (kind === 'witch') { burst(P, 40, tc.setRGB(1.6, 0.8, 2.2), 2, 2, 2); }
    else if (kind === 'elf') { for (const E of FOLK.elves) E.lift = 1.4; burst(P, 24, tc.setRGB(1.0, 1.6, 2.2), 1.5, 0.8, 2.2); }
    else if (kind === 'rabbit') { burst(P, 10, tc.setRGB(1.4, 1.4, 1.2), 1.2, 0.6, 1.0); }
    else if (kind === 'house') { releaseLanterns(3, P.x, P.z, 3); WIN.pulse = 4; burst(P, 18, tc.setRGB(1.8, 1.1, 0.5), 1.6, 0.8, 1.6); }
    else if (kind === 'menhir') { const C0 = CIRC.near[0]; if (C0) { let k = 0, bd = 1e9; C0.stones.forEach((st, i) => { const d = Math.hypot(st.x - P.x, st.z - P.z); if (d < bd) { bd = d; k = i; } }); circleNote({ p: (k + 0.5) / 12, v: 1 }); } }
    else if (kind === 'ruin') { CLICK.pos.value.copy(P); CLICK.age.value = 0; burst(P, 26, tc.setRGB(0.6, 1.6, 2.0), 2.4, 1.0, 2.2); }
    else { gustAt(P, 0.85 * lv); if (TOY.flowers) bloomWave(P.x, P.z, C(BLOOM_PAL[Math.floor(Math.random() * 12)]), 1.1); burst(P, 22, tc.setRGB(1.6, 1.4, 0.8), 1.4, 1.2, 1.8); }
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
    if (seen < 3) { hintEl = document.createElement('div'); hintEl.textContent = 'Drag to look  ·  WASD or arrows to move, Shift to go faster  ·  Click the world';
      hintEl.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);font:500 13px/1.4 "Instrument Sans",system-ui,sans-serif;color:#f3e8d6;background:rgba(13,8,16,.55);border:1px solid rgba(241,228,207,.18);padding:9px 16px;border-radius:999px;pointer-events:none;transition:opacity 1.2s;z-index:5;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(hintEl); setTimeout(hideHint, 14000); }
  }
  function directorTick(dt, M) {
    CAM.t += dt;
    if (M.big && CAM.t > 2.5 && W.t - W.lastBig > 14) { W.lastBig = W.t; directorStart(true); return; }
    if (CAM.t > CAM.len && (M.downbeat || CAM.t > CAM.len + 5)) directorStart(false);
  }

  // ---------------- music toys: things in the world that play along with the notes ----------------
  // One note feed for everything. Audio files are scanned ahead (exact), jazz covers know their notes,
  // live audio only has a predicted beat grid. Each toy reads ahead so it can start moving before the note lands.
  const NT = { ev: [], unit: 1, now: 0, last: 0, clock: null, kind: 'none' };
  const TOY = { fish: true, stones: true, lanterns: true, flowers: true, circle: true, drums: true };
  const firstAt = (ev, t) => { let lo = 0, hi = ev.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].t < t) lo = m + 1; else hi = m; } return lo; };
  const toys = [];
  function ntSet(ev, unit, clock, kind) { NT.beats = ev && ev.beats && ev.beats.length ? ev.beats : null; NT.bi = 0; NT.chords = ev && ev.chords && ev.chords.length ? ev.chords : null; NT.ci = 0; NT.ev = ev || []; NT.unit = unit || 1; NT.clock = clock || null; NT.kind = ev ? kind : 'none'; NT.now = clock ? (clock() ?? 0) : NT.now; NT.last = NT.now; for (const t of toys) t.idx = firstAt(NT.ev, NT.now); clearStones(); }
  function clearStones() { if (!ORB.stones) return; ORB.land.forEach(L => { ORB.stones.setMatrixAt(L.k, ZERO); ORB.free.push(L.k); }); ORB.land = []; ORB.from = null; }
  function ntTick() {
    if (NT.clock) { const v = NT.clock(); if (v != null) NT.now = v; }
    if (NT.now < NT.last - 0.3 / NT.unit || NT.now > NT.last + 4 / NT.unit) { for (const t of toys) t.idx = firstAt(NT.ev, NT.now); clearStones(); }
    // scanned files know their chord changes: fire the bloom wave exactly on them
    if (NT.chords) { const C_ = NT.chords; if (NT.ci > 0 && C_[NT.ci - 1].t > NT.now + 0.05) NT.ci = firstAt(C_, NT.now); if (Math.abs(NT.now - NT.last) > 2) NT.ci = firstAt(C_, NT.now - 0.05);
      while (NT.ci < C_.length && C_[NT.ci].t <= NT.now) { const c = C_[NT.ci++]; if (NT.now - c.t < 0.5) onChord(c); } }
    if (NT.beats) { const B_ = NT.beats; if (Math.abs(NT.now - NT.last) > 2 || (NT.bi > 0 && B_[NT.bi - 1].t > NT.now + 0.05)) NT.bi = firstAt(B_, NT.now - 0.02);
      while (NT.bi < B_.length && B_[NT.bi].t <= NT.now) { const b = B_[NT.bi++]; if (NT.now - b.t < 0.25) onBeat(b); }
      const per = NT.bi > 0 && NT.bi < B_.length ? B_[NT.bi].t - B_[NT.bi - 1].t : 0.5; W.beatPer = per; W.nextBeat = W.t + (NT.bi < B_.length ? (B_[NT.bi].t - NT.now) / NT.unit : per); }
    NT.last = NT.now;
    if (NT.hold) return;
    for (const toy of toys) { if (!TOY[toy.key]) continue; const ev = NT.ev; if (toy.idx > ev.length) toy.idx = firstAt(ev, NT.now);
      while (toy.idx < ev.length && (ev[toy.idx].t - NT.now) * NT.unit < toy.look) { const e = ev[toy.idx++]; if (e.t >= NT.now - 0.01) toy.on(e, W.t + (e.t - NT.now) * NT.unit); } }
  }
  // pitch -> a warm curated ramp (amber low, coral, rose, lilac, sky high) instead of a full rainbow
  const HUE_STOPS = ['#ffa040', '#ff6e5a', '#ff70b0', '#b890ff', '#78c8ff'].map(h => new THREE.Color(h));
  const hueOf = p => { const t = clamp(p, 0, 1) * (HUE_STOPS.length - 1), i = Math.min(HUE_STOPS.length - 2, Math.floor(t)); return HUE_STOPS[i].clone().lerp(HUE_STOPS[i + 1], t - i); };

  // 1) note stones: the glowing orb hops stone to stone near your flight line, landing on each note
  toys.push({ key: 'stones', look: 3.2, idx: 0, on(e, wt) { W.orbOn = true; scheduleLanding(wt, e.p, e.v); } });

  // chime circle: each note lights the standing stone for its pitch
  toys.push({ key: 'circle', look: 0.02, idx: 0, on(e, wt) { FXQ.push({ t: wt, fn: () => circleNote(e) }); } });

  // drum hits (kick / snare / hat) from the scan drive the hits layer
  toys.push({ key: 'drums', look: 0.06, idx: 0, on(e, wt) { if (NT.kind === 'file' && e.k) FXQ.push({ t: wt, fn: () => onHit(e.k, e.v) }); } });

  // 2) leaping fish: they leave the water just before a note and splash back in on it
  const FISH = [], WATERSPOTS = []; let fishK = 0, fishLastT = -9, spotT = 0;
  function buildFish() {
    const g = new THREE.SphereGeometry(1, 16, 10); g.scale(0.11, 0.12, 0.42); const tail = new THREE.ConeGeometry(0.12, 0.26, 4); tail.rotateX(-Math.PI / 2); tail.scale(0.3, 1, 1); tail.translate(0, 0, -0.5);
    const parts = [g, tail].map(x => x.toNonIndexed()), pos = [], nrm = []; for (const x of parts) { pos.push(...x.attributes.position.array); nrm.push(...x.attributes.normal.array); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: C('#b8c4cc'), metalness: 0.7, roughness: 0.28, emissive: C(0, 0, 0) })); m.visible = false; m.castShadow = true; scene.add(m); FISH.push({ m, on: false, t0: 0, t1: 0, p0: V(), p1: V(), h: 1, splash0: false }); }
  }
  function refreshSpots() {
    WATERSPOTS.length = 0; if (!water || !water.visible) return; cam.getWorldDirection(tv); const fl = Math.hypot(tv.x, tv.z) || 1, ux = tv.x / fl, uz = tv.z / fl;
    for (let i = 0; i < 140 && WATERSPOTS.length < 16; i++) { const dist = R(12, 130), lat = R(-0.6, 0.6) * dist, x = cam.position.x + ux * dist - uz * lat, z = cam.position.z + uz * dist + ux * lat;
      if (heightAt(x, z) < SC.water - 0.25 && heightAt(x + 1.5, z) < SC.water && heightAt(x - 1.5, z) < SC.water && heightAt(x, z + 1.5) < SC.water) WATERSPOTS.push(V(x, SC.water, z)); }
  }
  toys.push({ key: 'fish', look: 1.0, idx: 0, on(e, wt) {
    if (!WATERSPOTS.length || wt - fishLastT < 0.3) return; fishLastT = wt;
    const F = FISH[fishK]; fishK = (fishK + 1) % FISH.length; const dur = clamp(wt - W.t, 0.45, 0.95), sp = pick(WATERSPOTS), a = rnd() * 6.283, len = R(1.4, 2.6) * (0.7 + e.p * 0.6);
    F.p0.set(sp.x + R(-1, 1), SC.water - 0.15, sp.z + R(-1, 1)); F.p1.set(F.p0.x + Math.cos(a) * len, SC.water - 0.15, F.p0.z + Math.sin(a) * len);
    F.t0 = wt - dur; F.t1 = wt; F.h = 1.0 + e.p * 2.2 + e.v * 0.6; F.on = true; F.splash0 = false; F.col = hueOf(e.p); F.s = R(1.5, 2.1); F.m.scale.setScalar(F.s);
  } });
  function updateFish() {
    spotT -= 1 / 60; if (spotT < 0) { spotT = 0.5; refreshSpots(); }
    const night = curTod === 'night' || curTod === 'dusk';
    for (const F of FISH) { if (!F.on) continue; const u = (W.t - F.t0) / (F.t1 - F.t0);
      if (u < 0) { F.m.visible = false; continue; }
      if (!F.splash0) { F.splash0 = true; ripple(F.p0, 0.45); burst(F.p0, 8, tc.setRGB(1.1, 1.2, 1.3), 1.4, 0.5, 0.6); }
      if (u >= 1) { F.on = false; F.m.visible = false; ripple(F.p1, 0.9); burst(V(F.p1.x, SC.water + 0.05, F.p1.z), 16, tc.copy(F.col).multiplyScalar(night ? 2.2 : 1.3), 2.6, 0.8, 0.8); continue; }
      const x = mix(F.p0.x, F.p1.x, u), z = mix(F.p0.z, F.p1.z, u), y = SC.water - 0.15 + 4 * F.h * u * (1 - u);
      const vy = 4 * F.h * (1 - 2 * u), vh = Math.hypot(F.p1.x - F.p0.x, F.p1.z - F.p0.z);
      F.m.position.set(x, y, z); F.m.rotation.set(0, 0, 0); F.m.rotation.order = 'YXZ'; F.m.rotation.y = Math.atan2(F.p1.x - F.p0.x, F.p1.z - F.p0.z); F.m.rotation.x = -Math.atan2(vy, vh) + Math.sin(W.t * 30) * 0.08; F.m.visible = true;
      F.m.material.emissive.copy(F.col).multiplyScalar(night ? 0.9 : 0.06); }
  }

  // 3) lantern wave: each note lights the next lantern along the trail; windows breathe with the bass
  const LAMPL = []; let lampSeq = [], lampI = 0, lampT = 0, lampK = 0;
  function buildLampLights() { for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 0, 18, 2); scene.add(l); LAMPL.push({ l, a: 0 }); } }
  function refreshLamps() { cam.getWorldDirection(tv); lampSeq = props.items.filter(it => it.v === LAMPV && (it.x - cam.position.x) * tv.x + (it.z - cam.position.z) * tv.z > -10 && Math.hypot(it.x - cam.position.x, it.z - cam.position.z) < 170).sort((a, b) => b.z - a.z); if (lampI >= lampSeq.length) lampI = 0; }
  toys.push({ key: 'lanterns', look: 0.05, idx: 0, on(e, wt) {
    FXQ.push({ t: wt, fn: () => { if (!lampSeq.length) return; const it = lampSeq[lampI % lampSeq.length]; lampI++; const L = LAMPL[lampK]; lampK = (lampK + 1) % LAMPL.length;
      L.l.position.set(it.x, it.y + 2.25, it.z + 0.5); L.a = 1; L.l.color.copy(hueOf(e.p)).lerp(C(1, 0.7, 0.4), 0.55);
      burst(V(it.x, it.y + 2.3, it.z + 0.5), 10, tc.copy(L.l.color).multiplyScalar(2), 1.2, 0.5, 1.1); } });
  } });
  function updateLamps(dt) {
    lampT -= dt; if (lampT < 0) { lampT = 1; refreshLamps(); }
    const night = curTod === 'night' || curTod === 'dusk' ? 1 : curTod === 'golden' ? 0.5 : 0.2;
    for (const L of LAMPL) { L.a *= Math.exp(-dt * 2.5); L.l.intensity = L.a * 60 * night; }
  }
  function updateToys(dt) { ntTick(); updateCircles(dt); updateSkyLanterns(dt); updateShrooms(dt); if (TOY.fish) updateFish(); updateLamps(dt); if (WIN.base == null) WIN.base = WIN.value; WIN.pulse = (WIN.pulse || 0) * Math.exp(-dt * 1.2); WIN.value = WIN.base * (1 + W.kick * 0.5) + WIN.pulse; }

  // ---------------- music hooks ----------------
  function onNote(pitch, vel = 0.8) { W.flare = Math.min(1.6, W.flare + 0.5 * vel); if (FOLK.witch && FOLK.witch.on) { const p = FOLK.witch.g.position; burst(p, 6, hueOf(pitch).multiplyScalar(2), 0.6, 0.8, 1.4); } }
  function onBass(v = 0.7) { const g = U.gust.value[W.gustI]; W.gustI = (W.gustI + 1) % 4; cam.getWorldDirection(tv); g.set(cam.position.x + tv.x * R(6, 30) + R(-10, 10), cam.position.z + tv.z * R(6, 30) + R(-10, 10), W.t, (W.calm ? 0.25 : 0.45) * v); }
  function onChord(c) { W.chords++; W.chordFlash = 1; CIRC.chord.copy(chordColor(c)); CIRC.chordA = 1; lanternsOnChord(false); for (const E of FOLK.elves) E.lift = 1; if (TOY.flowers && W.t - BL.lastWave > 0.6) { const p = waveOrigin(); bloomWave(p.x, p.z, chordColor(c), 1); } if (W.chords % 8 === 0) flock(); }
  function onBig() { if (rnd() < 0.6) flock(); lanternsOnChord(true); if (FOLK.fire) FOLK.fire.flare = 1; if (FOLK.troll) FOLK.troll.thump = W.t; if (TOY.flowers && W.t - BL.lastWave > 0.6) { const p = waveOrigin(); bloomWave(p.x, p.z, C(BLOOM_PAL[Math.floor(Math.random() * 12)]), 1.4); } }

  // ---------------- per frame ----------------
  function step(dt, M) {
    if (!Rr) return;
    if (W.freeze && !W.ffing) return;
    if (!ready) { W.t += dt; Rr.setClearColor(0x000000); Rr.clear(); return; }
    W.t += dt; W.calm = M.calm; U.time.value = W.t; perf(dt);
    if (wantTod === 'auto' && Math.floor(W.t) % 30 === 0 && Math.floor(W.t - dt) % 30 !== 0) { const k = clockTod(); if (k !== curTod) applyTod(k); }
    if (W.fadeDir > 0) { W.fade = Math.min(1, W.fade + dt / 0.6); if (W.fade >= 1) { if (W.pending) { applyScene(W.pending); W.pending = null; } W.fadeDir = -1; } }
    else if (W.fadeDir < 0) { W.fade = Math.max(0, W.fade - dt / 1.4); if (W.fade <= 0) W.fadeDir = 0; }
    grade.uniforms.fade.value = Math.max(W.fade, M.ending || 0);
    W.level += (M.level - W.level) * Math.min(1, dt * 0.6); W.levelSlow += (M.level - W.levelSlow) * Math.min(1, dt * 0.05);
    W.hit *= Math.exp(-dt * 5); W.kick *= Math.exp(-dt * 6); W.flare *= Math.exp(-dt * 3); W.chordFlash *= Math.exp(-dt * 1.2); W.swell *= Math.exp(-dt * 0.7);
    U.windAmp.value = (M.calm ? 0.12 : 0.18) + W.level * (M.calm ? 0.2 : 0.45); U.cloudSpeed.value = 0.01 + W.level * 0.015; if (curTod === 'night') U.aurora.value = 0.8 + RU.bEnv.value * 1.2;
    moodTickCam(dt); flight(dt); followCam(dt); updateToys(dt); updateOrb(dt); updateInteract(dt); updateCreatures(dt); updateFolk(dt); updateDeco(dt); updateFlutter(dt); updateBalloons(dt); updateRhythm(dt); updateCrystals(dt); updateSmoke(dt); if (SMOKE.mat) SMOKE.mat.uniforms.scale.value = (innerHeight * pr) / (2 * Math.tan(cam.fov * Math.PI / 360));
    updateTiles(cam.position.x, cam.position.z, 6); updateGrass(cam.position.x, cam.position.z, W.t < 0.3 ? null : 4); updateBloom(dt);
    pumpContent(false);
    if (frames % 3 === 0 || W.t < 0.3) { cam.updateMatrixWorld(); pmat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pmat); cullSet(trees, NEAR_TREE, 1700); cullSet(rocks, 600, 600); cullSet(props, 3000, 3000); if (frames % 30 === 0) gatherChimneys(); }
    W.ambBird -= dt; if (W.ambBird < 0) { W.ambBird = R(30, 60); flock(); }
    updateStreaks(dt); streakMesh.material.uniforms.col.value.setScalar(curTod === 'night' ? 0.25 : 0.9);
    // shadow box follows what the camera looks at, snapped to texels to avoid shimmer
    cam.getWorldDirection(tv); const fx = cam.position.x + tv.x * 45, fz = cam.position.z + tv.z * 45, step2 = 160 / 2048, sx = Math.round(fx / step2) * step2, sz = Math.round(fz / step2) * step2, fy = groundAt(sx, sz);
    sun.target.position.set(sx, fy, sz); sun.position.copy(U.sunDir.value).multiplyScalar(400).add(sun.target.position);
    if (TD.el < 2 && curTod !== 'night') sun.intensity = TD.si * 0.6;
    sky.position.copy(cam.position);
    water.position.set(cam.position.x, SC.water, cam.position.z); water.visible = SC.water > -100;
    updateHeightMap(false); WU.hmMin.value.set(HM.wx * HM.cell, HM.wz * HM.cell); WU.hmMax.value.set((HM.wx + HM.N - 1) * HM.cell, (HM.wz + HM.N - 1) * HM.cell);
    WU.wLevel.value = SC.water; WU.fogColor.value.copy(scene.fog.color); WU.fogDensity.value = scene.fog.density; WU.kick.value = W.kick;
    WU.ambC.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.55);
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
    ntSet(S.lead.map(e => ({ t: e.t, p: clamp((e.n - 58) / 28, 0, 1), v: e.v ?? 0.8 })), S.spj, null, 'midi');
    if (want === 'auto') setTheme('auto');
  }
  function frame(jb, dt, opts) {
    if (!Rr || !S || mode !== 'timeline') return;
    if (opts.spj) S.spj = opts.spj;
    if (jb < S.last - 0.5 || jb > S.last + 8) { S.pL = firstAfter(S.lead, jb - 0.01); S.pB = firstAfter(S.bass, jb - 0.01); S.pD = firstAfter(S.drums, jb - 0.01); S.pO = firstAfter(S.lead, jb + 0.05); ORB.land.forEach(L => { ORB.stones && ORB.stones.setMatrixAt(L.k, ZERO); ORB.free.push(L.k); }); ORB.land = []; ORB.from = null; }
    NT.now = jb; NT.unit = S.spj; NT.hold = opts.playing === false;
    while (S.pL < S.lead.length && S.lead[S.pL].t <= jb) { const e = S.lead[S.pL++]; if (jb - e.t < 1) onNote(clamp((e.n - 58) / 28, 0, 1), e.v ?? 0.8); }
    while (S.pB < S.bass.length && S.bass[S.pB].t <= jb) { const e = S.bass[S.pB++]; if (jb - e.t < 1) onBass(0.7); }
    let big = false;
    while (S.pD < S.drums.length && S.drums[S.pD].t <= jb) { const e = S.drums[S.pD++]; if (jb - e.t > 1) continue; if (e.n === 'ride' || e.n === 'tap') { W.hit = Math.min(1.2, W.hit + (e.v || 0.6) * 0.5); onHit(e.n === 'tap' ? 's' : 'h', e.v || 0.6); } else if (e.n === 'kick') { W.kick = Math.min(1, W.kick + (e.v || 0.6) * 0.8); onHit('k', e.v || 0.7); } else if (e.n === 'swell') { W.swell = 1; big = true; onBig(); } }
    if (Math.floor(jb) !== Math.floor(S.last) && jb > S.last && jb - S.last < 1) onBeat({ d: Math.floor(jb) % 4 === 0 });
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
    if ((f.kickHit || 0) > 0) { onBass(Math.min(1, f.kickHit)); if (!(NT.kind === 'file' && NT.beats)) onHit('k', Math.min(1, f.kickHit)); }
    const ck = f.chord ? f.chord.root + f.chord.q : null; if (ck !== LV.chordKey) { if (ck && !(NT.kind === 'file' && NT.chords)) onChord(f.chord); LV.chordKey = ck; }
    // live audio can't see ahead: unless a scanned file is playing, toys follow the predicted beat grid
    if (NT.kind === 'midi') ntSet(null);
    if (NT.kind !== 'file') {
      NT.unit = 1; NT.clock = null; NT.now = W.t; NT.hold = false;
      if (ready && f.active && (f.tempoConf || 0) > 0.4 && f.barDur > 0.6) { NT.kind = 'grid';
        const per = f.barDur / 4, nextIn = ((f.downbeatIn % per) + per) % per, busy = (MD.on / Math.max(1, MD.t)) > 3.5 && per > 0.45, stepT = busy ? per / 2 : per;
        for (let k = 0; k < 10; k++) { const t = W.t + nextIn + k * stepT; if (t - W.t > 3.2) break; const lastT = NT.ev.length ? NT.ev[NT.ev.length - 1].t : -1; if (t > lastT + stepT * 0.6) NT.ev.push({ t, p: clamp(f.pitch ?? 0.5, 0, 1), v: 0.7 }); }
        if (NT.ev.length > 400) { const cut = NT.ev.length - 200; NT.ev = NT.ev.slice(cut); for (const t of toys) t.idx = Math.max(0, t.idx - cut); }
      }
    }
    if (NT.kind === 'file' && NT.beats) {} else if (f.active && (f.tempoConf || 0) > 0.4 && f.barDur > 0.6) { const per = f.barDur / 4; W.barDur = f.barDur; W.downIn = f.downbeatIn; W.beatPer = per; W.nextBeat = W.t + (((f.downbeatIn % per) + per) % per); } else W.beatPer = 0;
    const downbeat = (f.tempoConf || 0) > 0.4 && f.downbeatIn != null && f.downbeatIn < dt * 1.5;
    step(dt, { calm: !!opts.calm, level: f.active ? (f.level || 0) : 0.35, downbeat, big });
  }

  return { init, load, frame, live, frameLive, setBaseHue() {}, setTheme, setTime,
    set orb(v) { TOY.stones = !!v; }, get orb() { return TOY.stones; },
    set toys(o) { Object.assign(TOY, o || {}); if (!TOY.stones) clearStones(); }, get toys() { return Object.assign({}, TOY); },
    setTrack(ev, unit, clock) { ntSet(ev, unit, clock, ev ? 'file' : 'none'); }, get noteFeed() { return NT.kind; },
    set avatar(v) { setAvatar(v); }, get avatar() { return AV.kind; },
    _fly(keys, secs) { for (const k of keys) KEYS[k] = true; W.noRender = true; W.ffing = true; W.freeze = true; for (let i = 0; i < secs * 30; i++) frameLive(1 / 30, { level: 0.5, active: false, onsets: [] }, {}); for (const k of keys) KEYS[k] = false; W.noRender = false; composer.render(); W.ffing = false; return { pos: AV.pos.toArray().map(Math.round), yaw: +AV.yaw.toFixed(2), ctl: +AV.ctl.toFixed(2) }; },
    _click(x, y) { return interact(x, y); },
    _view(px, py, pz, tx, ty, tz) { cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld(); pmat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pmat);
      cullSet(trees, NEAR_TREE, 1700); cullSet(rocks, 600, 600); cullSet(props, 3000, 3000); updateTiles(px, pz, null, true); updateGrass(px, pz, null, true); updateBloom(0); SHR.t = 0; updateShrooms(0); updateCircles(0); composer.render(); },
    _wave(root, q) { const p = waveOrigin(); bloomWave(p.x, p.z, chordColor({ root, q }), 1); return { n: BL.meshes.map(m => m.count), filled: BL.slotKey.filter(Boolean).length, pos: BL.pos.reduce((a, p) => a + (p ? p.length / 3 : 0), 0) }; },
    get themes() { return [{ key: 'auto', name: 'Auto' }].concat(SC_ORDER.map(k => ({ key: k, name: SCN[k].name }))); },
    get times() { return [{ key: 'auto', name: 'Auto' }].concat(TOD_ORDER.map(k => ({ key: k, name: TOD[k].name }))); },
    get theme() { return cur; }, get themeName() { return SCN[cur].name + ' · ' + TD.name; }, get want() { return want; },
    set letterbox(v) { W.letterbox = !!v; resize(); }, get mode() { return mode; }, get ok() { return !!Rr; }, get ready() { return ready; },
    _villages() { return villages.map(v => ({ x: v.x, z: v.z, d: v.d })); },
    _goto(x, y, z, yaw) { AV.pos.set(x, y, z); AV.yaw = yaw; AV.pitch = 0; W.d = -z; AV.camInit = false; AV.lastInput = W.t; pumpContent(true); updateTiles(x, z, null, true); updateGrass(x, z, null, true); },
    _toys() { return { kind: NT.kind, now: +NT.now.toFixed(2), fish: FISH.filter(f => f.on).length, stones: ORB.land.length, spots: WATERSPOTS.length, lamps: lampSeq.length }; },
    _dbg() { return { CRYS, BT, RU, FLUT, BALL, bloom, rays, grade, DECO, MILLS, BOATS, FOLK, CIRC, SKYL, SHR, circleNote, releaseLanterns, lanternSource, villages, composer, heightAt, BL, AV, GL, W, CAM, cam, U, ORB, trees, rocks, props, tiles, gchunks, HORSE, Rr, scene }; },
    _shot(k) { const m = { low: 0.02, mid: 0.45, high: 0.98 }[k]; if (m != null) { GL.mood = m; W.levelSlow = 0.4; glideReset(); } },
    _ff(n, dt, f) { W.noRender = true; W.ffing = true; W.freeze = true; for (let i = 0; i < n; i++) frameLive(dt, Object.assign({ level: 0.5, pitch: 0.5, active: true, tempoConf: 0.9, barDur: 2, downbeatIn: 2 - ((W.t % 2) + 2) % 2 }, f || {}, { onsets: i % 7 === 0 ? [Math.random()] : [], kickHit: i % 15 === 0 ? 1 : 0 }), {}); W.noRender = false; composer.render(); W.ffing = false; } };
})();
window.World = World;
export default World;
