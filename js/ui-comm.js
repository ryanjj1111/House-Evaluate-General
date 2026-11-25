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
// 每筆成交的單價（萬/坪，扣車位）：有車位但沒拆價時，用社區（沒有就用整區）的車位中位數補上
function cmUnits(rows, R, carMed) {
 return rows.map(r => {
  let car = r[R.car], est = false;
  if (r[R.carN] > 0 && !car) { if (!carMed) return { r, u: null }; car = carMed * r[R.carN]; est = true; }
  const u = r[R.ping] > 0 ? (r[R.price] - car) / r[R.ping] / 10 : null;
  return { r, u, est };
 });
}
function cmCarMed(rows, R) { return cmMed(rows.filter(r => r[R.carN] > 0 && r[R.car] > 0).map(r => r[R.car] / r[R.carN])); }
// 行情用的單價中位數：排除一樓（常是店面）、增建
function cmUnitMed(list, R) { return cmMed(list.filter(x => x.u && x.r[R.floor] !== 1 && !(x.r[R.flags] & CM_F.ADD)).map(x => x.u)); }

// ---------- 畫面
async function renderComm() {
 const box = $('cmIn'); if (!box) return;
 const H = S.house;
 if (!(await cmIdx())) { box.innerHTML = `<div class="h">社區實價資料還沒產生。合併後 GitHub 會自動整理一次（約 10 分鐘），之後每月更新。${CM.err ? `（${esc(CM.err)}）` : ''}</div>`; return; }
 const code = H.comm && H.comm.city || H.city;
 const C = CM.idx.counties[code];
 if (!C) { box.innerHTML = `<div class="h">社區實價目前有${Object.values(CM.idx.counties).map(c => c.name).join('、')}。先在 🔑 出租頁的「租金行情」選你的縣市。</div>`; return; }
 if (H.comm && !CM.edit) return cmShow(box, code, C);
 const ds = Object.keys(C.dists);
 if (!CM.dist || !ds.includes(CM.dist)) CM.dist = ds.includes(H.dist) ? H.dist : ds[0];
 box.innerHTML = `<div class="g"><label><span class="lt">行政區</span><select id="cmDist">${ds.map(d => `<option${d === CM.dist ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
  <label><span class="lt">搜尋</span><input id="cmQ" type="search" placeholder="社區名稱或路名" value="${esc(CM.q)}"></label></div>
  <div class="h" style="margin-top:4px">${C.nameMode === 'match' ? '社區名稱來自臺南市公寓大廈管理委員清冊，大約六成的社區對得到名稱；對不到的用路名找。'
   : C.nameMode === 'pick' ? '臺中市的社區名冊沒有地址，打名稱會先找到名冊，再從同區、差不多年份完工的社區裡挑出你的。'
   : '這個縣市沒有公開的社區名冊，請用路名找；選好後可以自己取名字。'}</div>
  <div id="cmList" style="margin-top:6px"></div>${H.comm ? '<button style="margin-top:6px" onclick="CM.edit=false;renderComm()">取消</button>' : ''}`;
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
function cmEdit() { CM.edit = true; CM.dist = S.house.comm ? S.house.comm.dist : ''; renderComm(); }
function cmNick(v) { if (!S.house.comm) return; S.house.comm.nick = v.trim(); save(); const t = $('cmTitle'); if (t) t.textContent = cmTitle(); }
function cmTitle(c) { const m = S.house.comm; return (m && (m.nick || m.name)) || (c ? cmLabel(c) : (m ? m.key.split('|')[0] : '')); }

async function cmShow(box, code, C) {
 const m = S.house.comm, H = S.house, { R } = cmCols(), T = CM.idx.types;
 const f = await cmFile(code, m.dist);
 const ci = f ? f.clusters.findIndex(c => cmKey(c) === m.key) : -1;
 if (ci < 0) {
  box.innerHTML = `<div class="hl y">「${esc(m.nick || m.name || m.key.split('|')[0])}」最近 3 年沒有成交紀錄（或資料還在更新）。</div><button style="margin-top:6px" onclick="cmEdit()">換一個社區</button>`;
  return;
 }
 const c = f.clusters[ci];
 const end = (() => { const [y, mo] = CM.idx.window.to.split('-').map(Number); return y * 100 + mo; })();
 const mine = f.rows.filter(r => r[R.c] === ci);
 const carMed = cmCarMed(mine, R) || cmCarMed(f.rows, R);
 const units = cmUnits(mine, R, carMed);
 const rec = units.filter(x => x.r[R.ym] > end - 200);
 let med = cmUnitMed(rec, R), span = '近 2 年';
 if (!med || rec.filter(x => x.u).length < 3) { med = cmUnitMed(units, R); span = '近 3 年'; }
 const by = Math.floor(c[1] / 10000);
 const peers = f.rows.filter(r => { const p = f.clusters[r[R.c]]; return r[R.c] !== ci && p[3] === c[3] && Math.abs(Math.floor(p[1] / 10000) - by) <= 5 && r[R.ym] > end - 200; });
 const peerMed = cmUnitMed(cmUnits(peers, R, cmCarMed(f.rows, R)), R);
 const ping = +H.ping || 0, carV = H.park && carMed ? carMed / 10 : 0;
 const est = med && ping ? med * ping + carV : 0;
 const tile = (l, v, cls = '') => `<div class="cmt ${cls}"><span>${l}</span><b>${v}</b></div>`;
 const show = CM.all ? units : units.slice(0, 10);
 box.innerHTML = `<div class="cmh"><div><b id="cmTitle">${esc(cmTitle(c))}</b><div class="h">${esc(m.dist)}${esc(c[0])} ${c[5] === c[6] ? c[5] : `${c[5]}～${c[6]}`} 號・${cmBuilt(c[1])} 完工・${c[2]} 層・${T[c[3]] || ''}</div></div><button onclick="cmEdit()">更換</button></div>
  <label style="margin-top:6px"><span class="lt">自己取的名字（只存在這台裝置）</span><input placeholder="例如：我家" value="${esc(m.nick || '')}" onchange="cmNick(this.value)"></label>
  <div class="cmg">${tile(`${span}成交`, `${(span === '近 2 年' ? rec : units).length} 筆`)}${tile('單價中位數（扣車位）', med ? `${med.toFixed(1)} 萬/坪` : '—')}
   ${tile('社區車位行情', carMed ? `${f0(carMed / 10)} 萬` : '—')}${tile(ping ? `估值（${ping} 坪${H.park ? '＋車位' : ''}）` : '估值', est ? `${f0(est)} 萬` : ping ? '—' : '先填坪數', 'ok')}</div>
  ${peerMed ? `<div class="h" style="margin-top:6px">對照：${esc(m.dist)}${by - 5}～${by + 5} 年完工的${T[c[3]] || ''}，${'近 2 年'}單價中位數 ${peerMed.toFixed(1)} 萬/坪（${peers.length} 筆）${med ? `，這個社區${med >= peerMed ? '高' : '低'} ${Math.abs((med / peerMed - 1) * 100).toFixed(0)}%` : ''}。</div>` : ''}
  <div class="sub" style="margin-top:8px">最近成交</div>
  <div class="w"><table class="cmr"><tr><th>年月</th><th>樓層</th><th>房</th><th>坪</th><th>總價</th><th>單價</th></tr>${show.map(({ r, u, est }) => {
   const ym = String(r[R.ym]), tags = [r[R.carN] ? (r[R.car] ? `車位 ${f0(r[R.car] / 10)} 萬` : '車位未拆價') : '', r[R.floor] === 1 ? '一樓' : '', r[R.flags] & CM_F.ADD ? '增建' : '', r[R.flags] & CM_F.FURN ? '含家具' : ''].filter(Boolean).join('・');
   return `<tr><td>${ym.slice(0, 4)}/${ym.slice(4)}</td><td>${r[R.floor] || '—'}</td><td>${r[R.rooms] || '—'}</td><td>${r[R.ping]}</td><td>${f0(r[R.price] / 10)} 萬</td><td>${u ? u.toFixed(1) + (est ? '*' : '') : '—'}</td></tr>${tags ? `<tr class="cmtag"><td colspan="6">${esc(tags)}</td></tr>` : ''}`;
  }).join('')}</table></div>
  ${units.length > 10 ? `<button style="margin-top:6px" onclick="CM.all=!CM.all;renderComm()">${CM.all ? '只看最近 10 筆' : `顯示全部 ${units.length} 筆`}</button>` : ''}
  <div class="h" style="margin-top:6px">單價＝（總價 − 車位價）÷ 坪數（不含車位），萬元／坪；中位數不算一樓和有增建的。* 是車位沒拆價，用社區車位中位數 ${carMed ? f0(carMed / 10) + ' 萬' : ''}補上估的。資料：${esc(CM.idx.source)}，${ymTxt(CM.idx.window.from)}～${ymTxt(CM.idx.window.to)}，更新 ${esc(CM.idx.updated)}。</div>`;
}
