#!/usr/bin/env python3
"""Smoke-test local dev apps with temporary data and disabled integrations."""
from pathlib import Path
import http.cookiejar
import json
import os
import secrets
import signal
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
APPS = [('tallytrail', 3101), ('greengate', 3102), ('quorum', 3103), ('suppliers', 3104), ('proof', 3105)]

def request(opener, port, path='/', body=None):
    origin = f'http://127.0.0.1:{port}'
    headers = {'Origin': origin}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with opener.open(req, timeout=15) as response:
            data = response.read()
            return response.status, data
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'{path}: HTTP {error.code}: {error.read().decode()}') from error

if __name__ == '__main__':
    processes = []
    with tempfile.TemporaryDirectory(prefix='hackathon-http-smoke-') as temporary:
        temporary = Path(temporary)
        environment = {**os.environ, 'NEXT_TELEMETRY_DISABLED': '1'}
        for name in ['TALLYTRAIL_GEMINI_ENABLED', 'YOUCAM_ENABLE_LIVE', 'YOUCAM_ENABLE_EXPLORATION', 'YOUCAM_CAMERA_KIT_ENABLED', 'QUORUM_ENABLE_LIVE', 'GITLAB_READ_ENABLED', 'SUPPLIERS_ENABLE_STRIPE_TEST']:
            environment[name] = 'false'
        for name in ['PROOF', 'QUORUM', 'SUPPLIERS']:
            environment[name + '_SESSION_SECRET'] = secrets.token_hex(32)
        for app, _port in APPS:
            environment[app.upper() + '_DATA_DIR'] = str(temporary / app)
        try:
            for app, port in APPS:
                log = (temporary / f'{app}.log').open('w')
                process = subprocess.Popen(['node', str(ROOT / 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', str(port)], cwd=ROOT / 'apps' / app, env=environment, stdout=log, stderr=log, start_new_session=True)
                log.close()
                processes.append((app, port, process))
            for app, port, process in processes:
                opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                deadline = time.monotonic() + 30
                while True:
                    try:
                        status, page = request(opener, port)
                        assert status == 200 and b'<html' in page.lower()
                        break
                    except Exception:
                        if process.poll() is not None or time.monotonic() > deadline:
                            print((temporary / f'{app}.log').read_text())
                            raise
                        time.sleep(0.25)
                print(f'{app}: local HTML HTTP 200', flush=True)
                if app == 'tallytrail':
                    status, data = request(opener, port, '/api/reports')
                    assert status == 200 and 'reports' in json.loads(data)
                elif app == 'greengate':
                    assert request(opener, port, '/api/health')[0] == 200
                elif app == 'quorum':
                    status, data = request(opener, port, '/api/demo', {})
                    event = json.loads(data)
                    assert status == 200 and event['mode'] == 'demo' and event['plan'] and len(event['attendees']) == 4
                    assert request(opener, port, f"/api/events/{event['id']}")[0] == 200
                elif app == 'suppliers':
                    assert request(opener, port, '/api/session', {'persona': 'owner'})[0] == 200
                    status, data = request(opener, port, '/api/workspace')
                    assert status == 200 and json.loads(data)['org']['name'] == 'Cedar & Grain'
                elif app == 'proof':
                    status, data = request(opener, port, '/api/state')
                    assert status == 200 and json.loads(data)['configuration']['liveAnalysis'] is False
                    status, data = request(opener, port, '/api/actions', {'action': 'demo'})
                    assert status == 200 and len(json.loads(data)['state']['checkins']) == 4
                print(f'{app}: local API smoke passed', flush=True)
        finally:
            for _app, _port, process in processes:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
            for _app, _port, process in processes:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
