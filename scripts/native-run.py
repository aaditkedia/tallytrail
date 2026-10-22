#!/usr/bin/env python3
"""Run a command with this suite's installed native tools; does not change login files."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
tools = root / '.toolchains'
environment = {**os.environ, 'RUSTUP_HOME': str(tools / 'rustup'), 'CARGO_HOME': str(tools / 'cargo'), 'PATH': str(tools / 'cargo/bin') + os.pathsep + str(tools / 'bin') + os.pathsep + str(tools / 'solana-release/bin') + os.pathsep + os.environ['PATH']}
if len(sys.argv) < 2:
    raise SystemExit('Usage: python3 scripts/native-run.py <command> [arguments]')
raise SystemExit(subprocess.run(sys.argv[1:], env=environment).returncode)
