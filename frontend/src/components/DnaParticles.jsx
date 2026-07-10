import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * DnaParticles — cinematic ember-particle DNA helix on a near-black stage.
 * Inspired by Nixtio's "Health Insights" shot: the helix is built from
 * thousands of glowing gold/amber particles that twinkle, two white-hot
 * energy surges race along the strands, warm nebula haze floats behind,
 * and bokeh dust drifts in the foreground. UnrealBloom fuses it into glow.
 * Slow rotation, gentle bob, pointer parallax. Pauses when tab hidden.
 */

// ── palette: weighted ember tones (sampled per particle) ──
const EMBERS = [
  { c: new THREE.Color(0xffb066), w: 0.32 }, // warm gold
  { c: new THREE.Color(0xff8a3d), w: 0.24 }, // orange
  { c: new THREE.Color(0xffd9a8), w: 0.16 }, // pale gold
  { c: new THREE.Color(0xe85d1f), w: 0.14 }, // deep orange
  { c: new THREE.Color(0xfff3e0), w: 0.07 }, // near-white hot
  { c: new THREE.Color(0x9c3a16), w: 0.07 }, // dark ember
];
function pickEmber() {
  let r = Math.random();
  for (const e of EMBERS) {
    if ((r -= e.w) <= 0) return e.c;
  }
  return EMBERS[0].c;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPulse1;
  uniform float uPulse2;
  uniform float uPulseGain;
  uniform float uScale;
  uniform float uAssemble;
  uniform float uShockR;
  uniform float uShockAmp;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aS;
  attribute vec3 aScatter;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float tw = 0.6 + 0.4 * sin(uTime * aSpeed + aPhase);
    float d1 = abs(aS - uPulse1); d1 = min(d1, 1.0 - d1);
    float d2 = abs(aS - uPulse2); d2 = min(d2, 1.0 - d2);
    float pulse = smoothstep(0.05, 0.0, d1) * 1.25 + smoothstep(0.075, 0.0, d2);
    pulse *= uPulseGain;

    vec3 p = position;
    // living ripple: a wave rolls along the helix axis, strands undulate
    vec2 radial = normalize(p.xz + vec2(1e-4));
    float ripple = sin(aS * 26.0 - uTime * 2.2);
    p.xz += radial * ripple * 0.11;
    // heartbeat shockwave: glowing shell expands from the core
    float dc = length(p);
    float band = (1.0 - smoothstep(0.0, 1.7, abs(dc - uShockR))) * uShockAmp;
    p += (p / max(dc, 1e-3)) * band * 1.1;
    // intro: particles fly in from a scattered cloud and assemble the helix
    p += aScatter * (1.0 - uAssemble);

    vColor = aColor * (1.0 + pulse * 1.3 + band * 1.6)
           + vec3(1.0, 0.86, 0.62) * (pulse * 0.45 + band * 0.5);
    vAlpha = tw * (0.42 + pulse * 0.35 + band * 0.35) * (0.15 + 0.85 * uAssemble);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = aSize * (1.0 + pulse * 0.9 + band * 0.9);
    gl_PointSize = size * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a;
    gl_FragColor = vec4(vColor, vAlpha * a);
  }
`;

export default function DnaParticles() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch {
      return undefined;
    }

    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070302);
    scene.fog = new THREE.FogExp2(0x070302, 0.02);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(0, 0, 19);

    // ── soft round glow sprite shared by every particle system ──
    const makeGlowTex = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0.0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.55)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const glowTex = makeGlowTex();

    const makeEmberMaterial = (pulseGain) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPulse1: { value: 0 },
          uPulse2: { value: 0.5 },
          uPulseGain: { value: pulseGain },
          uScale: { value: height * 0.5 },
          uAssemble: { value: 1 },
          uShockR: { value: 0 },
          uShockAmp: { value: 0 },
          uMap: { value: glowTex },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    // ── helix geometry: two particle strands + particle rungs ──
    const LENGTH = 26; // world units along axis
    const RADIUS = 2.7;
    const TWISTS = 3.4; // full turns over LENGTH
    const turn = (TWISTS * Math.PI * 2) / LENGTH;

    const helixPos = (s, phase, out) => {
      // s in [0,1] along the axis
      const y = s * LENGTH - LENGTH / 2;
      const a = s * LENGTH * turn + phase;
      out.set(Math.cos(a) * RADIUS, y, Math.sin(a) * RADIUS);
      return out;
    };

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();

    // random point on a sphere shell, scaled — intro fly-in start offsets
    const fillScatter = (arr, i, minR, spread) => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = minR + Math.random() * spread;
      arr[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      arr[i * 3 + 1] = Math.cos(phi) * r;
      arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    };

    const buildStrand = (phase, count) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const size = new Float32Array(count);
      const ph = new Float32Array(count);
      const sp = new Float32Array(count);
      const ss = new Float32Array(count);
      const sc = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        fillScatter(sc, i, 4, 9);
        const s = Math.random();
        helixPos(s, phase, tmpA);
        // most particles hug the strand tube; some scatter out like drifting embers
        const scatter = Math.random() < 0.16 ? 0.28 + Math.random() * 0.75 : 0.05 + Math.random() * 0.17;
        pos[i * 3] = tmpA.x + (Math.random() - 0.5) * 2 * scatter;
        pos[i * 3 + 1] = tmpA.y + (Math.random() - 0.5) * 2 * scatter;
        pos[i * 3 + 2] = tmpA.z + (Math.random() - 0.5) * 2 * scatter;
        const c = pickEmber();
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        size[i] = scatter > 0.28 ? 0.09 + Math.random() * 0.14 : 0.14 + Math.random() * 0.32;
        ph[i] = Math.random() * Math.PI * 2;
        sp[i] = 0.6 + Math.random() * 2.6;
        ss[i] = s;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
      geo.setAttribute("aSpeed", new THREE.BufferAttribute(sp, 1));
      geo.setAttribute("aS", new THREE.BufferAttribute(ss, 1));
      geo.setAttribute("aScatter", new THREE.BufferAttribute(sc, 3));
      return geo;
    };

    const buildRungs = (rungCount, perRung) => {
      const count = rungCount * perRung;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const size = new Float32Array(count);
      const ph = new Float32Array(count);
      const sp = new Float32Array(count);
      const ss = new Float32Array(count);
      const sc = new Float32Array(count * 3);
      let k = 0;
      for (let r = 0; r < rungCount; r++) {
        const s = (r + 0.5) / rungCount;
        helixPos(s, 0, tmpA);
        helixPos(s, Math.PI, tmpB);
        for (let j = 0; j < perRung; j++) {
          const t = (j + 0.5) / perRung;
          fillScatter(sc, k, 4, 9);
          pos[k * 3] = tmpA.x + (tmpB.x - tmpA.x) * t + (Math.random() - 0.5) * 0.14;
          pos[k * 3 + 1] = tmpA.y + (tmpB.y - tmpA.y) * t + (Math.random() - 0.5) * 0.14;
          pos[k * 3 + 2] = tmpA.z + (tmpB.z - tmpA.z) * t + (Math.random() - 0.5) * 0.14;
          const c = pickEmber();
          col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
          size[k] = 0.12 + Math.random() * 0.2;
          ph[k] = Math.random() * Math.PI * 2;
          sp[k] = 0.6 + Math.random() * 2.2;
          ss[k] = s;
          k++;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
      geo.setAttribute("aSpeed", new THREE.BufferAttribute(sp, 1));
      geo.setAttribute("aS", new THREE.BufferAttribute(ss, 1));
      geo.setAttribute("aScatter", new THREE.BufferAttribute(sc, 3));
      return geo;
    };

    // ── ambient bokeh dust in a big loose shell around the helix ──
    const buildDust = (count) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const size = new Float32Array(count);
      const ph = new Float32Array(count);
      const sp = new Float32Array(count);
      const ss = new Float32Array(count);
      const sc = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        fillScatter(sc, i, 2, 7);
        pos[i * 3] = (Math.random() - 0.5) * 34;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
        const c = pickEmber();
        const big = Math.random() < 0.05;
        // big soft bokeh blobs stay very dim or they nuke the frame under bloom
        const dim = big ? 0.07 + Math.random() * 0.08 : 0.28 + Math.random() * 0.4;
        col[i * 3] = c.r * dim; col[i * 3 + 1] = c.g * dim; col[i * 3 + 2] = c.b * dim;
        size[i] = big ? 0.5 + Math.random() * 0.55 : 0.06 + Math.random() * 0.2;
        ph[i] = Math.random() * Math.PI * 2;
        sp[i] = 0.25 + Math.random() * 0.9;
        ss[i] = 0.0;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
      geo.setAttribute("aSpeed", new THREE.BufferAttribute(sp, 1));
      geo.setAttribute("aS", new THREE.BufferAttribute(ss, 1));
      geo.setAttribute("aScatter", new THREE.BufferAttribute(sc, 3));
      return geo;
    };

    const emberMat = makeEmberMaterial(1.0);
    const dustMat = makeEmberMaterial(0.0);

    const strandGeoA = buildStrand(0, 2400);
    const strandGeoB = buildStrand(Math.PI, 2400);
    const rungGeo = buildRungs(30, 18);
    const dustGeo = buildDust(420);

    const helix = new THREE.Group();
    helix.add(new THREE.Points(strandGeoA, emberMat));
    helix.add(new THREE.Points(strandGeoB, emberMat));
    helix.add(new THREE.Points(rungGeo, emberMat));
    helix.rotation.z = -0.48; // diagonal flow, like the reference
    helix.rotation.x = 0.1;
    helix.position.x = 0.6;
    scene.add(helix);

    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ── warm nebula haze: big additive glow sprites behind everything ──
    const hazeMat1 = new THREE.SpriteMaterial({
      map: glowTex, color: 0xb3491a, transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const hazeMat2 = new THREE.SpriteMaterial({
      map: glowTex, color: 0x7a2a10, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const hazeMat3 = new THREE.SpriteMaterial({
      map: glowTex, color: 0xcc6a22, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const haze1 = new THREE.Sprite(hazeMat1);
    haze1.position.set(-11, 7, -10);
    haze1.scale.set(30, 24, 1);
    const haze2 = new THREE.Sprite(hazeMat2);
    haze2.position.set(12, -6, -12);
    haze2.scale.set(34, 26, 1);
    const haze3 = new THREE.Sprite(hazeMat3);
    haze3.position.set(3, 10, -14);
    haze3.scale.set(26, 20, 1);
    scene.add(haze1, haze2, haze3);

    // ── post-processing: bloom is what turns particles into embers ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.5, 0.35);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const disposables = [
      strandGeoA, strandGeoB, rungGeo, dustGeo,
      emberMat, dustMat, hazeMat1, hazeMat2, hazeMat3, glowTex,
    ];

    // Pointer parallax
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointerMove = (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove);

    const resize = () => {
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      emberMat.uniforms.uScale.value = height * 0.5;
      dustMat.uniforms.uScale.value = height * 0.5;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let frameId = 0;
    let running = true;

    // debug/testing: ?bgt=9 starts the animation clock at t=9s
    const timeOffset = parseFloat(new URLSearchParams(window.location.search).get("bgt")) || 0;
    // accumulated time survives tab-switch pauses — the intro must never replay
    let tAccum = timeOffset;

    const renderFrame = () => {
      tAccum += Math.min(clock.getDelta(), 0.05);
      const t = tAccum;

      // intro: scattered cloud vortex-spirals into the helix
      const aT = Math.min(t / 2.4, 1);
      const assemble = reduceMotion ? 1 : 1 - Math.pow(1 - aT, 3);

      // spin-up settles into a steady, clearly visible rotation + axis sway
      helix.rotation.y = t * 0.55 + (1 - assemble) * 4.2;
      helix.rotation.x = 0.1 + Math.sin(t * 0.21) * 0.07;
      helix.rotation.z = -0.48 + Math.sin(t * 0.17) * 0.06;
      helix.position.y = Math.sin(t * 0.3) * 0.35;
      dust.rotation.y = t * 0.02;

      // heartbeat shockwave every 5.5s once assembled
      let shockR = 0;
      let shockAmp = 0;
      if (!reduceMotion && aT >= 1) {
        const local = (t - 2.4) % 5.5;
        shockR = local * 8.5;
        shockAmp = Math.exp(-local * 1.5) * Math.min(local / 0.1, 1) * 0.85;
      }

      // energy surges race along the strands; flicker keeps them alive
      const p1 = (t * 0.095) % 1;
      const p2 = (t * 0.062 + 0.45) % 1;
      const gain = 1.0 + 0.35 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
      emberMat.uniforms.uTime.value = t;
      emberMat.uniforms.uPulse1.value = p1;
      emberMat.uniforms.uPulse2.value = p2;
      emberMat.uniforms.uPulseGain.value = gain;
      emberMat.uniforms.uAssemble.value = assemble;
      emberMat.uniforms.uShockR.value = shockR;
      emberMat.uniforms.uShockAmp.value = shockAmp;
      dustMat.uniforms.uTime.value = t;
      dustMat.uniforms.uAssemble.value = assemble;

      pointer.x += (target.x - pointer.x) * 0.04;
      pointer.y += (target.y - pointer.y) * 0.04;
      camera.position.x = pointer.x * 1.3;
      camera.position.y = -pointer.y * 0.9;
      camera.position.z = 19 + Math.sin(t * 0.12) * 1.3; // slow breathing dolly
      camera.lookAt(0, 0, 0);

      composer.render();
    };

    const animate = () => {
      if (!running) return;
      frameId = requestAnimationFrame(animate);
      renderFrame();
    };

    clock.getDelta();
    if (reduceMotion) {
      renderFrame();
    } else {
      animate();
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frameId);
      } else if (!reduceMotion && !running) {
        running = true;
        clock.getDelta(); // swallow the hidden-time gap; tAccum keeps its place
        animate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="three-bg" aria-hidden="true" />;
}
