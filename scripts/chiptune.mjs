// Draws the Pingy theme's 8-bit sounds into public/sounds/pingy/ (square/triangle/noise, 22.05 kHz mono 8-bit WAV).
// A dev tool like mascots.py: the app ships only the .wav files. Run: node scripts/chiptune.mjs
import { writeFileSync } from "node:fs";

const RATE = 22050;
const hz = (note) => 440 * 2 ** ((note - 69) / 12); // MIDI note → Hz

/** notes: [midi | null (rest), seconds, wave?] played one after another. */
function render(notes, { duty = 0.5, vol = 0.5, slide = 0 } = {}) {
  const out = [];
  for (const [note, dur, wave = "square"] of notes) {
    const n = Math.round(dur * RATE);
    let phase = 0, noise = 0;
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 60) * (1 - i / n) ** 0.6; // tiny attack, decay to 0: no clicks
      if (note === null) { out.push(0); continue; }
      const f = hz(note + slide * (i / n));
      phase = (phase + f / RATE) % 1;
      let s;
      if (wave === "noise") { if (i % Math.max(1, Math.round(RATE / f)) === 0) noise = Math.random() * 2 - 1; s = noise; }
      else if (wave === "tri") s = 4 * Math.abs(phase - 0.5) - 1;
      else s = phase < duty ? 1 : -1;
      out.push(s * env * vol);
    }
  }
  return out;
}

function wav(name, samples) {
  const data = Buffer.from(samples.map((s) => Math.round(128 + 127 * Math.max(-1, Math.min(1, s)))));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(new URL(`../public/sounds/pingy/${name}.wav`, import.meta.url), Buffer.concat([h, data]));
}

// Task ticked by the game: a coin pickup.
wav("auto", render([[83, 0.06], [88, 0.22]], { duty: 0.25 }));
// Another player opened the cube: a sad descending "you lose".
wav("cube-lost", render([[67, 0.18], [66, 0.18], [65, 0.18], [64, 0.5]], { duty: 0.5, slide: -1 }));
// Shugo Festival: a short fanfare.
wav("shugo", render([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.25], [null, 0.05], [79, 0.1], [84, 0.4]], { duty: 0.25 }));
// Immortal Gartua: an ominous boss arpeggio over a low drum.
wav("gartua", [
  ...render([[36, 0.12, "noise"], [null, 0.04]], { vol: 0.6 }),
  ...render([[45, 0.15, "tri"], [48, 0.15, "tri"], [51, 0.15, "tri"], [54, 0.15, "tri"], [57, 0.6, "tri"]], { vol: 0.7 }),
]);
// Reset warning: a level-up run.
wav("reset", render([[60, 0.07], [64, 0.07], [67, 0.07], [72, 0.07], [76, 0.07], [79, 0.3]], { duty: 0.125 }));
