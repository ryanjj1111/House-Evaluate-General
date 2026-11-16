// 房屋試算｜💰 房貸頁：輸入、重點卡、提醒、提前還款、升息壓力、📅 明細
let R = null;   // 最近一次的計算結果（圖表、明細共用）

// 重點卡（可在圖表的 ⚙️ 關掉）
const CARDS = [['c_pay', '本月月付'], ['c_bal', '剩餘本金'], ['c_next', '下次利率調整'], ['c_off', '預計還清'], ['c_int', '未來利息'], ['c_grace', '寬限期']];

function buildLoanInputs() {
 const L = S.loan;
 $('loanIn').innerHTML = `<div class="g">${fld('loan.amt')}${fld('loan.disb')}${fld('loan.yrs')}${fld('loan.grace')}${fld('loan.method')}</div>
 <details style="margin-top:6px"><summary style="font-weight:600;font-size:12.5px">進階：對齊銀行實際扣款</summary>
  <div class="g3">${fld('loan.first')}${fld('loan.amStart')}${fld('loan.amN')}</div>
  <div class="h" style="margin-top:4px">通常留空。銀行的第一次本息扣款月份或期數和這裡算的不同時再填，例如：首次本息月 2026-10、本息期數 324。</div></details>
 <div class="h" id="loanInfo" style="margin-top:6px"></div>`;

 let r = `<div class="g">${fld('loan.rateMode')}${L.rateMode === 'single' ? fld('loan.rate') : '<div></div>'}</div>`;
 if (L.rateMode === 'qingan') r += `<div class="g" style="margin-top:6px">${fld('loan.qa.sub')}${fld('loan.qa.base')}</div>`;
 else if (L.rateMode === 'custom') {
  r += `<div class="row r-lad h" style="margin-top:6px"><span>起始年月</span><span>年利率（%）</span><span></span></div>` +
   L.ladder.map((x, i) => `<div class="row r-lad">${cell(`loan.ladder.${i}.from`, 'month')}${cell(`loan.ladder.${i}.r`, 'number', 'step="0.005" min="0" max="15"')}<button onclick="delRow('loan.ladder',${i})" aria-label="刪除">🗑</button></div>`).join('') +
   `<button onclick="addRow('loan.ladder')">＋新增一段</button>`;
 }
 $('rateIn').innerHTML = r + `<div class="lad" id="ladChips"></div>`;

 $('preIn').innerHTML = `<div class="sub" style="margin-top:2px">一次提前還款</div>` +
  (L.pre.length ? `<div class="row r-pre h"><span>年月</span><span>金額（萬）</span><span>方式</span><span></span></div>` : '') +
  L.pre.map((x, i) => `<div class="row r-pre">${cell(`loan.pre.${i}.ym`, 'month')}${cell(`loan.pre.${i}.amt`, 'number', 'step="1" min="0"')}<select data-p="loan.pre.${i}.mode" data-t="sel"><option value="term"${x.mode !== 'pay' ? ' selected' : ''}>縮短年限</option><option value="pay"${x.mode === 'pay' ? ' selected' : ''}>降低月付</option></select><button onclick="delRow('loan.pre',${i})" aria-label="刪除">🗑</button></div>`).join('') +
  `<button onclick="addRow('loan.pre')">＋新增一筆</button>
  <div class="sub">每月多還本金</div><div class="g">${fld('loan.extra.amt')}${fld('loan.extra.from')}</div>`;

 $('stIn').innerHTML = `<div class="g" style="margin-bottom:6px">${fld('stressPct')}<div></div></div>`;
}
function addRow(path) {
 const A = getP(path) || [], L = S.loan;
 if (path === 'loan.ladder') A.push({ from: A.length ? YM.add(A[A.length - 1].from, 12) : String(L.disb).slice(0, 7), r: A.length ? A[A.length - 1].r : 2 });
 else A.push({ ym: YM.add(NOW, 6), amt: 50, mode: 'term' });
 setP(path, A); save(); buildInputs(); calc();
}
function delRow(path, i) { const A = getP(path) || []; A.splice(i, 1); setP(path, A); save(); buildInputs(); calc(); }

function calcLoan() {
 const L = S.loan;
 if (!(+L.amt > 0) || !YM.ok(L.disb)) { $('cards').innerHTML = '<div class="h">請先填寫貸款金額與撥款日。</div>'; R = null; return false; }
 const sm = loanSummary(L, NOW), T = sm.T, rows = sm.rows, ladder = loanLadder(L);
 const pe = (L.pre.some(x => +x.amt > 0) || +L.extra.amt > 0) ? prepayEffect(L, NOW) : null;
 R = { sm, T, rows, ladder, pe };
 const cur = sm.cur;

 $('loanInfo').innerHTML = `首期 ${ymTxt(T.first)}｜寬限期繳息 ${T.graceN} 期｜本息 ${T.amN} 期（${ymTxt(T.amStart)} 起）｜到期 ${ymTxt(T.last)}`;
 const lc = $('ladChips');
 if (lc) lc.innerHTML = L.rateMode === 'single' ? '' : ladder.slice().sort((a, b) => YM.p(a.from) - YM.p(b.from)).map((x, i, A) => {
  const on = YM.p(x.from) <= YM.p(NOW) && (!A[i + 1] || YM.p(A[i + 1].from) > YM.p(NOW));
  return `<span class="${on ? 'now' : ''}">${ymTxt(x.from)} 起 ${pc(x.r)}</span>`;
 }).join('');

 // 未來利率變化、寬限期
 const chg = [];
 for (let i = 1; i < rows.length; i++) if (rows[i].r !== rows[i - 1].r && YM.p(rows[i].ym) >= YM.p(NOW)) chg.push(rows[i]);
 const grEnd = rows.find(x => !x.grace), inGrace = cur && cur.grace, nx = chg[0];

 // 重點卡
 const card = (k, t, b, s, tip) => V().hide[k] ? '' : `<div class="c"><small>${t}${tip ? tipI(tip, t) : ''}</small><b>${b}</b>${s ? `<span class="sub2">${s}</span>` : ''}</div>`;
 const left = cur ? YM.diff(NOW, sm.payoff) + 1 : 0;
 $('cards').innerHTML =
  card('c_pay', '本月月付', cur ? f0(cur.base) + ' 元' : '—', cur ? `利率 ${pc(cur.r)}${cur.grace ? '・寬限期' : ''}` : '', '本月應繳的本金＋利息，不含提前還款。') +
  card('c_bal', '剩餘本金', w1(sm.balNow) + ' 萬', `已還 ${((1 - sm.balNow / (L.amt * 1e4)) * 100).toFixed(1)}%`, '到上個月為止的剩餘本金（推算值），可以和銀行對帳單比對。') +
  card('c_next', '下次利率調整', nx ? ymTxt(nx.ym) : '—', nx ? `${pc(nx.r)}・月付約 ${f0(nx.base)} 元` : '目前沒有排定', '依「利率」設定的階梯推算；機動利率還會隨央行升降息變動。') +
  card('c_off', '預計還清', ymTxt(sm.payoff), cur ? `還有 ${dur(left)}` : '', pe ? '已含提前還款的效果。' : '') +
  card('c_int', '未來利息', w1(sm.intFuture) + ' 萬', `全期利息 ${w1(sm.intTotal)} 萬`, '從本月起到還清，還要付的利息總額（以目前的利率設定推算）。') +
  card('c_grace', '寬限期', grEnd ? (inGrace ? `剩 ${YM.diff(NOW, grEnd.ym)} 期` : '已結束') : '—', grEnd ? `${ymTxt(grEnd.ym)} 起本息攤還` : '', '寬限期只繳利息；結束後要在剩下的年限內還完全部本金，月付會跳升。');

 // 提醒
 const al = [];
 if (L.rateMode === 'qingan' && (L.qa.base === '' || L.qa.base == null)) al.push(['b', `ℹ️ 原利率留空，先用補貼後利率＋0.5%（${pc(+L.qa.sub + 0.5)}）估計補貼結束後的利率；可以向銀行確認後填入。`]);
 if (inGrace && grEnd && YM.diff(NOW, grEnd.ym) <= 12) al.push(['y', `⚠️ 寬限期再 ${YM.diff(NOW, grEnd.ym)} 個月結束，月付會從 ${f0(cur.base)} 元增加到約 ${f0(grEnd.base)} 元，請先準備好現金流。`]);
 const n12 = chg.filter(x => YM.diff(NOW, x.ym) <= 12 && x.r > (cur ? cur.r : 0));
 if (cur && !inGrace && n12.length) al.push(['y', `⏳ ${ymTxt(n12[0].ym)} 利率調為 ${pc(n12[0].r)}，月付約增加 ${f0(n12[0].base - cur.base)} 元。`]);
 $('alerts').innerHTML = al.map(([c, t]) => `<div class="hl ${c}">${t}</div>`).join('');

 // 提前還款結果
 $('preOut').innerHTML = pe ? `<div class="hl g">✅ 省下利息約 <b>${w1(pe.saved)} 萬</b>，${pe.months > 0 ? `提早 <b>${dur(pe.months)}</b> 還清（${ymTxt(pe.payoff0)} → ${ymTxt(pe.payoff)}）` : `還款年限不變（${ymTxt(pe.payoff)} 還清），之後月付降低`}。</div>`
  : `<div class="h" style="margin-top:6px">新增一筆試試看：例如明年拿 50 萬提前還款，可以省多少利息。</div>`;

 // 升息壓力
 const bps = [25, 50], cu = Math.round((+S.stressPct || 0) * 100); if (cu > 0 && !bps.includes(cu)) bps.push(cu);
 const ss = cur ? stress(L, NOW, bps) : [];
 $('stT').innerHTML = cur ? `<tr><th>情境</th><th>本月起月付</th><th>每月增加</th><th>未來利息增加</th></tr><tr><td>目前利率</td><td>${f0(cur.base)}</td><td>—</td><td>—</td></tr>` +
  ss.map(x => `<tr><td>升息 ${+(x.bp / 100).toFixed(3)}%${x.bp % 25 === 0 ? `（${x.bp / 25} 碼）` : ''}</td><td>${f0(x.pay)}</td><td class="bad">+${f0(x.dPay)}</td><td class="bad">+${w1(x.dInt)} 萬</td></tr>`).join('') : '';
 return true;
}

// ---------- 📅 年度明細
function buildTable() {
 if (!R) { $('yt').innerHTML = ''; return; }
 const Y = byYear(R.rows), ny = NOW.slice(0, 4), op = V().open;
 let h = '<tr><th>年</th><th>期數</th><th>利率</th><th>月付（元）</th><th>本金</th><th>利息</th><th>提前還</th><th>年底餘額</th></tr>';
 for (const y of Y) {
  const ms = R.rows.filter(x => x.ym.startsWith(y.y)), pays = ms.map(x => x.base), lo = Math.min(...pays), hi = Math.max(...pays);
  h += `<tr class="yr${y.y === ny ? ' now' : ''}" onclick="tgYear('${y.y}')"><td>${op[y.y] ? '▾' : '▸'} ${y.y}</td><td>${y.n}${y.grace ? `<small class="h">（寬限 ${y.grace}）</small>` : ''}</td><td>${y.rMin === y.rMax ? pc(y.rMin) : pc(y.rMin) + '→' + pc(y.rMax)}</td><td>${Math.abs(hi - lo) < 1 ? f0(hi) : f0(lo) + '~' + f0(hi)}</td><td>${w1(y.prin)}</td><td>${w1(y.int)}</td><td>${y.extra ? w1(y.extra) : ''}</td><td>${w1(y.bal)}</td></tr>`;
  if (op[y.y]) for (const x of ms) h += `<tr class="mo${x.grace ? ' gr' : ''}"><td>${ymTxt(x.ym)}</td><td>${x.grace ? '寬限' : '本息'}</td><td>${pc(x.r)}</td><td>${f0(x.base)}</td><td>${f0(x.prin)}</td><td>${f0(x.int)}</td><td>${x.extra ? f0(x.extra) : ''}</td><td>${w1(x.bal)}</td></tr>`;
 }
 $('yt').innerHTML = h + '<tr><td colspan="8" class="h" style="text-align:left">年度金額單位：萬元；展開後的月份明細為元（餘額為萬元）。</td></tr>';
}
function tgYear(y) { const op = V().open; if (op[y]) delete op[y]; else op[y] = 1; save(); buildTable(); }
