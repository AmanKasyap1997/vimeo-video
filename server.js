// server.js
/**
 * Media Simplified – One-File Screen Recorder Kit
 * Node 18+ required. Install: `npm i express`
 *
 * Env Vars (set in hosting panel or .env when running locally via tools like dotenv/foreman):
 *  VIMEO_TOKEN, VIMEO_USER_ID, VIMEO_FOLDER_ID, GHL_API_KEY, GHL_LOCATION_ID (optional),
 *  GHL_CUSTOM_FIELD_ID, PORT (optional)
 */
const express = require('express');

const app = express();
app.use(express.json());

const VIMEO_API = 'https://api.vimeo.com';
const GHL_API   = 'https://services.leadconnectorhq.com';

const {
  VIMEO_TOKEN,
  VIMEO_USER_ID,
  VIMEO_FOLDER_ID,
  GHL_API_KEY,
  GHL_LOCATION_ID,
  GHL_CUSTOM_FIELD_ID,
  PORT = 3000
} = process.env;

// Optional: host -> LocationId mapping
const HOST_TO_LOCATION = {
  // "mediasimplified.growsimple.site": GHL_LOCATION_ID,
};

app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Media Simplified – Screen Recorder</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;margin:0;padding:28px;background:#f8fafc;color:#0f172a}
  h1{margin:0 0 10px;font-size:20px}
  .card{max-width:780px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
  label{display:block;margin:8px 0 6px;font-weight:600}
  input[type=text]{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:10px}
  .hint{color:#6b7280;font-size:13px;margin-top:6px}
  .cta{margin-top:12px;display:inline-block;color:#2563eb;text-decoration:underline;font-weight:700;cursor:pointer}
  .bubble{position:fixed;right:16px;bottom:16px;background:#111827;color:#fff;padding:12px 14px;border-radius:14px;display:none;align-items:center;gap:10px;z-index:100001}
  .dot{width:10px;height:10px;border-radius:50%;background:#ef4444;animation:pulse 1.2s infinite}
  @keyframes pulse{0%{opacity:.4}50%{opacity:1}100%{opacity:.4}}
  .countdown{display:none;position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);align-items:center;justify-content:center}
  .cdwrap{color:#fff;text-align:center}
  .cdnum{font-size:84px;font-weight:800;line-height:1}
  .cdbtn{margin-top:14px;padding:8px 12px;border:0;border-radius:10px;font-weight:700;cursor:pointer}
  .steps{margin:12px 0 0 0;padding-left:18px;color:#111827}
  .steps li{margin:6px 0}
  .ok{display:none;margin-top:12px;background:#ecfdf5;border:1px solid #c7f1df;color:#065f46;padding:10px;border-radius:10px;word-break:break-all}
</style>
</head>
<body>
  <div class="card">
    <h1>Record your screen for Support</h1>
    <ol class="steps">
      <li>Enter a <b>Ticket name</b> below.</li>
      <li>Click <b>Start recording</b>.</li>
      <li>Click <b>Allow</b> for microphone.</li>
      <li>Select <b>Window</b> or <b>Entire Screen</b> and click <b>Share</b>.</li>
      <li>Show the issue and describe what you're trying to do.</li>
      <li>Use the bottom-right bubble to <b>Finish</b>.</li>
    </ol>

    <label>Ticket name</label>
    <input id="ms-ticket" type="text" placeholder="Ex. Domain issues" />
    <div class="hint">This will appear in the video title and our internal Note.</div>

    <label style="margin-top:12px">Your name (optional)</label>
    <input id="ms-client" type="text" placeholder="Ex. Jane Doe (auto-filled if sent in URL)" />

    <a id="ms-open" class="cta" href="#">Start recording</a>

    <div id="ms-ok" class="ok"></div>
    <div class="hint">Privacy: videos are unlisted on Vimeo and shared only with our team via your ticket.</div>
  </div>

  <div id="ms-countdown" class="countdown">
    <div class="cdwrap">
      <div id="ms-count-num" class="cdnum">3</div>
      <div style="margin-top:8px;font-size:16px;opacity:.9">Starting recording…</div>
      <button id="ms-count-cancel" class="cdbtn">Cancel</button>
    </div>
  </div>

  <div id="ms-bubble" class="bubble" aria-live="polite">
    <span class="dot"></span>
    <span id="ms-time" style="font-variant-numeric:tabular-nums">00:00</span>
    <button id="ms-stop" style="margin-left:8px;border:0;border-radius:8px;padding:6px 10px;cursor:pointer">Finish</button>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/tus-js-client@2.4.1/dist/tus.min.js"></script>
  <script>
  (function(){
    const API = location.origin;
    const qs = new URLSearchParams(location.search);
    const ctx = {
      contactId: qs.get('contactId') || '',
      conversationId: qs.get('conversationId') || '',
      clientNameQP: (qs.get('name') || '').trim()
    };
    const el = (id)=>document.getElementById(id);
    const ticketEl = el('ms-ticket');
    const clientEl = el('ms-client');
    const okEl = el('ms-ok');
    if (ctx.clientNameQP && !clientEl.value) clientEl.value = ctx.clientNameQP;

    const openBtn=el('ms-open'), bubble=el('ms-bubble'), timeEl=el('ms-time'), stopBtn=el('ms-stop');
    const cdEl=el('ms-countdown'), cdNum=el('ms-count-num'), cdCancel=el('ms-count-cancel');

    let screenStream, micStream, mixedStream, recorder, chunks=[], timerInt=null, startedAt=0;
    function fmt(secs){ return String(Math.floor(secs/60)).padStart(2,'0')+":"+String(secs%60).padStart(2,'0'); }
    function startTimer(){ startedAt=Date.now(); timeEl.textContent='00:00'; timerInt=setInterval(()=>{ const s=Math.floor((Date.now()-startedAt)/1000); timeEl.textContent=fmt(s); },1000); }
    function stopTimer(){ clearInterval(timerInt); timerInt=null; }
    function countdown(seconds=3){
      return new Promise((resolve,reject)=>{
        let s=seconds; cdNum.textContent=s; cdEl.style.display='flex';
        const t=setInterval(()=>{ s-=1; if(s<=0){ clearInterval(t); cdEl.style.display='none'; resolve(); } else { cdNum.textContent=s; } },1000);
        cdCancel.onclick = ()=>{ clearInterval(t); cdEl.style.display='none'; reject(new Error('countdown_cancelled')); };
      });
    }

    async function start(){
      try{
        const nameFromDom = (clientEl.value || '').trim();
        const ticketName = (ticketEl.value || '').trim();
        if(!ticketName){ alert('Please enter a Ticket name before recording.'); return; }
        const ds = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
        const ms = await navigator.mediaDevices.getUserMedia({ audio:true });
        screenStream = ds; micStream = ms;
        const vt = ds.getVideoTracks()[0], sa = ds.getAudioTracks()[0], ma = ms.getAudioTracks()[0];
        mixedStream = new MediaStream([vt, sa, ma].filter(Boolean));
        vt?.addEventListener('ended', ()=>{ if(recorder && recorder.state!=='inactive') recorder.stop(); });
        await countdown(3);
        recorder = new MediaRecorder(mixedStream, { mimeType:'video/webm;codecs=vp9' });
        chunks = [];
        recorder.ondataavailable = e => { if(e.data?.size) chunks.push(e.data); };
        recorder.onstop = ()=> onStop(nameFromDom, ticketName);
        recorder.start();
        bubble.style.display='flex'; startTimer(); okEl.style.display='none';
      }catch(e){
        [screenStream,micStream,mixedStream].forEach(s=>s?.getTracks().forEach(t=>t.stop()));
        screenStream=micStream=mixedStream=null;
        if(e && e.message==='countdown_cancelled') return;
        alert('Please allow microphone and choose a screen/window.'); console.error(e);
      }
    }

    async function onStop(clientName, ticketName){
      try{
        stopTimer(); bubble.style.display='none';
        const blob = new Blob(chunks, { type:'video/webm' });
        const sR = await fetch(API+'/api/vimeo/start', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ size: blob.size, name: 'Support Recording '+new Date().toISOString() })
        });
        const sJ = await sR.json(); if(!sR.ok || !sJ.uploadLink) throw new Error('Vimeo init failed');
        await new Promise((resolve,reject)=>{
          const up = new tus.Upload(blob, {
            uploadUrl: sJ.uploadLink, retryDelays:[0,1000,3000,5000], chunkSize: 5*1024*1024,
            metadata:{ filename:'recording.webm', filetype: blob.type || 'video/webm' },
            removeFingerprintOnSuccess:true, onError: reject, onSuccess: resolve
          }); up.start();
        });
        const niceDate = new Date().toLocaleString('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        const finalName = `${clientName || 'Client'} – ${ticketName} – ${niceDate} ET`;
        const fR = await fetch(API+'/api/vimeo/finalize', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ videoUri: sJ.videoUri, name: finalName })
        });
        const fJ = await fR.json(); if(!fR.ok) throw new Error('Vimeo finalize failed');
        const videoLink = fJ.playerLink || fJ.pageLink;
        await fetch(API+'/api/ghl/post', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            contactId: (new URLSearchParams(location.search)).get('contactId') || '',
            conversationId: (new URLSearchParams(location.search)).get('conversationId') || '',
            videoLink, ticketName, clientName: clientName || '', refererHost: location.host
          })
        });
        okEl.innerHTML = '<b>Uploaded.</b> We attached your video to the ticket. Link: <a href="'+videoLink+'" target="_blank" rel="noopener">'+videoLink+'</a>';
        okEl.style.display = 'block';
      }catch(e){
        alert('Upload failed. Please try again.'); console.error(e);
      }finally{
        [screenStream,micStream,mixedStream].forEach(s=>s?.getTracks().forEach(t=>t.stop()));
        recorder=null;
      }
    }

    openBtn.addEventListener('click', (e)=>{ e.preventDefault(); start(); });
    stopBtn.addEventListener('click', ()=>{ if(recorder && recorder.state!=='inactive') recorder.stop(); });
  })();
  </script>
</body></html>`);
});

// API: Vimeo Start
app.post('/api/vimeo/start', async (req, res) => {
  try {
    const { size, name } = req.body || {};
    const r = await fetch(`${VIMEO_API}/me/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VIMEO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        upload: { approach: 'tus', size: String(size || '') },
        name: name || 'Support Recording',
        privacy: { view: 'unlisted' },
        folder_uri: `/users/${process.env.VIMEO_USER_ID}/projects/${process.env.VIMEO_FOLDER_ID}`
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.json({ uploadLink: data?.upload?.upload_link, videoUri: data?.uri, vimeoPage: data?.link });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'vimeo_start_failed' }); }
});

// API: Vimeo Finalize
app.post('/api/vimeo/finalize', async (req, res) => {
  try {
    const { videoUri, name } = req.body || {};
    if (!videoUri) return res.status(400).json({ error: 'missing_videoUri' });
    const p = await fetch(`${VIMEO_API}${videoUri}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VIMEO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: name || 'Help Chat Recording' })
    });
    const meta = await p.json();
    if (!p.ok) return res.status(p.status).json(meta);
    const idMatch = String(videoUri).match(/\/videos\/(\d+)/);
    const id = idMatch ? idMatch[1] : null;
    return res.json({
      playerLink: id ? `https://player.vimeo.com/video/${id}` : null,
      pageLink: meta?.link || (id ? `https://vimeo.com/${id}` : null)
    });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'vimeo_finalize_failed' }); }
});

// API: GHL Save + Note
app.post('/api/ghl/post', async (req, res) => {
  try {
    const { contactId, conversationId, videoLink, ticketName, clientName, refererHost } = req.body || {};
    if (!videoLink) return res.status(400).json({ error: 'missing_videoLink' });
    const autoLocation = (HOST_TO_LOCATION[(refererHost || '').toLowerCase()] || GHL_LOCATION_ID || '').trim();
    const headers = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
      ...(autoLocation ? { 'LocationId': autoLocation } : {})
    };
    if (contactId && GHL_CUSTOM_FIELD_ID) {
      const upd = await fetch(`${GHL_API}/contacts/${contactId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ customFields: [{ id: GHL_CUSTOM_FIELD_ID, value: videoLink }] })
      });
      if (!upd.ok) { const uj = await upd.json(); return res.status(upd.status).json({ error: 'update_field_failed', details: uj }); }
    }
    if (conversationId) {
      const noteBody = [
        `Screen recording submitted: ${videoLink}`,
        ticketName ? `Ticket: ${ticketName}` : '',
        clientName ? `Client: ${clientName}` : ''
      ].filter(Boolean).join(' | ');
      const msg = await fetch(`${GHL_API}/conversations/${conversationId}/messages`, {
        method: 'POST', headers, body: JSON.stringify({ type: 'NOTE', body: noteBody })
      });
      if (!msg.ok) { const mj = await msg.json(); return res.status(msg.status).json({ error: 'post_note_failed', details: mj }); }
    }
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'ghl_post_failed' }); }
});

app.listen(PORT, () => console.log('MS Recorder running on http://localhost:' + PORT));