// 房屋試算｜政策與稅率參數（集中在這裡，政策改了只改這個檔案）
// 每一項都附生效日與來源。數字只供試算，實際以銀行、國稅局、地方稅務局為準。
// https://ryanjj1111.github.io/House-Evaluate-General/
const POLICY = {
 date: '2026-11-16',   // 政策資料最後確認日（畫面會顯示）
 // 新青安（青年安心成家購屋優惠貸款精進方案，2023-08-01 起核貸）
 // 已撥款案件：自撥款日起享 3 年完整補貼（合計 2 碼），之後每年少半碼，第 6 年起回到原利率。
 // 例：原利率 2.275% → 前 3 年 1.775%，第 4 年 1.900%，第 5 年 2.025%，第 6 年 2.150%，之後 2.275%。
 qingan: {
  full: 36,               // 完整補貼月數
  step: 0.125,            // 每年減少的補貼（百分點，半碼）
  steps: 3,               // 遞減幾次之後回到原利率
  sub: 0.5,               // 補貼合計（百分點，2 碼）
  src: '信義房屋知識庫〈青安 3.0 是什麼〉已撥款案件說明；財政部新青安精進措施',
  url: 'https://www.sinyi.com.tw/expertise/buying-guide/111'
 },
 // 青安 3.0（新申請，P6 購屋前模式用）
 qingan3: { from: '2026-08-01', to: '2029-07-31', src: '商業周刊 2026-07', url: 'https://www.businessweekly.com.tw/business/blog/3022044' },
 // 選擇性信用管制：自然人第二戶（P6 購屋前模式用）
 secondHome: { ltv: 0.7, grace: false, from: '2026-09-17', src: '自由時報 2026-09-17 央行理監事會', url: 'https://ec.ltn.com.tw/article/breakingnews/5577362' },
 // 新青安違規（出租等）：終止補貼、返還違規日起補貼、重新核定條件（P2 用）
 qinganBreach: { rate: 2.75, src: '工商時報 2024-06 財政部新青安 25 問；公視 2024 查核案例（1.775%→2.75%）', url: 'https://www.ctee.com.tw/news/20240628700974-430104' },
 // 出租方式（P2）。exempt：每屋每月租金免稅額；exp：超過部分可扣除的必要費用率；houseRate：房屋稅率（%，臺中）；
 // landX：地價稅相對自用住宅（2‰）的倍數（一般用地 10‰ ＝ 5 倍；社宅包租代管多數縣市減徵 80% ≈ 2‰）；
 // factor：實收租金占市場租金比例；noVac：空租風險由業者承擔
 rentModes: {
  normal: { name: '一般出租', note: '申報租賃所得達租金標準，3/22 前向地方稅務局申請', exempt: 0, exp: 0.43, houseRate: 1.5, landX: 5, factor: 1, noVac: false },
  public: { name: '公益出租人', note: '租給有租金補貼資格的房客，經主管機關認定', exempt: 15000, exp: 0.43, houseRate: 1.2, landX: 5, factor: 1, noVac: false },
  socialLease: { name: '社宅包租', note: '業者當二房東，每月付租金給你，空租由業者承擔', exempt: 15000, exp: 0.60, houseRate: 1.2, landX: 1, factor: 0.9, noVac: true },
  socialManage: { name: '社宅代管', note: '業者幫你找房客與管理，約 9 折出租，空租由你承擔', exempt: 15000, exp: 0.60, houseRate: 1.2, landX: 1, factor: 0.9, noVac: false }
 },
 houseTaxNonSelf: 3.2,
 // 轉貸（P2）：抵押權設定規費＝設定金額 × 0.1%；設定金額一般為貸款金額 × 120%。其他費用為一般行情，以銀行報價為準
 refi: { setRate: 0.001, setRatio: 1.2, src: '房感 2026（轉貸費用與違約金）、袋鼠金融（房貸相關費用項目）', url: 'https://www.housefeel.com.tw/article/%e8%bd%89%e8%b2%b8-%e6%88%bf%e5%b1%8b%e8%bd%89%e8%b2%b8-%e6%88%bf%e8%b2%b8%e8%bd%89%e8%b2%b8' },   // 臺中非自住住家用房屋（沒有申報出租或沒達租金標準）最低級距
 // 房地合一稅 2.0（個人、境內居住者，2016 年以後取得）：持有期間依「所有權移轉登記日」到出售登記日，按日計算
 //   2 年以內 45%；超過 2 年未逾 5 年 35%；超過 5 年未逾 10 年 20%；超過 10 年 15%
 //   課稅所得＝成交價 − 取得成本 − 費用 − 土地漲價總數額；費用沒有單據時按成交價 3%，上限 30 萬
 //   自住優惠：本人／配偶／未成年子女設籍、持有並居住連續滿 6 年，出售前 6 年內沒有出租或營業，6 年內沒用過 → 課稅所得 400 萬以內免稅，超過部分 10%
 houseLand: {
  brackets: [[2, 45], [5, 35], [10, 20], [Infinity, 15]],
  noCertPct: 3, noCertCap: 300000,
  self: { years: 6, exempt: 4000000, rate: 10 },
  src: [['Money101 2026-05（房地合一稅率）', 'https://www.money101.com.tw/blog/房地合一稅-試算-申報-懶人包'],
   ['工商時報 2025-12（自住優惠三要件）', 'https://www.ctee.com.tw/news/20251217700769-430601'],
   ['工商時報 2023-06（費用 3%、上限 30 萬）', 'https://www.ctee.com.tw/news/20230627700801-439803']]
 },
 // 土地增值稅：自用住宅用地 10%（一生一次；出售前 1 年內沒有出租、營業，本人／配偶／直系親屬設籍）；一般用地第一級 20%（漲價倍數愈高到 30%、40%，這裡只用第一級估計）
 landInc: { self: 10, normal: 20 },
 rentSrc: [
  ['國土署 2026-04（社宅包租代管 15,000 元免稅＋60% 費用）', 'https://www.ctee.com.tw/news/20260430701027-430104'],
  ['臺中市地方稅務局 2026-09（出租 1.5%～2.4%、公益出租人與社宅 1.2%、非自住 3.2%～4.8%）', 'https://www.etax.nat.gov.tw/etwmain/announcement/news/evGq2x8'],
  ['TVBS 2026（一般出租 43% 標準費用率）', 'https://news.tvbs.com.tw/life/3191298'],
  ['房地合一自住優惠：交易前 6 年內無出租（國稅局）', 'https://www.ctee.com.tw/news/20251217700769-430601']
 ]
};
if (typeof module !== 'undefined') module.exports = { POLICY };
