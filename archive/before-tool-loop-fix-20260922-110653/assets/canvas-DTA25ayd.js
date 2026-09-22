import"./modulepreload-polyfill-B5Qt9EMX.js";import{c as d,r as n,j as e,X as u,a as f}from"./index-DNqgyi4U.js";/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=d("Code2",[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]]);/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=d("LayoutTemplate",[["rect",{width:"18",height:"7",x:"3",y:"3",rx:"1",key:"f1a2em"}],["rect",{width:"9",height:"7",x:"3",y:"14",rx:"1",key:"jqznyg"}],["rect",{width:"5",height:"7",x:"16",y:"14",rx:"1",key:"q5h2i8"}]]),g=`<script>(function(){
  var need = false;
  try { window.localStorage; } catch (e) { need = true; }
  if (!need) return;
  var mk = function () {
    var s = {};
    return {
      getItem: function (k) { return k in s ? s[k] : null; },
      setItem: function (k, v) { s[k] = String(v); },
      removeItem: function (k) { delete s[k]; },
      clear: function () { s = {}; },
      key: function (i) { return Object.keys(s)[i] ?? null; },
      get length() { return Object.keys(s).length; }
    };
  };
  Object.defineProperty(window, 'localStorage', { value: mk() });
  Object.defineProperty(window, 'sessionStorage', { value: mk() });
})();<\/script>`;function b(){const[o,a]=n.useState(""),[i,x]=n.useState("html"),[t,m]=n.useState(!0);return n.useEffect(()=>{var c;const r=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",r),document.documentElement.classList.toggle("light",!r),typeof chrome<"u"&&((c=chrome.storage)!=null&&c.local)&&chrome.storage.local.get(["canvas_code","canvas_lang"],s=>{s.canvas_code&&a(s.canvas_code),s.canvas_lang&&x(s.canvas_lang)})},[]),e.jsxs("div",{className:"flex flex-col h-screen bg-bg text-ink font-sans",children:[e.jsxs("header",{className:"flex items-center justify-between px-4 py-3 border-b border-border bg-elevated/50",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(p,{className:"text-accent",size:18}),e.jsx("span",{className:"font-semibold tracking-wide text-[14px]",children:"Canvas"}),e.jsx("span",{className:"px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] uppercase tracking-wider text-muted ml-2",children:i})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{onClick:()=>m(!t),className:"flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink",children:[e.jsx(h,{size:14}),t?"Hide code":"Show code"]}),e.jsx("button",{onClick:()=>window.close(),className:"p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface transition-colors",children:e.jsx(u,{size:16})})]})]}),e.jsxs("div",{className:"flex flex-1 overflow-hidden",children:[t&&e.jsxs("div",{className:"w-1/2 border-r border-border bg-surface flex flex-col",children:[e.jsx("div",{className:"px-3 py-1.5 text-[11px] text-muted font-mono border-b border-border bg-bg/50",children:"source code"}),e.jsx("textarea",{value:o,onChange:r=>a(r.target.value),className:"flex-1 w-full bg-transparent resize-none p-4 font-mono text-[13px] text-ink outline-none leading-relaxed",spellCheck:!1})]}),e.jsx("div",{className:`flex flex-col ${t?"w-1/2":"w-full"} bg-white`,children:e.jsx("iframe",{srcDoc:g+o,className:"w-full h-full border-none",sandbox:"allow-scripts allow-forms"})})]})]})}const l=document.getElementById("root");l&&f(l).render(e.jsx(b,{}));
