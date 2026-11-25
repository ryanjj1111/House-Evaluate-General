// 房屋試算｜🏘️ 社區實價（💸 出售頁）：實價登錄買賣，依「同路段、同完工日、同總樓層」分成一個一個社區
// 資料由 GitHub Actions 每月整理（tools/fetch_sale.py），放在獨立的 data-sale 分支；網站從 raw.githubusercontent.com 讀。
// 本機測試時讀 data/sale/（不提交）。
// 選好的社區記在 S.house.comm：{ city, dist, key:'路段|完工日|樓層', name, nick }，只存在這台裝置與你匯出的設定檔。
const CM_BASE = /\.github\.io$/.test(location.hostname) ? 'https://raw.githubusercontent.com/ryanjj1111/House-Evaluate-General/data-sale/' : 'data/sale/';
const CM = { idx: null, files: {}, names: {}, err: '', q: '', dist: '', hint: null, edit: false, all: false };
const CM_F = { ADD: 1, FURN: 2, PRE: 4 };

async function cmJson(p) { const r = await fetch(CM_BASE + p, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function cmIdx() { if (!CM.idx) { try { CM.idx = await cmJson('index.json'); CM.err = ''; } catch (e) { CM.err = String(e.message || e); } } return CM.idx; }
async function cmFile(code, dist) {
 const k = code + '/' + dist;
 if (CM.files[k] === undefined) { try { CM.files[k] = await cmJson(`${code}/${encodeURIComponent(dist)}.json`); } catch (e) { CM.files[k] = null; } }
 return CM.files[k];
}
async function cmNames(code) {
 if (CM.names[code] === undefined) { try { CM.names[code] = (await cmJson(`${code}/names.json`)).names; } catch (e) { CM.names[code] = []; } }
 return CM.names[code];
}

// ---------- 計算
const cmMed = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; };
const cmKey = c => `${c[0]}|${c[1]}|${c[2]}`;
const cmBuilt = b => `${Math.floor(b / 10000)}/${String(Math.floor(b / 100) % 100).padStart(2, '0')}`;
const cmLabel = c => c[4] || c[0];
function cmCols() { const R = {}, K = {}; CM.idx.rowCols.forEach((k, i) => R[k] = i); CM.idx.clusterCols.forEach((k, i) => K[k] = i); return { R, K }; }
// 每筆成交的單價（萬/坪）
// 含車位（預設）：總價 ÷ 總坪數（含車位），中古屋最常這樣比
// 扣車位：（總價 − 車位數 × 你設的車位價）÷（總坪數 − 車位坪數）；沒車位的成交兩種算法一樣
function cmUnit(r, R, mode, carP) {
 const ping = mode === 'ex' && r[R.carN] ? r[R.ping] - r[R.carPing] : r[R.ping];
 const price = mode === 'ex' && r[R.carN] ? r[R.price] - r[R.carN] * carP * 10 : r[R.price];   // 千元
 return ping > 0 && price > 0 ? price / ping / 10 : null;
}
// 行情用的單價中位數：不算增建；no1 時不算 1 樓（常是店面或附庭院）
function cmStat(list, R, no1) {
 const v = list.filter(x => x.u && !(no1 && x.r[R.floor] === 1) && !(x.r[R.flags] & CM_F.ADD)).map(x => x.u).sort((a, b) => a - b);
 const q = p => { const i = (v.length - 1) * p, lo = Math.floor(i); return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (i - lo); };
 return { n: v.length, med: cmMed(v), lo: v.length >= 4 ? q(.25) : 0, hi: v.length >= 4 ? q(.75) : 0 };
}
// 房數、樓層篩選（樓層每 3 層一組，記起始樓層 1、4、7…）
function cmPass(r, R, f) {
 if (f.rooms.length && !f.rooms.includes(Math.min(r[R.rooms], 4))) return false;
 if (f.floors.length && !f.floors.includes(Math.floor((Math.max(r[R.floor], 1) - 1) / 3) * 3 + 1)) return false;
 return true;
}
const cmDoor = (c, r, R) => `${c[0]}${r[R.no]}號${r[R.floor] ? `${r[R.floor]}樓` : ''}${r[R.unit] ? `之${r[R.unit]}` : ''}`;

// ---------- 畫面
async function renderComm() {
 const box = $('cmIn'); if (!box) return;
 const H = S.house;
 if (!(await cmIdx())) { box.innerHTML = `<div class="h">社區實價資料還沒產生。合併後 GitHub 會自動整理一次（約 10 分鐘），之後每月更新。${CM.err ? `（${esc(CM.err)}）` : ''}</div>`; return; }
 if (!CM.idx.v || CM.idx.v < 2) { box.innerHTML = '<div class="h">社區實價資料正在更新成新格式，過幾分鐘再打開。</div>'; return; }
 if (H.comm && !CM.edit && CM.idx.counties[H.comm.city]) return cmShow(box, H.comm.city, CM.idx.counties[H.comm.city]);
 if (!CM.city || !CM.idx.counties[CM.city]) CM.city = CM.idx.counties[H.city] ? H.city : Object.keys(CM.idx.counties)[0];
 const code = CM.city, C = CM.idx.counties[code];
 const ds = Object.keys(C.dists);
 if (!CM.dist || !ds.includes(CM.dist)) CM.dist = ds.includes(H.dist) ? H.dist : ds[0];
 box.innerHTML = `<div class="g3"><label><span class="lt">縣市</span><select id="cmCity">${Object.entries(CM.idx.counties).map(([k, v]) => `<option value="${k}"${k === code ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
  <label><span class="lt">行政區</span><select id="cmDist">${ds.map(d => `<option${d === CM.dist ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
  <label><span class="lt">搜尋</span><input id="cmQ" type="search" placeholder="社區或路名" value="${esc(CM.q)}"></label></div>
  <div class="h" style="margin-top:4px">${C.nameMode === 'match' ? '社區名稱來自臺南市公寓大廈管理委員清冊，接近一半的社區對得到名稱；對不到的用路名找。'
   : C.nameMode === 'pick' ? '臺中市的社區名冊沒有地址，打名稱會先找到名冊，再從同區、差不多年份完工的社區裡挑出你的。'
   : '這個縣市沒有公開的社區名冊，請用路名找；選好後可以自己取名字。'}</div>
  <div id="cmList" style="margin-top:6px"></div>${H.comm ? '<button style="margin-top:6px" onclick="CM.edit=false;renderComm()">取消</button>' : ''}`;
 $('cmCity').onchange = e => { CM.city = e.target.value; CM.dist = ''; CM.hint = null; renderComm(); };
 $('cmDist').onchange = e => { CM.dist = e.target.value; CM.hint = null; cmList(code); };
 $('cmQ').oninput = e => { CM.q = e.target.value.trim(); CM.hint = null; clearTimeout(cmList.t); cmList.t = setTimeout(() => cmList(code), 250); };
 await cmList(code);
}

async function cmList(code) {
 const o = $('cmList'); if (!o) return;
 const C = CM.idx.counties[code], H = S.house, { R, K } = cmCols();
 const f = await cmFile(code, CM.dist);
 if (!f) { o.innerHTML = '<div class="h">這個行政區沒有資料。</div>'; return; }
 const n = new Array(f.clusters.length).fill(0);
 f.rows.forEach(r => n[r[R.c]]++);
 const q = CM.q, T = CM.idx.types, built = +H.built || 0;
 const item = (c, i) => `<button class="cmi" onclick="cmPick('${code}','${esc(CM.dist)}',${i})"><b>${esc(cmLabel(c))}</b><span>${c[4] ? esc(c[0]) + '・' : ''}${c[5] === c[6] ? c[5] : c[5] + '～' + c[6]} 號・${cmBuilt(c[1])} 完工・${c[2]} 層・${T[c[3]] || ''}</span><em>${n[i]} 筆</em></button>`;
 let html = '', list;
 if (CM.hint) {
  // 臺中：名冊只有區與使照年 → 列出同區、使照年前兩年內完工的社區讓使用者挑
  const y = CM.hint.year;
  list = f.clusters.map((c, i) => [c, i]).filter(([c]) => !y || (Math.floor(c[1] / 10000) <= y && Math.floor(c[1] / 10000) >= y - 2)).sort((a, b) => n[b[1]] - n[a[1]]).slice(0, 12);
  html = `<div class="sub">「${esc(CM.hint.name)}」${y ? `（${y} 年使照${CM.hint.hh ? `、${CM.hint.hh} 戶` : ''}）` : ''}可能是哪一個？</div><div class="h">同區、${y ? `${y - 2}～${y} 年完工、` : ''}最近 3 年有成交的社區，照筆數排。認得路名就點那一個。</div>` +
   (list.length ? list.map(([c, i]) => item(c, i)).join('') : '<div class="h">找不到，換個行政區或改用路名找。</div>') +
   '<button style="margin-top:6px" onclick="CM.hint=null;cmList(\'' + code + '\')">回到搜尋</button>';
  o.innerHTML = html; return;
 }
 if (!q) {
  list = f.clusters.map((c, i) => [c, i]).filter(([c]) => !built || Math.abs(Math.floor(c[1] / 10000) - built) <= 1).sort((a, b) => n[b[1]] - n[a[1]]).slice(0, 8);
  html = `<div class="sub">${built ? `${built - 1}～${built + 1} 年完工` : '成交最多'}的社區</div>` + (list.length ? list.map(([c, i]) => item(c, i)).join('') : '<div class="h">沒有，試試搜尋路名。</div>');
 } else {
  list = f.clusters.map((c, i) => [c, i]).filter(([c]) => c[0].includes(q) || (c[4] && c[4].includes(q))).sort((a, b) => n[b[1]] - n[a[1]]).slice(0, 12);
  html = list.length ? `<div class="sub">${esc(CM.dist)}</div>` + list.map(([c, i]) => item(c, i)).join('') : '';
  if (C.names) {
   const nm = (await cmNames(code)).filter(x => x[0].includes(q) && !(x[2] && x[1] === CM.dist && list.some(([c]) => cmKey(c) === x[2]))).slice(0, 10);
   CM.nm = nm;
   if (nm.length) html += `<div class="sub">社區名冊</div>` + nm.map((x, j) => `<button class="cmi" onclick="cmName('${code}',${j})"><b>${esc(x[0])}</b><span>${esc(x[1])}${x[3] ? `・${x[3]} 年${x[2] ? '完工' : '使照'}` : ''}${x[4] ? `・${x[4]} 戶` : ''}</span><em>${x[2] ? '選這個' : '找社區'}</em></button>`).join('');
  }
  if (!html) html = '<div class="h">找不到。社區名稱可能沒在名冊裡，試試路名（例如「福田」）。</div>';
 }
 o.innerHTML = html;
}

// 從名冊點名稱：有 key（臺南已對到）直接選；沒有（臺中）就切到那一區、列出年份相近的社區
async function cmName(code, j) {
 const [name, dist, key, year, hh] = CM.nm[j];
 CM.dist = dist; CM.q = '';
 if (key) {
  const f = await cmFile(code, dist), i = f ? f.clusters.findIndex(c => cmKey(c) === key) : -1;
  if (i >= 0) return cmPick(code, dist, i);
 }
 CM.hint = { name, year, hh };
 await renderComm();
}

async function cmPick(code, dist, i) {
 const f = await cmFile(code, dist); if (!f) return;
 const c = f.clusters[i];
 S.house.comm = { city: code, dist, key: cmKey(c), name: CM.hint ? CM.hint.name : (c[4] || ''), nick: S.house.comm && S.house.comm.key === cmKey(c) ? S.house.comm.nick || '' : '' };
 CM.edit = false; CM.hint = null; CM.q = ''; CM.all = false;
 save(); await renderComm(); toast('已選好社區');
}
function cmEdit() { CM.edit = true; if (S.house.comm) { CM.city = S.house.comm.city; CM.dist = S.house.comm.dist; } renderComm(); }
function cmNick(v) { if (!S.house.comm) return; S.house.comm.nick = v.trim(); save(); const t = $('cmTitle'); if (t) t.textContent = cmTitle(); }
function cmTitle(c) { const m = S.house.comm; return (m && (m.nick || m.name)) || (c ? cmLabel(c) : (m ? m.key.split('|')[0] : '')); }

async function cmShow(box, code, C) {
 const m = S.house.comm, H = S.house, { R } = cmCols(), T = CM.idx.types, F = V().cm;
 const f = await cmFile(code, m.dist);
 const ci = f ? f.clusters.findIndex(c => cmKey(c) === m.key) : -1;
 if (ci < 0) {
  box.innerHTML = `<div class="hl y">「${esc(m.nick || m.name || m.key.split('|')[0])}」最近 3 年沒有成交紀錄（或資料還在更新）。</div><button style="margin-top:6px" onclick="cmEdit()">換一個社區</button>`;
  return;
 }
 const c = f.clusters[ci];
 const end = (() => { const [y, mo] = CM.idx.window.to.split('-').map(Number); return y * 100 + mo; })();
 const ex = F.mode === 'ex', carP = +H.carPrice || 0, needCar = ex && !carP;
 const mine = f.rows.filter(r => r[R.c] === ci);
 const pass = mine.filter(r => cmPass(r, R, F)).map(r => ({ r, u: needCar ? null : cmUnit(r, R, F.mode, carP) }));
 const rec = pass.filter(x => x.r[R.ym] > end - 200);
 let st = cmStat(rec, R, F.no1), span = '近 2 年';
 if (st.n < 3) { st = cmStat(pass, R, F.no1); span = '近 3 年'; }
 // 對照：同區、同型態、完工年 ±5 年的其他社區（套用房數篩選，不套樓層）
 const by = Math.floor(c[1] / 10000);
 const peers = f.rows.filter(r => { const p = f.clusters[r[R.c]]; return r[R.c] !== ci && p[3] === c[3] && Math.abs(Math.floor(p[1] / 10000) - by) <= 5 && r[R.ym] > end - 200 && cmPass(r, R, { rooms: F.rooms, floors: [] }); });
 const ps = needCar ? { n: 0 } : cmStat(peers.map(r => ({ r, u: cmUnit(r, R, F.mode, carP) })), R, F.no1);
 // 估值
 const ping = +H.ping || 0, cping = H.park ? +H.carPing || 0 : 0;
 const base = ex ? ping : ping + cping, est = st.med && base ? st.med * base + (ex && H.park ? carP : 0) : 0;
 const estL = ex ? `${ping} 坪${H.park ? `＋車位 ${carP} 萬` : ''}` : `總坪數 ${+(ping + cping).toFixed(2)} 坪`;
 // 篩選按鈕
 const chip = (on, txt, js) => `<button class="seg1${on ? ' on' : ''}" onclick="${js}">${txt}</button>`;
 const fl = []; for (let s0 = 1; s0 <= c[2]; s0 += 3) fl.push(s0);
 const rows = [...pass].sort((a, b) => {
  const k = F.sort, d = F.desc ? -1 : 1;
  const v = x => k === 'u' ? (x.u || 0) : k === 'price' ? x.r[R.price] : k === 'ping' ? x.r[R.ping] : k === 'floor' ? x.r[R.floor] * 100 + x.r[R.unit] : x.r[R.ym];
  return (v(a) - v(b)) * d || (b.r[R.ym] - a.r[R.ym]);
 });
 const show = CM.all ? rows : rows.slice(0, 10);
 const th = (k, t) => `<th class="cms${F.sort === k ? ' on' : ''}" onclick="cmSort('${k}')">${t}${F.sort === k ? (F.desc ? '▾' : '▴') : ''}</th>`;
 const tile = (l, v, cls = '') => `<div class="cmt ${cls}"><span>${l}</span><b>${v}</b></div>`;
 const filt = F.rooms.length || F.floors.length;
 box.innerHTML = `<div class="cmh"><div><b id="cmTitle">${esc(cmTitle(c))}</b><div class="h">${esc(C.name)}${esc(m.dist)}${esc(c[0])} ${c[5] === c[6] ? c[5] : `${c[5]}～${c[6]}`} 號・${cmBuilt(c[1])} 完工・${c[2]} 層・${T[c[3]] || ''}</div></div><button onclick="cmEdit()">更換</button></div>
  <label style="margin-top:6px"><span class="lt">自己取的名字（只存在這台裝置）</span><input placeholder="例如：我家" value="${esc(m.nick || '')}" onchange="cmNick(this.value)"></label>
  <div class="sub">單價算法</div>
  <div class="seg" style="margin-top:4px">${chip(!ex, '含車位（總價 ÷ 總坪數）', "cmSet('mode','all')")}${chip(ex, '扣車位', "cmSet('mode','ex')")}</div>
  <div class="g3" style="margin-top:6px">${fld('house.ping')}${fld('house.park')}${H.park ? fld('house.carPing') : '<div></div>'}${ex ? fld('house.carPrice') : ''}</div>
  ${needCar ? '<div class="hl y" style="margin-top:6px">扣車位模式要先填「車位價」，例如 180 萬。</div>' : ''}
  <div class="sub">房數</div><div class="cmc">${chip(!F.rooms.length, '全部', "cmSet('rooms',[])")}${[1, 2, 3, 4].map(k => chip(F.rooms.includes(k), k === 4 ? '4 房以上' : `${k} 房`, `cmTog('rooms',${k})`)).join('')}</div>
  <div class="sub">樓層</div><div class="cmc">${chip(!F.floors.length, '全部', "cmSet('floors',[])")}${fl.map(k => chip(F.floors.includes(k), k + 2 >= c[2] && k < c[2] ? `${k}～${c[2]}` : k === c[2] ? `${k}` : `${k}～${k + 2}`, `cmTog('floors',${k})`)).join('')}</div>
  <label class="cmck"><input type="checkbox"${F.no1 ? ' checked' : ''} onchange="cmSet('no1',this.checked)"> 中位數不算 1 樓（常是店面或附庭院，表上照樣列出）</label>
  <div class="cmg">${tile(`${span}成交${filt ? '（篩選後）' : ''}`, `${span === '近 2 年' ? rec.length : pass.length} 筆`)}${tile(`單價中位數（${ex ? '扣車位' : '含車位'}）`, st.med ? `${st.med.toFixed(1)} 萬/坪` : '—')}
   ${tile('一半落在', st.lo ? `${st.lo.toFixed(1)}～${st.hi.toFixed(1)}` : '—')}${tile(base ? `估值（${estL}）` : '估值', est ? `${f0(est)} 萬` : base ? '—' : '先填坪數', 'ok')}</div>
  ${st.n && st.n < 3 ? '<div class="h wn" style="margin-top:4px">筆數太少，參考就好。</div>' : ''}
  ${ps.n ? `<div class="h" style="margin-top:6px">對照：${esc(m.dist)} ${by - 5}～${by + 5} 年完工的${T[c[3]] || ''}${F.rooms.length ? `（同房數）` : ''}，近 2 年單價中位數 ${ps.med.toFixed(1)} 萬/坪（${ps.n} 筆）${st.med ? `，這個社區${st.med >= ps.med ? '高' : '低'} ${Math.abs((st.med / ps.med - 1) * 100).toFixed(0)}%` : ''}。</div>` : ''}
  <div class="sub" style="margin-top:8px">成交紀錄 <span class="h">點表頭可以排序</span></div>
  <div class="w"><table class="cmr"><tr>${th('ym', '年月')}${th('floor', '樓層')}<th>房</th>${th('ping', ex ? '坪*' : '坪')}${th('price', '總價')}${th('u', '單價')}</tr>${show.map(({ r, u }) => {
   const ym = String(r[R.ym]);
   const tags = [cmDoor(c, r, R), r[R.carN] ? `車位 ${r[R.carN]} 個${r[R.carPing] ? ` ${r[R.carPing]} 坪` : ''}${r[R.car] ? ` ${f0(r[R.car] / 10)} 萬` : '（未拆價）'}` : '', r[R.floor] === 1 ? '1 樓' : '', r[R.flags] & CM_F.ADD ? '增建' : '', r[R.flags] & CM_F.FURN ? '含家具' : ''].filter(Boolean).join('・');
   const pg = ex && r[R.carN] ? r[R.ping] - r[R.carPing] : r[R.ping];
   return `<tr><td>${ym.slice(0, 4)}/${ym.slice(4)}</td><td>${r[R.floor] || '—'}</td><td>${r[R.rooms] || '—'}</td><td>${(+pg).toFixed(1)}</td><td>${f0(r[R.price] / 10)} 萬</td><td>${u ? u.toFixed(1) : '—'}</td></tr><tr class="cmtag"><td colspan="6">${esc(tags)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="h">沒有符合篩選的成交。</td></tr>'}</table></div>
  ${rows.length > 10 ? `<button style="margin-top:6px" onclick="CM.all=!CM.all;renderComm()">${CM.all ? '只看 10 筆' : `顯示全部 ${rows.length} 筆`}</button>` : ''}
  <div class="h" style="margin-top:6px">${ex ? `單價＝（總價 − 車位數 × ${carP || '?'} 萬）÷（總坪數 − 車位坪數）；坪*＝扣掉車位的坪數。` : '單價＝總價 ÷ 總坪數（含車位、公設）。'}中位數不算有增建的${F.no1 ? '和 1 樓' : ''}。資料：${esc(CM.idx.source)}，${ymTxt(CM.idx.window.from)}～${ymTxt(CM.idx.window.to)}，更新 ${esc(CM.idx.updated)}。</div>`;
}
function cmSet(k, v) { V().cm[k] = v; if (k !== 'sort') CM.all = CM.all; save(); renderComm(); }
function cmTog(k, v) { const a = V().cm[k], i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); save(); renderComm(); }
function cmSort(k) { const F = V().cm; if (F.sort === k) F.desc = !F.desc; else { F.sort = k; F.desc = true; } save(); renderComm(); }
// 房屋資料（坪數、車位）改了重算
document.addEventListener('change', e => { const p = e.target.dataset && e.target.dataset.p; if (p && /^house\.(ping|park|carPing|carPrice)$/.test(p) && S.house.comm) setTimeout(renderComm, 0); });
