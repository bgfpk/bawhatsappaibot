"""Back up independent staging before number migration; never touch production."""
from pathlib import Path
import hashlib
import json
import os
import sqlite3
import subprocess

STATE = Path('/var/lib/blackarrow-conversion-02')
assert os.geteuid() == 0
assert STATE.resolve() == STATE and not STATE.is_symlink()
backup = STATE / 'recovery/before-conversion-05.sqlite'
assert not backup.exists(), 'Preserve an existing Conversion 05 recovery point'
source = sqlite3.connect(f'file:{STATE / "blackarrow.sqlite"}?mode=ro', uri=True)
target = sqlite3.connect(str(backup))
source.backup(target)
assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
target.close()
source.close()
os.chmod(backup, 0o600)
os.chown(backup, 1001, 1001)
subprocess.run(['systemctl', 'restart', 'blackarrow-conversion-02.service'], check=True)
print(json.dumps({'private_staging_backup': str(backup), 'sha256': hashlib.sha256(backup.read_bytes()).hexdigest(),
                  'production_restart_or_migration': False}))
