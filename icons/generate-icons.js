// Run with: node generate-icons.js
// Generates icon-192.png and icon-512.png from icon.svg using sharp or canvas.
// If you can't run this, browsers will fall back to the SVG icon.
const fs = require('fs');
const { createCanvas } = require('canvas');

function draw(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * 0.1875; // border radius ~96/512
  // Background
  ctx.fillStyle = '#0f0f23';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  // Train body
  ctx.strokeStyle = '#4f8ef7';
  ctx.lineWidth = size * 0.039;
  ctx.beginPath();
  ctx.roundRect(size*0.1875, size*0.3125, size*0.625, size*0.390625, size*0.047);
  ctx.stroke();
  // Windows
  ctx.fillStyle = '#4f8ef7';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.roundRect(size*0.265, size*0.390625, size*0.195, size*0.15625, size*0.016);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(size*0.539, size*0.390625, size*0.195, size*0.15625, size*0.016);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Wheels
  ctx.fillStyle = '#4f8ef7';
  [0.34375, 0.65625].forEach(x => {
    ctx.beginPath();
    ctx.arc(size*x, size*0.703125, size*0.0546875, 0, Math.PI*2);
    ctx.fill();
  });
  // Bell/alert icon
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = size * 0.031;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(size*0.5, size*0.15625); ctx.lineTo(size*0.5, size*0.234375); ctx.stroke();
  return c.toBuffer('image/png');
}

try {
  fs.writeFileSync('icon-192.png', draw(192));
  fs.writeFileSync('icon-512.png', draw(512));
  console.log('Icons generated.');
} catch(e) {
  console.log('canvas module not available — browsers will use icon.svg');
}
