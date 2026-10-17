"""Conversion 07 compatible public release. Never modifies production database rows."""
from pathlib import Path
import subprocess,sqlite3,json,hashlib,secrets,os,time,sys,shutil,datetime
ROOT=Path('/opt/blackarrow-conversion');SOURCE=ROOT/'implementation'
STATE=Path('/var/lib/blackarrow-converted-public');AUTH=Path('/var/lib/blackarrow-public-auth')
OLD=Path('/etc/nginx/sites-available/blackarrow');PUBLIC=Path('/etc/nginx/sites-available/blackarrow-public-domain')
SHA=sys.argv[1];assert len(SHA)==40 and all(c in '0123456789abcdef'for c in SHA)
assert os.geteuid()==0 and not STATE.exists(),'Refusing to replace public state'
RECOVERY=Path('/var/lib/blackarrow-conversion-02/recovery')/('public-07-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
RECOVERY.mkdir(mode=0o700);os.umask(0o077)
for file in [OLD,PUBLIC]:shutil.copy2(file,RECOVERY/file.name)
def run(args,**kw):return subprocess.run(args,check=True,**kw)
def reload():run(['nginx','-t']);run(['systemctl','reload','nginx'])
def export():
 query="""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
 SELECT json_build_object('users',(SELECT coalesce(json_agg(json_build_object('id',id,'email',email) ORDER BY id),'[]') FROM app_users),
 'campaigns',(SELECT coalesce(json_agg(c ORDER BY id),'[]')FROM transport_campaigns c WHERE environment='production'),
 'ai',(SELECT coalesce(json_agg(a ORDER BY campaign_id),'[]')FROM ai_campaigns a WHERE environment='production' AND campaign_id IN(SELECT id FROM transport_campaigns WHERE environment='production')),
 'publications',(SELECT coalesce(json_agg(p ORDER BY created_at,version),'[]')FROM ai_configurations p WHERE environment='production' AND campaign_id IN(SELECT id FROM transport_campaigns WHERE environment='production')),
 'numbers',(SELECT count(*)FROM managed_numbers WHERE environment='production'),
 'knowledge',(SELECT count(*)FROM knowledge_items WHERE environment='production'),
 'documents',(SELECT count(*)FROM knowledge_documents WHERE environment='production'),
 'active_sessions',(SELECT count(*)FROM transport_sessions WHERE environment='production' AND state IN('connected','connecting','pairing')));
 COMMIT;"""
 raw=subprocess.check_output(['docker','exec','-e','PGOPTIONS=-c default_transaction_read_only=on','blackarrow-production-postgres-1','psql','-U','blackarrow','-d','blackarrow','-Atq','-c',query],text=True)
 return json.loads(raw)
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def freeze(file):
 s=file.read_text();assert s.count(' location /api/ {')==1
 auth=' location ^~ /api/auth/ { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; proxy_set_header Origin https://blackarrow.traino.live; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $remote_addr; }\n'
 # Existing API origin verification remains in force for auth; public origin mapping must match the existing vhost.
 if file==PUBLIC:auth=auth.replace('Origin https://blackarrow.traino.live','Origin $blackarrow_public_origin')
 else:auth=auth.replace(' proxy_set_header Origin https://blackarrow.traino.live;','')
 file.write_text(s.replace(' location /api/ {',auth+' location /api/ {\n  limit_except GET { deny all; }'))
def unit(name,text):
 Path('/etc/systemd/system/'+name+'.service').write_text(text);run(['systemctl','daemon-reload']);run(['systemctl','enable','--now',name+'.service'])
def fetch(url):return json.loads(subprocess.check_output(['curl','-fsS','--max-time','10',url],text=True))
try:
 freeze(OLD);freeze(PUBLIC);reload()
 before=export();assert all(before[k]==0 for k in ['numbers','knowledge','documents','active_sessions']),'Unsupported occupied data must be migrated explicitly'
 assert before['users'] and before['campaigns']
 run(['bash','/opt/blackarrow/infra/bootstrap/backup.sh'],stdout=subprocess.DEVNULL)
 backup=Path('/var/backups/blackarrow/latest.tar.age').resolve()
 # Verify authenticated decryption and all TAR member bytes, without exposing secrets.
 age=subprocess.Popen(['age','-d','-i','/etc/blackarrow/backup.agekey',str(backup)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 import tarfile
 with tarfile.open(fileobj=age.stdout,mode='r|')as archive:
  names=[]
  for member in archive:
   names.append(member.name)
   if member.isfile():
    stream=archive.extractfile(member)
    while stream.read(1024*1024):pass
 age.stdout.close();assert age.wait()==0 and 'database.sql'in names and 'private-data.tar'in names
 STATE.mkdir(mode=0o700);AUTH.mkdir(mode=0o700,exist_ok=True)
 for d in [STATE,AUTH]:os.chown(d,1001,1001)
 custody={'sessionSecret':secrets.token_hex(48),'encryptionSecret':secrets.token_hex(48),'email':'public-custody@blackarrow.invalid','password':secrets.token_urlsafe(48)}
 (STATE/'custody.json').write_text(json.dumps(custody));os.chown(STATE/'custody.json',1001,1001)
 db=sqlite3.connect(STATE/'blackarrow.sqlite');db.execute('PRAGMA foreign_keys=ON')
 db.execute('CREATE TABLE campaign_schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)')
 now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 for f in sorted((SOURCE/'src/campaigns/migrations').glob('[0-9][0-9][0-9]_*.sql')):
  data=f.read_bytes();db.executescript(data.decode());db.execute('INSERT INTO campaign_schema_migrations VALUES(?,?,?)',(int(f.name[:3]),hashlib.sha256(data).hexdigest(),now));db.commit()
 db.execute('CREATE TABLE legacy_import_records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id))')
 owners={u['id']for u in before['users']}
 for user in before['users']:db.execute('INSERT INTO campaign_accounts VALUES(?)',(user['id'],))
 checks=[]
 for c in before['campaigns']:
  assert c['owner_user_id']in owners
  a=c['owner_user_id'];cid=c['id'];ai=next((v for v in before['ai']if v['campaign_id']==cid),None)
  assert ai is not None and c['lifecycle']in ['active','paused','archived','pending_deletion']
  revision=max(1,ai['draft_revision']);draft=ai['draft'];assert isinstance(draft,dict)
  db.execute('INSERT INTO campaign_workspaces(account_id,id,name,description,timezone,lifecycle,revision,execution_epoch,work_hold,deleted_at,recover_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(a,cid,c['name'],c['description']or'',c['timezone'],c['lifecycle'],revision,max(1,ai['execution_revision']),1,c['deleted_at'],c['purge_after'],c['created_at'],c['updated_at']))
  db.execute('INSERT INTO campaign_drafts VALUES(?,?,?)',(a,cid,json.dumps(draft)))
  selected=None
  for version,pub in enumerate([v for v in before['publications']if v['campaign_id']==cid],1):
   snapshot={'config':pub['config'],'catalogue':[],'knowledge':[],'documents':[]}
   db.execute('INSERT INTO campaign_publications VALUES(?,?,?,?,?,?,?)',(a,cid,version,json.dumps(snapshot),revision,None,pub['created_at']))
   db.execute('INSERT INTO legacy_import_records VALUES(?,?,?)',('publication',pub['version'],json.dumps(pub)))
   if pub['version']==ai['published_version']:selected=version
  assert not ai['published_version']or selected is not None
  db.execute('UPDATE campaign_workspaces SET published_version=? WHERE account_id=? AND id=?',(selected,a,cid))
  db.execute('INSERT INTO campaign_revision_history VALUES(?,?,?,?,?)',(a,cid,revision,json.dumps({'config':draft,'knowledge':[],'documents':[]}),now))
  db.execute('INSERT INTO legacy_import_records VALUES(?,?,?)',('campaign',cid,json.dumps(c)))
  db.execute('INSERT INTO legacy_import_records VALUES(?,?,?)',('ai',cid,json.dumps(ai)))
  actual=json.loads(db.execute('SELECT config FROM campaign_drafts WHERE account_id=? AND campaign_id=?',(a,cid)).fetchone()[0]);assert actual==draft
  if selected:
   actual=json.loads(db.execute('SELECT snapshot FROM campaign_publications WHERE account_id=? AND campaign_id=? AND version=?',(a,cid,selected)).fetchone()[0])['config']
   original=next(v['config']for v in before['publications']if v['version']==ai['published_version']);assert actual==original
  checks.append({'campaign_id':cid,'owner_id':a,'draft_preserved':True,'published_preserved':True,'privacy_preserved':True})
 db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';assert not db.execute('PRAGMA foreign_key_check').fetchall();db.close();os.chown(STATE/'blackarrow.sqlite',1001,1001)
 image='sha256:b304dd15e9ab502f5dedf2178e88286f1f9f4ab75984e3a79b2d7cdb47112555'
 unit('blackarrow-public-gateway',f"""[Unit]
Description=Black Arrow public web and production authentication gateway
After=network-online.target docker.service
[Service]
User=vpsadmin
Group=vpsadmin
ExecStart=/usr/bin/python3 {SOURCE}/deploy/public-gateway.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths={AUTH}
ReadOnlyPaths={STATE}
InaccessiblePaths=/etc/blackarrow /opt/blackarrow /var/lib/blackarrow-conversion-02
RestrictAddressFamilies=AF_UNIX AF_INET
CapabilityBoundingSet=
MemoryMax=128M
TasksMax=32
UMask=0077
[Install]
WantedBy=multi-user.target
""")
 unit('blackarrow-converted-public',f"""[Unit]
Description=Black Arrow converted public dashboard
After=docker.service blackarrow-public-gateway.service blackarrow-conversion-gemini-egress.service
Requires=docker.service blackarrow-public-gateway.service blackarrow-conversion-gemini-egress.service
[Service]
ExecStart=/usr/bin/docker run --init --rm --name blackarrow-converted-public --network none --user 1001:1001 --read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m --memory 768m --cpus 1 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges -e NODE_ENV=production -e BLACKARROW_STAGE=1 -e BLACKARROW_PUBLIC=1 -e BLACKARROW_RELEASE_SHA={SHA} -e BLACKARROW_GEMINI_EGRESS_SOCKET=/egress/gemini.sock -v /var/lib/blackarrow-conversion-egress:/egress:ro -v {AUTH}:/auth:ro -v {SOURCE}:/work:ro -v {STATE}:/state:rw -w /work --health-cmd "node deploy/health-check.cjs" --health-interval 20s --health-timeout 5s --health-retries 3 --entrypoint node {image} dist/server.cjs
ExecStop=/usr/bin/docker stop -t 15 blackarrow-converted-public
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
[Install]
WantedBy=multi-user.target
""")
 for i in range(30):
  try:
   if fetch('http://127.0.0.1:3414/api/health')['environment']=='converted-public':break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Public runtime failed health acceptance')
 assert fetch('http://127.0.0.1:3414/api/release')['sha']==SHA
 assert digest(export())==digest(before),'Production business data changed during migration'
 public=PUBLIC.read_text();start=public.index(' location ^~ /api/health/');public=public[:start]+f""" location = /api/release {{ default_type application/json; add_header Cache-Control "no-store"; return 200 '{{"public":true,"sha":"{SHA}"}}'; }}
 location / {{
  proxy_pass http://127.0.0.1:3414;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_read_timeout 60s;
 }}
}}
""";public=public.replace('"existing-production"',f'"converted-{SHA}"');PUBLIC.write_text(public)
 OLD.write_text("""server {
 listen 80; listen [::]:80; server_name blackarrow.traino.live;
 location /.well-known/acme-challenge/ {root /var/lib/letsencrypt;}
 location / {return 308 https://app.blackgoldfertilizer.com$request_uri;}
}
server {
 listen 443 ssl; listen [::]:443 ssl; server_name blackarrow.traino.live;
 ssl_certificate /etc/letsencrypt/live/blackarrow.traino.live/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/blackarrow.traino.live/privkey.pem;
 return 308 https://app.blackgoldfertilizer.com$request_uri;
}
""");reload()
 for i in range(10):
  try:
   if fetch('https://app.blackgoldfertilizer.com/api/release')['sha']==SHA:break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Public routing did not activate the accepted release')
 result={'public':'CONVERTED','sha':SHA,'accounts_preserved':len(owners),'campaigns_migrated':len(checks),'checks':checks,'source_fingerprint':digest(before),'encrypted_backup':str(backup),'backup_sha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'backup_decrypted_and_read':True,'nginx_rollback':str(RECOVERY),'production_database_modified':False,'production_services_restarted':False,'gemini_key_autoassigned':False,'live_whatsapp':False}
 (RECOVERY/'migration-result.json').write_text(json.dumps(result,indent=2));(STATE/'migration-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 for f in [OLD,PUBLIC]:shutil.copy2(RECOVERY/f.name,f)
 reload();print(json.dumps({'public':'OLD','rollback':str(RECOVERY),'public_state_preserved':STATE.exists()}));raise
