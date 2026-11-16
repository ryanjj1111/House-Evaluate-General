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

// 實際使用的利率階梯：single 單一利率（預設）、qingan 新青安自動產生、custom 自訂多段
function loanLadder(L) {
 if (L.rateMode === 'qingan') return qinganLadder(String(L.disb).slice(0, 7), L.qa && L.qa.sub, L.qa && L.qa.base);
 if (L.rateMode === 'custom') return L.ladder || [];
 return [{ from: String(L.disb || '').slice(0, 7), r: +L.rate || 0 }];
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
function scheduleRaw(L, opt = {}) {
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
  let ex1 = 0, pre1 = 0, shorten = false;
  if (!grace && ex && p >= YM.p(ex.from) && bal > 0.5) { ex1 = Math.min(ex.amt, bal); bal -= ex1; shorten = true; }
  // 一次提前還款
  for (const e of pre) if (YM.p(e.ym) === p && bal > 0.5) {
   const a = Math.min(+e.amt * 1e4, bal); pre1 += a; bal -= a;
   if (e.mode === 'pay') recalc = true; else shorten = true;
  }
  const extra = ex1 + pre1;
  if (!grace && bal > 0.5 && shorten && !recalc) remain = pi ? Math.max(1, nper(bal, r, pay)) : Math.max(1, Math.ceil(bal / pp - 1e-9));
  lastR = rP;
  if (bal < 0.5) bal = 0;
  rows.push({ ym, r: rP, pay: payBase + extra, base: payBase, int: it, prin, extra, ex1, pre1, bal, grace });
 }
 return rows;
}

// 同樣的貸款條件只算一次（每改一個數字，畫面會呼叫好幾十次）。回傳的陣列請當唯讀。
const SCH_CACHE = new Map();
function schedule(L, opt = {}) {
 const k = JSON.stringify([L, opt]);
 let r = SCH_CACHE.get(k);
 if (!r) { r = scheduleRaw(L, opt); if (SCH_CACHE.size > 300) SCH_CACHE.clear(); SCH_CACHE.set(k, r); }
 return r;
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

// 從某個月起改用新利率（出租後轉貸、或新青安違規後重新核定）
function rateFrom(L, from, rate) {
 const lad = loanLadder(L).filter(x => YM.p(x.from) < YM.p(from));
 return { ...L, rateMode: 'custom', ladder: [...lad, { from: String(from).slice(0, 7), r: +rate }] };
}
const breachLoan = rateFrom;   // 舊名稱
// 出租後的貸款：
//  breach（新青安出租違規）：出租那個月起改用違規後利率 breachRate（留空用政策預設 2.75%）。違規會終止補貼、追回違規日起已撥的補貼並重新核定條件，經濟上等於從違規日起就沒有補貼。
//  沒有違規：有填「出租後利率」newRate（例如轉貸成一般房貸）就從出租那個月起改用；留空＝利率不變。
function rentStart(S) { const R = S.rent || {}; return YM.ok(R.start) ? String(R.start).slice(0, 7) : loanTiming(S.loan).amStart; }
const numOrNull = v => v === '' || v == null || !Number.isFinite(+v) ? null : +v;
function rentLoan(S) {
 const L = S.loan, R = S.rent || {}, start = rentStart(S);
 if (L.rateMode === 'qingan' && R.breach === true) { const br = numOrNull(R.breachRate); return rateFrom(L, start, br != null ? br : POLICY.qinganBreach.rate); }
 const nr = numOrNull(R.newRate);
 return nr != null ? rateFrom(L, start, nr) : L;
}
// 是否轉貸：沒有違規、有填出租後利率
function isRefi(S) { const R = S.rent || {}; return !(S.loan.rateMode === 'qingan' && R.breach === true) && numOrNull(R.newRate) != null; }
// 出租後的還款表。
//  轉貸時可以重設年限、寬限期：從出租那個月起，用當時的剩餘本金開一筆新貸款（年限留空＝剩下的期數不變）。
//  其他情況（違規、只改利率、不變）沿用原本的期數，只換利率。
function rentRows(S) {
 const L = S.loan, R = S.rent || {}, start = rentStart(S), base = schedule(L);
 if (!isRefi(S)) { const RL = rentLoan(S); return RL === L ? base : schedule(RL); }
 const f = R.refi || {}, yrs = numOrNull(f.yrs), gr = Math.max(0, numOrNull(f.grace) || 0);
 if (yrs == null && !gr) return schedule(rentLoan(S));
 const p0 = YM.p(start), before = base.filter(x => YM.p(x.ym) < p0);
 const bal = before.length ? before[before.length - 1].bal : (+L.amt || 0) * 1e4;
 if (bal <= 0.5) return base;
 const left = base.filter(x => YM.p(x.ym) >= p0).length;
 const L2 = {
  amt: bal / 1e4, disb: YM.add(start, -1) + '-01', first: start, n: yrs != null ? Math.max(1, Math.round(yrs * 12)) : Math.max(gr + 1, left), grace: gr,
  method: L.method, rateMode: 'single', rate: numOrNull(R.newRate),
  pre: (L.pre || []).filter(e => YM.ok(e.ym) && YM.p(e.ym) >= p0), extra: L.extra && YM.p(L.extra.from || start) >= p0 ? L.extra : { amt: L.extra ? L.extra.amt : 0, from: start }
 };
 return before.concat(schedule(L2));
}
// 轉貸一次性費用（元）：開辦費＋代書費＋設定規費（留空＝設定金額 × 0.1%，設定金額＝本金 × 120%）＋其他＋原貸違約金（剩餘本金 × %）
function refiCost(S) {
 if (!isRefi(S)) return { total: 0, bal: 0, parts: {} };
 const f = (S.rent || {}).refi || {}, start = rentStart(S), base = schedule(S.loan), p0 = YM.p(start);
 const before = base.filter(x => YM.p(x.ym) < p0), bal = before.length ? before[before.length - 1].bal : (+S.loan.amt || 0) * 1e4;
 const P = POLICY.refi, setFee = numOrNull(f.setFee) != null ? +f.setFee : Math.round(bal * P.setRatio * P.setRate);
 const parts = { fee: +f.fee || 0, scriv: +f.scriv || 0, setFee, other: +f.other || 0, penalty: bal * (+f.penalty || 0) / 100 };
 return { total: Object.values(parts).reduce((a, b) => a + b, 0), bal, parts };
}

// 出租 vs 自住：從開始出租的月份起 12 個月的「平均每月現金流」。
// 兩邊都在還房貸本金，所以差額主要來自：租金 − 租賃所得稅 − 多付的利息 − 變重的房屋稅地價稅 − 修繕 − 自己在外面租房。
// S：{ loan, hold, rent }；rentOverride：試算不同月租（求損益兩平用）
function rentCompare(S, modeKey, rentOverride) {
 const L = S.loan, H = S.hold || {}, Rn = S.rent || {}, M = POLICY.rentModes[modeKey];
 const start = rentStart(S);
 const p0 = YM.p(start), win = rows => rows.filter(x => YM.p(x.ym) >= p0 && YM.p(x.ym) < p0 + 12);
 const avg = (A, k) => A.length ? A.reduce((s, x) => s + x[k], 0) / 12 : 0;
 const h = holdMonthly(H);
 const breach = L.rateMode === 'qingan' && Rn.breach === true, RA = rentRows(S), base = schedule(L);
 const sRows = win(base), rRows = win(RA), rc = refiCost(S);
 const market = rentOverride != null ? rentOverride : (+Rn.rent || 0);
 const mRent = market * M.factor, vac = M.noVac ? 0 : Math.min(12, Math.max(0, +Rn.vac || 0)), on = (12 - vac) / 12;
 const selfRate = +H.selfRate || 1;
 const self = { pay: avg(sRows, 'base'), int: avg(sRows, 'int'), mgmt: h.mgmt, houseTax: h.houseTax, landTax: h.landTax, income: 0, tax: 0, repair: 0, myRent: 0 };
 const rent = {
  pay: avg(rRows, 'base'), int: avg(rRows, 'int'), mgmt: Rn.mgmtBy === 'tenant' ? 0 : h.mgmt,
  houseTax: h.houseTax / selfRate * M.houseRate, landTax: h.landTax * M.landX,
  income: mRent * on, tax: rentTax(mRent, M, H.incomeRate) * on, repair: +Rn.repair || 0, myRent: +Rn.myRent || 0, mRent, vac,
  refi: rc.total / 12
 };
 self.refi = 0;
 const net = o => o.income - o.tax - o.pay - o.mgmt - o.houseTax - o.landTax - o.repair - o.myRent - o.refi;
 self.net = net(self); rent.net = net(rent);
 return { mode: modeKey, M, start, self, rent, diff: rent.net - self.net, breach, refi: isRefi(S), refiCost: rc, changed: RA !== base, newRate: RA !== base && rRows.length ? rRows[0].r : null, breachInt: rent.int - self.int, months: sRows.length };
}
// 轉貸 vs 不轉貸（新青安：直接出租違規；一般房貸：原利率）。回本月數＝一次性費用 ÷ 每月少付的月付
function refiCompare(S) {
 if (!isRefi(S)) return null;
 const start = rentStart(S), p0 = YM.p(start), q = S.loan.rateMode === 'qingan';
 const alt = { ...S, rent: { ...S.rent, breach: q, newRate: '' } };
 const A = rentRows(S).filter(x => YM.p(x.ym) >= p0), B = rentRows(alt).filter(x => YM.p(x.ym) >= p0);
 const m12 = X => X.slice(0, 12).reduce((s, x) => s + x.base, 0) / 12, sum = (X, k) => X.reduce((s, x) => s + x[k], 0);
 const c = refiCost(S), save = m12(B) - m12(A);
 return { alt: q ? 'breach' : 'keep', cost: c, payA: m12(A), payB: m12(B), save, payback: save > 0 ? Math.ceil(c.total / save) : Infinity,
  intA: sum(A, 'int'), intB: sum(B, 'int'), endA: A.length ? A[A.length - 1].ym : '', endB: B.length ? B[B.length - 1].ym : '', rateA: A.length ? A[0].r : 0, rateB: B.length ? B[0].r : 0 };
}

// 損益兩平月租：出租後每月現金流＝自住時的月租（市場租金）。找不到回傳 Infinity
// 差額對月租 m 是分段直線：租金 m×f×on，租賃所得稅 max(0, m×f − 免稅額)×(1−費用率)×稅率×on，其餘和月租無關。
function rentBreakeven(S, modeKey) {
 const c0 = rentCompare(S, modeKey, 0), M = c0.M, on = (12 - c0.rent.vac) / 12, f = M.factor;
 const k = (1 - M.exp) * (+(S.hold || {}).incomeRate || 0) / 100;
 const s1 = f * on, s2 = f * on * (1 - k), d0 = c0.diff;
 if (d0 >= 0) return 0;
 if (s1 <= 0) return Infinity;
 const m1 = (M.exempt || 0) / f, d1 = d0 + s1 * m1;
 if (d1 >= 0) return -d0 / s1;
 return s2 > 0 ? m1 - d1 / s2 : Infinity;
}

if (typeof module !== 'undefined') module.exports = { YM, pmt, nper, qinganLadder, rateAt, loanLadder, loanTiming, schedule, scheduleRaw, loanSummary, byYear, prepayEffect, stress, holdMonthly, rentTax, rateFrom, breachLoan, rentStart, rentLoan, isRefi, rentRows, refiCost, refiCompare, rentCompare, rentBreakeven };
