"""Add one virtual host/certificate, preserving all existing sites and app services."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

HOST = 'app.blackgoldfertilizer.com'
AVAILABLE = Path('/etc/nginx/sites-available/blackarrow-public-domain')
ENABLED = Path('/etc/nginx/sites-enabled/blackarrow-public-domain')
RECOVERY = Path('/var/lib/blackarrow-conversion-domain-recovery')
assert os.geteuid() == 0
assert sys.argv[1] in ('challenge', 'https')
RECOVERY.mkdir(mode=0o700, exist_ok=True)
protected = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in Path('/etc/nginx/sites-enabled').iterdir() if p != ENABLED and p.is_file()}
if sys.argv[1] == 'challenge':
    assert not AVAILABLE.exists() and not ENABLED.exists(), 'Inspect an existing hostname configuration before changing it'
    body = '''server {
 listen 80; listen [::]:80; server_name app.blackgoldfertilizer.com;
 location /.well-known/acme-challenge/ { root /var/lib/letsencrypt; }
 location / { return 503; }
}
'''
    (RECOVERY / 'protected-sites-before.json').write_text(json.dumps(protected, indent=2))
else:
    assert ENABLED.is_symlink() and ENABLED.resolve() == AVAILABLE
    assert Path('/etc/letsencrypt/live/' + HOST + '/fullchain.pem').is_file()
    body = Path(__file__).with_name('blackarrow-public.conf').read_text()
previous = AVAILABLE.read_text() if AVAILABLE.exists() else None
try:
    AVAILABLE.write_text(body)
    if not ENABLED.exists():
        ENABLED.symlink_to(AVAILABLE)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except BaseException:
    if previous is None:
        if ENABLED.is_symlink(): ENABLED.unlink()
        AVAILABLE.unlink(missing_ok=True)
    else:
        AVAILABLE.write_text(previous)
    raise
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == digest for p, digest in protected.items())
print(json.dumps({'hostname': HOST, 'phase': sys.argv[1], 'unrelated_sites_unchanged': True,
                  'converted_staging_publicly_exposed': False}))
