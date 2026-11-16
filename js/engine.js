// 房屋試算｜計算核心（純函式，不碰畫面；可用 node 測試：node tools/test/engine-test.mjs）
// 目前內容（P1）：房貸。多段利率、新青安補貼遞減、寬限期、本息／本金均攤、提前還款、升息壓力、年度彙總。
// 金額：設定裡的貸款與提前還款用「萬元」，每月額外還款用「元」；計算與輸出一律用「元」。利率用「%」。
// https://ryanjj1111.github.io/House-Evaluate-General/

// ---------- 年月工具（'2026-10' 這種字串）
const YM = {
 p(s) { const m = /^(\d{4})-(\d{1,2})/.exec(String(s || '')); return m ? (+m[1]) * 12 + (+m[2] - 1) : NaN; },
 s(n) { const y = Math.floor(n / 12), m = n - y * 12 + 1; return y + '-' + String(m).padStart(2, '0'); },
 add(s, k) { return YM.s(YM.p(s) + k); },
 diff(a, b) { return YM.p(b) - YM.p(a); },
 ok(s) { return Number.isFinite(YM.p(s)); }
};

// 每期本息均攤月付（P 本金、r 年利率小數、n 期數）
function pmt(P, r, n) {
 if (n <= 0) return P;
 const i = r / 12;
 if (Math.abs(i) < 1e-12) return P / n;
 return P * i / (1 - Math.pow(1 + i, -n));
}
// 固定月付下，還清 P 需要幾期
function nper(P, r, pay) {
 if (P <= 0) return 0;
 const i = r / 12;
 if (Math.abs(i) < 1e-12) return Math.ceil(P / pay - 1e-9);
 const x = 1 - P * i / pay;
 if (x <= 0) return Infinity;
 return Math.ceil(-Math.log(x) / Math.log(1 + i) - 1e-9);
}

// 新青安補貼遞減的利率階梯。disb：撥款年月；sub：補貼後利率（%）；base：原利率（%，留空＝sub＋補貼合計）
function qinganLadder(disb, sub, base, P = (typeof POLICY !== 'undefined' ? POLICY.qingan : { full: 36, step: 0.125, steps: 3, sub: 0.5 })) {
 const d = String(disb).slice(0, 7), b = Number.isFinite(+base) && base !== '' && base !== null ? +base : +sub + P.sub;
 const L = [{ from: d, r: +sub }];
 for (let k = 1; k <= P.steps; k++) L.push({ from: YM.add(d, P.full + (k - 1) * 12), r: Math.min(b, round4(+sub + P.step * k)) });
 L.push({ from: YM.add(d, P.full + P.steps * 12), r: b });
 return L;
}
const round4 = v => Math.round(v * 1e4) / 1e4;

// 某個月適用的利率（%）。ladder：[{from:'YYYY-MM', r:%}]；shock：{from, bp}（升息幾個基點，1 碼＝25）
function rateAt(ladder, ym, shock) {
 const L = (ladder || []).filter(x => YM.ok(x.from) && Number.isFinite(+x.r)).sort((a, b) => YM.p(a.from) - YM.p(b.from));
 if (!L.length) return 0;
 const p = YM.p(ym);
 let r = +L[0].r;
 for (const x of L) if (YM.p(x.from) <= p) r = +x.r;
 if (shock && +shock.bp && (!shock.from || YM.p(shock.from) <= p)) r += shock.bp / 100;
 return r;
}

// 實際使用的利率階梯（新青安模式自動產生；自訂模式用使用者的表）
function loanLadder(L) {
 return L.rateMode === 'qingan' ? qinganLadder(String(L.disb).slice(0, 7), L.qa && L.qa.sub, L.qa && L.qa.base) : (L.ladder || []);
}

// 期數相關的推導值：首期、首次本息月、本息期數、寬限期期數
function loanTiming(L) {
 const disb = String(L.disb || '').slice(0, 7);
 const first = YM.ok(L.first) ? String(L.first).slice(0, 7) : YM.add(disb, 1);
 const G = Math.max(0, L.grace | 0);
 const amStart = YM.ok(L.amStart) ? String(L.amStart).slice(0, 7) : YM.add(first, G);
 const n = (+L.n > 0) ? (L.n | 0) : Math.round((+L.yrs || 30) * 12);
 const amN = (+L.amN > 0) ? (L.amN | 0) : Math.max(1, n - G);
 return { disb, first, amStart, amN, graceN: Math.max(0, YM.diff(first, amStart)), last: YM.add(amStart, amN - 1) };
}

// 還款明細（逐月）。opt.noPre：不含提前還款（當基準）；opt.shock：{from, bp} 升息壓力
// 規則：
//  1. 寬限期只繳利息（可提前還款，本金減少）。
//  2. 本息均攤：利率改變或「降低月付」型提前還款後，用「剩餘本金、剩餘期數」重算月付（浮動利率房貸的做法）。
//  3. 「縮短年限」型提前還款、每月額外還款：月付不變，剩餘期數重新計算。
//  4. 本金均攤：每期本金＝剩餘本金 ÷ 剩餘期數，利息另計。
function schedule(L, opt = {}) {
 const T = loanTiming(L), ladder = loanLadder(L), shock = opt.shock;
 const pre = opt.noPre ? [] : (L.pre || []).filter(e => YM.ok(e.ym) && +e.amt > 0);
 const ex = opt.noPre ? null : (L.extra && +L.extra.amt > 0 ? { amt: +L.extra.amt, from: YM.ok(L.extra.from) ? L.extra.from : T.amStart } : null);
 const pi = L.method !== 'pp';
 let bal = (+L.amt || 0) * 1e4, remain = T.amN, pay = null, pp = null, lastR = null, recalc = true;
 const rows = [], pS = YM.p(T.first), pA = YM.p(T.amStart);
 for (let p = pS; bal > 0.5 && p < pS + 12 * 60; p++) {
  const ym = YM.s(p), rP = rateAt(ladder, ym, shock), r = rP / 100, it = bal * r / 12;
  let prin = 0, payBase = it, grace = p < pA;
  if (!grace) {
   if (remain <= 0) remain = 1;
   if (recalc || rP !== lastR) { if (pi) pay = pmt(bal, r, remain); else pp = bal / remain; recalc = false; }
   prin = pi ? pay - it : pp;
   if (prin > bal) prin = bal;
   payBase = prin + it;
   bal -= prin; remain -= 1;
  }
  // 每月額外還款（縮短年限）
  let extra = 0, shorten = false;
  if (!grace && ex && p >= YM.p(ex.from) && bal > 0.5) { extra = Math.min(ex.amt, bal); bal -= extra; shorten = true; }
  // 一次提前還款
  for (const e of pre) if (YM.p(e.ym) === p && bal > 0.5) {
   const a = Math.min(+e.amt * 1e4, bal); extra += a; bal -= a;
   if (e.mode === 'pay') recalc = true; else shorten = true;
  }
  if (!grace && bal > 0.5 && shorten && !recalc) remain = pi ? Math.max(1, nper(bal, r, pay)) : Math.max(1, Math.ceil(bal / pp - 1e-9));
  lastR = rP;
  if (bal < 0.5) bal = 0;
  rows.push({ ym, r: rP, pay: payBase + extra, base: payBase, int: it, prin, extra, bal, grace });
 }
 return rows;
}

// 總結。now：今天的年月（決定「目前月付」「已繳／未繳利息」）
function loanSummary(L, now, opt = {}) {
 const rows = schedule(L, opt), T = loanTiming(L), pn = YM.p(now);
 const sum = (A, k) => A.reduce((s, x) => s + x[k], 0);
 const past = rows.filter(x => YM.p(x.ym) < pn), fut = rows.filter(x => YM.p(x.ym) >= pn);
 const cur = fut[0] || null;
 return {
  rows, T, cur,
  balNow: past.length ? past[past.length - 1].bal : (+L.amt || 0) * 1e4,
  intTotal: sum(rows, 'int'), intPaid: sum(past, 'int'), intFuture: sum(fut, 'int'),
  paidTotal: sum(rows, 'pay'), payoff: rows.length ? rows[rows.length - 1].ym : '', n: rows.length,
  firstAm: rows.find(x => !x.grace) || null,
  maxPay: rows.reduce((m, x) => Math.max(m, x.base), 0)
 };
}

// 年度彙總（日曆年）
function byYear(rows) {
 const M = new Map();
 for (const x of rows) {
  const y = x.ym.slice(0, 4);
  if (!M.has(y)) M.set(y, { y, pay: 0, int: 0, prin: 0, extra: 0, bal: 0, rMin: x.r, rMax: x.r, n: 0, grace: 0 });
  const o = M.get(y);
  o.pay += x.pay; o.int += x.int; o.prin += x.prin; o.extra += x.extra; o.bal = x.bal; o.n++; o.grace += x.grace ? 1 : 0;
  o.rMin = Math.min(o.rMin, x.r); o.rMax = Math.max(o.rMax, x.r);
 }
 return [...M.values()];
}

// 提前還款效果：和「不提前還款」比較
function prepayEffect(L, now) {
 const a = loanSummary(L, now), b = loanSummary(L, now, { noPre: true });
 return { saved: b.intTotal - a.intTotal, months: b.n - a.n, payoff: a.payoff, payoff0: b.payoff, with: a, without: b };
}

// 升息壓力：從 from 起利率加 bp，回傳目前月付與總利息的變化
function stress(L, now, bpList = [25, 50]) {
 const base = loanSummary(L, now);
 return bpList.map(bp => {
  const s = loanSummary(L, now, { shock: { from: now, bp } });
  return { bp, pay: s.cur ? s.cur.base : 0, dPay: (s.cur ? s.cur.base : 0) - (base.cur ? base.cur.base : 0), dInt: s.intTotal - base.intTotal };
 });
}

// ================= 出租（P2）=================
// 持有成本換算成每月（自住時的金額）。H：{ mgmt, mgmtPer:'m'|'q'|'y', houseTax(元/年), landTax(元/年) }
function holdMonthly(H = {}) {
 const per = H.mgmtPer === 'q' ? 3 : H.mgmtPer === 'y' ? 12 : 1;
 return { mgmt: (+H.mgmt || 0) / per, houseTax: (+H.houseTax || 0) / 12, landTax: (+H.landTax || 0) / 12 };
}
// 某一個月的租賃所得稅（m：當月實收租金；rate：綜所稅邊際稅率 %）
//   應稅所得 = max(0, 月租 − 每屋每月免稅額) × (1 − 必要費用率)
function rentTax(m, M, rate) { return Math.max(0, m - (M.exempt || 0)) * (1 - M.exp) * (+rate || 0) / 100; }

// 新青安違規：出租那個月起改用「違規後利率」。
// 違規會終止補貼、追回違規日起已撥的補貼並重新核定條件，經濟上等於從違規日起就沒有補貼；這裡用一個重新核定後的利率代表。
function breachLoan(L, from, rate) {
 const lad = loanLadder(L).filter(x => YM.p(x.from) < YM.p(from));
 return { ...L, rateMode: 'custom', ladder: [...lad, { from: String(from).slice(0, 7), r: +rate }] };
}

// 出租 vs 自住：從開始出租的月份起 12 個月的「平均每月現金流」。
// 兩邊都在還房貸本金，所以差額主要來自：租金 − 租賃所得稅 − 多付的利息 − 變重的房屋稅地價稅 − 修繕 − 自己在外面租房。
// S：{ loan, hold, rent }；rentOverride：試算不同月租（求損益兩平用）
function rentCompare(S, modeKey, rentOverride) {
 const L = S.loan, H = S.hold || {}, Rn = S.rent || {}, M = POLICY.rentModes[modeKey];
 const start = YM.ok(Rn.start) ? String(Rn.start).slice(0, 7) : loanTiming(L).amStart;
 const p0 = YM.p(start), win = rows => rows.filter(x => YM.p(x.ym) >= p0 && YM.p(x.ym) < p0 + 12);
 const avg = (A, k) => A.length ? A.reduce((s, x) => s + x[k], 0) / 12 : 0;
 const h = holdMonthly(H);
 const breach = L.rateMode === 'qingan' && Rn.qingan !== false;
 const sRows = win(schedule(L)), rRows = win(schedule(breach ? breachLoan(L, start, Rn.breachRate === '' || Rn.breachRate == null ? POLICY.qinganBreach.rate : Rn.breachRate) : L));
 const market = rentOverride != null ? rentOverride : (+Rn.rent || 0);
 const mRent = market * M.factor, vac = M.noVac ? 0 : Math.min(12, Math.max(0, +Rn.vac || 0)), on = (12 - vac) / 12;
 const selfRate = +H.selfRate || 1;
 const self = { pay: avg(sRows, 'base'), int: avg(sRows, 'int'), mgmt: h.mgmt, houseTax: h.houseTax, landTax: h.landTax, income: 0, tax: 0, repair: 0, myRent: 0 };
 const rent = {
  pay: avg(rRows, 'base'), int: avg(rRows, 'int'), mgmt: Rn.mgmtBy === 'tenant' ? 0 : h.mgmt,
  houseTax: h.houseTax / selfRate * M.houseRate, landTax: h.landTax * M.landX,
  income: mRent * on, tax: rentTax(mRent, M, H.incomeRate) * on, repair: +Rn.repair || 0, myRent: +Rn.myRent || 0, mRent, vac
 };
 const net = o => o.income - o.tax - o.pay - o.mgmt - o.houseTax - o.landTax - o.repair - o.myRent;
 self.net = net(self); rent.net = net(rent);
 return { mode: modeKey, M, start, self, rent, diff: rent.net - self.net, breach, breachInt: rent.int - self.int, months: sRows.length };
}
// 損益兩平月租：出租後每月現金流＝自住時的月租（市場租金）。找不到回傳 Infinity
function rentBreakeven(S, modeKey) {
 let lo = 0, hi = 500000;
 if (rentCompare(S, modeKey, hi).diff < 0) return Infinity;
 for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (rentCompare(S, modeKey, mid).diff < 0) lo = mid; else hi = mid; }
 return hi;
}

if (typeof module !== 'undefined') module.exports = { YM, pmt, nper, qinganLadder, rateAt, loanLadder, loanTiming, schedule, loanSummary, byYear, prepayEffect, stress, holdMonthly, rentTax, breachLoan, rentCompare, rentBreakeven };
