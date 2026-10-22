import { ratios, styles, type Poster } from './model';

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let fontsReady: Promise<unknown> | undefined;
export function loadImage(src: string): Promise<HTMLImageElement> {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { imageCache.delete(src); reject(new Error('Không đọc được ảnh sản phẩm.')); };
      image.src = src;
    }));
    // Keep memory bounded when replacing many large product images.
    if (imageCache.size > 12) imageCache.delete(imageCache.keys().next().value!);
  }
  return imageCache.get(src)!;
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-size * .6, -size * .5, -size * .4, -size, 0, -size);
  ctx.bezierCurveTo(size * .45, -size * .6, size * .2, -size * .2, 0, 0); ctx.fill();
  ctx.strokeStyle = '#ffffff35'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -size * .86); ctx.stroke(); ctx.restore();
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8; const r = i % 2 ? size * .55 : size;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (ctx.measureText(line ? `${line} ${word}` : word).width > width && line) { lines.push(line); line = ''; }
      // Split very long words, URLs and unspaced names to keep them inside the poster.
      if (ctx.measureText(word).width > width) {
        if (line) { lines.push(line); line = ''; }
        for (const letter of word) {
          if (ctx.measureText(line + letter).width > width && line) { lines.push(line); line = ''; }
          line += letter;
        }
      } else line += (line ? ' ' : '') + word;
    }
    lines.push(line);
  }
  return lines;
}
function textBlock(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, maxHeight: number, size: number, color: string, serif = false, align: CanvasTextAlign = 'left', weight = 500) {
  const family = serif ? '"Playfair Display", Georgia, serif' : '"Be Vietnam Pro", sans-serif';
  let lines: string[] = [];
  let actualSize = size;
  do {
    ctx.font = `${weight} ${actualSize}px ${family}`;
    lines = linesFor(ctx, text, width);
    if (lines.length * actualSize * 1.24 <= maxHeight) break;
    actualSize -= 2;
  } while (actualSize > 12);
  const maxLines = Math.max(1, Math.floor(maxHeight / (actualSize * 1.24)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines.at(-1)!;
    while (ctx.measureText(last + '…').width > width && last.length) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * actualSize * 1.24));
  return lines.length * actualSize * 1.24;
}

export async function renderPoster(canvas: HTMLCanvasElement, poster: Poster, maxSide = 1440): Promise<void> {
  const image = await loadImage(poster.image);
  fontsReady ??= Promise.all([
    document.fonts.load('500 24px "Playfair Display"', 'Thiên nhiên'),
    ...[400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 24px "Be Vietnam Pro"`, 'Tinh dầu')),
  ]);
  await fontsReady;
  drawPoster(canvas, poster, image, maxSide);
}
export function drawPoster(canvas: HTMLCanvasElement, p: Poster, image: HTMLImageElement, maxSide = 1440) {
  const ratio = ratios.find(r => r.id === p.ratio)!;
  const outputScale = maxSide / Math.max(ratio.width, ratio.height);
  canvas.width = Math.round(ratio.width * outputScale); canvas.height = Math.round(ratio.height * outputScale);
  const ctx = canvas.getContext('2d')!;
  const W = ratio.width >= ratio.height ? ratio.width / ratio.height * 1080 : 1080;
  const H = ratio.height > ratio.width ? ratio.height / ratio.width * 1080 : 1080;
  ctx.scale(canvas.width / W, canvas.height / H);
  const theme = styles.find(s => s.id === p.style)!;
  const a = p.accent; const dark = p.style === 'luxury';
  const ink = dark ? '#f5ecdd' : a;
  const secondary = dark ? '#d0c8b9' : '#5c665f';
  const portrait = H > W * 1.15;
  const centered = p.style === 'minimal' || p.style === 'luxury' || portrait;
  const pad = W * .075;
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

  if (p.style === 'botanical') {
    circle(ctx, W * .76, H * .58, Math.min(W, H) * .34, '#d8dfc9');
    circle(ctx, W * .76, H * .58, Math.min(W, H) * .29, '#e2e7d6');
    ctx.strokeStyle = '#9eaf8b77'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(W * .76, H * .58, W * .37, H * .3, -.32, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 5; i++) leaf(ctx, W - 14 - i * 7, H * .28 + i * 66, 130 + i * 8, -.7 - i * .18, i % 2 ? '#b3c19d' : '#a4b690');
    leaf(ctx, -15, H * .9, 220, .7, '#c2cba9'); leaf(ctx, 34, H * .99, 180, 1.1, '#a5b98e');
    circle(ctx, W * .52, H * .18, 4, '#c1a376'); circle(ctx, W * .16, H * .78, 3, '#a8b493');
  } else if (p.style === 'minimal') {
    ctx.fillStyle = '#e3ded5'; ctx.fillRect(W * .21, H * .41, W * .58, H * .37);
    ctx.strokeStyle = '#cec7bc'; ctx.lineWidth = 1; ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  } else if (p.style === 'editorial') {
    ctx.fillStyle = '#e3c5ac'; ctx.fillRect(W * .55, 0, W * .45, H);
    ctx.fillStyle = '#b76f56'; ctx.fillRect(W * .57, H * .21, W * .35, H * .56);
    textBlock(ctx, 'THE EDIT', pad, H * .72, W * .6, H * .08, 75, '#9b443922', true);
  } else if (p.style === 'playful') {
    circle(ctx, W * .74, H * .56, W * .34, '#d4bbdf');
    circle(ctx, W * .15, H * .81, W * .09, '#edac83');
    star(ctx, W * .88, H * .2, 65, a); star(ctx, W * .47, H * .71, 28, a);
    ctx.strokeStyle = '#fff9'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(W * .7, H * .55, W * .38, .5, 2.4); ctx.stroke();
  } else if (p.style === 'luxury') {
    ctx.strokeStyle = a + '66'; ctx.lineWidth = 1; ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.beginPath(); ctx.ellipse(W / 2, H * .57, W * .29, H * .34, 0, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(W / 2, H * .57, 0, W / 2, H * .57, W * .5);
    g.addColorStop(0, '#b89c5126'); g.addColorStop(1, '#b89c5100'); ctx.fillStyle = g; ctx.fillRect(0, H * .3, W, H * .55);
  } else if (p.style === 'sale') {
    ctx.save(); ctx.translate(W * .75, H * .56); ctx.rotate(-.16); ctx.fillStyle = '#efb9a4'; ctx.fillRect(-W * .28, -H * .32, W * .56, H * .65); ctx.restore();
    star(ctx, W * .85, H * .18, 85, '#eabb67');
    ctx.strokeStyle = a + '30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pad, H * .72); ctx.lineTo(W * .45, H * .72); ctx.stroke();
  } else if (p.style === 'tech') {
    ctx.strokeStyle = '#3e4fa01a'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 70) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    circle(ctx, W * .76, H * .54, W * .3, '#c3cbe5');
    ctx.strokeStyle = a; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W * .76, H * .54, W * .34, -.5, 1.5); ctx.stroke();
  } else {
    ctx.fillStyle = '#d9c4a6'; ctx.beginPath(); ctx.roundRect(W * .47, H * .23, W * .45, H * .58, [W * .23, W * .23, 0, 0]); ctx.fill();
    for (let i = 0; i < 7; i++) { ctx.strokeStyle = '#b0977844'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(W * .97, H * .94, 130 + i * 16, Math.PI, Math.PI * 1.5); ctx.stroke(); }
  }

  const brandAlign = centered ? 'center' : 'left';
  textBlock(ctx, p.brand.toLocaleUpperCase('vi'), centered ? W / 2 : pad, H * .065, W * .6, 45, 22, ink, false, brandAlign, 600);
  if (p.badge) textBlock(ctx, p.badge.toLocaleUpperCase('vi'), centered ? W / 2 : pad, H * .13, W * .62, 48, 17, secondary, false, brandAlign, 500);
  const titleY = H * (centered ? .18 : .24);
  const titleWidth = W * (centered ? .81 : .49);
  textBlock(ctx, p.name || 'Tên sản phẩm', centered ? W / 2 : pad, titleY, titleWidth, H * (portrait ? .18 : centered ? .2 : .31), portrait ? 88 : centered ? 76 : 91, ink, p.style !== 'tech' && p.style !== 'sale' && p.style !== 'playful', brandAlign, p.style === 'playful' ? 700 : 500);

  const box = centered
    ? { x: W * .23, y: H * (portrait ? .37 : .37), w: W * .54, h: H * (portrait ? .41 : .39) }
    : { x: W * .46, y: H * .24, w: W * .49, h: H * .56 };
  const imageFit = Math.min(box.w / image.naturalWidth, box.h / image.naturalHeight) * p.imageScale;
  const iw = image.naturalWidth * imageFit, ih = image.naturalHeight * imageFit;
  const cx = box.x + box.w / 2 + p.imageX * W / 100;
  const cy = box.y + box.h / 2 + p.imageY * H / 100;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(p.rotation * Math.PI / 180);
  if (p.shadow) { ctx.shadowColor = '#122c2540'; ctx.shadowBlur = 26; ctx.shadowOffsetX = 14; ctx.shadowOffsetY = 24; }
  ctx.drawImage(image, -iw / 2, -ih / 2, iw, ih); ctx.restore();

  const descY = centered ? H * .79 : H * .615;
  const descWidth = W * (centered ? .79 : .39);
  textBlock(ctx, p.description, centered ? W / 2 : pad, descY, descWidth, H * (centered ? .075 : .12), 23, secondary, false, brandAlign, 400);
  if (p.price) textBlock(ctx, p.price, centered ? W / 2 : pad, H * (centered ? .873 : .81), W * .5, 40, 28, ink, false, brandAlign, 600);
  if (p.cta) {
    ctx.font = '500 20px "Be Vietnam Pro", sans-serif';
    const ctaWidth = Math.max(180, ctx.measureText(p.cta).width + 65);
    const x = centered ? (W - ctaWidth) / 2 : W - pad - ctaWidth;
    const y = H * .925;
    ctx.fillStyle = a; ctx.beginPath(); ctx.roundRect(x, y, ctaWidth, 51, 26); ctx.fill();
    // Choose button text from actual accent brightness, including user-supplied colors.
    const rgb = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const luminance = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114;
    textBlock(ctx, p.cta, x + ctaWidth / 2, y + 13, ctaWidth - 24, 30, 20, luminance > 160 ? '#1e3028' : '#fffdf6', false, 'center');
  }
  ctx.fillStyle = dark ? '#ffffff1a' : '#3c5c4a1a'; ctx.fillRect(pad, H * .975, W - pad * 2, 1);
}

export async function exportPoster(poster: Poster, format: 'png' | 'jpeg', multiplier: number) {
  const ratio = ratios.find(r => r.id === poster.ratio)!;
  const canvas = document.createElement('canvas');
  await renderPoster(canvas, poster, Math.max(ratio.width, ratio.height) * multiplier);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Xuất ảnh thất bại.')), `image/${format}`, .96));
}
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
