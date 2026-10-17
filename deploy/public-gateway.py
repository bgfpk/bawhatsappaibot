"""Loopback web gateway and fixed production-auth Unix bridge. No content logging."""
import http.client,http.server,socket,socketserver,threading,os,json,time
from pathlib import Path
AUTH=Path('/var/lib/blackarrow-public-auth/auth.sock')
APP='/var/lib/blackarrow-converted-public/http.sock'
ORIGIN='https://blackarrow.traino.live'
LIMIT=3*1024*1024
ALLOWED={('GET','/api/auth/me'),('GET','/api/auth/csrf'),('POST','/api/auth/password/login'),('POST','/api/auth/password/change'),('POST','/api/auth/logout')}
slots=threading.BoundedSemaphore(16)
class UnixHTTP(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(45);self.sock.connect(APP)
class Handler(http.server.BaseHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args):pass
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def do_PATCH(self):self.forward()
 def do_HEAD(self):self.forward()
 def do_OPTIONS(self):self.forward()
 def failure(self,status):
  if self.path.startswith('/api/'):
   data=json.dumps({'error':'Service is restarting. Please retry shortly.' if status==503 else 'Request unavailable.','retryable':status==503}).encode()
   self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers()
   if self.command!='HEAD':self.wfile.write(data)
  else:self.send_error(status)
 def forward(self):
  if not slots.acquire(blocking=False):self.failure(503);return
  upstream=None
  try:
   is_auth=isinstance(self.server,socketserver.UnixStreamServer)
   if is_auth and (self.command,self.path)not in ALLOWED:self.failure(404);return
   length=int(self.headers.get('Content-Length','0'))
   if length<0 or length>LIMIT or self.headers.get('Transfer-Encoding'):self.failure(413);return
   body=self.rfile.read(length)if length else None
   headers={k:v for k,v in self.headers.items()if k.lower()in {'content-type','cookie','origin','x-blackarrow-csrf','accept','user-agent'}}
   headers['Host']='app.blackgoldfertilizer.com'
   if is_auth:headers['Origin']=ORIGIN
   upstream=http.client.HTTPConnection('127.0.0.1',3001,timeout=15)if is_auth else UnixHTTP('localhost',timeout=45)
   # Only connection establishment for read requests can retry. Never replay a POST/PATCH.
   if not is_auth and self.command in {'GET','HEAD'}:
    for attempt in range(5):
     try:upstream.connect();break
     except (ConnectionRefusedError,FileNotFoundError):
      upstream.close()
      if attempt==4:raise
      time.sleep(0.3*(attempt+1))
   upstream.request(self.command,self.path,body,headers);r=upstream.getresponse();data=r.read(8*1024*1024+1)
   if len(data)>8*1024*1024:raise ValueError('Response limit')
   self.send_response(r.status)
   for k,v in r.getheaders():
    if k.lower()not in {'connection','transfer-encoding','content-length','server','date'}:self.send_header(k,v)
   self.send_header('Content-Length',str(len(data)));self.end_headers()
   if self.command!='HEAD':self.wfile.write(data)
  except Exception:
   self.close_connection=True
   try:self.failure(503)
   except Exception:pass
  finally:
   if upstream:upstream.close()
   slots.release()
class UnixServer(socketserver.ThreadingMixIn,socketserver.UnixStreamServer):daemon_threads=True
class WebServer(http.server.ThreadingHTTPServer):daemon_threads=True
if __name__=='__main__':
 os.umask(0o077)
 if AUTH.exists():
  if not AUTH.is_socket():raise RuntimeError('Invalid auth socket')
  AUTH.unlink()
 auth=UnixServer(str(AUTH),Handler);os.chmod(AUTH,0o600)
 threading.Thread(target=auth.serve_forever,daemon=True).start()
 WebServer(('127.0.0.1',3414),Handler).serve_forever()
