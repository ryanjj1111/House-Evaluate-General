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
 qinganBreach: { rate: 2.75, src: '工商時報 2024-06 財政部新青安 25 問；公視 2024 查核案例（1.775%→2.75%）', url: 'https://www.ctee.com.tw/news/20240628700974-430104' }
};
if (typeof module !== 'undefined') module.exports = { POLICY };
