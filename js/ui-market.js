// 房屋試算｜🏘️ 租金行情：讀 data/rent/（GitHub Actions 每月從實價登錄整理），可以一鍵帶入出租月租與自己租屋的房租
const MK = { idx: null, county: {}, err: '' };

async function mkLoad(code) {
 try {
  if (!MK.idx) { const r = await fetch('data/rent/index.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); MK.idx = await r.json(); }
  if (code && !MK.county[code]) { const r = await fetch(`data/rent/${code}.json`, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); MK.county[code] = await r.json(); }
  MK.err = '';
 } catch (e) { MK.err = String(e.message || e); }
}

// 這個房子的行情：行政區 × 房數；樣本太少時改看整區
function mkPick() {
 const H = S.house, C = MK.county[H.city], D = C && C.districts[H.dist];
 if (!D) return null;
 const rk = String(Math.min(4, Math.max(1, +H.rooms || 3))), byRoom = D.rooms[rk];
 return { D, rk, s: byRoom && byRoom.n >= 5 ? byRoom : null, small: byRoom && byRoom.n < 5 ? byRoom : null, all: D.all };
}

async function renderMarket() {
 const box = $('mkIn'); if (!box) return;
 const H = S.house;
 if (!MK.idx) { box.innerHTML = '<div class="h">讀取中…</div>'; await mkLoad(); }
 if (!MK.idx) {
  box.innerHTML = `<div class="h">租金行情資料還沒產生。合併後到 GitHub 的 Actions →「更新租金行情」→ Run workflow 跑一次，之後每月自動更新。${MK.err ? `（${esc(MK.err)}）` : ''}</div>`;
  return;
 }
 const cs = Object.entries(MK.idx.counties);
 if (H.city && !MK.idx.counties[H.city]) { const hit = cs.find(([, v]) => v.name === H.city || v.name.replace('臺', '台') === H.city); H.city = hit ? hit[0] : ''; }   // 也接受縣市名稱
 if (!H.city) H.city = MK.idx.counties.b ? 'b' : cs[0][0];
 if (!MK.county[H.city]) { await mkLoad(H.city); }
 const C = MK.county[H.city];
 const ds = C ? Object.keys(C.districts) : [];
 if (!ds.includes(H.dist)) H.dist = ds[0] || '';
 box.innerHTML = `<div class="g3">
  <label><span class="lt">縣市</span><select data-mk="city">${cs.map(([k, v]) => `<option value="${k}"${k === H.city ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
  <label><span class="lt">行政區</span><select data-mk="dist">${ds.map(d => `<option${d === H.dist ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
  ${fld('house.rooms')}</div>
  <div class="g" style="margin-top:6px">${fld('house.ping')}<div></div></div>
  <div id="mkOut" style="margin-top:6px"></div>`;
 mkOut();
}

function mkOut() {
 const o = $('mkOut'); if (!o || !MK.idx) return;
 const p = mkPick(), H = S.house, w = MK.idx.window;
 if (!p) { o.innerHTML = '<div class="h">這個行政區最近沒有符合條件的租約。</div>'; return; }
 const s = p.s || p.all, lab = p.s ? `${H.dist} ${p.rk === '4' ? '4 房以上' : p.rk + ' 房'}` : `${H.dist}（全部房數）`;
 const ping = +H.ping > 0 && s.ping ? Math.round(s.ping * H.ping / 100) * 100 : null;
 const types = Object.entries(p.D.type).filter(([, v]) => v.n >= 3).map(([k, v]) => `${k} ${f0(v.med)}`).join('、');
 o.innerHTML = `<div class="verdict"><b>${esc(lab)}</b>：月租中位數 <b>${f0(s.med)} 元</b>${s.p25 ? `（一半落在 ${f0(s.p25)}～${f0(s.p75)}）` : ''}，${s.n} 筆。` +
  (s.ping ? `每坪月租中位數 ${f0(s.ping)} 元${ping ? `，換算你的 ${H.ping} 坪約 <b>${f0(ping)} 元</b>` : '（填坪數可以換算）'}。` : '') +
  (p.small ? `<br><span class="h">${p.rk === '4' ? '4 房以上' : p.rk + ' 房'}只有 ${p.small.n} 筆（中位數 ${f0(p.small.med)}），樣本太少，改用整區。</span>` : '') +
  (types ? `<br><span class="h">依型態（中位數）：${esc(types)}</span>` : '') + `</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
   <button onclick="mkUse('rent','${ping || s.med}')">帶入市場月租（${f0(ping || s.med)}）</button>
   <button onclick="mkUse('myRent','${s.med}')">帶入我搬出後的房租（${f0(s.med)}）</button></div>
  <div class="h" style="margin-top:4px">資料：${esc(MK.idx.source)}，${ymTxt(w.from)}～${ymTxt(w.to)}，${esc(MK.idx.filter)}。更新：${esc(MK.idx.updated)}。</div>`;
}

function mkUse(k, v) { S.rent[k] = Math.round(+v / 100) * 100; save(); buildRentInputs(); calc(); toast(k === 'rent' ? '已帶入市場月租' : '已帶入搬出後的房租'); }

document.addEventListener('change', async e => {
 const k = e.target.dataset && e.target.dataset.mk; if (!k) return;
 if (k === 'city') { S.house.city = e.target.value; S.house.dist = ''; } else S.house.dist = e.target.value;
 save(); await renderMarket();
});
// 房數、坪數改了只要重算行情
document.addEventListener('input', e => { const p = e.target.dataset && e.target.dataset.p; if (p === 'house.rooms' || p === 'house.ping') setTimeout(mkOut, 0); });
document.addEventListener('change', e => { const p = e.target.dataset && e.target.dataset.p; if (p === 'house.rooms' || p === 'house.ping') setTimeout(mkOut, 0); });
