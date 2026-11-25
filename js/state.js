// 房屋試算｜資料格式：預設值與舊設定檔轉換（純函式，不碰畫面與 localStorage；可用 node 測試）
// 一份資料 S = { v, loan, stressPct, hold, rent, view }。view 是畫面偏好（圖表、收合、分頁），一起存、一起匯出。
const DATA_V = 4;   // v4：房屋多了完工年、建物型態、車位；畫面多了租金行情的比對條件
const DEF = {
 v: DATA_V,
 loan: {
  amt: 800, disb: '2025-01-15', yrs: 30, grace: 0, method: 'pi', first: '', amStart: '', amN: '',
  rateMode: 'single', rate: 2.2, qa: { sub: 1.775, base: '' }, ladder: [{ from: '2025-01', r: 2.1 }, { from: '2026-01', r: 2.3 }],
  pre: [], extra: { amt: 0, from: '' }
 },
 stressPct: 0.75,
 house: { city: '', dist: '', rooms: 3, ping: '', built: '', btype: '大樓', park: false,   // 縣市代碼（實價登錄）、行政區、房數、坪數（不含車位）、完工年（西元）、建物型態、有沒有車位
  buyDate: '', price: 1000, buyCost: 0, improve: 0, selfSince: '' },   // 取得日（所有權登記日，留空＝撥款日）、取得價（萬）、取得費用（元）、改良（萬）、設籍自住起日
 sale: { date: '', priceMode: 'growth', est: '', growth: 1.5, price: '', brokerPct: 2, other: 10000, feeMode: 'actual', landGain: 0, usedSelf: false, landUsed: false, path: 'self' },
 hold: { mgmt: 2500, mgmtPer: 'm', houseTax: 3000, landTax: 300, selfRate: 1, incomeRate: 12 },
 rent: { start: '', rent: 28000, vac: 1, mgmtBy: 'owner', repair: 1000, myRent: 22000, breach: false, newRate: '', breachRate: '', mode: 'normal',
  refi: { yrs: '', grace: 0, fee: 5000, scriv: 8000, setFee: '', other: 3000, penalty: 0 } },   // refi：轉貸（出租前先轉成一般房貸）
 view: {
  tab: 'L', cv: 'bal',
  rng: '10', rngN: 15, from: 'disb',   // 範圍：5／10／all／n（自訂 rngN 年）；起點：disb 撥款日、now 今天前 1 年
  hide: {}, fold: {}, pin: 0, open: {},  // hide：關掉的線與卡片；fold：收合狀態（1 收、0 開，沒記錄用預設）；open：明細展開的年份
  mk: { age: '5', type: 'same', park: 'same', m: '12', soc: true, furn: false }   // 租金行情比對條件：屋齡 ±幾年、型態、車位、月數、排除社宅包租代管、排除附家具
 }
};
const clone = o => JSON.parse(JSON.stringify(o));

// 補齊欄位、轉換舊版設定檔（v1 示範／我的資料、v2 沒有 view）
function norm(d) {
 d = d && typeof d === 'object' ? clone(d) : {};
 if (d.mine && d.mine.loan) d = clone(d.mine);                       // v1 localStorage 整包
 if (d.data && d.data.loan) d = clone(d.data);                       // 匯出檔
 d.loan = { ...clone(DEF.loan), ...(d.loan || {}) };
 d.loan.qa = { ...DEF.loan.qa, ...(d.loan.qa || {}) };
 d.loan.extra = { ...DEF.loan.extra, ...(d.loan.extra || {}) };
 if (!Array.isArray(d.loan.pre)) d.loan.pre = [];
 if (!Array.isArray(d.loan.ladder)) d.loan.ladder = clone(DEF.loan.ladder);
 if (!['single', 'qingan', 'custom'].includes(d.loan.rateMode)) d.loan.rateMode = 'single';
 if (d.stressPct == null || d.stressPct === '') d.stressPct = d.stressBp != null ? +d.stressBp / 100 : DEF.stressPct;
 delete d.stressBp;
 d.hold = { ...clone(DEF.hold), ...(d.hold || {}) };
 d.house = { ...clone(DEF.house), ...(d.house || {}) };
 d.sale = { ...clone(DEF.sale), ...(d.sale || {}) };
 const r = { ...(d.rent || {}) };
 if (r.breach == null) r.breach = false;                              // v1 的 qingan 不沿用，預設「否」
 delete r.qingan;
 d.rent = { ...clone(DEF.rent), ...r, refi: { ...clone(DEF.rent.refi), ...(r.refi || {}) } };
 const v = d.view || {};
 d.view = { ...clone(DEF.view), ...v, hide: { ...(v.hide || {}) }, fold: { ...(v.fold || {}) }, open: { ...(v.open || {}) }, mk: { ...clone(DEF.view.mk), ...(v.mk || {}) } };
 if (d.ui && typeof d.ui === 'object') {                              // v2 的 ui 搬進 view
  for (const k of ['tab', 'cv', 'rng', 'pin']) if (d.ui[k] != null && v[k] == null) d.view[k] = d.ui[k];
  if (d.ui.open && !v.open) d.view.open = { ...d.ui.open };
 }
 delete d.ui; delete d.name; delete d.src; delete d.mine;
 if (!['L', 'R', 'X'].includes(d.view.tab)) d.view.tab = 'L';   // 明細分頁（Y）已併進房貸頁
 if (!['bal', 'pay', 'yr'].includes(d.view.cv)) d.view.cv = 'bal';
 if (!['5', '10', 'all', 'n'].includes(String(d.view.rng))) d.view.rng = '10';
 d.view.rng = String(d.view.rng);
 d.v = DATA_V;
 return d;
}
if (typeof module !== 'undefined') module.exports = { DEF, DATA_V, norm, clone };
