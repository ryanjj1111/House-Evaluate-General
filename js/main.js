// 房屋試算｜啟動與整體流程：build() 重畫全部；calc() 只重算數字
function buildInputs() { buildLoanInputs(); buildRentInputs(); buildSaleInputs(); renderMarket(); }
function calc() {
 if (calcLoan()) { buildTable(); drawMain(); calcRent(); calcSale(); }
 else buildTable();
}
function build() {
 segOn('cvSeg', 'v', V().cv); applyRng(); applyPin();
 $('rngNi').value = V().rngN;
 $('gearp').style.display = 'none'; $('gearB').classList.remove('on');
 buildInputs(); applyFold(); calc(); tab(V().tab);
}

load();
buildStatic();
document.addEventListener('input', onField);
document.addEventListener('change', onField);
chartBind($('cv')); chartBind($('saleCv'));
let rsT; window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(drawMain, 150); });
build();
try { if (localStorage.getItem(GKEY) !== '1') showGd(); } catch (e) { }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
