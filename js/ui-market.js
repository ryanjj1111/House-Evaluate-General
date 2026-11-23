// 房屋試算｜🏘️ 租金行情：讀 data/rent/（GitHub Actions 每月從實價登錄整理），可以一鍵帶入出租月租與自己租屋的房租
// 比對方式：讀這個行政區的逐筆租約（data/rent/<縣市代碼>/<行政區>.json，最近 24 個月），
// 依房屋資料（房數、完工年、建物型態、車位）和比對條件（view.mk）篩出「跟我的房子相近」的租約。
// 樣本太少時依序放寬：期間 → 屋齡 → 型態 → 車位，並寫出放寬了什麼。
// 還沒有逐筆資料（Actions 還沒用新版跑過）時，退回整區統計（data/rent/<代碼>.json）。
const MK = { idx: null, county: {}, rows: {}, err: '' };
const MK_MIN = 8;   // 少於幾筆就放寬
const MK_F = { SOC: 1, FURN: 2, LIFT: 4 };

async function mkJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function mkLoad(code) {
 try {
  if (!MK.idx) MK.idx = await mkJson('data/rent/index.json');
  if (code && !MK.county[code]) MK.county[code] = await mkJson(`data/rent/${code}.json`);
  MK.err = '';
 } catch (e) { MK.err = String(e.message || e); }
}
// 逐筆資料：null＝還沒讀、false＝沒有（舊版資料或這區沒有租約）
async function mkRows(code, dist) {
 const k = code + '/' + dist;
 if (MK.rows[k] === undefined) {
  if (!MK.idx || !MK.idx.rows) { MK.rows[k] = false; return false; }
  try { MK.rows[k] = (await mkJson(`data/rent/${code}/${encodeURIComponent(dist)}.json`)).rows; } catch (e) { MK.rows[k] = false; }
 }
 return MK.rows[k];
}

async function renderMarket() {
 const box = $('mkIn'); if (!box) return;
 const H = S.house;
 if (!MK.idx) { box.innerHTML = '<div class="h">讀取中…</div>'; await mkLoad(); }
 if (!MK.idx) {
  box.innerHTML = `<div class="h">租金行情資料還沒產生。到 GitHub 的 Actions →「更新租金行情」→ Run workflow 跑一次，之後每月自動更新。${MK.err ? `（${esc(MK.err)}）` : ''}</div>`;
  return;
 }
 const cs = Object.entries(MK.idx.counties);
 if (H.city && !MK.idx.counties[H.city]) { const hit = cs.find(([, v]) => v.name === H.city || v.name.replace('臺', '台') === H.city); H.city = hit ? hit[0] : ''; }   // 也接受縣市名稱
 if (!H.city) H.city = MK.idx.counties.b ? 'b' : cs[0][0];
 if (!MK.county[H.city]) { await mkLoad(H.city); }
 const C = MK.county[H.city];
 const ds = C ? Object.keys(C.districts) : [];
 if (!ds.includes(H.dist)) H.dist = ds[0] || '';
 box.innerHTML = `<div class="sub">我的房子</div><div class="g3">
  <label><span class="lt">縣市</span><select data-mk="city">${cs.map(([k, v]) => `<option value="${k}"${k === H.city ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
  <label><span class="lt">行政區</span><select data-mk="dist">${ds.map(d => `<option${d === H.dist ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
  ${fld('house.rooms')}${fld('house.btype')}${fld('house.built')}${fld('house.park')}</div>
  <div class="g" style="margin-top:6px">${fld('house.ping')}<div></div></div>
  <details class="mkf" style="margin-top:8px"><summary class="h">比對條件（屋齡、型態、車位、期間…）</summary>
   <div class="g3" style="margin-top:4px">${['age', 'type', 'park', 'm', 'soc', 'furn'].map(k => fld('view.mk.' + k)).join('')}</div>
   <div class="h">樣本少於 ${MK_MIN} 筆時會自動放寬，依序是期間、屋齡、型態、車位。比對條件只記在畫面設定，不會改到房屋資料。</div></details>
  <div id="mkOut" style="margin-top:8px"></div>`;
 await mkOut();
}

// ---------- 篩選
const mkMed = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; };
function mkQ(a, q) { const v = [...a].sort((x, y) => x - y), i = (v.length - 1) * q, lo = Math.floor(i); return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (i - lo); }
const MK_AGE = ['3', '5', '10', 'all'], MK_TYPE = ['same', 'lift', 'all'];

// 依條件篩選；回傳 { list, cond }
function mkFilter(rows, c, ctx) {
 const H = S.house, C = ctx.C, T = MK.idx.rows.types, built = +H.built || 0, rooms = +H.rooms || 3, park = !!H.park;
 const minYm = ctx.end - (c.m === '24' ? 200 : 100);   // yyyymm：往前 12 或 24 個月
 const list = rows.filter(r => {
  if (r[C.ym] <= minYm) return false;
  if (rooms >= 4 ? r[C.rooms] < 4 : r[C.rooms] !== rooms) return false;
  const f = r[C.flags];
  if (c.soc && (f & MK_F.SOC)) return false;
  if (c.furn && (f & MK_F.FURN)) return false;
  if (built && c.age !== 'all' && (!r[C.built] || Math.abs(r[C.built] - built) > +c.age)) return false;
  const t = T[r[C.type]];
  if (c.type === 'same' && t !== H.btype) return false;
  if (c.type === 'lift' && !((f & MK_F.LIFT) || t === '大樓' || t === '華廈')) return false;
  if (c.park === 'same' && !!r[C.park] !== park) return false;
  return true;
 });
 return { list, cond: c };
}

// 從使用者的條件開始，樣本不夠就一步一步放寬
function mkSearch(rows) {
 const C = Object.fromEntries(MK.idx.rows.cols.map((k, i) => [k, i]));
 const end = +MK.idx.rows.to.replace('-', '');
 const ctx = { C, end };
 let c = { ...V().mk };
 const steps = [];
 let r = mkFilter(rows, c, ctx);
 const tries = [
  () => c.m === '12' && ['期間改成最近 24 個月', { m: '24' }],
  ...MK_AGE.slice(1).map(a => () => +S.house.built && MK_AGE.indexOf(c.age) < MK_AGE.indexOf(a) && [a === 'all' ? '屋齡改成不限' : `屋齡放寬到 ±${a} 年`, { age: a }]),
  ...MK_TYPE.slice(1).map(t => () => MK_TYPE.indexOf(c.type) < MK_TYPE.indexOf(t) && [t === 'lift' ? '型態放寬到有電梯（大樓＋華廈）' : '型態改成不限', { type: t }]),
  () => c.park === 'same' && ['車位改成不限', { park: 'all' }],
 ];
 for (const t of tries) {
  if (r.list.length >= MK_MIN) break;
  const x = t(); if (!x) continue;
  c = { ...c, ...x[1] }; steps.push(x[0]);
  r = mkFilter(rows, c, ctx);
 }
 return { ...r, steps, C };
}

// 這筆租約換算成「跟我的房子比」的月租：我有車位時用含車位的總額；對方沒車位就加上這區的車位租金中位數
function mkVal(r, C, carMed) {
 if (!S.house.park) return r[C.rent];
 return r[C.rent] + (r[C.park] ? r[C.car] : carMed);
}

async function mkOut() {
 const o = $('mkOut'); if (!o || !MK.idx) return;
 const H = S.house, rows = H.city && H.dist ? await mkRows(H.city, H.dist) : false;
 if (!rows) return mkOutAgg(o);
 if (!rows.length) { o.innerHTML = '<div class="h">這個行政區最近沒有符合條件的租約。</div>'; return; }
 const s = mkSearch(rows), C = s.C, c = s.cond, T = MK.idx.rows.types;
 const carMed = mkMed(rows.filter(r => r[C.park] && r[C.car] > 0).map(r => r[C.car]));
 const vals = s.list.map(r => mkVal(r, C, carMed));
 const n = vals.length;
 const built = +H.built || 0;
 const lab = [H.dist, (+H.rooms >= 4 ? '4 房以上' : `${+H.rooms || 3} 房`),
  built ? (c.age === 'all' ? '屋齡不限' : `${built - c.age}～${built + +c.age} 年完工`) : '',
  c.type === 'same' ? H.btype : c.type === 'lift' ? '大樓或華廈' : '',
  c.park === 'same' ? (H.park ? '含車位' : '沒有車位') : '',
  c.m === '24' ? '最近 24 個月' : '最近 12 個月'].filter(Boolean).join('・');
 // 全區同房數（不分屋齡、型態）當對照
 const endYm = +MK.idx.rows.to.replace('-', ''), ref = rows.filter(r => r[C.ym] > endYm - 100 && (+H.rooms >= 4 ? r[C.rooms] >= 4 : r[C.rooms] === (+H.rooms || 3)) && !(r[C.flags] & MK_F.SOC)).map(r => r[C.rent]);
 let html;
 if (!n) {
  html = `<div class="verdict"><b>${esc(lab)}</b>：放寬條件後還是沒有相近的租約。</div>`;
 } else {
  const med = mkMed(vals), per = s.list.map((r, i) => r[C.ping] >= 5 ? vals[i] / r[C.ping] : 0).filter(Boolean);
  const perMed = per.length ? mkMed(per) : 0, byPing = +H.ping > 0 && perMed ? Math.round(perMed * H.ping / 100) * 100 : 0;
  const med100 = Math.round(med / 100) * 100;
  html = `<div class="verdict"><b>${esc(lab)}</b>：${n} 筆，月租中位數 <b>${f0(med)} 元</b>` +
   (n >= 4 ? `（一半落在 ${f0(mkQ(vals, .25))}～${f0(mkQ(vals, .75))}）` : '') + `${H.park ? '，含車位' : ''}。` +
   (perMed ? `每坪 ${f0(perMed)} 元${byPing ? `，換算你的 ${H.ping} 坪約 <b>${f0(byPing)} 元</b>` : '（填坪數可以換算）'}。` : '') +
   (s.steps.length ? `<br><span class="h">樣本不夠，已放寬：${esc(s.steps.join('、'))}。</span>` : '') +
   (n < MK_MIN ? `<br><span class="h wn">只有 ${n} 筆，參考就好。</span>` : '') +
   (H.park && carMed && s.list.some(r => !r[C.park]) ? `<br><span class="h">沒車位的租約加上這區車位租金中位數 ${f0(carMed)} 元再比。</span>` : '') +
   (!built ? `<br><span class="h">填「完工年份」可以只比屋齡相近的房子。</span>` : '') +
   (ref.length ? `<br><span class="h">對照：${esc(H.dist)}同房數全部 ${ref.length} 筆（不分屋齡、型態、不含車位）中位數 ${f0(mkMed(ref))} 元。</span>` : '') + '</div>';
  // 最相近的幾筆：屋齡差、坪數差、時間
  const near = s.list.map((r, i) => ({ r, v: vals[i], d: (built && r[C.built] ? Math.abs(r[C.built] - built) : 8) + (+H.ping > 0 && r[C.ping] ? Math.abs(r[C.ping] - H.ping) / 3 : 2) + (endYm - r[C.ym]) / 600 }))
   .sort((a, b) => a.d - b.d).slice(0, 6);
  html += `<div class="sub" style="margin-top:8px">最相近的 ${near.length} 筆</div><table class="mkt"><tr><th>月份</th><th>房屋</th><th>坪數</th><th>月租</th></tr>` +
   near.map(({ r, v }) => {
    const tags = [T[r[C.type]], r[C.built] ? `${r[C.built]} 年` : '', r[C.park] ? '車位' : '', r[C.flags] & MK_F.FURN ? '家具' : '', r[C.flags] & MK_F.SOC ? '社宅' : ''].filter(Boolean).join('・');
    const ym = String(r[C.ym]);
    return `<tr><td>${ym.slice(0, 4)}/${ym.slice(4)}</td><td>${r[C.rooms]} 房・${esc(tags)}</td><td>${r[C.ping] || '—'}</td><td>${f0(v)}${S.house.park && !r[C.park] && carMed ? '<sup>＋</sup>' : ''}</td></tr>`;
   }).join('') + '</table>';
  html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
   <button onclick="mkUse('rent',${med100})">帶入市場月租（${f0(med100)}）</button>
   <button onclick="mkUse('myRent',${med100})">帶入我搬出後的房租（${f0(med100)}）</button></div>`;
 }
 const w = MK.idx.rows;
 o.innerHTML = html + `<div class="h" style="margin-top:4px">資料：${esc(MK.idx.source)}，${ymTxt(w.from)}～${ymTxt(w.to)}。只有透過包租代管業者或仲介的租約一定要登錄，屋主自己出租的常常沒有登錄，所以行情通常偏低。更新：${esc(MK.idx.updated)}。</div>`;
}

// 舊版資料（只有整區統計）：行政區 × 房數；樣本太少時改看整區
function mkPick() {
 const H = S.house, C = MK.county[H.city], D = C && C.districts[H.dist];
 if (!D) return null;
 const rk = String(Math.min(4, Math.max(1, +H.rooms || 3))), byRoom = D.rooms[rk];
 return { D, rk, s: byRoom && byRoom.n >= 5 ? byRoom : null, small: byRoom && byRoom.n < 5 ? byRoom : null, all: D.all };
}
function mkOutAgg(o) {
 const p = mkPick(), H = S.house, w = MK.idx.window;
 if (!p) { o.innerHTML = '<div class="h">這個行政區最近沒有符合條件的租約。</div>'; return; }
 const s = p.s || p.all, lab = p.s ? `${H.dist} ${p.rk === '4' ? '4 房以上' : p.rk + ' 房'}` : `${H.dist}（全部房數）`;
 const ping = +H.ping > 0 && s.ping ? Math.round(s.ping * H.ping / 100) * 100 : null;
 const types = Object.entries(p.D.type).filter(([, v]) => v.n >= 3).map(([k, v]) => `${k} ${f0(v.med)}`).join('、');
 o.innerHTML = `<div class="hl y">還沒有逐筆資料，暫時用整區統計（不分屋齡、車位）。到 GitHub 的 Actions →「更新租金行情」跑一次就會有。</div><div class="verdict"><b>${esc(lab)}</b>：月租中位數 <b>${f0(s.med)} 元</b>${s.p25 ? `（一半落在 ${f0(s.p25)}～${f0(s.p75)}）` : ''}，${s.n} 筆。` +
  (s.ping ? `每坪月租中位數 ${f0(s.ping)} 元${ping ? `，換算你的 ${H.ping} 坪約 <b>${f0(ping)} 元</b>` : '（填坪數可以換算）'}。` : '') +
  (p.small ? `<br><span class="h">${p.rk === '4' ? '4 房以上' : p.rk + ' 房'}只有 ${p.small.n} 筆（中位數 ${f0(p.small.med)}），樣本太少，改用整區。</span>` : '') +
  (types ? `<br><span class="h">依型態（中位數）：${esc(types)}</span>` : '') + `</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
   <button onclick="mkUse('rent',${ping || s.med})">帶入市場月租（${f0(ping || s.med)}）</button>
   <button onclick="mkUse('myRent',${s.med})">帶入我搬出後的房租（${f0(s.med)}）</button></div>
  <div class="h" style="margin-top:4px">資料：${esc(MK.idx.source)}，${ymTxt(w.from)}～${ymTxt(w.to)}，${esc(MK.idx.filter)}。更新：${esc(MK.idx.updated)}。</div>`;
}

function mkUse(k, v) { S.rent[k] = Math.round(+v / 100) * 100; save(); buildRentInputs(); calc(); toast(k === 'rent' ? '已帶入市場月租' : '已帶入搬出後的房租'); }

document.addEventListener('change', async e => {
 const k = e.target.dataset && e.target.dataset.mk; if (!k) return;
 if (k === 'city') { S.house.city = e.target.value; S.house.dist = ''; } else S.house.dist = e.target.value;
 save(); await renderMarket();
});
// 房屋資料或比對條件改了只要重算行情
const MK_P = /^(house\.(rooms|ping|built|btype|park)|view\.mk\.)/;
for (const ev of ['input', 'change']) document.addEventListener(ev, e => { const p = e.target.dataset && e.target.dataset.p; if (p && MK_P.test(p)) { clearTimeout(mkOut.t); mkOut.t = setTimeout(mkOut, ev === 'input' ? 300 : 0); } });
