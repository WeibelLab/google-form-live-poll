"""Live poll board for a Google Form (Slido-style), served locally.

Reads the form's response Sheet with the Google Docs MCP token (read-only),
aggregates answers (no names or emails on the page), and serves a projector
page on http://127.0.0.1:8765 that refreshes every 3 seconds: a bar chart for
multiple-choice questions and a word cloud for text questions, plus a QR code
to the form.

    .venv/bin/python tools/live_poll.py SHEET_ID FORM_URL [--port 8765]
    .venv/bin/python tools/live_poll.py SHEET_ID --credit out.csv   # emails + timestamps for credit
    .venv/bin/python tools/live_poll.py --config polls/cse291a_week0.json   # one form per question

Keys on the page: arrows or 1-9 switch question, Q toggles the QR code.
Runs only while the command is running (Ctrl-C to stop).
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import qrcode
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path.home() / "Projects" / "canvas-rollover"))  # Google token helper
from canvas_rollover import access  # noqa: E402

SKIP = {"timestamp", "email address", "email", "score"}
_tok = {"value": None, "at": 0}


def token() -> str:
    if time.time() - _tok["at"] > 1800:
        _tok["value"], _tok["at"] = access._google_token(), time.time()
    return _tok["value"]


def rows(sheet: str) -> list[list[str]]:
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{sheet}/values/"
           + urllib.parse.quote("A1:Z5000"))
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token()}"})
    return json.load(urllib.request.urlopen(req, timeout=20)).get("values", [])


def norm(s: str) -> str:
    s = re.sub(r"[^\w\s\-+.#/]", "", s.strip().lower())
    return re.sub(r"\s+", " ", s)


DEMO = [["Timestamp", "Email Address", "What's your program?", "One word for why you're taking this class", "An AI tool you use every day"]] + [
    ["", "", p, w, t] for p, w, t in zip(
        ["Grad: CSE MS"] * 14 + ["Grad: other program"] * 5 + ["Grad: DSC", "Undergrad", "Grad: CSE PhD"],
        ["curiosity", "career", "ethics", "Curiosity", "design", "interest", "career", "responsible AI", "curiosity", "users",
         "fun", "career", "learning", "ethics", "HCI", "trust", "curiosity", "impact", "design", "career", "safety", "fairness"],
        ["ChatGPT", "Claude", "chatgpt", "Copilot", "Gemini", "ChatGPT", "Cursor", "Claude", "Perplexity", "ChatGPT", "Grammarly",
         "chatgpt", "Claude", "Copilot", "Gemini", "ChatGPT", "NotebookLM", "Claude", "chatgpt", "Cursor", "Gemini", "ChatGPT"])]


STOP = set("""a an the and or but of to in on for with at by from as is are was were be been being it its this that these
those i we you they he she them our your their my me us not no yes so if then than can could should would will may
might must do does did have has had more most less very also just about into over under because which who what when
where how why all any some such other only own same too there here up out more many much each both few one model
models open source sourcing""".split())


def words(answers: list[str]) -> Counter:
    c = Counter()
    for a in answers:
        for w in re.findall(r"[a-z][a-z\-']+", a.lower()):
            if w not in STOP and len(w) > 2:
                c[w] += 1
    return c


def aggregate(sheet: str, choices: dict[str, list[str]], long: bool = False) -> dict:
    vals = DEMO if sheet == "demo" else rows(sheet)
    if not vals:
        return {"n": 0, "questions": []}
    head, data = vals[0], vals[1:]
    qs = []
    for i, h in enumerate(head):
        if h.strip().lower() in SKIP:
            continue
        answers = [r[i].strip() for r in data if i < len(r) and r[i].strip()]
        if h in choices:
            c = Counter(answers)
            qs.append({"title": h, "kind": "bars", "n": len(answers),
                       "items": [[o, c.get(o, 0)] for o in choices[h]]
                       + [[o, k] for o, k in c.items() if o not in choices[h]]})
        elif long:
            qs.append({"title": h, "kind": "cloud", "n": len(answers),
                       "items": [[w, k] for w, k in words(answers).most_common(80)]})
        else:
            c = Counter(norm(a) for a in answers)
            shown = {}
            for a in answers:   # display the most common original spelling of each word
                shown.setdefault(norm(a), Counter())[a.strip()] += 1
            qs.append({"title": h, "kind": "cloud", "n": len(answers),
                       "items": [[shown[w].most_common(1)[0][0], k] for w, k in c.most_common(150)]})
    return {"n": len(data), "questions": qs}


def qr_data_uri(url: str) -> str:
    img = qrcode.make(url, border=2)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>Live poll</title>
<style>
:root{--navy:#13305a;--gold:#deb160;--bg:#f6f7fb}
body{margin:0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:var(--bg);color:#1b2433}
header{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:var(--navy);color:#fff}
header .t{font-size:26px;font-weight:700} header .n{font-size:20px;color:var(--gold)}
main{display:flex;gap:24px;padding:24px 28px;height:calc(100vh - 120px);box-sizing:border-box}
#stage{flex:1;background:#fff;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.06);padding:22px 28px;display:flex;flex-direction:column}
#q{font-size:34px;font-weight:700;color:var(--navy);margin:0 0 6px}
#sub{font-size:16px;color:#667;margin-bottom:12px}
#viz{flex:1;position:relative}
.bar{display:flex;align-items:center;margin:16px 0;font-size:22px}
.bar .lab{width:30%;padding-right:12px}.bar .trk{flex:1;background:#e8ecf3;border-radius:8px;height:44px;position:relative;overflow:hidden}
.bar .fill{height:100%;background:var(--navy);border-radius:8px;transition:width .6s}
.bar .pct{width:110px;text-align:right;font-weight:700}
#cloud{width:100%;height:100%}
aside{width:300px;background:#fff;border-radius:14px;padding:18px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.06)}
aside img{width:100%} aside .h{font-weight:700;color:var(--navy);font-size:20px;margin-bottom:8px}
.nav{font-size:14px;color:#889;margin-top:10px}
.hide{display:none}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/wordcloud2.js/1.2.2/wordcloud2.min.js"></script>
</head><body>
<header><div class="t">__TITLE__</div><div class="n" id="count">0 responses</div></header>
<main><section id="stage"><div id="q">Loading…</div><div id="sub"></div><div id="viz"></div></section>
<aside id="qrbox"><div class="h">Answer here</div><img id="qrimg" src=""><div>Sign in with your UCSD account</div><div class="nav">← → or 1-9: question · Q: QR code</div></aside></main>
<script>
let D=null, cur=0, last=''; const QRS=__QRS__;
const pal=['#13305a','#c48f2c','#1f6f8b','#7a3e9d','#2e7d32','#b23a48','#455a64'];
function draw(force){
  if(!D||!D.questions.length) return;
  cur=Math.max(0,Math.min(cur,D.questions.length-1));
  const q=D.questions[cur], key=JSON.stringify([cur,q.items]);
  document.getElementById('count').textContent=q.n+' response'+(q.n==1?'':'s');
  document.getElementById('qrimg').src=QRS[cur]||QRS[0];
  document.getElementById('q').textContent=q.title;
  document.getElementById('sub').textContent=`Question ${cur+1} of ${D.questions.length} · ${q.n} answer${q.n==1?'':'s'}`;
  if(key===last && !force) return; last=key;
  const v=document.getElementById('viz'); v.innerHTML='';
  if(q.kind==='bars'){
    const tot=q.items.reduce((s,x)=>s+x[1],0)||1;
    for(const [o,k] of q.items){const p=Math.round(100*k/tot);
      v.insertAdjacentHTML('beforeend',`<div class="bar"><div class="lab">${o.replace(/</g,'&lt;')}</div><div class="trk"><div class="fill" style="width:${p}%"></div></div><div class="pct">${p}% (${k})</div></div>`);}
  } else {
    const c=document.createElement('canvas'); c.id='cloud'; v.appendChild(c);
    c.width=v.clientWidth; c.height=v.clientHeight;
    const max=Math.max(1,...q.items.map(x=>x[1]));
    const sc=Math.min(c.width/800,c.height/450); const words=q.items.map(([w,k])=>[w,Math.round((18+92*Math.sqrt(k/max))*sc)]);
    if(words.length) WordCloud(c,{list:words,fontFamily:'-apple-system,Helvetica,Arial',fontWeight:'700',
      color:()=>pal[Math.floor(Math.random()*pal.length)],rotateRatio:0,gridSize:10,shuffle:false,backgroundColor:'#fff'});
  }
}
async function tick(){try{D=await (await fetch('/data')).json();draw(false);}catch(e){} setTimeout(tick,1000);}
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'){cur++;draw(true)} else if(e.key==='ArrowLeft'){cur--;draw(true)}
  else if(/^[1-9]$/.test(e.key)){cur=+e.key-1;draw(true)}
  else if(e.key==='q'||e.key==='Q'){document.getElementById('qrbox').classList.toggle('hide');setTimeout(()=>draw(true),50)}
});
window.addEventListener('resize',()=>draw(true));
tick();
</script></body></html>"""


def aggregate_slides(slides: list[dict]) -> dict:
    """One slide per form: {"sheet", "url", "question", "choices"?}."""
    out = []
    for sl in slides:
        a = aggregate(sl["sheet"], {sl["question"]: sl["choices"]} if sl.get("choices") else {}, sl.get("long", False))
        q = next((x for x in a["questions"] if x["title"].strip() == sl["question"].strip()), None)
        out.append(q or {"title": sl["question"], "kind": "bars" if sl.get("choices") else "cloud", "n": 0,
                         "items": [[o, 0] for o in sl.get("choices", [])]})
    return {"n": sum(q["n"] for q in out), "questions": out}


def serve(sheet, form_url, title, choices, port, slides=None):
    qrs = [qr_data_uri(sl["url"]) for sl in slides] if slides else [qr_data_uri(form_url)]
    page = PAGE.replace("__TITLE__", title).replace("__QRS__", json.dumps(qrs)).encode()
    cache = {"at": 0, "body": b"{}"}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path.startswith("/data"):
                if time.time() - cache["at"] > 0.8:
                    try:
                        data = aggregate_slides(slides) if slides else aggregate(sheet, choices)
                        cache["body"] = json.dumps(data).encode()
                    except Exception as e:  # keep serving the last result
                        print("sheet read failed:", e)
                    cache["at"] = time.time()
                body, ctype = cache["body"], "application/json"
            else:
                body, ctype = page, "text/html; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    print(f"Live poll board: http://127.0.0.1:{port}  (Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()


def credit(sheet, out):
    vals = rows(sheet)
    head = [h.strip().lower() for h in vals[0]]
    ie, it = head.index("email address"), head.index("timestamp")
    with open(out, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["email", "timestamp"])
        for r in vals[1:]:
            if ie < len(r):
                w.writerow([r[ie].strip().lower(), r[it] if it < len(r) else ""])
    print(f"{len(vals) - 1} responses written to {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet", nargs="?"); ap.add_argument("form_url", nargs="?")
    ap.add_argument("--config", help="JSON with {title, slides:[{sheet,url,question,choices?}]} (one form per question)")
    ap.add_argument("--title", default="CSE 291A: Getting to Know You")
    ap.add_argument("--choices", default="{}", help='JSON {"question title": ["option", ...]} for bar order')
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--credit")
    a = ap.parse_args()
    if a.credit:
        credit(a.sheet, a.credit)
    elif a.config:
        cfg = json.load(open(a.config))
        serve(None, None, cfg.get("title", a.title), {}, a.port, slides=cfg["slides"])
    else:
        serve(a.sheet, a.form_url, a.title, json.loads(a.choices), a.port)
