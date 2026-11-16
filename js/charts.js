// 房屋試算｜圖表（canvas，自己畫，不用外部套件）。只管畫面，不碰計算。
// drawChart(canvas, spec, hoverIndex)
// spec = { x:[標籤], series:[{name, color, data:[數字|null], axis:'L'|'R', type:'line'|'step'|'area'|'bar', stack, dash}],
//          fmtL, fmtR, marks:[{i, color, label}], now:索引, onHover(i) }
const CH = { spec: null, hover: -1 };

function niceRange(lo, hi, ticks = 4) {
 if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, step: 0.25 };
 if (lo === hi) { hi = lo + 1; lo = Math.max(0, lo - 1); }
 const raw = (hi - lo) / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
 const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
 return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

function drawChart(cv, spec, hi = -1) {
 CH.spec = spec; CH.hover = hi;
 const dpr = window.devicePixelRatio || 1, rc = cv.getBoundingClientRect();
 if (!rc.width) return;
 cv.width = rc.width * dpr; cv.height = rc.height * dpr;
 const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
 const W = rc.width, H = rc.height, hasR = spec.series.some(s => s.axis === 'R');
 const pad = { t: 10, r: hasR ? 40 : 10, b: 20, l: 44 }, cw = W - pad.l - pad.r, chh = H - pad.t - pad.b, N = spec.x.length;
 c.clearRect(0, 0, W, H); c.font = '10px -apple-system,"Noto Sans TC",sans-serif';
 if (!N) return;
 const bars = spec.series.filter(s => s.type === 'bar'), isBar = bars.length > 0;
 const xAt = i => pad.l + (isBar ? (i + 0.5) * cw / N : (N === 1 ? cw / 2 : i * cw / (N - 1)));
 // 軸範圍
 const rng = ax => {
  let lo = Infinity, hi2 = -Infinity;
  const S = spec.series.filter(s => (s.axis || 'L') === ax);
  if (!S.length) return null;
  if (S.some(s => s.stack)) { for (let i = 0; i < N; i++) { const t = S.filter(s => s.stack).reduce((a, s) => a + (s.data[i] || 0), 0); hi2 = Math.max(hi2, t); } lo = 0; }
  for (const s of S) for (const v of s.data) if (v != null && Number.isFinite(v)) { lo = Math.min(lo, v); hi2 = Math.max(hi2, v); }
  if (S.some(s => s.type === 'area' || s.type === 'bar' || s.zero)) lo = Math.min(lo, 0);
  return niceRange(lo, hi2);
 };
 const RL = rng('L'), RR = rng('R');
 const yL = v => pad.t + chh - (v - RL.lo) / (RL.hi - RL.lo) * chh;
 const yR = v => pad.t + chh - (v - RR.lo) / (RR.hi - RR.lo) * chh;
 // 格線與刻度
 c.strokeStyle = '#e2e8f0'; c.lineWidth = 1; c.fillStyle = '#94a3b8'; c.textAlign = 'right';
 for (let v = RL.lo; v <= RL.hi + 1e-9; v += RL.step) {
  const y = yL(v); c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke();
  c.fillText(spec.fmtL ? spec.fmtL(v) : String(v), pad.l - 4, y + 3);
 }
 if (RR) { c.textAlign = 'left'; for (let v = RR.lo; v <= RR.hi + 1e-9; v += RR.step) c.fillText(spec.fmtR ? spec.fmtR(v) : String(v), W - pad.r + 4, yR(v) + 3); }
 // x 標籤：大約 6 個
 c.textAlign = 'center'; c.fillStyle = '#94a3b8';
 const every = Math.max(1, Math.ceil(N / 6));
 for (let i = 0; i < N; i += every) c.fillText(spec.xl ? spec.xl(spec.x[i], i) : spec.x[i], Math.min(Math.max(xAt(i), pad.l + 14), W - pad.r - 14), H - 5);
 // 今天
 if (spec.now != null && spec.now >= 0 && spec.now < N) {
  const x = xAt(spec.now); c.strokeStyle = '#0f766e'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, pad.t + chh); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#0f766e'; c.textAlign = 'left'; c.fillText('今天', x + 3, pad.t + 9);
 }
 // 長條（可堆疊）
 if (isBar) {
  const bw = Math.max(2, cw / N * 0.7), base = new Array(N).fill(0);
  for (const s of bars) {
   c.fillStyle = s.color;
   for (let i = 0; i < N; i++) {
    const v = s.data[i] || 0, b0 = s.stack ? base[i] : 0, y1 = yL(b0 + v), y0 = yL(b0);
    c.globalAlpha = hi >= 0 && hi !== i ? 0.55 : 1; c.fillRect(xAt(i) - bw / 2, y1, bw, y0 - y1);
    if (s.stack) base[i] += v;
   }
   c.globalAlpha = 1;
  }
 }
 // 線
 for (const s of spec.series.filter(s => s.type !== 'bar')) {
  const y = s.axis === 'R' ? yR : yL;
  c.strokeStyle = s.color; c.lineWidth = s.width || 2; c.setLineDash(s.dash || []);
  c.beginPath(); let started = false, px = 0, py = 0;
  for (let i = 0; i < N; i++) {
   const v = s.data[i]; if (v == null || !Number.isFinite(v)) { started = false; continue; }
   const X = xAt(i), Y = y(v);
   if (!started) { c.moveTo(X, Y); started = true; } else if (s.type === 'step') { c.lineTo(X, py); c.lineTo(X, Y); } else c.lineTo(X, Y);
   px = X; py = Y;
  }
  c.stroke(); c.setLineDash([]);
  if (s.type === 'area') {
   c.lineTo(px, y(Math.max(0, RL.lo))); c.lineTo(xAt(s.data.findIndex(v => v != null)), y(Math.max(0, RL.lo))); c.closePath();
   c.globalAlpha = 0.12; c.fillStyle = s.color; c.fill(); c.globalAlpha = 1;
  }
 }
 // 事件標記
 for (const m of spec.marks || []) {
  if (m.i < 0 || m.i >= N) continue;
  const x = xAt(m.i); c.fillStyle = m.color || '#7c3aed';
  c.beginPath(); c.moveTo(x, pad.t + chh); c.lineTo(x - 5, pad.t + chh + 8); c.lineTo(x + 5, pad.t + chh + 8); c.closePath(); c.fill();
 }
 // 滑過的位置
 if (hi >= 0 && hi < N) {
  const x = xAt(hi); c.strokeStyle = '#334155'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, pad.t + chh); c.stroke();
  for (const s of spec.series.filter(s => s.type !== 'bar')) {
   const v = s.data[hi]; if (v == null) continue;
   c.fillStyle = s.color; c.beginPath(); c.arc(x, (s.axis === 'R' ? yR : yL)(v), 3.5, 0, 7); c.fill();
  }
 }
 CH.geo = { pad, cw, N, isBar, W };
}

// 觸控／滑鼠：找最近的索引，交給 spec.onHover
function chartBind(cv) {
 const pick = ev => {
  const g = CH.geo, s = CH.spec; if (!g || !s) return;
  const rc = cv.getBoundingClientRect(), pt = ev.touches ? ev.touches[0] : ev, x = pt.clientX - rc.left;
  let i = g.isBar ? Math.floor((x - g.pad.l) / (g.cw / g.N)) : Math.round((x - g.pad.l) / (g.cw / Math.max(1, g.N - 1)));
  i = Math.max(0, Math.min(g.N - 1, i));
  if (i !== CH.hover) { drawChart(cv, s, i); if (s.onHover) s.onHover(i); }
 };
 cv.addEventListener('mousemove', pick); cv.addEventListener('touchstart', pick, { passive: true }); cv.addEventListener('touchmove', pick, { passive: true });
 cv.addEventListener('mouseleave', () => { if (CH.spec) { drawChart(cv, CH.spec, -1); if (CH.spec.onHover) CH.spec.onHover(-1); } });
}
