// 房屋試算｜畫面共用：格式、儲存、欄位、收合、分頁、使用說明。計算都在 engine.js。
// 資料只存在這個瀏覽器（localStorage），可匯出／匯入 JSON；「↺ 重置」回到預設值。
const KEY = 'hc-v2', OLD = 'hc-v1', GKEY = 'hc-gd';
const NOW = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
let S = norm(DEF);
const V = () => S.view;
const $ = id => document.getElementById(id);

// ---------- 格式
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f0 = v => Math.round(v || 0).toLocaleString('zh-TW');
const w1 = v => (Math.round((v || 0) / 1e3) / 10).toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pc = v => (+v || 0).toFixed(3).replace(/0$/, '') + '%';
const ymTxt = s => s ? String(s).replace('-', '/') : '—';
const dur = m => { m = Math.max(0, m | 0); const y = Math.floor(m / 12), r = m % 12; return (y ? y + ' 年' : '') + (r ? (y ? ' ' : '') + r + ' 個月' : (y ? '' : '0 個月')); };
const sg = v => (v >= 0 ? '+' : '−') + f0(Math.abs(v));
const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; };
function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 2600); }

// ---------- 儲存
function load() {
 let o = null;
 try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
 if (o && o.data) o = { ...o.data, ui: o.ui };                              // v2：{ data, ui }
 if (!o) { try { const old = JSON.parse(localStorage.getItem(OLD) || 'null'); if (old && old.mine) o = { ...old.mine, ui: old.ui }; } catch (e) { } }
 S = norm(o || DEF);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify({ data: S })); } catch (e) { } }
function resetD() {
 if (!confirm('清除目前所有設定，回到預設值？（建議先匯出備份）')) return;
 try { localStorage.removeItem(KEY); localStorage.removeItem(OLD); } catch (e) { }
 S = norm(DEF); save(); build(); toast('已回到預設值');
}
function expJson() {
 const d = new Date(), z = n => String(n).padStart(2, '0'), name = `房屋試算-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}.json`;
 const blob = new Blob([JSON.stringify({ app: 'house-evaluate', v: DATA_V, exported: d.toISOString(), data: S }, null, 1)], { type: 'application/json' });
 const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
 setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
 toast('已匯出 ' + name);
}
function impJson(inp) {
 const f = inp.files && inp.files[0]; if (!f) return;
 const rd = new FileReader();
 rd.onload = () => {
  try {
   const o = JSON.parse(rd.result), d = o && o.data ? o.data : o;
   if (!d || !d.loan) throw new Error('格式不對');
   S = norm(d); save(); build(); toast('已匯入設定檔');
  } catch (e) { toast('匯入失敗：' + e.message); }
  inp.value = '';
 };
 rd.readAsText(f);
}

// ---------- 路徑讀寫（'loan.qa.sub'、'loan.pre.0.amt'）
function getP(path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], S); }
function setP(path, v) { const ks = path.split('.'), last = ks.pop(); let o = S; for (const k of ks) { if (o[k] == null) o[k] = {}; o = o[k]; } o[last] = v; }

// ---------- 欄位（定義在 fields.js；o 可覆寫：l 名稱、ph、tip）
function fld(path, o = {}) {
 const F = { ...(FIELDS[path] || {}), ...o }, t = F.t || 'number', v = getP(path), lab = F.l || path;
 const head = `<span class="lt">${esc(lab)}${F.tip ? tipI(F.tip, lab) : ''}</span>`;
 if (t === 'sel') return `<label>${head}<select data-p="${path}" data-t="sel"${F.rb ? ' data-rb="1"' : ''}>${F.o.map(([k, n]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
 const at = (F.step ? ` step="${F.step}"` : '') + (F.min != null ? ` min="${F.min}"` : '') + (F.max != null ? ` max="${F.max}"` : '') + (F.ph ? ` placeholder="${esc(F.ph)}"` : '');
 return `<label>${head}<input type="${t}" data-p="${path}" data-t="${t}" value="${esc(v ?? '')}"${at}${t === 'number' ? ' inputmode="decimal"' : ''}${F.rb ? ' data-rb="1"' : ''}></label>`;
}
// 表格列裡的小欄位（利率階梯、提前還款）
function cell(path, t, extra = '') {
 const v = getP(path);
 return `<input type="${t}" data-p="${path}" data-t="${t}" value="${esc(v ?? '')}"${t === 'number' ? ' inputmode="decimal"' : ''} ${extra}>`;
}
function onField(e) {
 const el = e.target; if (!el.dataset || !el.dataset.p) return;
 const t = el.dataset.t; let v = el.value;
 if (t === 'number') v = v === '' ? '' : +v;
 if (t === 'sel') { if (v === 'true' || v === 'false') v = v === 'true'; else if (/^-?\d+(\.\d+)?$/.test(v)) v = +v; }
 el.classList.toggle('bad', t === 'number' && el.value !== '' && !el.checkValidity());
 setP(el.dataset.p, v); save();
 if (el.dataset.rb && e.type === 'change') buildInputs();
 clearTimeout(onField.t); onField.t = setTimeout(calc, e.type === 'input' ? 250 : 0);
}

// ---------- 區塊收合（<details class="p fd" data-k="...">，收起來的記在 view.fold）
function applyFold() {
 document.querySelectorAll('details.fd[data-k]').forEach(d => { d.open = !V().fold[d.dataset.k]; });
}
document.addEventListener('toggle', e => {
 const d = e.target; if (!d.matches || !d.matches('details.fd[data-k]')) return;
 if (d.open) delete V().fold[d.dataset.k]; else V().fold[d.dataset.k] = 1;
 save();
 if (d.open && d.dataset.k === 'chart' && typeof drawMain === 'function' && R) requestAnimationFrame(drawMain);
}, true);

// ---------- 分頁
function tab(t) {
 V().tab = t; save();
 document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
 document.querySelectorAll('.pg').forEach(p => p.classList.toggle('on', p.id === 'pg' + t));
 if (R) drawMain();
}
function segOn(id, k, v) { document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset[k] === String(v))); }

// ---------- 使用說明
function showGd() { $('gdn').checked = (() => { try { return localStorage.getItem(GKEY) === '1'; } catch (e) { return false; } })(); $('gd').style.display = 'flex'; }
function closeGd() { try { if ($('gdn').checked) localStorage.setItem(GKEY, '1'); else localStorage.removeItem(GKEY); } catch (e) { } $('gd').style.display = 'none'; }
function gdGo(id) { const d = $(id); if (!d) return; d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function buildStatic() {
 const Q = POLICY.qingan, ex = qinganLadder('2024-03', 1.775);
 $('fmQ').innerHTML = `自撥款日起 ${Q.full / 12} 年完整補貼（合計 ${Q.sub / 0.25} 碼），之後每年少半碼（${Q.step}%），遞減 ${Q.steps} 次後回到原利率。例：2024-03 撥款、補貼後 1.775%：` +
  ex.map(x => `<code>${ymTxt(x.from)} ${pc(x.r)}</code>`).join(' → ') + '。';
 $('fmSrc').innerHTML = `政策資料確認日：${POLICY.date}。來源：<a href="${Q.url}" target="_blank" rel="noopener">${esc(Q.src)}</a>、` + POLICY.rentSrc.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join('、') + '。';
}
