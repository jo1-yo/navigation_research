import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * ARStage — camera-backed 3D presentation, world-anchored to the compass.
 *
 * Two variants:
 *
 * "trial"  — the square + circle pair at real depths in front of the participant.
 *            With `fill`, the camera view is the whole screen and the question /
 *            answers float on top of it, so the objects render as large as the
 *            phone allows instead of inside a small square.
 *            When a compass heading and an anchor bearing are supplied, the pair is
 *            anchored to that real-world bearing: the scene's -Z axis IS the block's
 *            target direction, and the camera yaws opposite the device, so turning
 *            the phone pans the objects across the frame exactly like physical
 *            objects would. They no longer follow the camera.
 *
 * "orient" — the pre-block alignment step. Two arrows share one root, compass-needle
 *            style, floating dead-centre in view so holding the phone up and filming
 *            straight ahead is all it takes to see them. The dark facing arrow always
 *            points straight up (= the way the body points); the green target arrow
 *            pivots its TIP around the shared root by the heading error. Rotating the
 *            body swings the green tip until the two arrows coincide, and `aligned`
 *            recolors the facing arrow as confirmation.
 *
 * Without a heading (desktop, permission refused) the trial variant falls back to
 * the previous device-locked behavior: array centered ahead, tilt parallax only.
 *
 * iOS Safari has no WebXR, so this is a camera feed with a perspective scene
 * composited on top rather than a tracked AR session. Yaw comes from the compass
 * (webkitCompassHeading / alpha) and pitch from beta, which is enough for a
 * participant standing in place and rotating — translation is not tracked.
 */

// ─── tunables ─────────────────────────────────────────────

// Depth of each slot, in metres in front of the participant. The far slot sits
// further out than the near/mid spacing alone would suggest: with the objects on
// the floor and the pair only 18° below the eye line, the far object's bottom edge
// and the near object's top edge come close enough to read as one blob, and depth
// is what buys the separation back.
const NEAR_Z = -2.0;
const FAR_Z = -5.5;
const MID_Z = -3.1;

// The scene is metres, with the FLOOR at y = 0 and the eye at standing height.
// Objects rest on the floor and the camera looks very nearly level, which is what
// you actually see holding a phone up in front of you: two things on the ground
// ahead, low in the frame. The earlier framing tilted the virtual camera 29° down
// while the real camera stayed level, so the objects were drawn in a downward
// perspective over a level scene — it read as "these are on the floor, point the
// phone down" and participants did exactly that.
//
// The camera cannot be perfectly level, and the objects cannot be at eye height:
// in the near/far layout both sit on the same line of sight, so raising them to
// eye level puts the near one straight on top of the far one. Occlusion is a
// defect, not a depth cue — the participant has to read both shapes to answer.
// The floor gives the pair the vertical separation that avoids it, and 18° of
// downward pitch — against the 29-33° it used to be — puts the pair in the lower
// middle of the frame with the phone held level. 18 is the smallest pitch that
// keeps the nearest object clear of the answer panel: the near cube's closest
// bottom CORNER, not its centre, is what reaches lowest (the -22° yaw brings it
// to 1.54 m when the cube's centre is at 2.0 m).
const GROUND_Y = 0;
const CAMERA_Y = 1.6;
const FILL_PITCH_DEG = -18;

// Lateral offset for the left/right slots, set so each object's OUTER EDGE stays
// inside the frame at FILL_H_FOV — the near diagonal slot is the binding case,
// since a nearby object is both far off-axis and large.
const SIDE_X = 0.82;
const DIAG_X = 0.38;

// Physical size is identical for both shapes, so any apparent size difference is
// purely a depth cue and never a confound. Both are ~15% larger than they were:
// at 3.1 m the pair renders about 125 px wide on a 393 pt screen, against 108 px.
const CUBE_SIDE = 0.71;
const SPHERE_R = 0.37;

// Horizontal field of view, in degrees. It is the HORIZONTAL angle that is locked
// and the vertical that follows the container's aspect, so the pair frames the same
// way on any phone and never slides off the sides of a tall screen. A square
// container at 60° reproduces the original framing exactly.
const SQUARE_H_FOV = 60;
// Narrower on the full-bleed screen: less angle across the same (wider) canvas is
// what makes the objects render ~1.5x larger than they did in the 320px square.
const FILL_H_FOV = 50;

// How far the scene shifts when the phone is tilted, in fallback mode only.
// In anchored mode rotation IS the parallax, so the positional shim is off.
const PARALLAX_STRENGTH = 0.32;
const PARALLAX_MAX_DEG = 22;

// Pitch tracking range in anchored mode (degrees of phone tilt honoured).
const PITCH_TRACK_MAX_DEG = 30;

// Per-frame easing toward the sensor pose. Low enough to swallow compass noise,
// high enough that the world doesn't feel like it's floating on rubber bands.
const POSE_EASE = 0.15;

/**
 * Slot A is the "first" position (top / left / top-left), slot B its opposite —
 * matching how squareFirst was read in the flat version. Each slot is (x, z) only:
 * the height comes from the shape, because both shapes REST ON THE FLOOR and a
 * cube and a sphere have their centres at different heights when they do.
 */
const SLOTS = {
  horizontal: { A: [-SIDE_X, MID_Z], B: [SIDE_X, MID_Z] },
  vertical: { A: [0, FAR_Z], B: [0, NEAR_Z] },
  'diag-nwse': { A: [-DIAG_X, FAR_Z], B: [DIAG_X, NEAR_Z] },
  'diag-nesw': { A: [DIAG_X, FAR_Z], B: [-DIAG_X, NEAR_Z] },
};

function slotsFor(layout, squareFirst) {
  const slot = SLOTS[layout] || SLOTS.horizontal;
  return squareFirst
    ? { square: slot.A, circle: slot.B }
    : { square: slot.B, circle: slot.A };
}

// Wrap any angle difference to (-180, 180].
function wrapSigned(deg) {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

// Distance of the guide arrows from the eye, their height, and how far below the
// view centre the shared root sits. Tip length is chosen so a fully sideways
// needle (90° error) still keeps its tip inside a square frame.
const ARROW_DIST = 3.2;
const ARROW_H = 1.8;
const ARROW_ROOT_Y = -0.9;

// Flat arrow silhouette facing the viewer: a triangular head with slightly swept
// barbs over a shaft that tapers toward the head — wider at the base, the way a
// painted road arrow reads. The ROOT is at the local origin and the tip at
// +ARROW_H, so rotating the mesh about z pivots the tip around the root,
// compass-needle style, which is exactly how the orient variant animates it.
function makeUprightArrow(color, opacity = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, ARROW_H);            // tip
  s.lineTo(0.50, ARROW_H - 0.59);  // right barb, swept slightly down
  s.lineTo(0.11, ARROW_H - 0.52);  // notch where the head meets the shaft
  s.lineTo(0.18, 0);               // shaft widens toward the base
  s.lineTo(-0.18, 0);
  s.lineTo(-0.11, ARROW_H - 0.52);
  s.lineTo(-0.50, ARROW_H - 0.59);
  s.closePath();
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
    side: THREE.DoubleSide,
  });
  return { mesh: new THREE.Mesh(new THREE.ShapeGeometry(s), mat), mat };
}

// ─── component ────────────────────────────────────────────

export default function ARStage({
  layout,
  squareFirst,
  parallax = true,
  deviceHeading = null,
  anchorBearing = null,
  variant = 'trial',
  aligned = false,
  fill = false,
}) {
  const mountRef = useRef(null);
  const videoRef = useRef(null);
  const sceneRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);

  const anchored = deviceHeading !== null && anchorBearing !== null;

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

    const hFov = fill ? FILL_H_FOV : SQUARE_H_FOV;
    const camera = new THREE.PerspectiveCamera(hFov, 1, 0.1, 100);
    camera.position.set(0, CAMERA_Y, 0);
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const disposables = [];
    const rig = {
      renderer,
      scene,
      camera,
      cube: null,
      sphere: null,
      ghostArrow: null,
      facingMat: null,
      // Orient mode looks straight ahead — the arrows stand at eye level, so the
      // participant just holds the phone up. Trials keep the slight downward gaze.
      basePitch: variant === 'trial' ? THREE.MathUtils.degToRad(FILL_PITCH_DEG) : 0,
      // Sensor pose targets, eased toward in the animate loop.
      yaw: { current: 0, target: 0, initialized: false },
      pitch: { current: 0, target: 0 },
      parallax: { x: 0, y: 0 },
      anchored: false,
    };

    if (variant === 'trial') {
      // Lighting — one key light casting shadows, plus fill so the unlit faces of
      // the cube stay readable against a bright camera feed.
      scene.add(new THREE.AmbientLight(0xffffff, 0.62));
      const key = new THREE.DirectionalLight(0xffffff, 1.25);
      key.position.set(1.6, 5.0, -1.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -4;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 16;
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
      disposables.push(ground.geometry, ground.material);

      const material = () =>
        new THREE.MeshStandardMaterial({ color: 0xe4e4e4, roughness: 0.62, metalness: 0.04 });

      const cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE_SIDE, CUBE_SIDE, CUBE_SIDE), material());
      cube.castShadow = true;
      // A slight yaw shows two faces at once, which reads as solid immediately.
      cube.rotation.y = THREE.MathUtils.degToRad(-22);
      scene.add(cube);
      disposables.push(cube.geometry, cube.material);

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R, 48, 32), material());
      sphere.castShadow = true;
      scene.add(sphere);
      disposables.push(sphere.geometry, sphere.material);

      rig.cube = cube;
      rig.sphere = sphere;
    } else {
      // Orient variant. Both arrows are parented to the camera, so they float
      // dead-centre in view no matter how the phone is held — the camera feed is
      // what rotates behind them. They share one root, compass-needle style: the
      // dark facing arrow always points straight up, and the green target arrow's
      // TIP pivots around that root by the heading error (driven in animate).
      // The target sits a touch farther so the facing arrow occludes it cleanly
      // when the two coincide.
      const ghost = makeUprightArrow(0x4caf50, 0.45);
      ghost.mesh.position.set(0, ARROW_ROOT_Y, -ARROW_DIST - 0.05);
      const facing = makeUprightArrow(0x37414e, 1);
      facing.mesh.position.set(0, ARROW_ROOT_Y, -ARROW_DIST);
      camera.add(ghost.mesh, facing.mesh);
      scene.add(camera);
      disposables.push(ghost.mat, ghost.mesh.geometry, facing.mat, facing.mesh.geometry);

      rig.ghostArrow = ghost.mesh;
      rig.facingMat = facing.mat;
    }

    sceneRef.current = rig;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the HORIZONTAL angle fixed and derive the vertical one. Three.js's
      // fov is vertical, so on a tall phone a fixed vertical fov would squeeze the
      // horizontal frame down to ~30° and throw the side objects off-screen.
      camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hFov) / 2) / camera.aspect)
      );
      camera.updateProjectionMatrix();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);

      if (rig.anchored) {
        // World-anchored: the camera turns, the scene stays put. Ease along the
        // shortest arc so compass noise (and the 359→0 wrap) never spins the view.
        rig.yaw.current = wrapSigned(
          rig.yaw.current + wrapSigned(rig.yaw.target - rig.yaw.current) * POSE_EASE
        );
        rig.pitch.current += (rig.pitch.target - rig.pitch.current) * POSE_EASE;
        camera.position.set(0, CAMERA_Y, 0);
        camera.rotation.y = -THREE.MathUtils.degToRad(rig.yaw.current);
        camera.rotation.x = rig.basePitch + rig.pitch.current;
      } else {
        // Fallback: the same framing, with the tilt parallax as a small camera
        // translation. Sharing basePitch with the anchored branch is what keeps
        // desktop and phone composing the scene identically.
        camera.position.x += (rig.parallax.x - camera.position.x) * 0.12;
        camera.position.y += (CAMERA_Y + rig.parallax.y - camera.position.y) * 0.12;
        camera.rotation.y = 0;
        camera.rotation.x = rig.basePitch;
      }

      // Compass needle: yaw.current is the eased signed heading error (facing −
      // target), so this leans the green tip toward the target — right of the
      // facing arrow when the participant must turn right — and the two arrows
      // coincide exactly at alignment.
      if (rig.ghostArrow) rig.ghostArrow.rotation.z = THREE.MathUtils.degToRad(rig.yaw.current);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sceneRef.current = null;
      disposables.forEach(d => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [variant, fill]);

  // ── world anchoring: feed the sensor yaw target ──
  useEffect(() => {
    const rig = sceneRef.current;
    if (!rig) return;
    rig.anchored = anchored;
    if (!anchored) return;
    rig.yaw.target = wrapSigned(deviceHeading - anchorBearing);
    // Snap on the first reading so mounting mid-turn doesn't animate a sweep.
    if (!rig.yaw.initialized) {
      rig.yaw.current = rig.yaw.target;
      rig.yaw.initialized = true;
    }
  }, [anchored, deviceHeading, anchorBearing]);

  // ── reposition on trial change ──
  useEffect(() => {
    const rig = sceneRef.current;
    if (!rig?.cube) return;
    const { square, circle } = slotsFor(layout, squareFirst);
    // Sitting on the floor means the centre is half a side (or one radius) up.
    rig.cube.position.set(square[0], GROUND_Y + CUBE_SIDE / 2, square[1]);
    rig.sphere.position.set(circle[0], GROUND_Y + SPHERE_R, circle[1]);
  }, [layout, squareFirst, variant]);

  // ── alignment feedback on the facing arrow ──
  useEffect(() => {
    const rig = sceneRef.current;
    if (rig?.facingMat) rig.facingMat.color.set(aligned ? 0x4caf50 : 0x37414e);
  }, [aligned, variant]);

  // ── device tilt: pitch tracking when anchored, positional parallax otherwise ──
  useEffect(() => {
    if (!parallax) return;
    let base = null;

    const handler = (e) => {
      const rig = sceneRef.current;
      if (!rig || e.gamma == null || e.beta == null) return;
      // First reading becomes the neutral pose, so the participant's natural
      // holding angle maps to a centred view rather than an off-axis one.
      if (!base) base = { gamma: e.gamma, beta: e.beta };
      if (rig.anchored) {
        const dy = Math.max(-PITCH_TRACK_MAX_DEG, Math.min(PITCH_TRACK_MAX_DEG, e.beta - base.beta));
        rig.pitch.target = THREE.MathUtils.degToRad(dy);
      } else {
        const clamp = (v) => Math.max(-PARALLAX_MAX_DEG, Math.min(PARALLAX_MAX_DEG, v));
        const dx = clamp(e.gamma - base.gamma) / PARALLAX_MAX_DEG;
        const dy = clamp(e.beta - base.beta) / PARALLAX_MAX_DEG;
        rig.parallax.x = dx * PARALLAX_STRENGTH;
        rig.parallax.y = -dy * PARALLAX_STRENGTH * 0.6;
      }
    };

    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [parallax]);

  return (
    <div
      style={{
        // fill: the camera view IS the screen, and the trial chrome floats on top.
        // Otherwise: a square capped against the viewport height so it never pushes
        // the controls below it off a phone screen (the shell is a fixed 100dvh).
        ...(fill
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0 }
          : {
              width: 'min(100%, 38dvh)',
              maxWidth: 320,
              aspectRatio: '1 / 1',
              position: 'relative',
              margin: '8px auto',
              flexShrink: 0,
              borderRadius: 12,
            }),
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
