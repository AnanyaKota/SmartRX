import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * BrainBackground — the "medical brain", ember edition.
 *
 * A brain-shaped neural network rendered in the app's ember palette:
 *  · glowing gold/orange neuron nodes wired by synapse lines with pulses
 *  · a translucent fresnel "cortex" hull so the brain reads as a solid form
 *  · UnrealBloom fuses everything into warm light
 *  · interactive: pointer tilt/parallax, scroll dolly, click → neural burst
 *    (a firing storm + shockwave ring from a random cortex node)
 *
 * Procedural (no model download). Anchored right on wide screens, centred on
 * narrow. Failure-safe: any WebGL error just hides the layer.
 */

const R = 4.2; // brain radius (world units)

/* ── compact 3D simplex noise — organic cortex wrinkle ── */
const _grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const _perm = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
})();
function simplex3(x, y, z) {
  const F3 = 1 / 3, G3 = 1 / 6;
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  const dot = (g, a, b, c) => g[0] * a + g[1] * b + g[2] * c;
  let n = 0;
  const corner = (xx, yy, zz, gi) => {
    let tt = 0.6 - xx * xx - yy * yy - zz * zz;
    if (tt < 0) return 0;
    tt *= tt;
    return tt * tt * dot(_grad3[gi % 12], xx, yy, zz);
  };
  n += corner(x0, y0, z0, _perm[ii + _perm[jj + _perm[kk]]]);
  n += corner(x1, y1, z1, _perm[ii + i1 + _perm[jj + j1 + _perm[kk + k1]]]);
  n += corner(x2, y2, z2, _perm[ii + i2 + _perm[jj + j2 + _perm[kk + k2]]]);
  n += corner(x3, y3, z3, _perm[ii + 1 + _perm[jj + 1 + _perm[kk + 1]]]);
  return 32 * n;
}

/* cortex displacement shared by the node cloud and the fresnel hull */
function cortexDisp(d) {
  let amp = 0.5, freq = 2.4, sum = 0, norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += amp * (1 - Math.abs(simplex3(d.x * freq, d.y * freq, d.z * freq)));
    norm += amp; amp *= 0.5; freq *= 2.05;
  }
  let disp = (sum / norm - 0.5) * 0.22;
  // central longitudinal fissure along the top
  disp -= Math.exp(-(d.x * d.x) / 0.02) * Math.max(0, d.y) * 0.22;
  return disp;
}

export default function BrainBackground() {
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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070302); // page stage colour
    scene.fog = new THREE.FogExp2(0x070302, 0.014);

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(0, 0, 15);

    const group = new THREE.Group();
    group.rotation.x = 0.1;
    scene.add(group);

    const disposables = [];

    /* ── ember palette ── */
    const GOLD = new THREE.Color(0xffb066);
    const EMBER = new THREE.Color(0xe85d1f);
    const PALE = new THREE.Color(0xffd9a8);
    const WHITEHOT = new THREE.Color(0xfff3e0);

    /* ── 1. neuron nodes in a brain-ish shape ── */
    const COUNT = width < 760 ? 170 : 260;
    const nodes = [];
    const nColor = new Float32Array(COUNT * 3);
    const ga = 2.399963229728653;
    const d = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * ga;
      d.set(Math.cos(theta) * rad, y, Math.sin(theta) * rad).normalize();
      const disp = cortexDisp(d);
      const shell = 0.86 + Math.random() * 0.14;
      const s = R * (1 + disp) * shell;
      nodes.push(new THREE.Vector3(d.x * 1.22 * s, d.y * 0.92 * s, d.z * 1.02 * s));

      // hemisphere tint: pale gold core, gold left, ember right
      const c = PALE.clone().lerp(d.x < 0 ? GOLD : EMBER, Math.abs(d.x) * 0.62 + 0.12);
      nColor[i * 3] = c.r; nColor[i * 3 + 1] = c.g; nColor[i * 3 + 2] = c.b;
    }

    /* ── 2. synapse wiring (k-nearest, deduped) ── */
    const K = 3;
    const edgeSet = new Set();
    const edges = [];
    const adjacency = Array.from({ length: COUNT }, () => []);
    for (let i = 0; i < COUNT; i++) {
      const near = [];
      for (let j = 0; j < COUNT; j++) {
        if (j === i) continue;
        near.push([nodes[i].distanceToSquared(nodes[j]), j]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < K; k++) {
        const j = near[k][1];
        const key = i < j ? i * COUNT + j : j * COUNT + i;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        adjacency[i].push(edges.length);
        adjacency[j].push(edges.length);
        edges.push([i, j]);
      }
    }

    /* ── 3. synapse lines: gold→ember gradient + travelling pulses ── */
    const EC = edges.length;
    const lPos = new Float32Array(EC * 2 * 3);
    const lCol = new Float32Array(EC * 2 * 3);
    const lT = new Float32Array(EC * 2);
    const lSeed = new Float32Array(EC * 2);
    for (let e = 0; e < EC; e++) {
      const [a, b] = edges[e];
      const pa = nodes[a], pb = nodes[b];
      const len = pa.distanceTo(pb);
      const seed = Math.random();
      lPos.set([pa.x, pa.y, pa.z], e * 6);
      lPos.set([pb.x, pb.y, pb.z], e * 6 + 3);
      lCol.set([GOLD.r, GOLD.g, GOLD.b], e * 6);
      lCol.set([EMBER.r, EMBER.g, EMBER.b], e * 6 + 3);
      lT[e * 2] = 0; lT[e * 2 + 1] = len;
      lSeed[e * 2] = seed; lSeed[e * 2 + 1] = seed;
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3));
    lineGeo.setAttribute("color", new THREE.BufferAttribute(lCol, 3));
    lineGeo.setAttribute("aT", new THREE.BufferAttribute(lT, 1));
    lineGeo.setAttribute("aSeed", new THREE.BufferAttribute(lSeed, 1));
    disposables.push(lineGeo);

    const lineMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uExcite: { value: 0 } },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aT;
        attribute float aSeed;
        varying vec3 vColor;
        varying float vT;
        varying float vSeed;
        void main() {
          vColor = color;
          vT = aT;
          vSeed = aSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uExcite;
        varying vec3 vColor;
        varying float vT;
        varying float vSeed;
        void main() {
          float phase = vT * 2.4 - uTime * 1.6 + vSeed * 6.2831853;
          float pulse = pow(0.5 + 0.5 * sin(phase), 8.0);
          pulse = min(pulse * (1.0 + uExcite * 1.6), 2.0);
          vec3 col = vColor * (0.30 + 0.95 * pulse) + vec3(1.0, 0.85, 0.6) * pulse * uExcite * 0.35;
          float a = 0.14 + 0.68 * pulse;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    disposables.push(lineMat);
    group.add(new THREE.LineSegments(lineGeo, lineMat));

    /* ── 4. fresnel cortex hull — the brain reads as a solid glowing form ── */
    const hullGeo = new THREE.SphereGeometry(1, 110, 110);
    {
      const pos = hullGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize();
        const disp = cortexDisp(v);
        const s = R * (1 + disp) * 1.015;
        pos.setXYZ(i, v.x * 1.22 * s, v.y * 0.92 * s, v.z * 1.02 * s);
      }
      hullGeo.computeVertexNormals();
    }
    disposables.push(hullGeo);
    const hullMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xff8a3d) },
        uBoost: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uBoost;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.8);
          float breathe = 0.85 + 0.15 * sin(uTime * 0.7);
          float k = f * (0.55 + uBoost * 0.9) * breathe;
          gl_FragColor = vec4(uColor * k * 1.4, k * 0.5);
        }
      `,
    });
    disposables.push(hullMat);
    group.add(new THREE.Mesh(hullGeo, hullMat));

    /* ── 5. glowing neuron nodes ── */
    const makeGlow = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0.0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.65)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const sprite = makeGlow();
    disposables.push(sprite);

    const nPos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      nPos[i * 3] = nodes[i].x; nPos[i * 3 + 1] = nodes[i].y; nPos[i * 3 + 2] = nodes[i].z;
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3));
    nodeGeo.setAttribute("color", new THREE.BufferAttribute(nColor, 3));
    disposables.push(nodeGeo);
    const nodeMat = new THREE.PointsMaterial({
      size: 0.34, map: sprite, vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    });
    disposables.push(nodeMat);
    group.add(new THREE.Points(nodeGeo, nodeMat));

    /* ── 6. signal pulses firing across the network ── */
    const SIG = width < 760 ? 16 : 26;
    const BURST_SIG = 14; // extra pool reserved for click bursts
    const TOTAL_SIG = SIG + BURST_SIG;
    const signals = [];
    const sPos = new Float32Array(TOTAL_SIG * 3);
    const sCol = new Float32Array(TOTAL_SIG * 3);
    const pickEdge = () => (Math.random() * EC) | 0;
    for (let i = 0; i < TOTAL_SIG; i++) {
      const burstPool = i >= SIG;
      signals.push({
        e: pickEdge(),
        p: Math.random(),
        speed: 0.5 + Math.random() * 0.8,
        burstPool,
        active: !burstPool,
      });
      const c = burstPool ? WHITEHOT : (i % 2 ? GOLD : EMBER);
      sCol[i * 3] = c.r; sCol[i * 3 + 1] = c.g; sCol[i * 3 + 2] = c.b;
    }
    const sigGeo = new THREE.BufferGeometry();
    sigGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    sigGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
    disposables.push(sigGeo);
    const sigMat = new THREE.PointsMaterial({
      size: 0.62, map: sprite, vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true, opacity: 1.0, blending: THREE.AdditiveBlending,
    });
    disposables.push(sigMat);
    group.add(new THREE.Points(sigGeo, sigMat));

    /* ── 7. burst shockwave ring ── */
    const ringMat = new THREE.SpriteMaterial({
      map: sprite, color: 0xffd9a8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    disposables.push(ringMat);
    const ring = new THREE.Sprite(ringMat);
    ring.scale.setScalar(0.1);
    group.add(ring);

    /* ── 8. warm haze sprites behind the brain ── */
    const hazeMat = new THREE.SpriteMaterial({
      map: sprite, color: 0xb3491a, transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    disposables.push(hazeMat);
    const haze = new THREE.Sprite(hazeMat);
    haze.position.set(0, 0, -6);
    haze.scale.set(26, 20, 1);
    group.add(haze);

    /* ── post-processing: bloom makes it ember ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.75, 0.55, 0.22);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    /* ── responsive framing ── */
    const layout = () => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const visH = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * camera.position.z;
      const visW = visH * camera.aspect;
      const wide = camera.aspect > 1.1;
      group.position.x = wide ? 0.24 * visW : 0;
      group.position.y = wide ? 0.04 * visH : 0;
      group.userData.s0 = wide ? 1 : 0.82;
    };
    layout();

    /* ── interactivity ── */
    const pointer = { x: 0, y: 0 };
    const targetP = { x: 0, y: 0 };
    const onPointerMove = (e) => {
      targetP.x = (e.clientX / window.innerWidth - 0.5) * 2;
      targetP.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove);

    // scroll dolly: brain recedes + turns as the page scrolls
    let scrollT = 0;
    const onScroll = () => {
      scrollT = Math.min(window.scrollY / 900, 1.6);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // click → neural burst from a random cortex node
    const burst = { t: -10, node: 0 };
    const onPointerDown = () => {
      burst.t = 0;
      burst.node = (Math.random() * COUNT) | 0;
      // launch the reserved white-hot signals from edges around the node
      let launched = 0;
      const startEdges = adjacency[burst.node];
      for (const sg of signals) {
        if (!sg.burstPool) continue;
        sg.active = true;
        sg.p = 0;
        sg.speed = 1.6 + Math.random() * 1.4;
        sg.e = startEdges.length
          ? startEdges[launched % startEdges.length]
          : pickEdge();
        launched++;
      }
      ring.position.copy(nodes[burst.node]);
    };
    window.addEventListener("pointerdown", onPointerDown);

    const resize = () => {
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      layout();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let frameId = 0;
    let running = true;

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();

    const renderFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      lineMat.uniforms.uTime.value = t;
      hullMat.uniforms.uTime.value = t;

      // burst envelope: sharp attack, ~1.4s decay
      burst.t += dt;
      const b = burst.t >= 0 ? Math.exp(-burst.t * 2.2) : 0;
      lineMat.uniforms.uExcite.value = b;
      hullMat.uniforms.uBoost.value = b * 0.9;
      bloom.strength = 0.75 + b * 0.55;

      // shockwave ring grows + fades
      if (b > 0.01) {
        const age = burst.t;
        ring.scale.setScalar(0.4 + age * 9);
        ringMat.opacity = b * 0.55;
      } else {
        ringMat.opacity = 0;
      }

      group.rotation.y = t * 0.08 + scrollT * 0.9;
      const breathe = 1 + Math.sin(t * 0.7) * 0.015 + b * 0.03;
      group.scale.setScalar((group.userData.s0 || 1) * breathe);

      // node shimmer
      nodeMat.size = 0.34 + Math.sin(t * 2.1) * 0.02 + b * 0.1;

      // signals along edges; burst-pool signals retire on arrival
      const sa = sigGeo.attributes.position;
      for (let i = 0; i < TOTAL_SIG; i++) {
        const sg = signals[i];
        if (!sg.active) {
          sa.array[i * 3] = 0; sa.array[i * 3 + 1] = 999; sa.array[i * 3 + 2] = 0; // parked offscreen
          continue;
        }
        sg.p += sg.speed * dt;
        if (sg.p >= 1) {
          if (sg.burstPool && burst.t > 1.2) {
            sg.active = false;
            continue;
          }
          sg.p = 0;
          sg.e = pickEdge();
        }
        const [a2, b2] = edges[sg.e];
        tmpA.copy(nodes[a2]); tmpB.copy(nodes[b2]);
        tmpA.lerp(tmpB, sg.p);
        sa.array[i * 3] = tmpA.x; sa.array[i * 3 + 1] = tmpA.y; sa.array[i * 3 + 2] = tmpA.z;
      }
      sa.needsUpdate = true;

      pointer.x += (targetP.x - pointer.x) * 0.045;
      pointer.y += (targetP.y - pointer.y) * 0.045;
      group.rotation.x = 0.1 + pointer.y * 0.12;
      group.rotation.z = -pointer.x * 0.06;
      camera.position.x = pointer.x * 0.9;
      camera.position.y = -pointer.y * 0.6;
      camera.position.z = 15 + scrollT * 2.6;
      camera.lookAt(group.position.x * 0.55, group.position.y, 0);

      composer.render();
    };

    const animate = () => {
      if (!running) return;
      frameId = requestAnimationFrame(animate);
      renderFrame();
    };

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
        clock.getDelta();
        animate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      disposables.forEach((x) => x.dispose && x.dispose());
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="three-bg" aria-hidden="true" />;
}
