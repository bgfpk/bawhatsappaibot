"""Install only the independent Black Arrow Conversion 02 service and local socket proxy."""
from pathlib import Path
import json
import os
import secrets
import subprocess

ROOT = Path('/opt/blackarrow-conversion/implementation')
STATE = Path('/var/lib/blackarrow-conversion-02')
IMAGE = 'sha256:b304dd15e9ab502f5dedf2178e88286f1f9f4ab75984e3a79b2d7cdb47112555'
assert os.geteuid() == 0
assert ROOT.is_dir() and (ROOT / 'dist/server.cjs').is_file()
assert STATE.resolve() == STATE and not STATE.is_symlink()
STATE.mkdir(mode=0o700, exist_ok=True)
os.chown(STATE, 1001, 1001)
os.chmod(STATE, 0o700)
custody = STATE / 'custody.json'
if not custody.exists():
    custody.write_text(json.dumps({'email': 'staging.owner@blackarrow.test',
        'password': secrets.token_urlsafe(24), 'sessionSecret': secrets.token_hex(48),
        'encryptionSecret': secrets.token_hex(48)}))
    os.chown(custody, 1001, 1001)
    os.chmod(custody, 0o600)

run = ['docker', 'run', '--rm', '--network', 'none', '--user', '1001:1001',
       '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=64m',
       '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
       '--memory', '768m', '--cpus', '1', '--pids-limit', '128',
       '-e', 'NODE_ENV=production', '-e', 'BLACKARROW_STAGE=1',
       '-v', str(ROOT) + ':/work:ro', '-v', str(STATE) + ':/state:rw',
       '-w', '/work', '--entrypoint', 'node']
if not (STATE / 'blackarrow.sqlite').exists():
    subprocess.run(run + [IMAGE, '--import', 'tsx', 'src/staging/account-bootstrap.ts'], check=True)

unit = '''[Unit]
Description=Black Arrow Conversion 02 isolated copied application
After=docker.service
Requires=docker.service
[Service]
Type=simple
ExecStart=/usr/bin/docker run --init --rm --name blackarrow-conversion-02 --network none --user 1001:1001 --read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m --memory 768m --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges -e NODE_ENV=production -e BLACKARROW_STAGE=1 -v /opt/blackarrow-conversion/implementation:/work:ro -v /var/lib/blackarrow-conversion-02:/state:rw -w /work --health-cmd "node deploy/health-check.cjs" --health-interval 20s --health-timeout 5s --health-retries 3 --entrypoint node IMAGE dist/server.cjs
ExecStop=/usr/bin/docker stop -t 15 blackarrow-conversion-02
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
[Install]
WantedBy=multi-user.target
'''.replace('IMAGE', IMAGE)
socket = '''[Unit]
Description=Black Arrow Conversion 02 loopback entry
[Socket]
ListenStream=127.0.0.1:3412
NoDelay=true
[Install]
WantedBy=sockets.target
'''
proxy = '''[Unit]
Description=Black Arrow Conversion 02 local Unix socket proxy
Requires=blackarrow-conversion-02.service
After=blackarrow-conversion-02.service
[Service]
ExecStart=/usr/lib/systemd/systemd-socket-proxyd /var/lib/blackarrow-conversion-02/http.sock
User=vpsadmin
Group=vpsadmin
NoNewPrivileges=true
PrivateNetwork=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_UNIX AF_INET
'''
for name, body in [('blackarrow-conversion-02.service', unit),
                   ('blackarrow-conversion-02-proxy.socket', socket),
                   ('blackarrow-conversion-02-proxy.service', proxy)]:
    target = Path('/etc/systemd/system') / name
    if target.exists() and target.read_text() != body:
        raise RuntimeError('Existing staging service differs; inspect before replacing: ' + name)
    target.write_text(body)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'blackarrow-conversion-02.service',
                'blackarrow-conversion-02-proxy.socket'], check=True)
print('Independent staging service and loopback socket installed. Credentials remain in private custody.')
