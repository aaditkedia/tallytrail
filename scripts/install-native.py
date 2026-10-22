#!/usr/bin/env python3
"""Install project-local native tools from official HTTPS distribution sources."""
from pathlib import Path
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.toolchains'
DOWNLOADS = TOOLS / 'downloads'
BIN = TOOLS / 'bin'
MANIFEST = TOOLS / 'installed.json'
ANCHOR = '0.32.1'
SOLANA = '2.3.0'

def download(url: str, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'hackathon-dependency-setup'})
    with urllib.request.urlopen(request, timeout=90) as source, destination.open('wb') as target:
        shutil.copyfileobj(source, target, 1024 * 1024)
    digest = hashlib.file_digest(destination.open('rb'), 'sha256').hexdigest()
    print(f'Downloaded {destination.name}: {destination.stat().st_size} bytes', flush=True)
    return {'url': url, 'sha256': digest}

def release_asset(repo: str, version: str, asset_name: str):
    request = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/tags/v{version}', headers={'User-Agent': 'hackathon-dependency-setup'})
    with urllib.request.urlopen(request, timeout=30) as response:
        release = json.load(response)
    asset = next(item for item in release['assets'] if item['name'] == asset_name)
    if not asset['browser_download_url'].startswith('https://github.com/'):
        raise ValueError('Unexpected release asset origin')
    destination = DOWNLOADS / asset_name
    recorded = download(asset['browser_download_url'], destination)
    upstream = asset.get('digest')
    if upstream and upstream != 'sha256:' + recorded['sha256']:
        raise ValueError('Release asset checksum mismatch')
    return destination, {**recorded, 'version': version, 'upstream_digest': upstream}

def environment():
    return {**os.environ, 'RUSTUP_HOME': str(TOOLS / 'rustup'), 'CARGO_HOME': str(TOOLS / 'cargo'), 'PATH': str(TOOLS / 'cargo/bin') + os.pathsep + str(BIN) + os.pathsep + str(TOOLS / 'solana-release/bin') + os.pathsep + os.environ['PATH']}

def rust():
    setup = DOWNLOADS / 'rustup-init'
    url = 'https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init'
    recorded = download(url, setup)
    with urllib.request.urlopen(url + '.sha256', timeout=30) as response:
        expected = response.read().decode().split()[0]
    if expected != recorded['sha256']:
        raise ValueError('Official rustup-init SHA-256 mismatch')
    setup.chmod(0o755)
    subprocess.run([str(setup), '-y', '--profile', 'minimal', '--default-toolchain', 'stable', '--no-modify-path'], env=environment(), check=True)
    subprocess.run([str(TOOLS / 'cargo/bin/rustc'), '--version'], env=environment(), check=True)
    return {**recorded, 'checksum_verified_against': url + '.sha256'}

def anchor():
    asset, recorded = release_asset('solana-foundation/anchor', ANCHOR, f'anchor-{ANCHOR}-x86_64-unknown-linux-gnu')
    BIN.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(asset, BIN / 'anchor')
    (BIN / 'anchor').chmod(0o755)
    subprocess.run([str(BIN / 'anchor'), '--version'], env=environment(), check=True)
    return recorded

def solana():
    asset, recorded = release_asset('anza-xyz/agave', SOLANA, 'solana-release-x86_64-unknown-linux-gnu.tar.bz2')
    with tarfile.open(asset, 'r:bz2') as archive:
        archive.extractall(TOOLS, filter='data')
    subprocess.run([str(TOOLS / 'solana-release/bin/solana'), '--version'], env=environment(), check=True)
    return recorded

if __name__ == '__main__':
    if sys.platform != 'linux' or platform.machine() != 'x86_64':
        raise SystemExit('This installer supports Linux x86_64 only; use official installation docs on other platforms.')
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    records = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    failed = []
    for name, installer in [('rust', rust), ('anchor', anchor), ('solana', solana)]:
        try:
            records[name] = installer()
            MANIFEST.write_text(json.dumps(records, indent=2) + '\n')
        except Exception as error:
            failed.append(name)
            print(f'{name} installation failed: {error}', file=sys.stderr, flush=True)
    raise SystemExit(1 if failed else 0)
