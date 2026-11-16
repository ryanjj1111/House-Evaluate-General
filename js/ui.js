// 房屋試算｜畫面（輸入、輸出、儲存）。計算都在 engine.js。
// 資料：「示範資料」是虛構的，修改不會儲存；「我的資料」只存在這個瀏覽器（localStorage），可匯出／匯入 JSON。
const KEY = 'hc-v1';
const DEMO = {
 v: 1, name: '示範房屋（虛構）',
 loan: { amt: 800, disb: '2024-03-15', yrs: 30, grace: 24, method: 'pi', first: '', amStart: '', amN: '',
  rateMode: 'qingan', qa: { sub: 1.775, base: '' }, ladder: [{ from: '2024-03', r: 2.185 }, { from: '2025-03', r: 2.385 }],
  pre: [], extra: { amt: 0, from: '' } },
 stressBp: 75
};
const clone = o => JSON.parse(JSON.stringify(o));
const NOW = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
let ST = { src: 'demo', mine: null, ui: { tab: 'L', cv: 'bal', rng: '10', pin: 0, open: {} } };
let S = clone(DEMO), demoEdit = null;

// ---------- 格式
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f0 = v => Math.round(v || 0).toLocaleString('zh-TW');
const w1 = v => (Math.round((v || 0) / 1e3) / 10).toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pc = v => (+v || 0).toFixed(3).replace(/0$/, '') + '%';
const ymTxt = s => s ? s.replace('-', '/') : '—';
const dur = m => { m = Math.max(0, m | 0); const y = Math.floor(m / 12), r = m % 12; return (y ? y + ' 年' : '') + (r ? (y ? ' ' : '') + r + ' 個月' : (y ? '' : '0 個月')); };
function toast(t) { const e = document.getElementById('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 2600); }

// ---------- 儲存
function load() {
 try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) ST = { ...ST, ...o, ui: { ...ST.ui, ...(o.ui || {}) } }; } catch (e) { }
 S = ST.src === 'mine' && ST.mine ? ST.mine : (demoEdit || clone(DEMO));
}
function save() {
 if (ST.src === 'mine') ST.mine = S; else demoEdit = S;
 try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { }
}
function setSrc(s) {
 if (s === 'mine' && !ST.mine) { ST.mine = clone(DEMO); ST.mine.name = '我的房子'; toast('已用示範值當起點，請改成你的數字'); }
 ST.src = s; S = s === 'mine' ? ST.mine : (demoEdit || clone(DEMO)); save(); build();
}

// ---------- 路徑讀寫（'loan.qa.sub'、'loan.pre.0.amt'）
function getP(path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], S); }
function setP(path, v) { const ks = path.split('.'), last = ks.pop(); let o = S; for (const k of ks) { if (o[k] == null) o[k] = {}; o = o[k]; } o[last] = v; }

// ---------- 輸入欄位
function fld(path, label, o = {}) {
 const v = getP(path), t = o.type || 'number';
 return `<label><span class="lt">${esc(label)}${o.tip ? tipI(o.tip, label) : ''}</span><input type="${t}" data-p="${path}" data-t="${t}" value="${esc(v ?? '')}"${o.step ? ` step="${o.step}"` : ''}${o.min != null ? ` min="${o.min}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${t === 'number' ? ' inputmode="decimal"' : ''}></label>`;
}
function sel(path, label, opts, tip) {
 const v = getP(path);
 return `<label><span class="lt">${esc(label)}${tip ? tipI(tip, label) : ''}</span><select data-p="${path}" data-t="sel" data-rb="1">${opts.map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
}
function onField(e) {
 const el = e.target; if (!el.dataset || !el.dataset.p) return;
 const t = el.dataset.t; let v = el.value;
 if (t === 'number') v = v === '' ? '' : +v;
 setP(el.dataset.p, v); save();
 if (el.dataset.rb) buildInputs();
 clearTimeout(onField.t); onField.t = setTimeout(calc, e.type === 'input' ? 250 : 0);
}

function buildInputs() {
 const L = S.loan;
 document.getElementById('loanIn').innerHTML = `<div class="g" style="margin-top:6px">
  ${fld('loan.amt', '貸款金額（萬元）', { step: 1, min: 0 })}
  ${fld('loan.disb', '撥款日', { type: 'date' })}
  ${fld('loan.yrs', '貸款年限（年）', { step: 1, min: 1 })}
  ${fld('loan.grace', '寬限期（期數，月）', { step: 1, min: 0, tip: '只繳利息、不還本金的期數。3 年＝36 期；沒有寬限期填 0。' })}
  ${sel('loan.method', '還款方式', [['pi', '本息平均攤還'], ['pp', '本金平均攤還']], '本息均攤：每月金額固定（利率變動時重算）。本金均攤：每月還一樣多的本金，前期月付較高、總利息較少。')}
 </div>
 <details style="margin-top:6px"><summary style="font-weight:600;font-size:12.5px">進階：對齊銀行實際扣款</summary>
  <div class="g3">${fld('loan.first', '首期繳款月', { type: 'month' })}${fld('loan.amStart', '首次本息月', { type: 'month' })}${fld('loan.amN', '本息期數', { step: 1, min: 1 })}</div>
  <div class="h" style="margin-top:4px">通常留空。銀行的第一次本息扣款月份或期數和這裡算的不同時再填，例如：首次本息月 2026-10、本息期數 324。</div></details>
 <div class="h" id="loanInfo" style="margin-top:6px"></div>`;

 const q = L.rateMode === 'qingan';
 let r = `<div style="margin-top:6px">${sel('loan.rateMode', '利率方案', [['qingan', '新青安（補貼逐年遞減）'], ['custom', '自訂多段利率']])}</div>`;
 if (q) r += `<div class="g" style="margin-top:6px">${fld('loan.qa.sub', '補貼後利率（%）', { step: 0.005, tip: '前 3 年的實際利率，例如 1.775%。' })}${fld('loan.qa.base', '原利率（%，可留空）', { step: 0.005, ph: '補貼後＋0.5', tip: '補貼完全結束後的利率。留空時用「補貼後利率＋0.5%」估計（補貼合計 2 碼）。實際原利率會隨基準利率變動，以銀行通知為準。' })}</div>`;
 else {
  r += `<div class="row r-lad h" style="margin-top:6px"><span>起始年月</span><span>年利率（%）</span><span></span></div>` +
   (L.ladder || []).map((x, i) => `<div class="row r-lad"><input type="month" data-p="loan.ladder.${i}.from" data-t="month" value="${esc(x.from)}"><input type="number" step="0.005" inputmode="decimal" data-p="loan.ladder.${i}.r" data-t="number" value="${esc(x.r)}"><button onclick="delRow('loan.ladder',${i})" aria-label="刪除">🗑</button></div>`).join('') +
   `<button onclick="addRow('loan.ladder')">＋新增一段</button>`;
 }
 r += `<div class="lad" id="ladChips"></div>`;
 document.getElementById('rateIn').innerHTML = r;

 document.getElementById('preIn').innerHTML = `<div class="sub">一次提前還款</div>` +
  ((L.pre || []).length ? `<div class="row r-pre h"><span>年月</span><span>金額（萬）</span><span>方式</span><span></span></div>` : '') +
  (L.pre || []).map((x, i) => `<div class="row r-pre"><input type="month" data-p="loan.pre.${i}.ym" data-t="month" value="${esc(x.ym)}"><input type="number" step="1" min="0" inputmode="decimal" data-p="loan.pre.${i}.amt" data-t="number" value="${esc(x.amt)}"><select data-p="loan.pre.${i}.mode" data-t="sel"><option value="term"${x.mode !== 'pay' ? ' selected' : ''}>縮短年限</option><option value="pay"${x.mode === 'pay' ? ' selected' : ''}>降低月付</option></select><button onclick="delRow('loan.pre',${i})" aria-label="刪除">🗑</button></div>`).join('') +
  `<button onclick="addRow('loan.pre')">＋新增一筆</button>
  <div class="sub">每月多還本金</div><div class="g">${fld('loan.extra.amt', '每月多還（元）', { step: 1000, min: 0 })}${fld('loan.extra.from', '從哪個月開始', { type: 'month' })}</div>`;

 document.getElementById('stIn').innerHTML = `<div class="g" style="margin:6px 0">${fld('stressBp', '自訂升息（基點，1 碼＝25）', { step: 25, min: 0 })}<div></div></div>`;
}
function addRow(path) {
 const A = getP(path) || []; const L = S.loan;
 if (path === 'loan.ladder') A.push({ from: A.length ? YM.add(A[A.length - 1].from, 12) : String(L.disb).slice(0, 7), r: A.length ? A[A.length - 1].r : 2 });
 else A.push({ ym: YM.add(NOW, 6), amt: 50, mode: 'term' });
 setP(path, A); save(); buildInputs(); calc();
}
function delRow(path, i) { const A = getP(path) || []; A.splice(i, 1); setP(path, A); save(); buildInputs(); calc(); }

// ---------- 計算與輸出
let R = null;
function calc() {
 const L = S.loan;
 if (!(+L.amt > 0) || !YM.ok(L.disb)) { document.getElementById('verdict').textContent = '請先填寫貸款金額與撥款日。'; return; }
 const sm = loanSummary(L, NOW), T = sm.T, rows = sm.rows, ladder = loanLadder(L);
 const pe = ((L.pre || []).some(x => +x.amt > 0) || +(L.extra && L.extra.amt) > 0) ? prepayEffect(L, NOW) : null;
 R = { sm, T, rows, ladder, pe };
 const cur = sm.cur, past = rows.filter(x => YM.p(x.ym) < YM.p(NOW)).length;

 // 期數說明
 document.getElementById('loanInfo').innerHTML = `首期 ${ymTxt(T.first)}｜寬限期繳息 ${T.graceN} 期｜本息 ${T.amN} 期（${ymTxt(T.amStart)} 起）｜到期 ${ymTxt(T.last)}`;
 // 利率階梯小標籤
 const lc = document.getElementById('ladChips');
 if (lc) lc.innerHTML = ladder.slice().sort((a, b) => YM.p(a.from) - YM.p(b.from)).map((x, i, A) => {
  const on = YM.p(x.from) <= YM.p(NOW) && (!A[i + 1] || YM.p(A[i + 1].from) > YM.p(NOW));
  return `<span class="${on ? 'now' : ''}">${ymTxt(x.from)} 起 ${pc(x.r)}</span>`;
 }).join('');

 // 未來利率變化
 const chg = [];
 for (let i = 1; i < rows.length; i++) if (rows[i].r !== rows[i - 1].r && YM.p(rows[i].ym) >= YM.p(NOW)) chg.push(rows[i]);
 const grEnd = rows.find(x => !x.grace), inGrace = cur && cur.grace;

 // 結論文字
 let v = '';
 if (!cur) v = `這筆貸款已在 ${ymTxt(sm.payoff)} 還清。`;
 else {
  v = `<b>本月（${ymTxt(cur.ym)}）月付 ${f0(cur.base)} 元</b>，利率 ${pc(cur.r)}${inGrace ? '（寬限期，只繳利息）' : ''}。`;
  if (inGrace && grEnd) v += `寬限期到 ${ymTxt(YM.add(grEnd.ym, -1))}，<b>${ymTxt(grEnd.ym)} 起月付變成約 ${f0(grEnd.base)} 元</b>（每月多 ${f0(grEnd.base - cur.base)} 元）。`;
  const ch2 = chg.filter(x => !(inGrace && grEnd && x.ym === grEnd.ym)).slice(0, 3);
  if (ch2.length) v += '之後利率：' + ch2.map(x => `${ymTxt(x.ym)} 起 ${pc(x.r)}（約 ${f0(x.base)} 元）`).join('、') + '。';
  v += `剩餘本金 ${w1(sm.balNow)} 萬，預計 ${ymTxt(sm.payoff)} 還清，未來還要付利息約 ${w1(sm.intFuture)} 萬。`;
 }
 document.getElementById('verdict').innerHTML = v;

 // 重點卡
 const nx = chg[0];
 const card = (t, b, s, tip) => `<div class="c"><small>${t}${tip ? tipI(tip, t) : ''}</small><b>${b}</b>${s ? `<span class="sub2">${s}</span>` : ''}</div>`;
 const left = cur ? YM.diff(NOW, sm.payoff) + 1 : 0;
 document.getElementById('cards').innerHTML =
  card('本月月付', cur ? f0(cur.base) + ' 元' : '—', cur ? `利率 ${pc(cur.r)}${cur.grace ? '・寬限期' : ''}` : '', '本月應繳的本金＋利息，不含提前還款。') +
  card('剩餘本金', w1(sm.balNow) + ' 萬', `已還 ${((1 - sm.balNow / (L.amt * 1e4)) * 100).toFixed(1)}%`, '到上個月為止的剩餘本金（推算值），可以和銀行對帳單比對。') +
  card('下次利率調整', nx ? ymTxt(nx.ym) : '—', nx ? `${pc(nx.r)}・月付約 ${f0(nx.base)} 元` : '目前沒有排定', '依「利率」設定的階梯推算；機動利率還會隨央行升降息變動。') +
  card('預計還清', ymTxt(sm.payoff), cur ? `還有 ${dur(left)}` : '', pe ? '已含提前還款的效果。' : '') +
  card('未來利息', w1(sm.intFuture) + ' 萬', `全期利息 ${w1(sm.intTotal)} 萬`, '從本月起到還清，還要付的利息總額（以目前的利率設定推算）。') +
  card('寬限期', grEnd ? (inGrace ? `剩 ${YM.diff(NOW, grEnd.ym)} 期` : '已結束') : '—', grEnd ? `${ymTxt(grEnd.ym)} 起本息攤還` : '', '寬限期只繳利息；結束後要在剩下的年限內還完全部本金，月付會跳升。');

 // 提醒
 const al = [];
 if (L.rateMode === 'qingan' && (L.qa.base === '' || L.qa.base == null)) al.push(['b', `ℹ️ 原利率留空，先用補貼後利率＋0.5%（${pc(+L.qa.sub + 0.5)}）估計補貼結束後的利率；可以向銀行確認後填入。`]);
 if (inGrace && grEnd && YM.diff(NOW, grEnd.ym) <= 12) al.push(['y', `⚠️ 寬限期再 ${YM.diff(NOW, grEnd.ym)} 個月結束，月付會從 ${f0(cur.base)} 元增加到約 ${f0(grEnd.base)} 元，請先準備好現金流。`]);
 const n12 = chg.filter(x => YM.diff(NOW, x.ym) <= 12 && x.r > (cur ? cur.r : 0));
 if (cur && !inGrace && n12.length) al.push(['y', `⏳ ${ymTxt(n12[0].ym)} 利率調為 ${pc(n12[0].r)}，月付約增加 ${f0(n12[0].base - cur.base)} 元。`]);
 document.getElementById('alerts').innerHTML = al.map(([c, t]) => `<div class="hl ${c}">${t}</div>`).join('');

 // 提前還款結果
 document.getElementById('preOut').innerHTML = pe ? `<div class="hl g">✅ 省下利息約 <b>${w1(pe.saved)} 萬</b>，${pe.months > 0 ? `提早 <b>${dur(pe.months)}</b> 還清（${ymTxt(pe.payoff0)} → ${ymTxt(pe.payoff)}）` : `還款年限不變（${ymTxt(pe.payoff)} 還清），之後月付降低`}。</div>`
  : `<div class="h" style="margin-top:6px">新增一筆試試看：例如明年拿 50 萬提前還款，可以省多少利息。</div>`;

 // 升息壓力
 const bps = [25, 50]; if (+S.stressBp > 0 && !bps.includes(+S.stressBp)) bps.push(+S.stressBp);
 const ss = cur ? stress(L, NOW, bps) : [];
 document.getElementById('stT').innerHTML = cur ? `<tr><th>情境</th><th>本月起月付</th><th>每月增加</th><th>未來利息增加</th></tr><tr><td>目前利率</td><td>${f0(cur.base)}</td><td>—</td><td>—</td></tr>` +
  ss.map(x => `<tr><td>升息 ${x.bp % 25 === 0 ? x.bp / 25 + ' 碼' : x.bp + ' 基點'}</td><td>${f0(x.pay)}</td><td class="bad">+${f0(x.dPay)}</td><td class="bad">+${w1(x.dInt)} 萬</td></tr>`).join('') : '';

 buildTable(); drawMain();
 document.getElementById('srcNote').innerHTML = ST.src === 'demo' ? '目前是<b>示範資料</b>（虛構）。修改不會儲存；切到「我的資料」才會保存在這個瀏覽器。' : `<b>我的資料</b>：只存在這個瀏覽器，記得到 ⚙️ 設定匯出備份。`;
}

// ---------- 年度明細
function buildTable() {
 const Y = byYear(R.rows), ny = NOW.slice(0, 4);
 let h = '<tr><th>年</th><th>期數</th><th>利率</th><th>月付（元）</th><th>本金</th><th>利息</th><th>提前還</th><th>年底餘額</th></tr>';
 for (const y of Y) {
  const ms = R.rows.filter(x => x.ym.startsWith(y.y)), pays = ms.map(x => x.base), lo = Math.min(...pays), hi = Math.max(...pays);
  h += `<tr class="yr${y.y === ny ? ' now' : ''}" onclick="tgYear('${y.y}')"><td>${ST.ui.open[y.y] ? '▾' : '▸'} ${y.y}</td><td>${y.n}${y.grace ? `<small class="h">（寬限 ${y.grace}）</small>` : ''}</td><td>${y.rMin === y.rMax ? pc(y.rMin) : pc(y.rMin) + '→' + pc(y.rMax)}</td><td>${Math.abs(hi - lo) < 1 ? f0(hi) : f0(lo) + '~' + f0(hi)}</td><td>${w1(y.prin)}</td><td>${w1(y.int)}</td><td>${y.extra ? w1(y.extra) : ''}</td><td>${w1(y.bal)}</td></tr>`;
  if (ST.ui.open[y.y]) for (const x of ms) h += `<tr class="mo${x.grace ? ' gr' : ''}"><td>${ymTxt(x.ym)}</td><td>${x.grace ? '寬限' : '本息'}</td><td>${pc(x.r)}</td><td>${f0(x.base)}</td><td>${f0(x.prin)}</td><td>${f0(x.int)}</td><td>${x.extra ? f0(x.extra) : ''}</td><td>${w1(x.bal)}</td></tr>`;
 }
 document.getElementById('yt').innerHTML = h + '<tr><td colspan="8" class="h" style="text-align:left">年度金額單位：萬元；展開後的月份明細為元（餘額為萬元）。</td></tr>';
}
function tgYear(y) { ST.ui.open[y] = !ST.ui.open[y]; save(); buildTable(); }

// ---------- 主圖表
function drawMain() {
 const cv = document.getElementById('cv'), rows = R.rows, mode = ST.ui.cv;
 const cvi = document.getElementById('cvi'), lg = document.getElementById('lg');
 let A = rows;
 if (ST.ui.rng === '10') { const p0 = YM.p(NOW) - 12, p1 = YM.p(NOW) + 120; A = rows.filter(x => YM.p(x.ym) >= p0 && YM.p(x.ym) <= p1); if (!A.length) A = rows; }
 const nowI = A.findIndex(x => x.ym === NOW);
 const preM = new Set((S.loan.pre || []).map(x => x.ym));
 const xl = s => s.slice(2, 4) + '/' + s.slice(5);
 if (mode === 'yr') {
  const Y = byYear(A);
  const info = i => { if (i < 0) { cvi.textContent = '點圖表看每一年的本金與利息'; return; } const y = Y[i]; cvi.innerHTML = `<b>${y.y}</b>｜本金 ${w1(y.prin)} 萬｜利息 ${w1(y.int)} 萬${y.extra ? `｜提前還 ${w1(y.extra)} 萬` : ''}｜年底餘額 ${w1(y.bal)} 萬`; };
  drawChart(cv, { x: Y.map(y => y.y), xl: s => s, series: [
   { name: '本金', color: '#2563eb', type: 'bar', stack: 1, data: Y.map(y => y.prin / 1e4) },
   { name: '利息', color: '#f59e0b', type: 'bar', stack: 1, data: Y.map(y => y.int / 1e4) },
   { name: '提前還款', color: '#7c3aed', type: 'bar', stack: 1, data: Y.map(y => y.extra / 1e4) }],
   fmtL: v => v + '萬', now: Y.findIndex(y => y.y === NOW.slice(0, 4)), onHover: info });
  info(-1);
  lg.innerHTML = '<i style="background:#2563eb"></i>本金<i style="background:#f59e0b"></i>利息<i style="background:#7c3aed"></i>提前還款';
  return;
 }
 const info = i => {
  if (i < 0) { const c = R.sm.cur; cvi.innerHTML = c ? `今天 ${ymTxt(c.ym)}｜餘額 ${w1(c.bal)} 萬｜利率 ${pc(c.r)}｜月付 ${f0(c.base)} 元` : ''; return; }
  const x = A[i]; cvi.innerHTML = `<b>${ymTxt(x.ym)}</b>｜餘額 ${w1(x.bal)} 萬｜利率 ${pc(x.r)}｜月付 ${f0(x.base)} 元（利息 ${f0(x.int)}）${x.extra ? `｜提前還 ${f0(x.extra)}` : ''}${x.grace ? '｜寬限期' : ''}`;
 };
 const marks = A.map((x, i) => preM.has(x.ym) ? { i, color: '#7c3aed' } : null).filter(Boolean);
 if (mode === 'pay') {
  drawChart(cv, { x: A.map(x => x.ym), xl, series: [
   { name: '月付', color: '#0f766e', type: 'step', data: A.map(x => x.base), zero: 1 },
   { name: '其中利息', color: '#f59e0b', type: 'line', width: 1.5, data: A.map(x => x.int) }],
   fmtL: v => (v / 1e4).toFixed(1) + '萬', now: nowI, marks, onHover: info });
  lg.innerHTML = '<i style="background:#0f766e"></i>每月月付<i style="background:#f59e0b"></i>其中利息';
 } else {
  drawChart(cv, { x: A.map(x => x.ym), xl, series: [
   { name: '剩餘本金', color: '#2563eb', type: 'area', data: A.map(x => x.bal / 1e4) },
   { name: '利率', color: '#f59e0b', type: 'step', axis: 'R', data: A.map(x => x.r) }],
   fmtL: v => v + '萬', fmtR: v => v.toFixed(2) + '%', now: nowI, marks, onHover: info });
  lg.innerHTML = '<i style="background:#2563eb"></i>剩餘本金（左軸）<i style="background:#f59e0b"></i>利率（右軸）' + (marks.length ? '<i style="background:#7c3aed;height:8px;width:8px"></i>提前還款' : '');
 }
 info(-1);
}
function setCv(v) { ST.ui.cv = v; save(); segOn('cvSeg', 'v', v); drawMain(); }
function setRng(v) { ST.ui.rng = v; save(); segOn('rngSeg', 'r', v); drawMain(); }
function tgPin() { ST.ui.pin = ST.ui.pin ? 0 : 1; save(); applyPin(); }
function applyPin() { document.getElementById('chp').classList.toggle('pin', !!ST.ui.pin); document.getElementById('pinB').classList.toggle('on', !!ST.ui.pin); }
function segOn(id, k, v) { document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset[k] === v)); }
function tab(t) { ST.ui.tab = t; save(); document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); document.querySelectorAll('.pg').forEach(p => p.classList.toggle('on', p.id === 'pg' + t)); }

// ---------- 匯出／匯入
function expJson() {
 const d = new Date(), z = n => String(n).padStart(2, '0'), name = `房屋試算-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}.json`;
 const blob = new Blob([JSON.stringify({ app: 'house-evaluate', v: 1, exported: d.toISOString(), data: S }, null, 1)], { type: 'application/json' });
 const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
 toast('已匯出 ' + name);
}
function impJson(inp) {
 const f = inp.files && inp.files[0]; if (!f) return;
 const rd = new FileReader();
 rd.onload = () => {
  try {
   const o = JSON.parse(rd.result), d = o && o.data ? o.data : o;
   if (!d || !d.loan) throw new Error('格式不對');
   d.loan = { ...clone(DEMO.loan), ...d.loan, qa: { ...DEMO.loan.qa, ...(d.loan.qa || {}) }, extra: { ...DEMO.loan.extra, ...(d.loan.extra || {}) } };
   ST.mine = { ...clone(DEMO), ...d }; ST.src = 'mine'; S = ST.mine; save(); build(); toast('已匯入到「我的資料」');
  } catch (e) { toast('匯入失敗：' + e.message); }
  inp.value = '';
 };
 rd.readAsText(f);
}
function resetMine() {
 if (!confirm('把「我的資料」改回示範值？（建議先匯出備份）')) return;
 ST.mine = clone(DEMO); ST.mine.name = '我的房子'; ST.src = 'mine'; S = ST.mine; save(); build(); toast('已改回示範值');
}

// ---------- 靜態說明
function buildStatic() {
 const Q = POLICY.qingan, ex = qinganLadder('2024-03', 1.775);
 document.getElementById('fmQ').innerHTML = `自撥款日起 ${Q.full / 12} 年完整補貼（合計 ${Q.sub / 0.25} 碼），之後每年少半碼（${Q.step}%），遞減 ${Q.steps} 次後回到原利率。例：2024-03 撥款、補貼後 1.775%：` +
  ex.map(x => `<code>${ymTxt(x.from)} ${pc(x.r)}</code>`).join(' → ') + '。';
 document.getElementById('fmSrc').innerHTML = `政策資料確認日：${POLICY.date}。來源：<a href="${Q.url}" target="_blank" rel="noopener">${esc(Q.src)}</a>。`;
 document.getElementById('about').innerHTML = `房貸、出租、出售的整合試算。目前完成：💰 房貸（多段利率、新青安補貼遞減、寬限期、提前還款、升息壓力）。<br>政策資料確認日：${POLICY.date}。<br>舊版出租／賣房評估：<a href="legacy.html">legacy.html</a>（會在新版重寫後移除）。<br>原始碼：<a href="https://github.com/ryanjj1111/House-Evaluate-General" target="_blank" rel="noopener">GitHub</a>`;
}

function build() {
 segOn('srcSeg', 's', ST.src); segOn('cvSeg', 'v', ST.ui.cv); segOn('rngSeg', 'r', ST.ui.rng); applyPin(); tab(ST.ui.tab);
 buildInputs(); calc();
}
