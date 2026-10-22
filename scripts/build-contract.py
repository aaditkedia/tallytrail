#!/usr/bin/env python3
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
contract = root / 'apps/tallytrail/anchor'
runner = str(root / 'scripts/native-run.py')
# Keep the SBF-only option out of Anchor's separate host-Cargo IDL invocation.
commands = [
    ['anchor', 'build', '--no-idl', '--', '--tools-version', 'v1.57'],
    ['anchor', 'idl', 'build', '--out', 'target/idl/tallytrail.json'],
]
for command in commands:
    result = subprocess.run([sys.executable, runner, *command], cwd=contract)
    if result.returncode:
        raise SystemExit(result.returncode)
(contract / 'idl').mkdir(exist_ok=True)
shutil.copyfile(contract / 'target/idl/tallytrail.json', contract / 'idl/tallytrail.json')
