"""Owner-run deployment to isolated conversion staging, never production."""
from pathlib import Path, PurePosixPath
import hashlib, json, os, shutil, sqlite3, subprocess, sys, tarfile, tempfile, time

ROOT = Path('/opt/blackarrow-conversion')
LIVE = ROOT / 'implementation'
STATE = Path('/var/lib/blackarrow-conversion-02')
IMAGE = 'sha256:b304dd15e9ab502f5dedf2178e88286f1f9f4ab75984e3a79b2d7cdb47112555'
SERVICE = 'blackarrow-conversion-02.service'
assert os.geteuid() == 0
assert ROOT.resolve() == ROOT and LIVE.resolve() == LIVE and STATE.resolve() == STATE
phase = sys.argv[2] if len(sys.argv) == 3 else '06'
assert phase in ('05', '06', '07')
archive = Path('/tmp/blackarrow-conversion-' + phase + '-sanitized.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == sys.argv[1]
unit = subprocess.check_output(['systemctl', 'cat', SERVICE], text=True)
assert '--network none' in unit and str(LIVE) + ':/work:ro' in unit
assert '/opt/blackarrow:' not in unit
work = ROOT / 'work'
work.mkdir(mode=0o755, exist_ok=True)
assert work.resolve() == work
release = Path(tempfile.mkdtemp(prefix='conversion-' + phase + '-', dir=work))
os.chmod(release, 0o755)
with tarfile.open(archive) as package:
    manifest = json.load(package.extractfile('SOURCE-MANIFEST.json'))
    assert manifest['phase'] == 'Conversion ' + phase
    for row in manifest['records']:
        relative = PurePosixPath(row['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        assert not set(relative.parts) & {'node_modules', 'dist', '.git', 'sessions', 'uploads'}
        member = package.getmember('source/' + str(relative))
        assert member.isfile() and member.size < 32 * 1024 * 1024
        data = package.extractfile(member).read()
        assert hashlib.sha256(data).hexdigest() == row['sha256']
        destination = release / str(relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
for directory, _, files in os.walk(release):
    os.chown(directory, 1001, 1001)
    for name in files:
        os.chown(Path(directory) / name, 1001, 1001)
build = ['docker', 'run', '--rm', '--network', 'none', '--user', '1001:1001',
         '--memory', '2304m', '--cpus', '2', '--cap-drop', 'ALL',
         '--security-opt', 'no-new-privileges', '--tmpfs', '/work/node_modules/.vite-temp:rw,uid=1001,gid=1001,size=64m',
         '-e', 'NODE_OPTIONS=--max-old-space-size=1792',
         '-v', str(release) + ':/work:rw', '-v', str(LIVE / 'node_modules') + ':/work/node_modules:ro',
         '-w', '/work', '--entrypoint', 'sh', IMAGE, '-c',
         'node node_modules/typescript/bin/tsc --noEmit && node deploy/build-stage.mjs']
subprocess.run(build, check=True)  # A failed build leaves the running release untouched.
recovery = STATE / 'recovery' / release.name
recovery.mkdir(mode=0o700)
with sqlite3.connect(f'file:{STATE / "blackarrow.sqlite"}?mode=ro', uri=True) as source:
    with sqlite3.connect(recovery / 'before.sqlite') as target:
        source.backup(target)
        assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
os.chmod(recovery / 'before.sqlite', 0o600)
# Retain exactly the files being overwritten and the working build for rollback.
old = recovery / 'source'
old.mkdir()
created = []
for row in manifest['records']:
    destination = LIVE / row['path']
    assert not destination.is_symlink()
    if destination.exists():
        saved = old / row['path']; saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, saved)
    else:
        created.append(row['path'])
(recovery / 'created-files.json').write_text(json.dumps(created))
shutil.copytree(LIVE / 'dist', recovery / 'dist')
try:
    for row in manifest['records']:
        destination = LIVE / row['path']; destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(release / row['path'], destination)
        os.chown(destination, 1001, 1001)
    previous = release / 'previous-dist'
    (LIVE / 'dist').rename(previous)
    (release / 'dist').rename(LIVE / 'dist')
    subprocess.run(['systemctl', 'restart', SERVICE], check=True)
    for attempt in range(20):
        check = subprocess.run(['docker', 'exec', 'blackarrow-conversion-02', 'node', 'deploy/health-check.cjs'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if check.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Staging health check failed')
except Exception:
    for row in manifest['records']:
        destination = LIVE / row['path']; saved = old / row['path']
        if saved.exists():
            shutil.copy2(saved, destination)
        elif row['path'] in created:
            destination.unlink(missing_ok=True)
    failed = LIVE / ('dist-failed-' + release.name)
    if (LIVE / 'dist').exists(): (LIVE / 'dist').rename(failed)
    shutil.copytree(recovery / 'dist', LIVE / 'dist')
    subprocess.run(['systemctl', 'restart', SERVICE], check=False)
    raise  # Preserve the current database; never discard new owner data automatically.
print(json.dumps({'isolated_staging_deployed': True, 'recovery': str(recovery),
                  'production_changed': False, 'live_whatsapp_enabled': False}))
