import * as THREE from 'three';
import type { CoastlineRing } from '@orbital/data';

/**
 * Build an equirectangular day-side Earth texture from the coastline vectors.
 * Drawn so that a point at (lon, lat) lands at canvas (X, Y) =
 * ((lon+180)/360·W, (90−lat)/180·H) — the same mapping the Earth shader
 * inverts, which is what keeps the texture aligned with satellite positions.
 */
export function buildDayTexture(coastlines: CoastlineRing[]): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const d = canvas.getContext('2d')!;

  // Ocean.
  const ocean = d.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#0a1c30');
  ocean.addColorStop(0.5, '#0e2f52');
  ocean.addColorStop(1, '#0a1c30');
  d.fillStyle = ocean;
  d.fillRect(0, 0, W, H);

  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;

  // Land path (even-odd so lakes/holes read correctly).
  d.beginPath();
  for (const ring of coastlines) {
    ring.forEach((p, i) => {
      const x = X(p[0]);
      const y = Y(p[1]);
      if (i === 0) d.moveTo(x, y);
      else d.lineTo(x, y);
    });
    d.closePath();
  }

  d.save();
  d.clip('evenodd');
  const land = d.createLinearGradient(0, 0, 0, H);
  land.addColorStop(0, '#dfe7e0'); // arctic
  land.addColorStop(0.2, '#3f6d3a');
  land.addColorStop(0.5, '#7c834a'); // arid mid-latitudes
  land.addColorStop(0.8, '#3f6d3a');
  land.addColorStop(1, '#e7eef0'); // antarctic
  d.fillStyle = land;
  d.fillRect(0, 0, W, H);
  d.restore();

  // Coastline highlight.
  d.lineWidth = 1.1;
  d.strokeStyle = 'rgba(150, 210, 190, 0.28)';
  d.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A plain ocean texture used before/without coastline data (offline first run). */
export function buildOceanTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const d = canvas.getContext('2d')!;
  const g = d.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0a1c30');
  g.addColorStop(0.5, '#0e2f52');
  g.addColorStop(1, '#0a1c30');
  d.fillStyle = g;
  d.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
