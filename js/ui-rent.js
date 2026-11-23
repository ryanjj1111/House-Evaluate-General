// 房屋試算｜🔑 出租頁：出租 vs 自住、出租方式比較
const RK = ['normal', 'public', 'socialLease', 'socialManage'];
const RENT_MODES_TIP = '一般出租：自己找房客，租賃所得扣 43% 費用後課稅；申報達租金標準可用 1.5% 房屋稅。\n公益出租人：房客有租金補貼資格，每屋每月 15,000 元免稅，超過部分扣 43% 費用；房屋稅 1.2%。\n社宅包租：業者當二房東，約 9 折，空租由業者承擔；每月 15,000 元免稅，超過部分扣 60%；房屋稅 1.2%。\n社宅代管：業者代為出租管理，約 9 折，空租由你承擔；稅務同社宅包租。\n地價稅、9 折等數字是一般情況，實際以稅單、合約為準。';

// 沒填開始出租年月時，用兩個月後
function rentS() { const d = { ...S, rent: { ...S.rent } }; if (!YM.ok(d.rent.start)) d.rent.start = YM.add(NOW, 2); return d; }

function buildRentInputs() {
 const q = S.loan.rateMode === 'qingan', br = q && S.rent.breach === true;
 $('holdIn').innerHTML = `<div class="g">${fld('hold.mgmt')}${fld('hold.mgmtPer')}${fld('hold.houseTax')}${fld('hold.landTax')}${fld('hold.selfRate')}${fld('hold.incomeRate')}</div>`;
 $('rentIn').innerHTML = `<div class="g">${fld('rent.start')}${fld('rent.rent')}${fld('rent.vac')}${fld('rent.mgmtBy')}${fld('rent.repair')}${fld('rent.myRent')}
  ${q ? fld('rent.breach') : ''}
  ${br ? fld('rent.breachRate', { ph: String(POLICY.qinganBreach.rate) }) : fld('rent.newRate')}</div>` +
  (!br && S.rent.newRate !== '' && S.rent.newRate != null ? `<div class="sub">🔁 轉貸設定</div><div class="g">${fld('rent.refi.yrs')}${fld('rent.refi.grace')}${fld('rent.refi.fee')}${fld('rent.refi.scriv')}${fld('rent.refi.setFee')}${fld('rent.refi.other')}${fld('rent.refi.penalty')}</div>
   <div class="h" style="margin-top:4px">費用是一般行情的估計，實際以銀行報價為準。</div>` : '');
}

function calcRent() {
 if (!$('rentRes') || !R) return;
 const D = rentS(), C = RK.map(k => rentCompare(D, k)), BE = RK.map(k => rentBreakeven(D, k));
 const sel = RK.includes(D.rent.mode) ? D.rent.mode : 'normal', ci = RK.indexOf(sel), c = C[ci], self = c.self;
 const best = C.reduce((b, x, i) => x.diff > C[b].diff ? i : b, 0);
 let v = `從 <b>${ymTxt(c.start)}</b> 開始<b>${c.M.name}</b>、市場月租 ${f0(+D.rent.rent || 0)} 元：出租後第一年平均每月現金流 <b class="${c.diff >= 0 ? 'up' : 'dn'}">比自住${c.diff >= 0 ? '多' : '少'} ${f0(Math.abs(c.diff))} 元</b>。`;
 v += BE[ci] === Infinity ? '怎麼調高月租都無法打平。' : `月租至少要 <b>${f0(BE[ci])} 元</b>才和自住打平。`;
 if (best !== ci) v += `「${C[best].M.name}」比較好（每月${C[best].diff >= 0 ? '多' : '少'} ${f0(Math.abs(C[best].diff))} 元）。`;
 const ry = numOrNull(D.rent.refi && D.rent.refi.yrs);
 if (c.changed) v += `其中${c.breach ? '新青安違規' : c.refi ? `轉貸（${pc(c.newRate)}${ry != null ? `、${ry} 年` : ''}）` : `利率改為 ${pc(c.newRate)} `}讓月付${c.rent.pay >= c.self.pay ? '多' : '少'} <b>${f0(Math.abs(c.rent.pay - c.self.pay))} 元</b>（利息${c.breachInt >= 0 ? '多' : '少'} ${f0(Math.abs(c.breachInt))} 元）。`;
 $('rentRes').innerHTML = v;

 // 長條：各出租方式和自住的差額
 const mx = Math.max(1, ...C.map(x => Math.abs(x.diff)));
 $('rentBars').innerHTML = C.map((x, i) => `<div class="rb${i === ci ? ' on' : ''}" onclick="setMode('${RK[i]}')"><span class="rbn">${x.M.name}</span><span class="rbt"><i class="${x.diff >= 0 ? 'pos' : 'neg'}" style="width:${Math.abs(x.diff) / mx * 50}%;${x.diff >= 0 ? 'left:50%' : 'right:50%'}"></i></span><span class="rbv ${x.diff >= 0 ? 'up' : 'dn'}">${sg(x.diff)}</span></div>`).join('') +
  '<div class="h" style="text-align:center;margin-top:2px">每月現金流：出租 − 自住（元，出租後第一年平均）｜點一列看細項</div>';

 // 比較表
 const cols = [{ h: '自住', o: self, d: null, be: null }, ...C.map((x, i) => ({ h: x.M.name, o: x.rent, d: x.diff, be: BE[i], i }))];
 const row = (t, f, cls = '') => `<tr class="${cls}"><td>${t}</td>${cols.map(k => `<td class="${k.i === ci ? 'sel' : ''}">${f(k)}</td>`).join('')}</tr>`;
 const neg = v => v ? '−' + f0(v) : '0';
 $('rentT').innerHTML =
  `<tr><th>每月（元）</th>${cols.map(k => `<th class="${k.i === ci ? 'sel' : ''}"${k.i != null ? ` onclick="setMode('${RK[k.i]}')" style="cursor:pointer"` : ''}>${k.h}</th>`).join('')}</tr>` +
  row('租金收入', k => k.o.income ? '+' + f0(k.o.income) : '—') +
  row('租賃所得稅', k => k.o.tax ? neg(k.o.tax) : '—') +
  row('房貸月付', k => neg(k.o.pay)) +
  row('　其中利息', k => f0(k.o.int), 'mut') +
  row('管理費', k => neg(k.o.mgmt)) +
  row('房屋稅', k => neg(k.o.houseTax)) +
  row('地價稅', k => neg(k.o.landTax)) +
  row('修繕預備', k => k.o.repair ? neg(k.o.repair) : '—') +
  row('自己租屋', k => k.o.myRent ? neg(k.o.myRent) : '—') +
  (c.refi ? row('轉貸費用（攤 12 個月）', k => k.o.refi ? neg(k.o.refi) : '—') : '') +
  row('<b>每月現金流</b>', k => `<b>${sg(k.o.net)}</b>`, 'tot') +
  row('<b>比自住</b>', k => k.d == null ? '—' : `<b class="${k.d >= 0 ? 'up' : 'dn'}">${sg(k.d)}</b>`, 'tot') +
  row('打平月租', k => k.be == null ? '—' : k.be === Infinity ? '無法' : f0(k.be));

 // 註記與提醒都放進標題旁的 ⓘ
 const note = `${c.M.name}：${c.M.note}。實收月租 ${f0(c.rent.mRent)} 元${c.rent.vac ? `，每年空租 ${c.rent.vac} 個月` : ''}；租賃所得稅：${c.M.exempt ? `每月超過 ${f0(c.M.exempt)} 元的部分` : '全部租金'}扣除 ${c.M.exp * 100}% 費用後 × ${D.hold.incomeRate}%；房屋稅 ${c.M.houseRate}%（自住 ${D.hold.selfRate}%）。`;
 const al = [];
 if (!c.breach && D.loan.rateMode === 'qingan') al.push(`⚠️ 新青安：選「否」代表出租前會先轉貸成一般房貸${c.changed ? `（這裡用 ${pc(c.newRate)}，轉貸費用約 ${f0(c.refiCost.total)} 元，攤在第一年）` : '（還沒填出租後利率，目前沿用新青安利率，會低估成本）'}。如果沒轉貸就出租，屬於違規，請改選「是」。`);
 if (c.breach) al.push(`🚫 新青安違規：新青安要自住，出租會被終止補貼、追回違規日起的補貼，並重新核定條件（這裡用 ${pc(c.newRate)}）。第一年多付利息約 ${w1(c.breachInt * 12)} 萬；銀行也可能收回部分借款或縮短年限、寬限期。`);
 al.push(`🏷️ 自住優惠會中斷：房地合一自住優惠（獲利 400 萬內免稅、超過部分 10%）的條件是出售前 6 年內沒有出租。${ymTxt(c.start)} 出租後，要到搬回自住滿 6 年才能再用（💸 出售頁可以看差多少）。`);
 if (sel === 'normal') al.push(`🏠 房屋稅：一般出租要在出租那年 3/22 前向地方稅務局申請，並在 5 月申報租賃所得達租金標準，才能用 1.5%；沒有申請會用非自住 ${POLICY.houseTaxNonSelf}%（每年約 ${f0(c.self.houseTax * 12 / (+D.hold.selfRate || 1) * POLICY.houseTaxNonSelf)} 元）。`);
 al.push('🌱 地價稅、土地增值稅：出租後不能用自用住宅 2‰ 地價稅（一般 10‰ 起），出售時也不能用自用住宅 10% 的土地增值稅率。');
 calcRefi();
 $('rentTip').innerHTML = tipI(`【目前選的方式】\n${note}\n\n【注意事項】\n${al.join('\n\n')}\n\n【四種出租方式】\n${RENT_MODES_TIP}`, '出租方式比較');
}
// 🔁 轉貸試算：轉貸後出租 vs 不轉貸（新青安＝直接出租違規；一般房貸＝原利率）
function calcRefi() {
 const D = rentS(), x = refiCompare(D);
 if (!x) { $('refiRes').innerHTML = '<div class="h">在「📝 出租條件」填「出租後房貸利率」（轉貸後的利率），這裡會比較轉貸的費用、月付和回本時間。</div>'; return; }
 const bn = x.alt === 'breach' ? '直接出租（違規）' : '不轉貸';
 const c = x.cost.parts;
 let v = `轉貸一次性費用約 <b>${f0(x.cost.total)} 元</b>，`;
 v += x.save > 0 ? `轉貸後月付比${bn}每月少 <b>${f0(x.save)} 元</b>，約 <b>${x.payback} 個月</b>回本。` : `但轉貸後月付沒有比${bn}低（每月${x.save < 0 ? '多' : '差'} ${f0(Math.abs(x.save))} 元），費用回不來。`;
 if (x.alt === 'breach') v += '轉貸可以合法出租，不會被追回補貼或被銀行收回借款。';
 $('refiRes').innerHTML = `<div class="verdict">${v}</div>
 <div class="w" style="margin-top:6px"><table class="st"><tr><th></th><th>轉貸後出租</th><th>${bn}</th></tr>
  <tr><td>利率</td><td>${pc(x.rateA)}</td><td>${pc(x.rateB)}</td></tr>
  <tr><td>第一年平均月付</td><td>${f0(x.payA)}</td><td>${f0(x.payB)}</td></tr>
  <tr><td>還清年月</td><td>${ymTxt(x.endA)}</td><td>${ymTxt(x.endB)}</td></tr>
  <tr><td>出租後總利息</td><td>${w1(x.intA)} 萬</td><td>${w1(x.intB)} 萬</td></tr>
  <tr><td>一次性費用</td><td>${f0(x.cost.total)}</td><td>—</td></tr></table></div>
 <div class="h" style="margin-top:4px">費用明細：開辦 ${f0(c.fee)}＋代書 ${f0(c.scriv)}＋設定規費 ${f0(c.setFee)}＋其他 ${f0(c.other)}${c.penalty ? `＋違約金 ${f0(c.penalty)}` : ''} 元（以出租前剩餘本金 ${w1(x.cost.bal)} 萬計）。${x.endA > x.endB ? '轉貸拉長年限：月付變低，但總利息變多。' : ''}</div>`;
}
function setMode(k) { S.rent.mode = k; save(); calcRent(); }
