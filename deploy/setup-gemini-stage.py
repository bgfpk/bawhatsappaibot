"""Upgrade isolated staging only. Preserve private database and prior service unit."""
from pathlib import Path
import hashlib
import json
import os
import sqlite3
import subprocess

ROOT = Path('/opt/blackarrow-conversion/implementation')
STATE = Path('/var/lib/blackarrow-conversion-02')
UNIT = Path('/etc/systemd/system/blackarrow-conversion-02.service')
EGRESS = Path('/var/lib/blackarrow-conversion-egress')
assert os.geteuid() == 0
assert ROOT.is_dir() and (ROOT / 'dist/server.cjs').is_file()
assert STATE.resolve() == STATE and not STATE.is_symlink()
assert UNIT.is_file() and '--network none' in UNIT.read_text()
assert '/opt/blackarrow-conversion/implementation:/work:ro' in UNIT.read_text()
recovery = STATE / 'recovery'
recovery.mkdir(mode=0o700, exist_ok=True)
backup = recovery / 'before-conversion-04.sqlite'
if not backup.exists():
    source = sqlite3.connect(f'file:{STATE / "blackarrow.sqlite"}?mode=ro', uri=True)
    target = sqlite3.connect(str(backup))
    source.backup(target)
    assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    target.close()
    source.close()
    os.chmod(backup, 0o600)
    os.chown(backup, 1001, 1001)
old = recovery / 'before-conversion-04.service'
if not old.exists():
    old.write_text(UNIT.read_text())
    os.chmod(old, 0o600)
    os.chown(old, 1001, 1001)
EGRESS.mkdir(mode=0o700, exist_ok=True)
assert EGRESS.resolve() == EGRESS and not EGRESS.is_symlink()
os.chown(EGRESS, 1001, 1001)
os.chmod(EGRESS, 0o700)
gateway = '''[Unit]
Description=Black Arrow restricted Gemini HTTPS gateway
After=network-online.target
Wants=network-online.target
[Service]
User=vpsadmin
Group=vpsadmin
ExecStart=/usr/bin/python3 /opt/blackarrow-conversion/implementation/deploy/gemini-egress.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/blackarrow-conversion-egress
InaccessiblePaths=/var/lib/blackarrow-conversion-02 /opt/blackarrow /etc/blackarrow
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
MemoryMax=128M
TasksMax=32
LimitNOFILE=128
UMask=0077
[Install]
WantedBy=multi-user.target
'''
gateway_unit = Path('/etc/systemd/system/blackarrow-conversion-gemini-egress.service')
if gateway_unit.exists() and gateway_unit.read_text() != gateway:
    raise RuntimeError('Inspect differing existing Gemini gateway before replacing')
gateway_unit.write_text(gateway)
unit = UNIT.read_text()
if 'BLACKARROW_GEMINI_EGRESS_SOCKET=' not in unit:
    unit = unit.replace('Requires=docker.service', 'Requires=docker.service blackarrow-conversion-gemini-egress.service')
    unit = unit.replace('After=docker.service', 'After=docker.service blackarrow-conversion-gemini-egress.service')
    unit = unit.replace('-e BLACKARROW_STAGE=1 ', '-e BLACKARROW_STAGE=1 -e BLACKARROW_GEMINI_EGRESS_SOCKET=/egress/gemini.sock -v /var/lib/blackarrow-conversion-egress:/egress:ro ')
    UNIT.write_text(unit)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', gateway_unit.name], check=True)
subprocess.run(['systemctl', 'restart', UNIT.name], check=True)
print(json.dumps({'staging_upgrade': True, 'network': 'none', 'private_pre_migration_backup': str(backup),
                  'backup_sha256': hashlib.sha256(backup.read_bytes()).hexdigest(), 'production_changed': False}))
