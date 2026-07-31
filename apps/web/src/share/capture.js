/**
 * Offscreen capture of the live globe for the share card.
 *
 * Design notes, in the order they mattered:
 *
 * 1. The renderer is created without `preserveDrawingBuffer` (scene/core.js),
 *    so reading back from its canvas would need a synchronous
 *    render→toDataURL pair and a temporary resize of the canvas the user is
 *    looking at. Rendering into a WebGLRenderTarget avoids both: the live
 *    canvas is never touched, and the readback doesn't depend on when the
 *    browser next composites.
 *
 * 2. The EXISTING renderer is reused rather than constructing a second one.
 *    WebKit caps the number of live WebGL contexts and evicts the oldest under
 *    memory pressure, so spinning up a second renderer risks killing the
 *    globe's own context on iOS — the exact platform this has to work on.
 *
 * 3. Nothing here taints the canvas: every texture in this scene is generated
 *    procedurally onto an offscreen 2D canvas (scene/earth.js's day/night
 *    builders, clouds.js's makeShapeTextures), so there are no cross-origin
 *    image loads and readback is always permitted.
 */
import * as THREE from "three";
import { renderer, scene } from "../scene/core.js";
import { clouds } from "../scene/clouds.js";
import { setTrailVisible } from "../scene/trail.js";
import { CATS } from "../config.js";
import { SHARE_W, SHARE_H, SSAA } from "./layout.js";
import { frameShareCamera } from "./camera.js";

/**
 * Point clouds use `sizeAttenuation: false`, i.e. a size fixed in device
 * pixels. Rendering into a target much larger than the live drawing buffer
 * would therefore make every satellite cover proportionally less of the frame
 * — the export would look sparser and thinner than what's on screen. Scaling
 * the material size by the same ratio as the render size keeps the visual
 * density of the capture matched to the live view.
 */
function scalePointSizes(factor) {
  const restore = [];
  for (const c in clouds) {
    const pts = clouds[c] && clouds[c].points;
    if (!pts || !pts.material) continue;
    restore.push([pts.material, pts.material.size]);
    pts.material.size = (CATS[c] ? CATS[c].px : 4) * factor;
  }
  return restore;
}

/**
 * Render the globe offscreen, framed on `sat`, and return it as a 2D canvas at
 * the card's output size plus the camera used (so the composer can project the
 * subject and its orbit into the same frame).
 */
export function captureGlobe(sat, date, ssaa = SSAA) {
  if (!renderer || !sat || !sat._p) return null;

  const W = SHARE_W * ssaa;
  const H = SHARE_H * ssaa;
  const { camera, subject } = frameShareCamera(sat._p);

  // --- save every piece of live state this touches ---
  const prevTarget = renderer.getRenderTarget();
  const liveSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const cloudEntry = clouds[sat._cloud];
  const cloudPoints = cloudEntry && cloudEntry.points;
  const prevCloudVisible = cloudPoints ? cloudPoints.visible : null;
  const sizeRestore = scalePointSizes(H / Math.max(1, liveSize.y));

  // The subject must appear even if the user has hidden its category in the
  // legend — it can still be selected from search while hidden.
  if (cloudPoints) cloudPoints.visible = true;
  // The scene's hairline ring is replaced by the composer's 2D one.
  setTrailVisible(false);

  let rt = null;
  let canvas = null;
  try {
    rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);

    const pixels = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);

    // GL reads bottom-up; ImageData is top-down. Flip row-wise on the way in.
    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    const rowBytes = W * 4;
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * rowBytes;
      img.data.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
    }
    ctx.putImageData(img, 0, 0);
  } finally {
    renderer.setRenderTarget(prevTarget);
    if (rt) rt.dispose();
    for (const [mat, size] of sizeRestore) mat.size = size;
    if (cloudPoints && prevCloudVisible !== null) cloudPoints.visible = prevCloudVisible;
    setTrailVisible(true);
  }

  return canvas ? { canvas, camera, subject, ssaa } : null;
}
