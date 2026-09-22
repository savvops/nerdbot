import{c as p,r as n,j as e,R as C,D as _,X as N,C as S,b as O,f as D}from"./index-B8K2GvbX.js";/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=p("Code2",[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]]);/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=p("LayoutTemplate",[["rect",{width:"18",height:"7",x:"3",y:"3",rx:"1",key:"f1a2em"}],["rect",{width:"9",height:"7",x:"3",y:"14",rx:"1",key:"jqznyg"}],["rect",{width:"5",height:"7",x:"16",y:"14",rx:"1",key:"q5h2i8"}]]),d=`<script>(function(){
  try {
    window.localStorage;
  } catch (e) {
    try {
      var _data = {};
      var _makeStorage = function() {
        return {
          getItem: function(k) { return k in _data ? _data[k] : null; },
          setItem: function(k, v) { _data[k] = String(v); },
          removeItem: function(k) { delete _data[k]; },
          clear: function() { _data = {}; },
          key: function(i) { return Object.keys(_data)[i] || null; },
          get length() { return Object.keys(_data).length; }
        };
      };
      var _shim = _makeStorage();
      try {
        Object.defineProperty(window, 'localStorage', { value: _shim, configurable: true, writable: true });
        Object.defineProperty(window, 'sessionStorage', { value: _shim, configurable: true, writable: true });
      } catch (_1) {
        try {
          Object.defineProperty(Object.getPrototypeOf(window), 'localStorage', { get: function() { return _shim; } });
          Object.defineProperty(Object.getPrototypeOf(window), 'sessionStorage', { get: function() { return _shim; } });
        } catch (_2) {}
      }
    } catch (_outer) {}
  }
})();<\/script>`;function P(r,o){if(!r||!r.trim())return"";const t=r.trim();return o==="svg"||t.startsWith("<svg")&&t.endsWith("</svg>")?`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      background: #0f172a;
      overflow: hidden;
    }
    svg { max-width: 90%; max-height: 90%; }
  </style>
</head>
<body>
  ${t}
</body>
</html>`:t.includes("<head>")?t.replace("<head>","<head>"+d):t.includes("<html>")?t.replace("<html>","<html><head>"+d+"</head>"):t.includes("<!DOCTYPE")||t.includes("<body")?d+t:`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${d}
</head>
<body>
  ${t}
</body>
</html>`}function T(){const[r,o]=n.useState(""),[t,m]=n.useState(""),[c,b]=n.useState("html"),[i,g]=n.useState(!0),[x,u]=n.useState(!1),[v,w]=n.useState(0);n.useEffect(()=>{var l;const a=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",a),document.documentElement.classList.toggle("light",!a),typeof chrome<"u"&&((l=chrome.storage)!=null&&l.local)&&chrome.storage.local.get(["canvas_code","canvas_lang"],s=>{s.canvas_code&&(o(s.canvas_code),m(s.canvas_code)),s.canvas_lang&&b(s.canvas_lang)})},[]),n.useEffect(()=>{const a=setTimeout(()=>{m(r)},250);return()=>clearTimeout(a)},[r]);const y=async()=>{await navigator.clipboard.writeText(r),u(!0),setTimeout(()=>u(!1),1800)},j=()=>{const a=c==="svg"?"svg":"html",l=new Blob([r],{type:c==="svg"?"image/svg+xml":"text/html"}),s=document.createElement("a");s.href=URL.createObjectURL(l),s.download=`canvas-${Date.now()}.${a}`,s.click(),setTimeout(()=>URL.revokeObjectURL(s.href),1e3)},k=()=>{w(a=>a+1)},h=P(t,c);return e.jsxs("div",{className:"flex flex-col h-screen bg-bg text-ink font-sans",children:[e.jsxs("header",{className:"flex items-center justify-between px-4 py-2.5 border-b border-border bg-elevated/50",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(R,{className:"text-accent",size:18}),e.jsx("span",{className:"font-semibold tracking-wide text-[14px]",children:"Canvas"}),e.jsx("span",{className:"px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] uppercase tracking-wider text-muted ml-2",children:c})]}),e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsxs("button",{onClick:k,title:"Reload preview",className:"flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink",children:[e.jsx(C,{size:13}),e.jsx("span",{children:"Reload"})]}),e.jsxs("button",{onClick:j,title:"Download file",className:"flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink",children:[e.jsx(_,{size:13}),e.jsx("span",{children:"Export"})]}),e.jsxs("button",{onClick:()=>g(!i),className:"flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink",children:[e.jsx(E,{size:13}),i?"Hide code":"Show code"]}),e.jsx("div",{className:"h-4 w-[1px] bg-border mx-1"}),e.jsx("button",{onClick:()=>window.close(),className:"p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface transition-colors",title:"Close Canvas",children:e.jsx(N,{size:16})})]})]}),e.jsxs("div",{className:"flex flex-1 overflow-hidden",children:[i&&e.jsxs("div",{className:"w-1/2 border-r border-border bg-surface flex flex-col h-full",children:[e.jsxs("div",{className:"px-3 py-1.5 text-[11px] text-muted font-mono border-b border-border bg-bg/50 flex items-center justify-between",children:[e.jsx("span",{children:"source code"}),e.jsxs("button",{onClick:y,className:"flex items-center gap-1 text-[11px] text-muted hover:text-ink transition-colors",children:[x?e.jsx(S,{size:11,className:"text-accent"}):e.jsx(O,{size:11}),e.jsx("span",{children:x?"Copied":"Copy"})]})]}),e.jsx("textarea",{value:r,onChange:a=>o(a.target.value),className:"flex-1 w-full bg-transparent resize-none p-4 font-mono text-[13px] text-ink outline-none leading-relaxed",spellCheck:!1,placeholder:"Paste or edit HTML / SVG here..."})]}),e.jsx("div",{className:`flex-1 flex flex-col ${i?"w-1/2":"w-full"} h-full bg-white relative overflow-hidden`,children:h?e.jsx("iframe",{srcDoc:h,className:"flex-1 w-full h-full border-none",sandbox:"allow-scripts allow-forms allow-modals",title:"Canvas Preview"},`${v}-${h.length>0}`):e.jsx("div",{className:"flex-1 flex items-center justify-center text-muted text-[13px] font-sans",children:"Waiting for code to preview..."})})]})]})}const f=document.getElementById("root");f&&D(f).render(e.jsx(T,{}));
