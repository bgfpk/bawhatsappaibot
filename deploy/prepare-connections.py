"""Build an isolated immutable release; never changes running source or owner state."""
from pathlib import Path,PurePosixPath
import hashlib,json,os,subprocess,sys,tarfile,tempfile
root=Path('/opt/blackarrow-conversion');archive=Path('/tmp/blackarrow-conversion-08-sanitized.tar.gz')
assert os.geteuid()==0 and hashlib.sha256(archive.read_bytes()).hexdigest()==sys.argv[1]
parent=root/'releases';parent.mkdir(exist_ok=True);release=Path(tempfile.mkdtemp(prefix='conversion-08-',dir=parent));release.chmod(0o755)
with tarfile.open(archive)as package:
 manifest=json.load(package.extractfile('SOURCE-MANIFEST.json'));assert manifest['phase']=='Conversion 08'
 for row in manifest['records']:
  name=PurePosixPath(row['path']);assert not name.is_absolute()and '..'not in name.parts and not set(name.parts)&{'node_modules','dist','.git','sessions','uploads'}
  item=package.getmember('source/'+str(name));assert item.isfile()and item.size<32*1024*1024
  data=package.extractfile(item).read();assert hashlib.sha256(data).hexdigest()==row['sha256']
  target=release/str(name);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
(release/'SOURCE-MANIFEST.json').write_text(json.dumps(manifest));(release/'node_modules').mkdir()
for directory,_,files in os.walk(release):
 os.chown(directory,1001,1001)
 for name in files:os.chown(Path(directory)/name,1001,1001)
image='sha256:b304dd15e9ab502f5dedf2178e88286f1f9f4ab75984e3a79b2d7cdb47112555'
subprocess.run(['docker','run','--rm','--network','none','--user','1001:1001','--memory','2304m','--cpus','2','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/work/node_modules/.vite-temp:rw,uid=1001,gid=1001,size=64m','-e','NODE_OPTIONS=--max-old-space-size=1792','-v',str(release)+':/work:rw','-v',str(root/'implementation/node_modules')+':/work/node_modules:ro','-w','/work','--entrypoint','sh',image,'-c','node node_modules/typescript/bin/tsc --noEmit && node deploy/build-stage.mjs'],check=True)
result={'release':str(release),'archive_sha256':sys.argv[1],'source_files':len(manifest['records']),'build':'passed','running_public_changed':False}
Path('/tmp/blackarrow-conversion-08-candidate.json').write_text(json.dumps(result));print(json.dumps(result))
