import fs from 'node:fs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const W = 480, H = 270, FRAMES = 70;
const frames = [];

function setPx(buf, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const aa = a / 255;
  buf[i] = Math.round(buf[i] * (1 - aa) + r * aa);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - aa) + g * aa);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - aa) + b * aa);
  buf[i + 3] = 255;
}

function circle(buf, cx, cy, rr, col, a = 255) {
  const r2 = rr * rr;
  const minX = Math.floor(cx - rr), maxX = Math.ceil(cx + rr);
  const minY = Math.floor(cy - rr), maxY = Math.ceil(cy + rr);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(buf, x, y, col[0], col[1], col[2], a);
    }
  }
}

function line(buf, x1, y1, x2, y2, width, col, a = 255) {
  const steps = Math.max(1, Math.floor(Math.hypot(x2 - x1, y2 - y1)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    circle(buf, x, y, width * 0.5, col, a);
  }
}

for (let f = 0; f < FRAMES; f++) {
  const t = f / 10;
  const buf = new Uint8Array(W * H * 4);

  // background gradient
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = y / H;
      buf[i] = 10 + Math.floor(20 * (1 - v));
      buf[i + 1] = 16 + Math.floor(30 * (1 - v));
      buf[i + 2] = 35 + Math.floor(50 * (1 - v));
      buf[i + 3] = 255;
    }
  }

  // food particles
  for (let i = 0; i < 90; i++) {
    const x = (i * 57 + f * 2) % W;
    const y = (i * 91 + Math.sin(t + i) * 20 + H) % H;
    circle(buf, x, y, 1.2, [150, 255, 180], 170);
  }

  // worms (swimming sway)
  for (let k = 0; k < 5; k++) {
    const cx = 70 + k * 85 + Math.sin(t * 0.7 + k) * 14;
    const cy = 130 + Math.sin(t * 0.45 + k * 0.7) * 70;
    const col = [120 + 20 * k, 140, 230 - 22 * k];
    let px = cx, py = cy;
    for (let s = 1; s <= 11; s++) {
      const u = s / 11;
      const x = cx - u * 70 + Math.sin(t * 2.4 - u * 9 + k) * (u * 18);
      const y = cy + Math.cos(t * 2.4 - u * 9 + k) * (u * 12);
      const w = 8 * (1 - u * 0.7);
      line(buf, px, py, x, y, w, col, 230);
      px = x; py = y;
    }
  }

  // protozoa + viruses
  for (let i = 0; i < 4; i++) {
    const x = 90 + i * 110 + Math.sin(t * 1.3 + i) * 22;
    const y = 45 + Math.cos(t * 1.1 + i) * 15;
    circle(buf, x, y, 10, [255, 120, 170], 190);
  }
  for (let i = 0; i < 7; i++) {
    const x = 50 + i * 60 + Math.sin(t * 2 + i) * 18;
    const y = 220 + Math.cos(t * 2.2 + i * 1.1) * 14;
    circle(buf, x, y, 3, [245, 190, 240], 220);
  }

  frames.push(buf);
}

const encoder = GIFEncoder();
for (const rgba of frames) {
  const palette = quantize(rgba, 256, { format: 'rgba4444' });
  const index = applyPalette(rgba, palette, { format: 'rgba4444' });
  encoder.writeFrame(index, W, H, { palette, delay: 6 });
}
encoder.finish();

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/evo-lumen-life.gif', Buffer.from(encoder.bytes()));
console.log('wrote docs/evo-lumen-life.gif');
