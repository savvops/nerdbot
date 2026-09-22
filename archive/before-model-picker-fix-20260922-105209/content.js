if(!window.__nerdbotContentLoaded){let u=function(){var t;try{return((t=window.getSelection())==null?void 0:t.toString().trim())??""}catch{return""}},f=function(){var e;const t=(e=document.body)==null?void 0:e.cloneNode(!0);if(!t)return"";t.querySelectorAll("script,style,noscript,svg,iframe").forEach(r=>r.remove());const n=(t.innerText||"").replace(/\s+\n/g,`
`).replace(/\n{3,}/g,`

`).trim();return n.length>a?n.slice(0,a)+`
…[truncated]`:n},b=function(){const t=document.getElementById(p);if(t){t.remove();return}x()},x=function(){var s,d;const t=document.createElement("div");t.id=p,t.style.cssText="position:fixed;bottom:24px;right:24px;z-index:2147483647;width:380px;font-family:Inter,system-ui,sans-serif;";const n=t.attachShadow({mode:"open"});n.innerHTML=`
    <style>
      .qc {
        background: rgb(24 27 34); color: rgb(232 234 240);
        border: 1px solid rgb(48 53 65); border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,.45);
        overflow: hidden;
      }
      .qc-head { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid rgb(48 53 65); font-size:13px; }
      .qc-orb { width:18px; height:18px; border-radius:50%; background: conic-gradient(from 220deg, #8aa4ff, #c089ff, #ff8ad1, #ffd089, #8aa4ff); }
      .qc-title { font-weight:600; flex:1; }
      .qc-x { background:transparent; border:0; color:rgb(156 163 178); cursor:pointer; padding:4px; border-radius:6px; }
      .qc-x:hover { background:rgb(32 36 45); color:rgb(232 234 240); }
      textarea {
        width:100%; min-height:64px; max-height:220px; resize:none; padding:12px 14px;
        border:0; outline:none; background:transparent; color:rgb(232 234 240);
        font:inherit; font-size:13.5px; line-height:1.5; box-sizing:border-box;
      }
      textarea::placeholder { color: rgb(110 117 132); }
      .qc-foot { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-top:1px solid rgb(48 53 65); font-size:11px; color:rgb(156 163 178); }
      .qc-send { padding:5px 12px; border-radius:999px; background:rgb(138 164 255); color:rgb(17 19 24); font-weight:600; border:0; cursor:pointer; font-size:12px; }
      .qc-send:disabled { background: rgb(48 53 65); color: rgb(110 117 132); cursor:not-allowed; }
    </style>
    <div class="qc">
      <div class="qc-head">
        <div class="qc-orb"></div>
        <div class="qc-title">Quick chat</div>
        <button class="qc-x" id="x">✕</button>
      </div>
      <textarea id="ta" placeholder="Ask Nerdbot about this page…"></textarea>
      <div class="qc-foot">
        <span>Opens in side panel · Esc to close</span>
        <button class="qc-send" id="send" disabled>Send →</button>
      </div>
    </div>
  `,document.documentElement.appendChild(t);const e=n.getElementById("ta"),r=n.getElementById("send"),i=()=>t.remove();(s=n.getElementById("x"))==null||s.addEventListener("click",i),e.focus();const c=(d=window.getSelection())==null?void 0:d.toString().trim();c&&(e.value=c),c&&(r.disabled=!1),e.addEventListener("input",()=>{r.disabled=e.value.trim().length===0}),e.addEventListener("keydown",o=>{o.key==="Escape"&&i(),o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),l())}),r.addEventListener("click",l);function l(){const o=e.value.trim();o&&(chrome.runtime.sendMessage({type:"QUICK_CHAT_QUEUE",payload:{text:o}},()=>{}),chrome.storage.local.set({"nerdbot.quickQueue.v1":{text:o,createdAt:Date.now()}}),i())}};window.__nerdbotContentLoaded=!0;const a=6e4;async function g(){var n;if(!/youtube\.com\/(watch|shorts)/.test(location.href))return;const t=document.querySelectorAll("ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-list-renderer .segment-text");if(t.length>0){const e=[];if(t.forEach(r=>{const i=r.innerText.trim();i&&e.push(i)}),e.length>0)return e.join(" ")}try{const r=document.documentElement.outerHTML.match(/"captionTracks":(\[.*?\])/);if(!r)return;const i=JSON.parse(r[1]),c=(n=i==null?void 0:i[0])==null?void 0:n.baseUrl;if(!c)return;const l=await fetch(c).then(o=>o.text()),d=Array.from(l.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map(o=>o[1].replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g,"")).join(" ").trim();return d.length>a?d.slice(0,a)+`
…[truncated]`:d}catch{return}}chrome.runtime.onMessage.addListener((t,n,e)=>(t==null?void 0:t.type)==="NERDBOT_PING"?(e({ok:!0}),!0):(t==null?void 0:t.type)==="GET_PAGE_CONTEXT"?(e({url:location.href,title:document.title,selection:u()}),!0):(t==null?void 0:t.type)==="GET_PAGE_TEXT"?((async()=>{const r=await g();e({url:location.href,title:document.title,selection:u(),text:f(),transcript:r})})(),!0):(t==null?void 0:t.type)==="TOGGLE_QUICK_CHAT"?(b(),e({ok:!0}),!0):!1);const p="nerdbot-quick-chat-host"}
