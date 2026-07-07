"""DOSL HUB マニュアル用スクリーンショット撮影（Chrome headless + CDP）"""
import asyncio
import base64
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from websockets.asyncio.client import connect

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = "http://localhost:8713"
OUT = Path(__file__).parent / "images"
OUT.mkdir(exist_ok=True)
PORT = 9333


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.msg_id = 0
        self.pending = {}
        self.events = asyncio.Queue()
        self.reader_task = asyncio.create_task(self._reader())

    async def _reader(self):
        async for raw in self.ws:
            msg = json.loads(raw)
            if "id" in msg:
                fut = self.pending.pop(msg["id"], None)
                if fut:
                    fut.set_result(msg)
            else:
                await self.events.put(msg)

    async def send(self, method, params=None):
        self.msg_id += 1
        fut = asyncio.get_event_loop().create_future()
        self.pending[self.msg_id] = fut
        await self.ws.send(json.dumps({"id": self.msg_id, "method": method, "params": params or {}}))
        res = await asyncio.wait_for(fut, 30)
        if "error" in res:
            raise RuntimeError(f"{method}: {res['error']}")
        return res.get("result", {})

    async def wait_event(self, name, timeout=15):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                msg = await asyncio.wait_for(self.events.get(), end - time.monotonic())
            except asyncio.TimeoutError:
                break
            if msg.get("method") == name:
                return msg
        raise TimeoutError(name)

    async def goto(self, url):
        await self.send("Page.navigate", {"url": url})
        await self.wait_event("Page.loadEventFired")
        await asyncio.sleep(0.5)

    async def js(self, expr, await_promise=True):
        res = await self.send("Runtime.evaluate", {
            "expression": expr, "awaitPromise": await_promise, "returnByValue": True,
        })
        if res.get("exceptionDetails"):
            raise RuntimeError(json.dumps(res["exceptionDetails"])[:500])
        return res.get("result", {}).get("value")

    async def shot(self, name):
        res = await self.send("Page.captureScreenshot", {"format": "png"})
        (OUT / f"{name}.png").write_bytes(base64.b64decode(res["data"]))
        print("saved", name)


LOGIN_JS = """
(async () => {{
  const res = await fetch('/api/auth/login', {{method:'POST',
    headers:{{'Content-Type':'application/json'}},
    body: JSON.stringify({{email:'{email}', password:'{password}'}})}});
  const d = await res.json();
  localStorage.setItem('doslhub_token', d.access_token);
  localStorage.setItem('doslhub_user', JSON.stringify(d.user));
  localStorage.removeItem('doslhub_exhibition_id');
  return 'ok';
}})()
"""


async def main():
    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
         "--window-size=1280,900", "--hide-scrollbars", "--force-device-scale-factor=2",
         "--user-data-dir=/tmp/chrome-manual-profile", "--no-first-run", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(30):
            try:
                targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read())
                pages = [t for t in targets if t["type"] == "page"]
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not ws_url:
            sys.exit("chrome CDP not ready")

        async with connect(ws_url, max_size=50 * 1024 * 1024) as ws:
            cdp = CDP(ws)
            await cdp.send("Page.enable")
            await cdp.send("Runtime.enable")

            # ── ログイン画面 ──
            await cdp.goto(f"{BASE}/login.html")
            await asyncio.sleep(1.0)
            await cdp.shot("login")

            # ── 出展社ポータル ──
            await cdp.js(LOGIN_JS.format(email="exhibitor-a@dosl-hub.example.com", password="exhibitor1234"))
            await cdp.goto(f"{BASE}/index.html")
            await asyncio.sleep(1.5)
            await cdp.shot("exhibitor_step1")

            # ファイルを追加して STEP2（カテゴリ選択）へ
            await cdp.js("""
              addFiles([new File(['demo'], '電気工事申込書.pdf', {type: 'application/pdf'})]);
              document.getElementById('btnNext1').click(); 'ok'
            """, await_promise=False)
            await asyncio.sleep(0.6)
            await cdp.shot("exhibitor_step2")

            # カテゴリ選択して STEP3（確認）へ
            await cdp.js("""
              [...document.querySelectorAll('.category-item')].find(i => i.textContent.includes('電気申込')).click();
              document.getElementById('btnNext2').click(); 'ok'
            """, await_promise=False)
            await asyncio.sleep(0.6)
            await cdp.shot("exhibitor_step3")

            # 提出済み書類一覧までスクロール
            await cdp.js("document.querySelectorAll('.card')[1].scrollIntoView({block:'start'}); 'ok'", await_promise=False)
            await asyncio.sleep(0.5)
            await cdp.shot("exhibitor_doclist")

            # ── 管理ダッシュボード ──
            await cdp.js(LOGIN_JS.format(email="admin@dosl-hub.example.com", password="admin1234"))
            await cdp.goto(f"{BASE}/admin.html")
            await asyncio.sleep(2.0)
            await cdp.shot("admin_dashboard")

            for tab, wait in [("documents", 1.2), ("review", 2.0), ("orders", 1.2),
                              ("designspecs", 1.2), ("categories", 1.2),
                              ("applications", 1.5), ("users", 1.5)]:
                await cdp.js(f"switchTab('{tab}'); 'ok'", await_promise=False)
                await asyncio.sleep(wait)
                await cdp.shot(f"admin_{tab}")

            # 設計仕様の詳細ダイアログ
            await cdp.js("document.querySelector('#specsTableBody .icon-btn')?.click(); 'ok'", await_promise=False)
            await asyncio.sleep(1.2)
            await cdp.shot("admin_spec_dialog")
            await cdp.js("closeSpecDialog(); 'ok'", await_promise=False)

            # 展示会を管理ダイアログ
            await cdp.js("switchTab('dashboard'); 'ok'", await_promise=False)
            await asyncio.sleep(1.0)
            await cdp.js("document.getElementById('btnManageExhibitions').click(); 'ok'", await_promise=False)
            await asyncio.sleep(0.6)
            await cdp.shot("admin_exhibitions_dialog")

        print("done")
    finally:
        proc.terminate()


asyncio.run(main())
