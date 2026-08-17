import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * ARStage — camera-backed 3D presentation of the square + circle pair.
 *
 * Replaces the old flat layout, where "closer / farther" was faked by moving a
 * div up and down the screen. Here the two objects live at real depths in front
 * of the participant, so "closer" means physically nearer to the body and the
 * usual depth cues (perspective size, height in the visual field, cast shadow)
 * all agree with the correct answer.
 *
 * The array stays locked to the device's forward direction — each trial presents
 * it in front of whatever way the participant is currently facing. That matches
 * the paradigm: the ego answers are heading-independent, and the allo answers are
 * derived from heading by dirMap8, not from where the objects sit on screen.
 *
 * iOS Safari has no WebXR, so this is a camera feed with a perspective scene
 * composited on top rather than a world-anchored AR session. Nothing here needs
 * permissions beyond the camera, and it degrades to a plain backdrop if refused.
 */

// ─── tunables ─────────────────────────────────────────────

// Depth of each slot, in metres in front of the participant.
const NEAR_Z = -2.0;
const FAR_Z = -4.6;
const MID_Z = -3.1;

// The view looks slightly down onto the objects, the way you would see two things
// set on the ground ahead of you. Eye-level framing pushed the near object right
// on top of the far one and the pair became hard to tell apart — the participant
// has to read both shapes to answer, so occlusion is a defect, not a depth cue.
const CAMERA_Y = 0.95;

// Lateral offset for the left/right slots.
const SIDE_X = 0.9;
const DIAG_X = 0.78;

// Objects sit below eye level, so nearer ones also fall lower in the frame —
// the same cue you get looking down at two things on the floor in front of you.
const OBJECT_Y = -0.55;
const GROUND_Y = -1.15;

// Physical size is identical for both shapes, so any apparent size difference is
// purely a depth cue and never a confound.
const CUBE_SIDE = 0.62;
const SPHERE_R = 0.32;

// How far the scene shifts when the phone is tilted. Motion parallax is what
// makes the depth read as physical rather than drawn. Set to 0 for a rigid scene.
const PARALLAX_STRENGTH = 0.32;
const PARALLAX_MAX_DEG = 22;

/**
 * Slot A is the "first" position (top / left / top-left), slot B its opposite —
 * matching how squareFirst was read in the flat version.
 */
const SLOTS = {
  horizontal: { A: [-SIDE_X, OBJECT_Y, MID_Z], B: [SIDE_X, OBJECT_Y, MID_Z] },
  vertical: { A: [0, OBJECT_Y, FAR_Z], B: [0, OBJECT_Y, NEAR_Z] },
  'diag-nwse': { A: [-DIAG_X, OBJECT_Y, FAR_Z], B: [DIAG_X, OBJECT_Y, NEAR_Z] },
  'diag-nesw': { A: [DIAG_X, OBJECT_Y, FAR_Z], B: [-DIAG_X, OBJECT_Y, NEAR_Z] },
};

function slotsFor(layout, squareFirst) {
  const slot = SLOTS[layout] || SLOTS.horizontal;
  return squareFirst
    ? { square: slot.A, circle: slot.B }
    : { square: slot.B, circle: slot.A };
}

// ─── component ────────────────────────────────────────────

export default function ARStage({ layout, squareFirst, parallax = true }) {
  const mountRef = useRef(null);
  const videoRef = useRef(null);
  const sceneRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);

  // ── camera feed ──
  useEffect(() => {
    let stream = null;
    let cancelled = false;

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // iOS refuses to autoplay without an explicit play() after srcObject.
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        // Never block the trial on the camera — fall back to a plain backdrop.
        console.warn('[ARStage] Camera unavailable:', err?.name || err);
        if (!cancelled) setCameraError(err?.name || 'error');
      }
    }

    openCamera();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── three.js scene (built once, objects repositioned per trial) ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, CAMERA_Y, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // Lighting — one key light casting shadows, plus fill so the unlit faces of
    // the cube stay readable against a bright camera feed.
    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(1.6, 4.2, -1.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    scene.add(key);

    // Invisible floor that receives only the contact shadows. Those shadows are
    // the strongest signal that the objects sit at different distances.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    scene.add(ground);

    const material = () =>
      new THREE.MeshStandardMaterial({ color: 0xe4e4e4, roughness: 0.62, metalness: 0.04 });

    const cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE_SIDE, CUBE_SIDE, CUBE_SIDE), material());
    cube.castShadow = true;
    // A slight yaw shows two faces at once, which reads as solid immediately.
    cube.rotation.y = THREE.MathUtils.degToRad(-22);
    scene.add(cube);

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R, 48, 32), material());
    sphere.castShadow = true;
    scene.add(sphere);

    const rig = { renderer, scene, camera, cube, sphere, parallax: { x: 0, y: 0 } };
    sceneRef.current = rig;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      // Ease the camera toward the parallax target so tilting feels physical
      // rather than jittery on noisy sensor data.
      camera.position.x += (rig.parallax.x - camera.position.x) * 0.12;
      camera.position.y += (CAMERA_Y + rig.parallax.y - camera.position.y) * 0.12;
      camera.lookAt(0, OBJECT_Y, MID_Z);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sceneRef.current = null;
      cube.geometry.dispose();
      cube.material.dispose();
      sphere.geometry.dispose();
      sphere.material.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── reposition on trial change ──
  useEffect(() => {
    const rig = sceneRef.current;
    if (!rig) return;
    const { square, circle } = slotsFor(layout, squareFirst);
    rig.cube.position.set(...square);
    rig.sphere.position.set(...circle);
  }, [layout, squareFirst]);

  // ── tilt parallax ──
  useEffect(() => {
    if (!parallax || PARALLAX_STRENGTH === 0) return;
    let base = null;

    const handler = (e) => {
      const rig = sceneRef.current;
      if (!rig || e.gamma == null || e.beta == null) return;
      // First reading becomes the neutral pose, so the participant's natural
      // holding angle maps to a centred view rather than an off-axis one.
      if (!base) base = { gamma: e.gamma, beta: e.beta };
      const clamp = (v) => Math.max(-PARALLAX_MAX_DEG, Math.min(PARALLAX_MAX_DEG, v));
      const dx = clamp(e.gamma - base.gamma) / PARALLAX_MAX_DEG;
      const dy = clamp(e.beta - base.beta) / PARALLAX_MAX_DEG;
      rig.parallax.x = dx * PARALLAX_STRENGTH;
      rig.parallax.y = -dy * PARALLAX_STRENGTH * 0.6;
    };

    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [parallax]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 320,
        aspectRatio: '1 / 1',
        position: 'relative',
        margin: '8px auto',
        flexShrink: 0,
        borderRadius: 12,
        overflow: 'hidden',
        background: cameraError
          ? 'linear-gradient(160deg, #3a4a5a 0%, #222c36 100%)'
          : '#111',
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: cameraError ? 'none' : 'block',
        }}
      />
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {cameraError && (
        <p
          style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 11,
            color: 'rgba(255,255,255,0.65)',
            margin: 0,
          }}
        >
          Camera unavailable — showing objects without the live view.
        </p>
      )}
    </div>
  );
}
