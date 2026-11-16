// 房屋試算｜啟動
load();
buildStatic();
document.addEventListener('input', onField);
document.addEventListener('change', onField);
chartBind(document.getElementById('cv'));
let rsT; window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => R && drawMain(), 150); });
build();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
