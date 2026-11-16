// 計算核心的測試：用虛構的貸款跑 js/engine.js，和「用公式獨立算出來的數字」逐項比對。
// 目的：之後改程式，房貸數字不會悄悄跑掉。不含任何個人資料、不需要安裝套件。
//   node tools/test/engine-test.mjs     全部通過結束碼 0；有錯列出並結束碼 1
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({ console });
for (const f of ['js/policy.js', 'js/state.js', 'js/engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
vm.runInContext('globalThis.__E={YM,pmt,nper,qinganLadder,rateAt,loanLadder,loanTiming,schedule,loanSummary,byYear,prepayEffect,stress,holdMonthly,rentTax,rateFrom,breachLoan,rentStart,rentLoan,rentCompare,rentBreakeven,POLICY,DEF,norm}', ctx);
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

// ---------- 8b. 單一利率（預設）
const Ls = { amt: 600, disb: '2025-01-10', yrs: 20, grace: 0, method: 'pi', rateMode: 'single', rate: 2.2 };
const Rs = E.schedule(Ls);
ok('單一利率：每期月付相同', near(Rs[0].base, P(6e6, 2.2, 240), 0.01) && near(Rs[239].base, Rs[0].base, 0.01) && Rs.length === 240 && Rs[0].ym === '2025-02');

// ---------- 9. 出租：租賃所得稅
const RM = E.POLICY.rentModes;
ok('一般出租稅 32,000×57%×20%', near(E.rentTax(32000, RM.normal, 20), 3648, 1e-6));
ok('公益出租人稅 (32,000−15,000)×57%×20%', near(E.rentTax(32000, RM.public, 20), 1938, 1e-6));
ok('社宅稅 (28,800−15,000)×40%×20%', near(E.rentTax(28800, RM.socialLease, 20), 1104, 1e-6));
ok('月租低於免稅額不課稅', E.rentTax(14000, RM.socialManage, 20) === 0);
ok('管理費季繳換月', near(E.holdMonthly({ mgmt: 7500, mgmtPer: 'q' }).mgmt, 2500, 1e-9));

// ---------- 10. 新青安違規與出租比較（虛構）
const Sx = { loan: L, hold: { mgmt: 2400, mgmtPer: 'm', houseTax: 3600, landTax: 240, selfRate: 1, incomeRate: 12 },
 rent: { start: '2027-07', rent: 28000, vac: 1, mgmtBy: 'owner', repair: 1000, myRent: 20000, breach: true, breachRate: 2.75, newRate: '' } };
const Lb = E.breachLoan(L, '2027-07', 2.75);
ok('違規前利率不變', E.rateAt(E.loanLadder(Lb), '2027-06') === 1.9 && E.rateAt(E.loanLadder(Lb), '2027-07') === 2.75);
const cN = E.rentCompare(Sx, 'normal');
ok('違規多付利息 > 0', cN.breach && cN.breachInt > 0 && cN.months === 12);
ok('一般出租房屋稅 1.5 倍', near(cN.rent.houseTax, 300 * 1.5, 1e-9) && near(cN.rent.landTax, 20 * 5, 1e-9));
const cSoc = E.rentCompare(Sx, 'socialLease');
ok('社宅包租不計空租、9 折', cSoc.rent.vac === 0 && near(cSoc.rent.income, 28000 * 0.9, 1e-9));
const noQ = E.rentCompare({ ...Sx, rent: { ...Sx.rent, breach: false, newRate: '' } }, 'normal');
ok('不違規、利率留空：利息相同', !noQ.breach && !noQ.changed && near(noQ.breachInt, 0, 1e-9) && noQ.diff > cN.diff);
const refi = E.rentCompare({ ...Sx, rent: { ...Sx.rent, breach: false, newRate: 2.4 } }, 'normal');
ok('不違規、轉貸 2.4%：從出租月起改利率', !refi.breach && refi.changed && refi.newRate === 2.4 && refi.breachInt > 0 && refi.breachInt < cN.breachInt);
const brDef = E.rentCompare({ ...Sx, rent: { ...Sx.rent, breach: true, breachRate: '', newRate: 2.4 } }, 'normal');
ok('違規、違規後利率留空用 2.75%（不用轉貸利率）', brDef.newRate === 2.75);
const be = E.rentBreakeven(Sx, 'normal');
ok('打平月租讓差額 ≈ 0', Number.isFinite(be) && Math.abs(E.rentCompare(Sx, 'normal', be).diff) < 0.01, be);
const sum = cN.rent.income - cN.rent.tax - cN.rent.pay - cN.rent.mgmt - cN.rent.houseTax - cN.rent.landTax - cN.rent.repair - cN.rent.myRent;
ok('現金流各項加總一致', near(sum, cN.rent.net, 1e-9));

// ---------- 11. 打平月租在免稅額以內也正確（公益出租人、月租低）
const Slow = { ...Sx, rent: { ...Sx.rent, myRent: 0, repair: 0, breach: false, newRate: '' } };
const beLow = E.rentBreakeven(Slow, 'public');
ok('打平月租（免稅額內外都對）', Number.isFinite(beLow) && Math.abs(E.rentCompare(Slow, 'public', beLow).diff) < 0.01, beLow);

// ---------- 12. 快取：同樣條件回傳同一份結果
ok('還款表快取', E.schedule(L) === E.schedule(JSON.parse(JSON.stringify(L))));
ok('每月多還與一次提前還款分開記', (() => { const r = E.schedule({ ...L, extra: { amt: 3000, from: '2026-04' }, pre: [{ ym: '2027-01', amt: 10, mode: 'term' }] }); const a = r.find(x => x.ym === '2027-01'); return a.ex1 === 3000 && a.pre1 === 1e5 && a.extra === 103000; })());

// ---------- 13. 設定檔轉換（舊版也能匯入）
const d0 = E.norm({});
ok('空資料補預設', d0.v === 3 && d0.loan.rateMode === 'single' && d0.view.rng === '10' && d0.view.from === 'disb' && d0.rent.breach === false);
const v1 = E.norm({ src: 'mine', mine: { v: 1, name: 'x', loan: { amt: 992, disb: '2023-10-21', rateMode: 'qingan', qa: { sub: 1.775 } }, stressBp: 50, rent: { qingan: true, breachRate: '' } }, ui: { tab: 'S' } });
ok('v1 我的資料：搬出 mine、碼數轉百分比、qingan 不沿用', v1.loan.amt === 992 && v1.loan.rateMode === 'qingan' && v1.stressPct === 0.5 && v1.rent.breach === false && !('qingan' in v1.rent) && !('name' in v1) && v1.view.tab === 'L');
const v2 = E.norm({ data: { v: 2, loan: { amt: 500 }, rent: { breach: true, newRate: 2.4 } } });
ok('v2 匯出檔：保留違規與轉貸利率', v2.loan.amt === 500 && v2.rent.breach === true && v2.rent.newRate === 2.4 && v2.view.cv === 'bal');
const v2u = E.norm({ loan: { amt: 1 }, ui: { tab: 'R', cv: 'pay', rng: 'all', pin: 1, open: { 2027: 1 } } });
ok('v2 localStorage 的 ui 搬進 view', v2u.view.tab === 'R' && v2u.view.cv === 'pay' && v2u.view.rng === 'all' && v2u.view.pin === 1 && v2u.view.open[2027] === 1);
const bad = E.norm({ loan: { rateMode: 'xx', pre: 'x' }, view: { tab: 'Z', rng: 7 } });
ok('不合法的值改回預設', bad.loan.rateMode === 'single' && Array.isArray(bad.loan.pre) && bad.view.tab === 'L' && bad.view.rng === '10');
ok('norm 不改到原物件', (() => { const o = { loan: { amt: 1 } }; E.norm(o); return !o.view; })());

// ---------- 14. 版本號：index.html 裡每個 js 的 ?v= 要一致（改版用 node tools/bump.mjs）
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const vs = [...html.matchAll(/\.js\?v=([\w.-]+)/g)].map(m => m[1]);
ok('js 版本號一致', vs.length >= 5 && new Set(vs).size === 1, [...new Set(vs)]);
const used = [...html.matchAll(/src="js\/([\w-]+)\.js/g)].map(m => m[1]);
ok('js 檔案都存在', used.every(f => fs.existsSync(path.join(ROOT, 'js', f + '.js'))), used);

console.log(`${pass} 項通過${fail ? `，${fail} 項失敗` : ''}`);
process.exit(fail ? 1 : 0);
