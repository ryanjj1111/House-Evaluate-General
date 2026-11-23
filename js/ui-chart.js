// 房屋試算｜主圖表：三種圖、範圍、點圖例開關線、⚙️ 顯示項目、📌 固定。只管畫面，資料來自 R（ui-loan.js）。
// 在 🔑 出租頁會用橘色虛線疊上「出租後」的貸款。顏色是 CSS 變數名稱（index.html），亮色／暗色各一組。
const LINES = [
 // [key, 名稱, 顏色, 樣式, 出現在哪些圖]
 ['bal', '剩餘本金', 'c2', '', 'bal'],
 ['rate', '利率', 'c3', '', 'bal'],
 ['prin', '本金', 'c5', '', 'pay yr'],
 ['int', '利息', 'c1', '', 'pay yr'],
 ['exM', '每月多還', 'c3', '', 'pay'],
 ['extra', '提前還款', 'c3', '', 'yr'],
 ['rBal', '出租後剩餘本金', 'bad', 'dash', 'bal rent'],
 ['rRate', '出租後利率', 'badt', 'dash', 'bal rent'],
 ['rPay', '出租後月付', 'bad', 'dash', 'pay rent'],
 ['mPre', '提前還款標記', 'c5', 'dot', 'bal pay'],
 ['mRent', '開始出租標記', 'bad', 'dot', 'bal pay rent'],
 ['today', '今天線', 'pri', 'dash', 'bal pay yr']
];
const lineOn = k => !V().hide[k];
const LC = Object.fromEntries(LINES.map(l => [l[0], l[2]]));
const lgI = (c0, t) => { const c = thV(c0); return `<i style="background:${t === 'dash' ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c};${t === 'dot' ? 'height:8px;width:8px;border-radius:50%' : ''}"></i>`; };

// 範圍：起點（撥款日或今天前 1 年）＋長度（5／10／自訂 N 年／全部）
function rangeRows(rows) {
 const v = V();
 if (v.rng === 'all' || !rows.length) return rows;
 const n = (v.rng === 'n' ? Math.max(1, Math.min(40, +v.rngN || 1)) : +v.rng) * 12;
 let p0 = v.from === 'now' ? YM.p(NOW) - 12 : YM.p(rows[0].ym);
 const pEnd = YM.p(rows[rows.length - 1].ym);
 if (p0 + n - 1 > pEnd) p0 = Math.max(YM.p(rows[0].ym), pEnd - n + 1);
 const A = rows.filter(x => YM.p(x.ym) >= p0 && YM.p(x.ym) < p0 + n);
 return A.length ? A : rows;
}

function drawMain() {
 if (!R) return;
 const cv = $('cv'), mode = V().cv, cvi = $('cvi'), lg = $('lg');
 if (!cv.getBoundingClientRect().width) return;   // 圖表收起來時不畫
 const A = rangeRows(R.rows), xl = s => s.slice(2, 4) + '/' + s.slice(5);
 const nowI = lineOn('today') ? A.findIndex(x => x.ym === NOW) : -1;
 const preM = new Set(S.loan.pre.map(x => x.ym));
 // 出租情境
 let RM = null, rs = null;
 if (V().tab === 'R') {
  const D = rentS(); rs = rentStart(D);
  const RA = rentRows(D);
  if (RA !== schedule(D.loan)) { RM = new Map(); for (const x of RA) RM.set(x.ym, x); }
 }
 const rv = (x, k) => { if (!RM || YM.p(x.ym) < YM.p(rs)) return null; const y = RM.get(x.ym); return y ? y[k] : 0; };
 const avail = new Set(LINES.filter(([k, , , , m]) => m.split(' ').includes(mode) && (!m.includes('rent') || (V().tab === 'R' && (k === 'mRent' || RM)))).map(l => l[0]));
 if (mode === 'pay' && !(+S.loan.extra.amt > 0)) avail.delete('exM');
 if (!S.loan.pre.length) { avail.delete('mPre'); if (mode === 'yr') avail.delete('extra'); }
 const on = k => avail.has(k) && lineOn(k);

 const marks = [];
 if (on('mPre')) A.forEach((x, i) => { if (preM.has(x.ym)) marks.push({ i, color: LC.mPre }); });
 if (on('mRent') && rs) { const i = A.findIndex(x => x.ym === rs); if (i >= 0) marks.push({ i, color: LC.mRent }); }

 let spec;
 if (mode === 'yr') {
  const Y = byYear(A);
  const info = i => { if (i < 0) { cvi.textContent = '按住圖表左右拖動，看每一年的本金與利息'; return; } const y = Y[i]; cvi.innerHTML = `<b>${y.y}</b>｜本金 ${w1(y.prin)} 萬｜利息 ${w1(y.int)} 萬${y.extra ? `｜提前還 ${w1(y.extra)} 萬` : ''}｜年底餘額 ${w1(y.bal)} 萬`; };
  const ser = [];
  if (on('prin')) ser.push({ name: '本金', color: LC.prin, type: 'bar', stack: 1, data: Y.map(y => y.prin / 1e4) });
  if (on('int')) ser.push({ name: '利息', color: LC.int, type: 'bar', stack: 1, data: Y.map(y => y.int / 1e4) });
  if (on('extra')) ser.push({ name: '提前還款', color: LC.extra, type: 'bar', stack: 1, data: Y.map(y => y.extra / 1e4) });
  spec = { x: Y.map(y => y.y), xl: s => s, series: ser, fmtL: v => v + '萬', now: on('today') ? Y.findIndex(y => y.y === NOW.slice(0, 4)) : -1, onHover: info };
  drawChart(cv, spec); info(-1);
 } else {
  const info = i => {
   if (i < 0) { const c = R.sm.cur; cvi.innerHTML = c ? `今天 ${ymTxt(c.ym)}｜剩餘本金 ${w1(R.sm.balNow)} 萬｜利率 ${pc(c.r)}｜月付 ${f0(c.base)} 元（本金 ${f0(c.prin)}＋利息 ${f0(c.int)}）` : '按住圖表左右拖動看每個月的數值'; return; }
   const x = A[i], rr = RM && rv(x, 'r') != null ? RM.get(x.ym) : null;
   cvi.innerHTML = `<b>${ymTxt(x.ym)}</b>｜餘額 ${w1(x.bal)} 萬｜利率 ${pc(x.r)}｜月付 ${f0(x.base)} 元（本金 ${f0(x.prin)}＋利息 ${f0(x.int)}）${x.ex1 ? `｜每月多還 ${f0(x.ex1)}` : ''}${x.pre1 ? `｜提前還 ${f0(x.pre1)}` : ''}${x.grace ? '｜寬限期' : ''}` +
    (rr ? `<span style="color:var(--bad)">｜出租後：利率 ${pc(rr.r)}、月付 ${f0(rr.base)} 元、餘額 ${w1(rr.bal)} 萬</span>` : '');
  };
  const ser = [];
  if (mode === 'pay') {
   if (on('prin')) ser.push({ name: '本金', color: LC.prin, type: 'area', stack: 1, data: A.map(x => x.prin) });
   if (on('int')) ser.push({ name: '利息', color: LC.int, type: 'area', stack: 1, data: A.map(x => x.int) });
   if (on('exM')) ser.push({ name: '每月多還', color: LC.exM, type: 'area', stack: 1, data: A.map(x => x.ex1 || 0) });
   if (on('rPay')) ser.push({ name: '出租後月付', color: LC.rPay, type: 'step', dash: [5, 4], data: A.map(x => rv(x, 'base')) });
   spec = { x: A.map(x => x.ym), xl, series: ser, fmtL: v => (v / 1e4).toFixed(1) + '萬', now: nowI, marks, onHover: info };
  } else {
   if (on('bal')) ser.push({ name: '剩餘本金', color: LC.bal, type: 'area', data: A.map(x => x.bal / 1e4) });
   if (on('rBal')) ser.push({ name: '出租後剩餘本金', color: LC.rBal, type: 'line', dash: [5, 4], width: 1.5, data: A.map(x => { const b = rv(x, 'bal'); return b == null ? null : b / 1e4; }) });
   if (on('rate')) ser.push({ name: '利率', color: LC.rate, type: 'step', axis: 'R', data: A.map(x => x.r) });
   if (on('rRate')) ser.push({ name: '出租後利率', color: LC.rRate, type: 'step', axis: 'R', dash: [5, 4], data: A.map(x => rv(x, 'r')) });
   spec = { x: A.map(x => x.ym), xl, series: ser, fmtL: v => v + '萬', fmtR: v => v.toFixed(2) + '%', now: nowI, marks, onHover: info };
  }
  drawChart(cv, spec); info(-1);
 }
 // 圖例：點一下開關這條線
 lg.innerHTML = LINES.filter(([k]) => avail.has(k)).map(([k, n, c, t]) => `<span data-lg="${k}" class="${lineOn(k) ? '' : 'off'}" title="點一下開關">${lgI(c, t)}${n}</span>`).join('') +
  (V().tab === 'R' && !RM ? '<div class="h">（出租後利率沒有變化，所以沒有橘色虛線）</div>' : '');
}

// ---------- 控制列
function setCv(v) { V().cv = v; save(); segOn('cvSeg', 'v', v); drawMain(); }
function setRng(v) { V().rng = v; save(); applyRng(); drawMain(); }
function applyRng() { segOn('rngSeg', 'r', V().rng); $('rngNw').style.display = V().rng === 'n' ? 'flex' : 'none'; }
function tgPin() { V().pin = V().pin ? 0 : 1; save(); applyPin(); requestAnimationFrame(drawMain); }
function applyPin() { $('chp').classList.toggle('pin', !!V().pin); $('pinB').classList.toggle('on', !!V().pin); }
function tgGear() { const g = $('gearp'), op = g.style.display === 'none'; g.style.display = op ? 'block' : 'none'; $('gearB').classList.toggle('on', op); if (op) buildGear(); }
function buildGear() {
 const ck = (k, n) => `<label class="ck"><input type="checkbox" data-h="${k}" ${V().hide[k] ? '' : 'checked'}>${n}</label>`;
 $('gearp').innerHTML = `<div class="h">重點卡</div><div class="tg">${CARDS.map(([k, n]) => ck(k, n)).join('')}</div>
  <div class="h" style="margin-top:6px">圖表線</div><div class="tg">${LINES.map(([k, n]) => ck(k, n)).join('')}</div>
  <div class="h" style="margin-top:6px">範圍起點</div><div class="seg" id="fromSeg"><button data-f="disb" onclick="setFrom('disb')">撥款日</button><button data-f="now" onclick="setFrom('now')">今天前 1 年</button></div>
  <div class="h" style="margin-top:6px">出租相關的線只在 🔑 出租頁顯示；也可以直接點圖例開關線。</div>`;
 segOn('fromSeg', 'f', V().from);
}
function setFrom(f) { V().from = f; save(); segOn('fromSeg', 'f', f); drawMain(); }
function toggleHide(k, show) { if (show) delete V().hide[k]; else V().hide[k] = 1; save(); }
document.addEventListener('change', e => {
 const k = e.target.dataset && e.target.dataset.h; if (!k) return;
 toggleHide(k, e.target.checked);
 if (k.startsWith('c_')) calcLoan(); else drawMain();
});
document.addEventListener('click', e => {
 const s = e.target.closest && e.target.closest('[data-lg]'); if (!s) return;
 const k = s.dataset.lg; toggleHide(k, !!V().hide[k]);
 document.querySelectorAll(`[data-h="${k}"]`).forEach(c => c.checked = !V().hide[k]);
 drawMain();
});
