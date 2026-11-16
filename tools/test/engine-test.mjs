// 計算核心的測試：用虛構的貸款跑 js/engine.js，和「用公式獨立算出來的數字」逐項比對。
// 目的：之後改程式，房貸數字不會悄悄跑掉。不含任何個人資料、不需要安裝套件。
//   node tools/test/engine-test.mjs     全部通過結束碼 0；有錯列出並結束碼 1
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({ console });
for (const f of ['js/policy.js', 'js/engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
vm.runInContext('globalThis.__E={YM,pmt,nper,qinganLadder,rateAt,loanLadder,loanTiming,schedule,loanSummary,byYear,prepayEffect,stress,holdMonthly,rentTax,breachLoan,rentCompare,rentBreakeven,POLICY}', ctx);
const E = ctx.__E;

let fail = 0, pass = 0;
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
function ok(name, cond, info = '') { if (cond) pass++; else { fail++; console.log('✗', name, info); } }
const P = (P0, rPct, n) => { const i = rPct / 1200; return P0 * i / (1 - Math.pow(1 + i, -n)); };

// ---------- 1. 基本公式
ok('pmt 1000萬 2% 360期', near(E.pmt(1e7, 0.02, 360), 36961.6, 0.5), E.pmt(1e7, 0.02, 360));
ok('pmt 零利率', near(E.pmt(1200, 0, 12), 100, 1e-9));
ok('nper 反推', E.nper(1e7, 0.02, E.pmt(1e7, 0.02, 360)) === 360);
ok('年月加減', E.YM.add('2026-11', 3) === '2027-02' && E.YM.diff('2023-10', '2026-10') === 36);

// ---------- 2. 新青安階梯（虛構撥款 2024-03）
const Q = E.qinganLadder('2024-03', 1.775);
ok('新青安階梯 5 段', Q.length === 5, JSON.stringify(Q));
ok('第 4 年 +半碼', Q[1].from === '2027-03' && near(Q[1].r, 1.9, 1e-9));
ok('第 6 年 +1.5 碼', Q[3].from === '2029-03' && near(Q[3].r, 2.15, 1e-9));
ok('第 7 年回原利率', Q[4].from === '2030-03' && near(Q[4].r, 2.275, 1e-9));
ok('rateAt 取當期', E.rateAt(Q, '2027-02') === 1.775 && E.rateAt(Q, '2027-03') === 1.9);
ok('rateAt 升息 1 碼', near(E.rateAt(Q, '2028-01', { from: '2027-06', bp: 25 }), 2.15, 1e-9));

// ---------- 3. 虛構貸款：800 萬、30 年、寬限 24 期、新青安
const L = { amt: 800, disb: '2024-03-15', n: 360, grace: 24, method: 'pi', rateMode: 'qingan', qa: { sub: 1.775, base: '' } };
const T = E.loanTiming(L);
ok('首期＝撥款次月', T.first === '2024-04');
ok('首次本息月', T.amStart === '2026-04' && T.amN === 336 && T.graceN === 24, JSON.stringify(T));
const R = E.schedule(L);
const g = R.find(x => x.ym === '2025-01');
ok('寬限期只繳息', g.grace && near(g.pay, 8e6 * 0.01775 / 12, 0.01) && g.bal === 8e6);
const a1 = R.find(x => x.ym === '2026-04');
ok('首期本息＝公式', near(a1.base, P(8e6, 1.775, 336), 0.01), a1.base);
// 2027-03 利率變 1.9%：用當時剩餘本金、剩餘期數重算
const before = R.find(x => x.ym === '2027-02'), chg = R.find(x => x.ym === '2027-03');
const left = 336 - E.YM.diff('2026-04', '2027-03');
ok('利率變動後重算月付', near(chg.base, P(before.bal, 1.9, left), 0.01), [chg.base, P(before.bal, 1.9, left)]);
ok('期數與還清月', R.length === 360 && R[R.length - 1].ym === '2054-03' && R[R.length - 1].bal === 0, [R.length, R[R.length - 1].ym]);
const sumPrin = R.reduce((s, x) => s + x.prin + x.extra, 0);
ok('本金合計＝貸款', near(sumPrin, 8e6, 1), sumPrin);

// ---------- 4. 本金均攤
const Lp = { ...L, method: 'pp' }, Rp = E.schedule(Lp), p1 = Rp.find(x => x.ym === '2026-04');
ok('本金均攤每期本金', near(p1.prin, 8e6 / 336, 0.01));
ok('本金均攤總利息較少', Rp.reduce((s, x) => s + x.int, 0) < R.reduce((s, x) => s + x.int, 0));

// ---------- 5. 提前還款
const Lt = { ...L, pre: [{ ym: '2028-01', amt: 100, mode: 'term' }] };
const et = E.prepayEffect(Lt, '2026-01');
const Rt = E.schedule(Lt), t0 = Rt.find(x => x.ym === '2027-12'), t2 = Rt.find(x => x.ym === '2028-02');
ok('縮短年限：月付不變', near(t2.base, t0.base, 0.01));
ok('縮短年限：提早還清、省利息', et.months > 0 && et.saved > 0, JSON.stringify({ m: et.months, s: et.saved }));
const Lq = { ...L, pre: [{ ym: '2028-01', amt: 100, mode: 'pay' }] };
const Rq = E.schedule(Lq), q1 = Rq.find(x => x.ym === '2028-01'), q2 = Rq.find(x => x.ym === '2028-02');
const leftQ = 336 - E.YM.diff('2026-04', '2028-02');
ok('降低月付：期數不變、月付重算', Rq.length === 360 && near(q2.base, P(q1.bal, 1.9, leftQ), 0.01), [q2.base, P(q1.bal, 1.9, leftQ)]);
const Le = { ...L, extra: { amt: 5000, from: '2026-04' } };
const ee = E.prepayEffect(Le, '2026-01');
ok('每月多還 5,000：提早還清', ee.months > 0 && ee.saved > 0);

// ---------- 6. 首次本息月、本息期數可以覆寫（配合銀行實際排程）
const Lo = { ...L, amStart: '2026-03', amN: 337 };
const To = E.loanTiming(Lo);
ok('覆寫首次本息月', To.graceN === 23 && To.amN === 337 && To.last === '2054-03');

// ---------- 7. 升息壓力
const S = E.stress(L, '2027-06', [25, 50]);
ok('升息 1 碼月付增加', S[0].dPay > 0 && S[1].dPay > S[0].dPay && S[1].dInt > S[0].dInt);

// ---------- 8. 年度彙總
const Y = E.byYear(R);
ok('年度彙總加總一致', near(Y.reduce((s, x) => s + x.int, 0), R.reduce((s, x) => s + x.int, 0), 0.01) && Y[0].y === '2024');

// ---------- 9. 出租：租賃所得稅
const RM = E.POLICY.rentModes;
ok('一般出租稅 32,000×57%×20%', near(E.rentTax(32000, RM.normal, 20), 3648, 1e-6));
ok('公益出租人稅 (32,000−15,000)×57%×20%', near(E.rentTax(32000, RM.public, 20), 1938, 1e-6));
ok('社宅稅 (28,800−15,000)×40%×20%', near(E.rentTax(28800, RM.socialLease, 20), 1104, 1e-6));
ok('月租低於免稅額不課稅', E.rentTax(14000, RM.socialManage, 20) === 0);
ok('管理費季繳換月', near(E.holdMonthly({ mgmt: 7500, mgmtPer: 'q' }).mgmt, 2500, 1e-9));

// ---------- 10. 新青安違規與出租比較（虛構）
const Sx = { loan: L, hold: { mgmt: 2400, mgmtPer: 'm', houseTax: 3600, landTax: 240, selfRate: 1, incomeRate: 12 },
 rent: { start: '2027-07', rent: 28000, vac: 1, mgmtBy: 'owner', repair: 1000, myRent: 20000, qingan: true, breachRate: 2.75 } };
const Lb = E.breachLoan(L, '2027-07', 2.75);
ok('違規前利率不變', E.rateAt(E.loanLadder(Lb), '2027-06') === 1.9 && E.rateAt(E.loanLadder(Lb), '2027-07') === 2.75);
const cN = E.rentCompare(Sx, 'normal');
ok('違規多付利息 > 0', cN.breach && cN.breachInt > 0 && cN.months === 12);
ok('一般出租房屋稅 1.5 倍', near(cN.rent.houseTax, 300 * 1.5, 1e-9) && near(cN.rent.landTax, 20 * 5, 1e-9));
const cSoc = E.rentCompare(Sx, 'socialLease');
ok('社宅包租不計空租、9 折', cSoc.rent.vac === 0 && near(cSoc.rent.income, 28000 * 0.9, 1e-9));
const noQ = E.rentCompare({ ...Sx, rent: { ...Sx.rent, qingan: false } }, 'normal');
ok('不計違規時利息相同', !noQ.breach && near(noQ.breachInt, 0, 1e-9) && noQ.diff > cN.diff);
const be = E.rentBreakeven(Sx, 'normal');
ok('打平月租讓差額 ≈ 0', Number.isFinite(be) && Math.abs(E.rentCompare(Sx, 'normal', be).diff) < 0.01, be);
const sum = cN.rent.income - cN.rent.tax - cN.rent.pay - cN.rent.mgmt - cN.rent.houseTax - cN.rent.landTax - cN.rent.repair - cN.rent.myRent;
ok('現金流各項加總一致', near(sum, cN.rent.net, 1e-9));

console.log(`${pass} 項通過${fail ? `，${fail} 項失敗` : ''}`);
process.exit(fail ? 1 : 0);
