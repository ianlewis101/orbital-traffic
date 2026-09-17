// =====================================================================
// ASSEMBLY
// =====================================================================
//
// Encodes the captured frame sequence into a deliverable, and burns the
// title lines over it.
//
// Every shot in the cut writes into ONE globally numbered frame sequence
// rather than a per-shot clip that gets concatenated afterwards. That is
// deliberate: concat demuxing across nine separately encoded segments means
// nine chances for a timebase or pixel-format mismatch to drop a frame at a
// cut, and the cuts here land on beats. A single sequence and a single encode
// cannot drift.
//
// Titles are composited at this stage instead of being drawn into the app, so
// retiming a line costs one re-encode (seconds) rather than a re-shoot
// (minutes). Each is an infinite looped PNG input, alpha-faded in and out at
// absolute output timestamps and gated to its shot's window with enable=.

import { spawn } from "node:child_process";

export function run(cmd, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });
    let err = "";
    if (quiet) {
      p.stderr.on("data", (d) => (err += d.toString()));
      p.stdout.on("data", () => {});
    }
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-3000)}`))
    );
  });
}

const FADE = 0.42; // seconds, title fade in and out — matches the reference's pace

/**
 * Build the filter graph that lays every title over the base sequence.
 *
 * `titles` is [{ png, start, end, fadeIn }] in absolute output seconds.
 * Returns { filter, inputs, outLabel } — inputs are ffmpeg arg arrays to
 * splice in after the frame-sequence input.
 */
export function titleFilter(titles) {
  const inputs = [];
  const parts = [];
  let last = "0:v";

  titles.forEach((t, i) => {
    const idx = i + 1; // input 0 is the frame sequence
    inputs.push("-loop", "1", "-i", t.png);
    const fin = t.fadeIn ?? FADE;
    const fout = FADE;
    // The PNG input's own timeline starts at output t=0, so the fades are
    // expressed in absolute output time and need no setpts shift.
    parts.push(
      `[${idx}:v]format=rgba,` +
        `fade=t=in:st=${t.start.toFixed(3)}:d=${fin.toFixed(3)}:alpha=1,` +
        `fade=t=out:st=${(t.end - fout).toFixed(3)}:d=${fout.toFixed(3)}:alpha=1[t${idx}]`
    );
    const out = `v${idx}`;
    parts.push(
      `[${last}][t${idx}]overlay=0:0:format=auto:` +
        `enable='between(t,${t.start.toFixed(3)},${t.end.toFixed(3)})'[${out}]`
    );
    last = out;
  });

  return { inputs, filter: parts.join(";"), outLabel: last };
}

/**
 * Encode frames -> MP4.
 *
 * H.264 High, yuv420p, +faststart: the combination every social platform
 * accepts without re-encoding twice. CRF 17 is visually lossless here and
 * matters because the platform WILL re-encode — handing it a soft source
 * compounds into visible banding on the globe's night side.
 */
export async function encode({
  framePattern,
  fps,
  totalFrames,
  titles = [],
  audio = null,
  out,
  fadeOutFrom = null,
}) {
  const { inputs, filter, outLabel } = titleFilter(titles);
  const chain = [];
  if (filter) chain.push(filter);

  let last = outLabel;
  if (fadeOutFrom != null) {
    chain.push(`[${last}]fade=t=out:st=${fadeOutFrom.toFixed(3)}:d=0.5[vf]`);
    last = "vf";
  }
  // Explicit final format conversion: the overlay chain runs in RGBA and a
  // stray alpha plane reaching the encoder produces a file some players show
  // as black.
  chain.push(`[${last}]format=yuv420p[vout]`);

  const args = [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    framePattern,
    ...inputs,
    ...(audio ? ["-i", audio] : []),
    "-filter_complex",
    chain.join(";"),
    "-map",
    "[vout]",
  ];

  if (audio) {
    const aIdx = 1 + titles.length;
    const dur = totalFrames / fps;
    args.push(
      "-map",
      `${aIdx}:a`,
      "-af",
      `afade=t=out:st=${Math.max(0, dur - 1.2).toFixed(3)}:d=1.2`,
      "-c:a",
      "aac",
      "-b:a",
      "192k"
    );
  }

  args.push(
    "-frames:v",
    String(totalFrames),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-crf",
    "17",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-r",
    String(fps),
    out
  );

  await run("ffmpeg", args);
  return out;
}

/** A single representative still, for thumbnails and quick review. */
export async function poster({ framePattern, frameIndex, out }) {
  await run("ffmpeg", [
    "-y",
    "-start_number",
    String(frameIndex),
    "-i",
    framePattern,
    "-frames:v",
    "1",
    out,
  ]);
  return out;
}
