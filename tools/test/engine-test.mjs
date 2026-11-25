// 計算核心的測試：用虛構的貸款跑 js/engine.js，和「用公式獨立算出來的數字」逐項比對。
// 目的：之後改程式，房貸數字不會悄悄跑掉。不含任何個人資料、不需要安裝套件。
//   node tools/test/engine-test.mjs     全部通過結束碼 0；有錯列出並結束碼 1
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({ console });
for (const f of ['js/policy.js', 'js/state.js', 'js/engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
vm.runInContext('globalThis.__E={YM,pmt,nper,qinganLadder,rateAt,loanLadder,loanTiming,schedule,loanSummary,byYear,prepayEffect,stress,holdMonthly,rentTax,rateFrom,breachLoan,rentStart,rentLoan,isRefi,rentRows,refiCost,refiCompare,rentCompare,rentBreakeven,POLICY,DEF,norm,DT,holdRate,nextRateDrop,saleDates,saleCalc,saleScan}', ctx);
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

// ---------- 12b. 轉貸
const Sr = { ...Sx, rent: { ...Sx.rent, breach: false, newRate: 2.4, refi: { yrs: '', grace: 0, fee: 5000, scriv: 8000, setFee: '', other: 3000, penalty: 0 } } };
ok('轉貸判斷', E.isRefi(Sr) && !E.isRefi(Sx) && !E.isRefi({ ...Sr, rent: { ...Sr.rent, newRate: '' } }));
const rc = E.refiCost(Sr), balR = E.schedule(L).filter(x => x.ym < '2027-07').pop().bal;
ok('轉貸費用：設定規費自動＝本金×120%×0.1%', near(rc.parts.setFee, Math.round(balR * 1.2 * 0.001), 0.5) && near(rc.total, 16000 + rc.parts.setFee, 0.5), rc);
const rc2 = E.refiCost({ ...Sr, rent: { ...Sr.rent, refi: { ...Sr.rent.refi, setFee: 1000, penalty: 1 } } });
ok('轉貸費用：手填設定規費、違約金 1%', near(rc2.total, 17000 + balR * 0.01, 0.5));
const same = E.rentRows(Sr), viaRate = E.schedule(E.rentLoan(Sr));
ok('年限留空＝只換利率', same.length === viaRate.length && near(same[same.length - 1].bal, 0, 1));
const S30 = { ...Sr, rent: { ...Sr.rent, refi: { ...Sr.rent.refi, yrs: 30 } } }, R30 = E.rentRows(S30);
const r0 = R30.find(x => x.ym === '2027-07');
ok('轉貸重設 30 年：從出租月起 360 期、月付＝公式', R30[R30.length - 1].ym === E.YM.add('2027-07', 359) && near(r0.base, P(balR, 2.4, 360), 0.01), [R30[R30.length - 1].ym, r0.base]);
const Sg = { ...Sr, rent: { ...Sr.rent, refi: { ...Sr.rent.refi, yrs: 30, grace: 12 } } }, Rg = E.rentRows(Sg);
ok('轉貸寬限 12 個月只繳息', Rg.find(x => x.ym === '2027-07').grace && !Rg.find(x => x.ym === '2028-07').grace);
const rx = E.refiCompare(Sr);
ok('轉貸 vs 違規：月付較低、回本月數＝費用÷每月少付', rx.alt === 'breach' && rx.save > 0 && rx.payback === Math.ceil(rx.cost.total / rx.save) && near(rx.rateB, 2.75, 1e-9) && near(rx.rateA, 2.4, 1e-9));
const cR = E.rentCompare(Sr, 'normal');
ok('出租比較含轉貸費用÷12', cR.refi && near(cR.rent.refi, rc.total / 12, 1e-9) && cR.self.refi === 0);
ok('設定檔轉換補上轉貸欄位', E.norm({ rent: { refi: { fee: 1 } } }).rent.refi.scriv === 8000 && E.norm({ rent: { refi: { fee: 1 } } }).rent.refi.fee === 1);

// ---------- 12c. 出售與房地合一稅（虛構）
ok('稅率邊界：滿 2 年當天 45%、隔天 35%', E.holdRate('2024-03-15', '2026-03-15') === 45 && E.holdRate('2024-03-15', '2026-03-16') === 35);
ok('稅率邊界：滿 5 年當天 35%、滿 10 年當天 20%、之後 15%', E.holdRate('2024-03-15', '2029-03-15') === 35 && E.holdRate('2024-03-15', '2029-03-16') === 20 && E.holdRate('2024-03-15', '2034-03-15') === 20 && E.holdRate('2024-03-15', '2034-03-16') === 15);
ok('2/29 加年', E.DT.addY('2024-02-29', 1) === '2025-02-28');
ok('下一次降稅日', E.nextRateDrop('2024-03-15', '2027-01-01') === '2029-03-16' && E.nextRateDrop('2024-03-15', '2035-01-01') === null);
const SS = { loan: L, hold: Sx.hold, rent: { ...Sx.rent, breach: false, newRate: '' },
 house: { buyDate: '2024-03-10', price: 1000, buyCost: 200000, improve: 0, selfSince: '' },
 sale: { date: '2030-03-20', priceMode: 'fixed', price: 1600, est: '', growth: 0, brokerPct: 2, other: 10000, feeMode: 'actual', landGain: 20, usedSelf: false, landUsed: false } };
const sa = E.saleCalc(SS, '2026-01');
const gainA = 16e6 - 10e6 - 2e5 - (16e6 * 0.02 + 10000) - 2e5;
ok('課稅所得', near(sa.gain, gainA, 0.01), [sa.gain, gainA]);
ok('自住滿 6 年：400 萬內免稅、超過 10%', sa.selfOK && near(sa.tax, (gainA - 4e6) * 0.1, 0.01), [sa.tax, sa.why]);
ok('土增稅自用 10%', sa.landSelf && near(sa.landTax, 2e5 * 0.1, 0.01));
const balAt = E.schedule(L).filter(x => x.ym < '2030-03').pop().bal;
ok('還清房貸＝出售前一個月的餘額', near(sa.loanBal, balAt, 0.01));
ok('實拿＝售價−費用−土增稅−房地合一稅−房貸', near(sa.net, 16e6 - sa.fee - sa.landTax - sa.tax - balAt, 0.01));
const sr = E.saleCalc(SS, '2026-01', { rented: true });
ok('出租過：不能用自住優惠，改用 20%（持有 6 年）', !sr.selfOK && sr.rate === 20 && near(sr.tax, gainA * 0.2, 0.01) && sr.why.some(w => w.includes('出租')));
ok('出租過：土增稅一般 20%', !sr.landSelf && near(sr.landTax, 2e5 * 0.2, 0.01));
const s5 = E.saleCalc({ ...SS, sale: { ...SS.sale, date: '2028-06-01' } }, '2026-01');
ok('自住未滿 6 年：用持有期間稅率 35%', !s5.selfOK && s5.rate === 35 && near(s5.tax, (16e6 - 10e6 - 2e5 - (16e6 * 0.02 + 10000) - 2e5) * 0.35, 0.01));
const snc = E.saleCalc({ ...SS, sale: { ...SS.sale, feeMode: 'nocert' } }, '2026-01');
ok('沒有單據：費用＝成交價 3%，上限 30 萬', near(snc.fee, 300000, 0.01));
const sg = E.saleCalc({ ...SS, sale: { ...SS.sale, priceMode: 'growth', est: 1200, growth: 2 } }, '2026-03');
ok('房價成長：目前估價 × (1+g)^年數', near(sg.price, 12e6 * Math.pow(1.02, 4), 1));
const sd = E.saleDates({ ...SS, house: { ...SS.house, buyDate: '' }, sale: { ...SS.sale, date: '' } });
ok('預設：取得日＝撥款日、出售日＝自住滿 6 年隔天', sd.buy === '2024-03-15' && sd.sale === '2030-03-16');
const scan = E.saleScan(SS, '2026-01', '2028-01', 36);
const jump = scan.findIndex(x => x.self.selfOK);
ok('逐月掃描：滿 6 年那個月起可用自住優惠', scan.length === 36 && jump > 0 && scan[jump].ym === '2030-03' && !scan[jump - 1].self.selfOK, scan[jump] && scan[jump].ym);

// ---------- 13. 設定檔轉換（舊版也能匯入）
const d0 = E.norm({});
ok('空資料補預設', d0.v === 4 && d0.house.btype === '大樓' && d0.house.park === false && d0.view.mk.age === '5' && d0.view.mk.soc === true && d0.loan.rateMode === 'single' && d0.view.rng === '10' && d0.view.from === 'disb' && d0.rent.breach === false);
const v1 = E.norm({ src: 'mine', mine: { v: 1, name: 'x', loan: { amt: 992, disb: '2023-10-21', rateMode: 'qingan', qa: { sub: 1.775 } }, stressBp: 50, rent: { qingan: true, breachRate: '' } }, ui: { tab: 'S' } });
ok('v1 我的資料：搬出 mine、碼數轉百分比、qingan 不沿用', v1.loan.amt === 992 && v1.loan.rateMode === 'qingan' && v1.stressPct === 0.5 && v1.rent.breach === false && !('qingan' in v1.rent) && !('name' in v1) && v1.view.tab === 'L');
const v2 = E.norm({ data: { v: 2, loan: { amt: 500 }, rent: { breach: true, newRate: 2.4 } } });
ok('v2 匯出檔：保留違規與轉貸利率', v2.loan.amt === 500 && v2.rent.breach === true && v2.rent.newRate === 2.4 && v2.view.cv === 'bal');
const v2u = E.norm({ loan: { amt: 1 }, ui: { tab: 'R', cv: 'pay', rng: 'all', pin: 1, open: { 2027: 1 } } });
ok('v2 localStorage 的 ui 搬進 view', v2u.view.tab === 'R' && v2u.view.cv === 'pay' && v2u.view.rng === 'all' && v2u.view.pin === 1 && v2u.view.open[2027] === 1);
const bad = E.norm({ loan: { rateMode: 'xx', pre: 'x' }, view: { tab: 'Z', rng: 7 } });
ok('不合法的值改回預設', bad.loan.rateMode === 'single' && Array.isArray(bad.loan.pre) && bad.view.tab === 'L' && bad.view.rng === '10');
const v3 = E.norm({ v: 3, house: { city: 'b', dist: '南區', rooms: 3, ping: 31.9 }, view: { fold: { market: 1 }, mk: { age: '10' } } });
ok('v3 → v4：房屋補完工年、型態、車位，保留原值與收合', v3.v === 4 && v3.house.rooms === 3 && v3.house.built === '' && v3.house.btype === '大樓' && v3.house.park === false && v3.view.fold.market === 1 && v3.view.mk.age === '10' && v3.view.mk.type === 'same');
ok('舊的明細分頁（Y）改回房貸頁', E.norm({ view: { tab: 'Y' } }).view.tab === 'L' && E.norm({ view: { tab: 'X' } }).view.tab === 'X');
ok('norm 不改到原物件', (() => { const o = { loan: { amt: 1 } }; E.norm(o); return !o.view; })());

// ---------- 14. 版本號：index.html 裡每個 js 的 ?v= 要一致（改版用 node tools/bump.mjs）
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const vs = [...html.matchAll(/\.js\?v=([\w.-]+)/g)].map(m => m[1]);
ok('js 版本號一致', vs.length >= 5 && new Set(vs).size === 1, [...new Set(vs)]);
const used = [...html.matchAll(/src="js\/([\w-]+)\.js/g)].map(m => m[1]);
ok('js 檔案都存在', used.every(f => fs.existsSync(path.join(ROOT, 'js', f + '.js'))), used);

console.log(`${pass} 項通過${fail ? `，${fail} 項失敗` : ''}`);
process.exit(fail ? 1 : 0);
