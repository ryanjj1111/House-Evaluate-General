// 房屋試算｜線條圖示（介面改版 PR 2，比照投資帳本）
// 圖示來自 Lucide（https://lucide.dev，ISC 授權，授權全文見 js/icons-LICENSE.txt）；tick 是投資帳本自己畫的對帳勾。
// 只打包用到的圖示，離線也能用。ic('名字') 回傳行內 SVG；跟文字同色（currentColor）。
// 程式和 HTML 裡照樣寫 emoji，顯示時才換成線條圖示：原始文字、匯出檔都不變。
// 不處理：textarea、pre、code、script、style、可編輯區、.noic；下拉選單（option）放不了圖示，只拿掉 emoji。
// 狀態類（勾、禁止、警告…）在一般文字裡會帶顏色；放在本來就有顏色的地方（例如提示框）就跟著那個顏色。
const ICP={
"ban": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M4.929 4.929 19.07 19.071\"/>",
"banknote": "<rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 12h.01M18 12h.01\"/>",
"book-open": "<path d=\"M12 5v16\"/><path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"/>",
"calendar": "<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/>",
"calendar-range": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M16 2v3\"/><path d=\"M3 9h18\"/><path d=\"M8 2v3\"/><path d=\"M17 13h-6\"/><path d=\"M13 17H7\"/><path d=\"M7 13h.01\"/><path d=\"M17 17h.01\"/>",
"chart-line": "<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"m19 9-5 5-4-4-3 3\"/>",
"clipboard-list": "<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/><path d=\"M12 11h4\"/><path d=\"M12 16h4\"/><path d=\"M8 11h.01\"/><path d=\"M8 16h.01\"/>",
"coins": "<path d=\"M13.744 17.736a6 6 0 1 1-7.48-7.48\"/><path d=\"M15 6h1v4\"/><path d=\"m6.134 14.768.866-.5 2 3.464\"/><circle cx=\"16\" cy=\"8\" r=\"6\"/>",
"download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
"hand-coins": "<path d=\"M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17\"/><path d=\"m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9\"/><path d=\"m2 16 6 6\"/><circle cx=\"16\" cy=\"9\" r=\"2.9\"/><circle cx=\"6\" cy=\"5\" r=\"3\"/>",
"hourglass": "<path d=\"M5 22h14\"/><path d=\"M5 2h14\"/><path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\"/><path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\"/>",
"house": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
"info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>",
"key-round": "<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\"/><circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
"landmark": "<path d=\"M10 18v-7\"/><path d=\"M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z\"/><path d=\"M14 18v-7\"/><path d=\"M18 18v-7\"/><path d=\"M3 22h18\"/><path d=\"M6 18v-7\"/>",
"library": "<path d=\"m16 6 4 14\"/><path d=\"M12 6v14\"/><path d=\"M8 8v12\"/><path d=\"M4 4v16\"/>",
"map-pin-house": "<path d=\"M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z\"/><path d=\"M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2\"/><path d=\"M18 22v-3\"/><circle cx=\"10\" cy=\"10\" r=\"3\"/>",
"notebook-pen": "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\"/><path d=\"M2 6h4\"/><path d=\"M2 10h4\"/><path d=\"M2 14h4\"/><path d=\"M2 18h4\"/><path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\"/>",
"pin": "<path d=\"M12 17v5\"/><path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\"/>",
"receipt": "<path d=\"M12 17V7\"/><path d=\"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8\"/><path d=\"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z\"/>",
"repeat": "<path d=\"m17 2 4 4-4 4\"/><path d=\"M3 11v-1a4 4 0 0 1 4-4h14\"/><path d=\"m7 22-4-4 4-4\"/><path d=\"M21 13v1a4 4 0 0 1-4 4H3\"/>",
"rocket": "<path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\"/><path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\"/><path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\"/><path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\"/>",
"rotate-ccw": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/>",
"ruler": "<path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\"/><path d=\"m14.5 12.5 2-2\"/><path d=\"m11.5 9.5 2-2\"/><path d=\"m8.5 6.5 2-2\"/><path d=\"m17.5 15.5 2-2\"/>",
"save": "<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\"/><path d=\"M7 3v4a1 1 0 0 0 1 1h7\"/>",
"settings": "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
"sprout": "<path d=\"M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3\"/><path d=\"M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4\"/><path d=\"M5 21h14\"/>",
"tag": "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>",
"thermometer": "<path d=\"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z\"/>",
"tick": "<path d=\"M3.6 12.9c1.6.7 3.1 2.1 4.8 4.4 3.3-5.3 7-9.3 12-12.6\"/>",
"trash": "<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
"triangle-exclamation-point": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>",
"upload": "<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>",
"x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>"
};
function ic(n,c){const p=ICP[n];if(!p)return'';return`<svg class="i${n=='tick'?' i-tick':''}${c?' '+c:''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${n=='tick'?2.2:1.75}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`}
const EMI={'✅':['tick','ok'],'✓':['tick','ok'],'⚠':['triangle-exclamation-point','wn'],'⏳':['hourglass','mut'],'🚫':['ban','bad'],'⛔':['ban','bad'],'❌':['x','wn'],'🏠':['house'],'🔑':['key-round'],'💸':['hand-coins'],'📅':['calendar'],'⚙':['settings'],'💰':['coins'],'📌':['pin'],'🔁':['repeat'],'⬆':['upload'],'⬇':['download'],'↺':['rotate-ccw'],'📖':['book-open'],'📋':['clipboard-list'],'🏘':['map-pin-house'],'💾':['save'],'📈':['chart-line'],'📝':['notebook-pen'],'🧾':['receipt'],'🗓':['calendar-range'],'🚀':['rocket'],'📐':['ruler'],'📚':['library'],'✕':['x'],'🗑':['trash'],'🏦':['landmark'],'💵':['banknote'],'🌡':['thermometer'],'ℹ':['info'],'🏷':['tag'],'🌱':['sprout']};
const EMI_RE=new RegExp('\\p{Regional_Indicator}{2}\\s?|(?:'+Object.keys(EMI).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')\\uFE0F?','gu');
// 整個畫面都換（含使用說明、ⓘ 說明小視窗）
const EMI_ROOTS='body';
const EMI_SKIP='script,style,textarea,pre,code,[contenteditable],.noic';
let EMI_TX=null;
function emiHtml(m,rest,par){const k=m.replace(/️/g,'');if(/\p{Regional_Indicator}/u.test(k))return'';const d=EMI[k];if(!d)return null;
 let n=d[0];if(typeof n=='function')n=n(rest);if(n=='→')return'→';
 // 狀態色：父元素是一般文字顏色才上色，否則跟著父元素
 let c=d[1]||'';if(c&&par){try{if(!EMI_TX)EMI_TX=getComputedStyle(document.body).color;if(getComputedStyle(par).color!=EMI_TX)c=''}catch(e){}}
 const cl=c?'i-'+c:'';
 return n=='dot'?`<span class="idot ${cl}" data-e="${k}" aria-hidden="true"></span>`:ic(n,cl).replace('<svg ',`<svg data-e="${k}" `)}
function emiNode(t){const s=t.nodeValue;if(!s)return;EMI_RE.lastIndex=0;if(!EMI_RE.test(s))return;const par=t.parentElement;if(!par||par.closest(EMI_SKIP))return;
 if(par.closest('option,select')){t.nodeValue=s.replace(EMI_RE,m=>{const k=m.replace(/️/g,'');return EMI[k]||/\p{Regional_Indicator}/u.test(k)?'':m}).replace(/^\s+/,'');return}
 let h='',last=0,any=0;EMI_RE.lastIndex=0;let m;const esc_=x=>x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 while((m=EMI_RE.exec(s))){const r=emiHtml(m[0],s.slice(m.index+m[0].length),par);if(r==null)continue;h+=esc_(s.slice(last,m.index))+r;last=m.index+m[0].length;any=1}
 if(!any)return;h+=esc_(s.slice(last));
 // 父元素是 flex／grid 時包成一個 span，避免圖示和文字被拆成兩格
 try{if(/flex|grid/.test(getComputedStyle(par).display))h=`<span>${h}</span>`}catch(e){}
const tp=document.createElement('template');tp.innerHTML=h;t.replaceWith(tp.content)}
function emiWalk(root){if(!root)return;if(root.nodeType==3){emiNode(root);return}if(root.nodeType!=1)return;
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),L=[];let n;while((n=w.nextNode()))L.push(n);L.forEach(emiNode)}
function emiIn(n){const e=n.nodeType==1?n:n.parentElement;return!!(e&&e.closest(EMI_ROOTS))}
function emiStart(){document.querySelectorAll(EMI_ROOTS).forEach(emiWalk);
 new MutationObserver(R=>{for(const r of R){if(r.type=='characterData'){if(emiIn(r.target))emiNode(r.target);continue}
  for(const n of r.addedNodes){if(n.nodeType==1&&n.matches&&n.matches(EMI_ROOTS))emiWalk(n);else if(emiIn(n))emiWalk(n)}}}).observe(document.body,{childList:true,subtree:true,characterData:true})}
if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',emiStart);else emiStart();
