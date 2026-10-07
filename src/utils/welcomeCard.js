// Immagini LiteRP: benvenuto ("BENVENUTO <nome> dentro LiteRP") e banner del pannello ticket.
const path = require('path');

let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
  const dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
  canvasLib.GlobalFonts.registerFromPath(path.join(dir, 'Poppins-ExtraBold.ttf'), 'LiteXB');
  canvasLib.GlobalFonts.registerFromPath(path.join(dir, 'Poppins-Bold.ttf'), 'LiteB');
  canvasLib.GlobalFonts.registerFromPath(path.join(dir, 'Poppins-Medium.ttf'), 'LiteM');
} catch (err) {
  console.error('[Benvenuto] Immagine di benvenuto non disponibile (esegui "npm install"):', err.message);
  canvasLib = null;
}

const W = 1100;
const H = 480;
const FALLBACK = '"Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI", Arial, sans-serif';
const font = (family, size) => `${size}px ${family}, ${FALLBACK}`;

async function fetchImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await canvasLib.loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
function rgba(color, alpha) {
  const n = typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Disegna l'immagine riempiendo l'area (come background-size: cover). */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Testo con spaziatura tra le lettere. */
function spacedText(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - spacing - x;
}

/** Riduce il font finché il testo entra nella larghezza, poi taglia con "…". */
function fitText(ctx, text, family, maxSize, minSize, maxWidth) {
  let size = maxSize;
  ctx.font = font(family, size);
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = font(family, size);
  }
  let out = text;
  while (ctx.measureText(out).width > maxWidth && out.length > 1) out = out.slice(0, -1);
  if (out !== text) out = `${out.slice(0, -1)}…`;
  return { text: out, size };
}

function circleImage(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** Sfondo comune alle immagini LiteRP: gradiente scuro (o immagine), bagliori colorati e barra in basso. */
function drawBackground(ctx, w, h, accent, background, glowX) {
  roundRect(ctx, 0, 0, w, h, 36);
  ctx.clip();

  if (background) {
    drawCover(ctx, background, 0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, 'rgba(6, 10, 22, 0.55)');
    shade.addColorStop(1, 'rgba(6, 10, 22, 0.85)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  } else {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#070b16');
    bg.addColorStop(0.55, '#0c1428');
    bg.addColorStop(1, '#111d3a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // righe diagonali leggere
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 2;
    for (let x = -h; x < w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  // bagliori colorati
  const glow1 = ctx.createRadialGradient(glowX, h / 2, 20, glowX, h / 2, 420);
  glow1.addColorStop(0, rgba(accent, 0.38));
  glow1.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);
  const glow2 = ctx.createRadialGradient(w, h, 10, w, h, 380);
  glow2.addColorStop(0, rgba(accent, 0.22));
  glow2.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  // barra colorata in basso
  const bar = ctx.createLinearGradient(0, 0, w, 0);
  bar.addColorStop(0, rgba(accent, 0));
  bar.addColorStop(0.5, rgba(accent, 1));
  bar.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = bar;
  ctx.fillRect(0, h - 6, w, 6);
}

/** Foto/logo rotondo con bagliore e anello colorato. */
function drawRingedCircle(ctx, img, cx, cy, r, accent) {
  ctx.save();
  ctx.shadowColor = rgba(accent, 0.9);
  ctx.shadowBlur = 45;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0f1e';
  ctx.fill();
  ctx.restore();

  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(0.45, hex(accent));
  ring.addColorStop(1, rgba(accent, 0.6));
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = ring;
  ctx.stroke();

  if (img) {
    circleImage(ctx, img, cx, cy, r);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(accent, 0.35);
    ctx.fill();
  }
}

/**
 * Banner del pannello ticket: logo del server e "CENTRO ASSISTENZA".
 * @param {import('discord.js').Guild} guild
 * @param {object} opts { accent, name }
 */
async function renderTicketBanner(guild, opts = {}) {
  if (!canvasLib) return null;
  const BW = 1100;
  const BH = 340;
  const accent = opts.accent ?? 0x00a8ff;
  const canvas = canvasLib.createCanvas(BW, BH);
  const ctx = canvas.getContext('2d');
  const logo = await fetchImage(guild.iconURL({ extension: 'png', size: 256, forceStatic: true }));

  drawBackground(ctx, BW, BH, accent, null, 170);
  drawRingedCircle(ctx, logo, 170, BH / 2, 100, accent);

  const tx = 335;
  const maxWidth = BW - tx - 60;
  ctx.font = font('LiteXB', 28);
  ctx.fillStyle = hex(accent);
  spacedText(ctx, `${(opts.name || guild.name).toUpperCase()} • SUPPORTO`, tx, 118, 7);

  const title = fitText(ctx, 'CENTRO ASSISTENZA', 'LiteXB', 70, 40, maxWidth);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.font = font('LiteXB', title.size);
  ctx.fillText(title.text, tx - 3, 190);
  ctx.restore();

  const line = ctx.createLinearGradient(tx, 0, tx + 220, 0);
  line.addColorStop(0, hex(accent));
  line.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = line;
  ctx.fillRect(tx, 212, 220, 4);

  const sub = fitText(ctx, 'Apri un ticket e parla in privato con lo staff', 'LiteM', 30, 20, maxWidth);
  ctx.fillStyle = '#d6dcef';
  ctx.fillText(sub.text, tx, 262);

  return canvas.encode('png');
}

/**
 * @param {import('discord.js').GuildMember} member
 * @param {object} opts { accent, background, title, subtitle, highlight, count }
 * @returns {Promise<Buffer|null>} PNG oppure null se la libreria grafica non è installata
 */
async function renderWelcomeCard(member, opts) {
  if (!canvasLib) return null;
  const { createCanvas } = canvasLib;
  const accent = opts.accent ?? 0x00a8ff;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const [avatar, logo, background] = await Promise.all([
    fetchImage(member.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true })),
    fetchImage(member.guild.iconURL({ extension: 'png', size: 256, forceStatic: true })),
    fetchImage(opts.background),
  ]);

  drawBackground(ctx, W, H, accent, background, 250);

  // ---------------------------------------------------------------- foto profilo
  drawRingedCircle(ctx, avatar, 250, H / 2, 140, accent);

  // ---------------------------------------------------------------- logo del server (in alto a destra)
  if (logo) {
    const lr = 34;
    const lx = W - 40 - lr;
    const ly = 40 + lr;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(lx, ly, lr + 3, 0, Math.PI * 2);
    ctx.fillStyle = rgba(accent, 0.8);
    ctx.fill();
    ctx.restore();
    circleImage(ctx, logo, lx, ly, lr);
  }

  // ---------------------------------------------------------------- testi
  const tx = 450;
  const maxWidth = W - tx - 60;
  ctx.textBaseline = 'alphabetic';

  // Posizioni calcolate per centrare verticalmente il blocco di testo
  const name = fitText(ctx, member.displayName, 'LiteXB', 86, 46, maxWidth);
  const total = 30 + 16 + name.size * 0.76 + 24 + 4 + 50 + (opts.count ? 30 + 46 : 0);
  const titleY = Math.round((H - total) / 2) + 30;
  const nameY = titleY + 16 + name.size * 0.76;
  const lineY = nameY + 24;
  const sy = lineY + 4 + 50;

  // BENVENUTO
  ctx.font = font('LiteXB', 40);
  ctx.fillStyle = hex(accent);
  spacedText(ctx, (opts.title || 'BENVENUTO').toUpperCase(), tx, titleY, 9);

  // Nome
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.font = font('LiteXB', name.size);
  ctx.fillText(name.text, tx - 3, nameY);
  ctx.restore();

  // linea separatrice
  const line = ctx.createLinearGradient(tx, 0, tx + 220, 0);
  line.addColorStop(0, hex(accent));
  line.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = line;
  ctx.fillRect(tx, lineY, 220, 4);

  // "dentro LiteRP" (la parte evidenziata in colore)
  const subtitle = opts.subtitle || 'dentro LiteRP';
  const hl = opts.highlight && subtitle.includes(opts.highlight) ? opts.highlight : null;
  if (hl) {
    const i = subtitle.indexOf(hl);
    const parts = [
      { text: subtitle.slice(0, i), family: 'LiteM', color: '#d6dcef' },
      { text: hl, family: 'LiteXB', color: hex(accent) },
      { text: subtitle.slice(i + hl.length), family: 'LiteM', color: '#d6dcef' },
    ];
    let cx = tx;
    for (const p of parts) {
      if (!p.text) continue;
      ctx.font = font(p.family, 42);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, cx, sy);
      cx += ctx.measureText(p.text).width;
    }
  } else {
    const sub = fitText(ctx, subtitle, 'LiteM', 42, 26, maxWidth);
    ctx.fillStyle = '#d6dcef';
    ctx.fillText(sub.text, tx, sy);
  }

  // pillola "MEMBRO #123"
  if (opts.count) {
    const label = `MEMBRO #${Number(opts.count).toLocaleString('it-IT')}`;
    ctx.font = font('LiteB', 22);
    const pw = ctx.measureText(label).width + 26 * 2 + label.length * 1.5;
    const py = sy + 30;
    roundRect(ctx, tx, py, pw, 46, 23);
    ctx.fillStyle = rgba(accent, 0.16);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(accent, 0.7);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    spacedText(ctx, label, tx + 26, py + 31, 1.5);
  }

  return canvas.encode('png');
}

module.exports = { renderWelcomeCard, renderTicketBanner, available: () => Boolean(canvasLib) };
