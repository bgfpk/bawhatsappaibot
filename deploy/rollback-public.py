"""Explicit operator rollback. Retains all converted owner data before restoring old routing."""
from pathlib import Path
import os,json,sqlite3,shutil,subprocess,datetime
assert os.geteuid()==0
state=Path('/var/lib/blackarrow-converted-public');metadata=json.loads((state/'migration-result.json').read_text())
recovery=Path(metadata['nginx_rollback']);assert recovery.resolve()==recovery and recovery.parent==Path('/var/lib/blackarrow-conversion-02/recovery')
files=[Path('/etc/nginx/sites-available/blackarrow'),Path('/etc/nginx/sites-available/blackarrow-public-domain')]
for f in files:assert (recovery/f.name).is_file()
os.umask(0o077);saved=recovery/('rollback-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));saved.mkdir(mode=0o700)
for f in files:shutil.copy2(f,saved/f.name)
def reload():
 subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
try:
 subprocess.run(['systemctl','stop','blackarrow-converted-public'],check=True)
 with sqlite3.connect('file:'+str(state/'blackarrow.sqlite')+'?mode=ro',uri=True)as source:
  with sqlite3.connect(saved/'converted-data.sqlite')as target:
   source.backup(target);assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 shutil.copy2(state/'custody.json',saved/'custody.json');shutil.copy2(state/'migration-result.json',saved/'migration-result.json')
 for f in files:shutil.copy2(recovery/f.name,f)
 reload()
 print(json.dumps({'public':'OLD','converted_data_retained':str(state),'consistent_converted_backup':str(saved),'production_database_restored':False,'reconciliation_required_before_reusing_old_campaign_writes':True}))
except Exception:
 for f in files:shutil.copy2(saved/f.name,f)
 reload();subprocess.run(['systemctl','start','blackarrow-converted-public'],check=False);raise
