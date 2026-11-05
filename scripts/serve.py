"""Serve the compiled game on loopback only. No third-party Python packages."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import argparse
import webbrowser
import subprocess
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'dist'
if not (root / 'index.html').exists():
    raise SystemExit('请先在项目目录运行 npm install 和 npm run build。')
try:
    server = ThreadingHTTPServer(('127.0.0.1', 4893), partial(SimpleHTTPRequestHandler, directory=str(root)))
except OSError:
    raise SystemExit('4893 端口正在使用。若游戏已启动，打开 http://127.0.0.1:4893/；否则关闭占用端口的程序后重试。')
dialogue_process = None
project = Path(__file__).resolve().parents[1]
if (project / '.env.server.local').exists():
    node = shutil.which('node')
    if node:
        dialogue_process = subprocess.Popen([node, str(project / 'server/index.mjs')], cwd=project)
    else:
        print('NIA 对话需要 Node.js 22.6+；当前仍可打开本地剧本。', flush=True)
print('余光 AFTERGLOW: http://127.0.0.1:4893/  （按 Control+C 停止）', flush=True)
if not args.no_browser:
    webbrowser.open('http://127.0.0.1:4893/')
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
    if dialogue_process is not None and dialogue_process.poll() is None:
        dialogue_process.terminate()
        dialogue_process.wait(timeout=5)
