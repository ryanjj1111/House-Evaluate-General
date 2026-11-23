// 房屋試算｜💸 出售頁：房地合一稅、自住優惠、售出瀑布、稅率時間帶、出售時點
function buildSaleInputs() {
 const fx = S.sale.priceMode === 'fixed';
 $('saleIn').innerHTML = `<div class="sub" style="margin-top:0">買進</div><div class="g">${fld('house.buyDate')}${fld('house.price')}${fld('house.buyCost')}${fld('house.improve')}${fld('house.selfSince')}</div>
  <div class="sub">出售</div><div class="g">${fld('sale.date')}${fld('sale.priceMode')}${fx ? fld('sale.price') : fld('sale.est') + fld('sale.growth')}${fld('sale.brokerPct')}${fld('sale.other')}${fld('sale.feeMode')}${fld('sale.landGain')}${fld('sale.usedSelf')}${fld('sale.landUsed')}</div>`;
}

function calcSale() {
 if (!$('saleRes') || !R) return;
 const D = rentS(), d = saleDates(D), a = saleCalc(D, NOW), b = saleCalc(D, NOW, { rented: true });
 const rs = D.rent.start, rentHit = b.rented;
 // 結論
 let v = `<b>${d.sale.replace(/-/g, '/')}</b> 以 <b>${w1(a.price)} 萬</b>賣出${S.sale.priceMode === 'fixed' ? '' : `（目前估 ${w1((+S.sale.est > 0 ? +S.sale.est : +S.house.price) * 1e4)} 萬、每年 ${+S.sale.growth || 0}%）`}：`;
 v += `一直自住，房地合一稅 <b>${w1(a.tax)} 萬</b>（${a.selfOK ? '可用自住優惠' : a.taxNote}），還完房貸實拿 <b>${w1(a.net)} 萬</b>。`;
 if (rentHit && a.net - b.net >= 1000) v += `如果照出租計畫從 ${ymTxt(rs)} 出租，稅變成 <b>${w1(b.tax)} 萬</b>、實拿 ${w1(b.net)} 萬，<b class="dn">少 ${w1(a.net - b.net)} 萬</b>。`;
 else if (rentHit) v += `照出租計畫出租，這個時間點的稅和實拿差不多（${a.selfOK ? '' : '本來就還不能用自住優惠，'}差 ${w1(a.net - b.net)} 萬）。`;
 if (!a.selfOK && a.next) v += `<br><span class="h">再等到 ${a.next.replace(/-/g, '/')} 出售，稅率會再降一級。</span>`;
 $('saleRes').innerHTML = v;

 // 瀑布（選一直自住或出租後）
 const path = S.sale.path === 'rent' && rentHit ? 'rent' : 'self', x = path === 'rent' ? b : a;
 $('saleSeg').innerHTML = `<div class="seg"><button class="${path === 'self' ? 'on' : ''}" onclick="setSalePath('self')">一直自住</button><button class="${path === 'rent' ? 'on' : ''}" onclick="setSalePath('rent')"${rentHit ? '' : ' disabled title="出租計畫在出售日之後"'}>依出租計畫</button></div>`;
 const steps = [['售價', x.price, 'c2'], ['仲介與出售費用', -x.fee, 'c8'], ['土地增值稅', -x.landTax, 'c3'], ['房地合一稅', -x.tax, 'c4'], ['還清房貸', -x.loanBal, 'c5']];
 const mx = Math.max(1, x.price);
 let cum = 0;
 $('saleWf').innerHTML = steps.map(([n, v2, c], i) => {
  const from = i ? cum + v2 : 0, to = i ? cum : v2; if (i) cum += v2; else cum = v2;
  const l = Math.min(from, to) / mx * 100, w = Math.abs(v2) / mx * 100;
  return `<div class="wf"><span>${n}</span><span class="wft"><i style="left:${Math.max(0, l)}%;width:${Math.max(0.5, w)}%;background:${thV(c)}"></i></span><span class="wfv">${i ? (v2 ? '−' : '') : ''}${w1(Math.abs(v2))}</span></div>`;
 }).join('') + `<div class="wf tot"><span>實拿</span><span class="wft"><i style="left:0;width:${Math.max(0, x.net) / mx * 100}%;background:var(--up)"></i></span><span class="wfv ${x.net >= 0 ? 'up' : 'dn'}">${w1(x.net)}</span></div><div class="h" style="text-align:right">單位：萬元</div>`;

 // 明細表（兩條路）
 const row = (t, f, cls = '') => `<tr class="${cls}"><td>${t}</td><td>${f(a)}</td><td>${rentHit ? f(b) : '—'}</td></tr>`;
 $('saleT').innerHTML = `<tr><th>萬元</th><th>一直自住</th><th>依出租計畫</th></tr>` +
  row('成交價', y => w1(y.price)) + row('− 取得成本', y => w1(y.cost)) + row('− 取得費用', y => w1(y.buyCost)) + row('− 改良裝修', y => w1(y.improve)) +
  row('− 出售費用', y => w1(y.fee)) + row('− 土地漲價總數額', y => w1(y.landGain)) + row('<b>課稅所得</b>', y => `<b>${w1(y.gain)}</b>`, 'tot') +
  row('持有期間', y => y.held.toFixed(1) + ' 年') + row('適用', y => y.selfOK ? '自住優惠' : `${y.rate}%`) +
  row('<b>房地合一稅</b>', y => `<b>${w1(y.tax)}</b>`, 'tot') + row('土地增值稅', y => `${w1(y.landTax)}<small class="h">（${y.landSelf ? '自用 10%' : '一般 20%'}）</small>`) +
  row('還清房貸', y => w1(y.loanBal)) + row('<b>實拿</b>', y => `<b>${w1(y.net)}</b>`, 'tot');
 const why = (y, t) => y.why.length ? `${t}不能用自住優惠：${y.why.join('；')}。` : '';
 $('saleWhy').innerHTML = [why(a, '一直自住'), rentHit ? why(b, '依出租計畫') : ''].filter(Boolean).map(t => `<div class="h">${esc(t)}</div>`).join('');

 // 稅率時間帶：取得日起 12 年
 const B = POLICY.houseLand.brackets, start = d.buy, end = DT.addY(d.buy, 12), span = Date.parse(end) - Date.parse(start);
 const pos = s => Math.max(0, Math.min(100, (Date.parse(s) - Date.parse(start)) / span * 100));
 let prev = start, seg = '';
 const col = r => `var(--b${r})`;
 for (const [y, r] of B) { const to = y === Infinity ? end : DT.addY(d.buy, y); seg += `<i style="left:${pos(prev)}%;width:${pos(to) - pos(prev)}%;background:${col(r)}">${r}%</i>`; prev = to; }
 const selfAt = DT.addY(d.self, POLICY.houseLand.self.years);
 const today = `${NOW}-15`;
 $('saleBand').innerHTML = `<div class="band">${seg}<b class="sf" style="left:${pos(selfAt)}%;width:${100 - pos(selfAt)}%"></b>` +
  `<u style="left:${pos(today)}%" title="今天"></u><u class="sl" style="left:${pos(d.sale)}%" title="出售日"></u></div>
  <div class="bandl"><span>${start.slice(0, 7).replace('-', '/')} 取得</span><span>${end.slice(0, 4)}</span></div>
  <div class="h">色塊是房地合一稅率；<span style="color:var(--ok)">墨青色框線</span>是可以用自住優惠的期間（${selfAt.replace(/-/g, '/')} 起，條件是出售前 6 年沒有出租）；<b style="color:var(--pri)">│</b>今天　<b style="color:var(--c4)">│</b>出售日。</div>`;

 drawSaleChart(D);
}
function setSalePath(p) { S.sale.path = p; save(); calcSale(); }

// 出售時點：今天起 12 年，每個月賣出的實拿（兩條路）
function drawSaleChart(D) {
 const cv = $('saleCv'); if (!cv || !cv.getBoundingClientRect().width) return;
 const sc = saleScan(D, NOW, NOW, 144), sale = DT.ym(saleDates(D).sale), hasRent = sc.some(x => x.rent.rented);
 const info = i => {
  if (i < 0) { $('saleCvi').textContent = '按住圖表左右拖動，看每個月賣出的實拿與稅'; return; }
  const x = sc[i];
  $('saleCvi').innerHTML = `<b>${ymTxt(x.ym)}</b>｜一直自住：實拿 ${w1(x.self.net)} 萬、稅 ${w1(x.self.tax)} 萬${x.self.selfOK ? '（自住優惠）' : `（${x.self.rate}%）`}` +
   (x.rent.rented ? `<span style="color:var(--bad)">｜出租：實拿 ${w1(x.rent.net)} 萬、稅 ${w1(x.rent.tax)} 萬（${x.rent.rate}%）</span>` : '');
 };
 const ser = [{ name: '一直自住 實拿', color: 'c1', type: 'line', data: sc.map(x => x.self.net / 1e4) },
  { name: '一直自住 稅', color: 'c1', type: 'step', axis: 'R', width: 1.5, dash: [2, 3], data: sc.map(x => x.self.tax / 1e4) }];
 if (hasRent) ser.push({ name: '出租 實拿', color: 'bad', type: 'line', dash: [5, 4], data: sc.map(x => x.rent.rented ? x.rent.net / 1e4 : null) },
  { name: '出租 稅', color: 'bad', type: 'step', axis: 'R', width: 1.5, dash: [2, 3], data: sc.map(x => x.rent.rented ? x.rent.tax / 1e4 : null) });
 const si = sc.findIndex(x => x.ym === sale);
 drawChart(cv, { x: sc.map(x => x.ym), xl: s => s.slice(2, 4) + '/' + s.slice(5), series: ser, fmtL: v => v + '萬', fmtR: v => v + '萬', now: 0, marks: si >= 0 ? [{ i: si, color: 'c4' }] : [], onHover: info });
 info(-1);
 $('saleLg').innerHTML = `<i style="background:var(--c1)"></i>一直自住：實拿（左軸）<i style="background:repeating-linear-gradient(90deg,var(--c1) 0 2px,transparent 2px 5px)"></i>稅（右軸）` +
  (hasRent ? `<i style="background:repeating-linear-gradient(90deg,var(--bad) 0 4px,transparent 4px 7px)"></i>依出租計畫` : '') + '<i style="background:var(--c4);height:8px;width:8px"></i>預計出售日';
}
