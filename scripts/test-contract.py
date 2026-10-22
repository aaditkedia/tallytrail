#!/usr/bin/env python3
"""Exercise duplicate-PDA rejection on an isolated local validator, never devnet."""
from pathlib import Path
import json
import os
import signal
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'apps/tallytrail/anchor'
PROGRAM = 'EkxBFKArDyC7opXhFEFZc6knzvv6mkeDUNkGPGHWD4By'
RPC = 'http://127.0.0.1:18899'

def rpc(method, params=None):
    request = urllib.request.Request(RPC, data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or []}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=3) as response:
        data = json.load(response)
    if 'error' in data:
        raise RuntimeError(data['error'])
    return data['result']

if __name__ == '__main__':
    if not (CONTRACT / 'target/idl/tallytrail.json').exists():
        raise SystemExit('Build the contract binary and IDL first: see the TallyTrail README.')
    with tempfile.TemporaryDirectory(prefix='tallytrail-validator-') as directory:
        directory = Path(directory)
        wallet = directory / 'wallet.json'
        key_script = "const {Keypair}=require('@solana/web3.js');const fs=require('node:fs');const key=Keypair.generate();fs.writeFileSync(process.argv[1],JSON.stringify([...key.secretKey]),{mode:0o600});process.stdout.write(key.publicKey.toBase58());"
        public_key = subprocess.check_output(['node', '-e', key_script, str(wallet)], cwd=ROOT, text=True).strip()
        with (directory / 'validator.log').open('w') as log:
            process = subprocess.Popen([str(ROOT / '.toolchains/solana-release/bin/solana-test-validator'), '--quiet', '--reset', '--ledger', str(directory / 'ledger'), '--rpc-port', '18899', '--faucet-port', '19900', '--gossip-port', '18001', '--dynamic-port-range', '18010-18030', '--bind-address', '127.0.0.1', '--bpf-program', PROGRAM, str(CONTRACT / 'target/deploy/tallytrail.so')], stdout=log, stderr=log, start_new_session=True)
        try:
            deadline = time.monotonic() + 45
            while True:
                try:
                    if rpc('getHealth') == 'ok':
                        break
                except Exception:
                    if process.poll() is not None or time.monotonic() > deadline:
                        print((directory / 'validator.log').read_text())
                        raise
                    time.sleep(0.25)
            rpc('requestAirdrop', [public_key, 2_000_000_000])
            for _ in range(40):
                if rpc('getBalance', [public_key])['value'] >= 1_000_000_000:
                    break
                time.sleep(0.25)
            result = subprocess.run(['node', '--test', 'tests/uniqueness.mjs'], cwd=CONTRACT, env={**os.environ, 'ANCHOR_PROVIDER_URL': RPC, 'ANCHOR_WALLET': str(wallet)})
            if result.returncode:
                raise SystemExit(result.returncode)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
