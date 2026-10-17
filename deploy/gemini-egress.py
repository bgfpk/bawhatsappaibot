"""Private Gemini-only HTTPS gateway. No general proxy, redirects or request logging."""
import http.client
import http.server
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import socketserver
import ssl
import threading
from urllib.parse import parse_qs, urlsplit

HOST = 'generativelanguage.googleapis.com'
SOCKET = Path('/var/lib/blackarrow-conversion-egress/gemini.sock')
LIMIT = 384 * 1024
slots = threading.BoundedSemaphore(2)


def allowed(method, target):
    url = urlsplit(target)
    if url.scheme or url.netloc or url.fragment or '%' in url.path:
        return False
    if method == 'GET' and url.path == '/v1beta/models':
        query = parse_qs(url.query, strict_parsing=True)
        return set(query) <= {'pageSize', 'pageToken'} and all(len(v) == 1 for v in query.values())
    return method == 'POST' and not url.query and bool(re.fullmatch(
        r'/v1beta/models/gemini-[A-Za-z0-9._-]+:generateContent', url.path))


def text_payload(body):
    value = json.loads(body)
    if not isinstance(value, dict) or set(value) - {'contents', 'systemInstruction', 'generationConfig', 'safetySettings'}:
        return False
    content = value.get('contents')
    if not isinstance(content, list) or not content or len(content) > 20:
        return False
    system = value.get('systemInstruction')
    entries = content + ([system] if system else [])
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) - {'role', 'parts'}:
            return False
        if entry.get('role', 'user') not in ('user', 'model', 'system'):
            return False
        parts = entry.get('parts')
        if not isinstance(parts, list) or not parts:
            return False
        if any(not isinstance(p, dict) or set(p) != {'text'} or not isinstance(p['text'], str) for p in parts):
            return False
    return True


class GoogleTLS(http.client.HTTPSConnection):
    def __init__(self):
        super().__init__(HOST, 443, timeout=30, context=ssl.create_default_context())

    def connect(self):
        addresses = socket.getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)
        for family, socktype, proto, _, address in addresses:
            if not ipaddress.ip_address(address[0]).is_global:
                raise OSError('Non-public Google address rejected')
        failure = None
        for family, socktype, proto, _, address in addresses:
            raw = socket.socket(family, socktype, proto)
            raw.settimeout(15)
            try:
                raw.connect(address)
                self.sock = self._context.wrap_socket(raw, server_hostname=HOST)
                return
            except OSError as error:
                raw.close()
                failure = error
        raise OSError('Google TLS connection unavailable') from failure


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def log_message(self, *_args):
        pass

    def send_error(self, code, *_args, **_kwargs):
        self.reply(code, json.dumps({'error': {'code': code, 'message': 'Gemini gateway rejected or could not complete the request'}}).encode())

    def reply(self, status, body, retry=None):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        if retry and re.fullmatch(r'\d{1,4}', retry):
            self.send_header('Retry-After', retry)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.handle_google()

    def do_POST(self):
        self.handle_google()

    def handle_google(self):
        acquired = False
        connection = None
        sent = False
        try:
            if not allowed(self.command, self.path) or self.headers.get('Transfer-Encoding'):
                self.send_error(403)
                return
            key = self.headers.get('x-goog-api-key', '')
            if not re.fullmatch(r'[A-Za-z0-9._~+/=-]{24,1024}', key):
                self.send_error(403)
                return
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > LIMIT or (self.command == 'POST' and not size):
                self.send_error(413)
                return
            self.connection.settimeout(10)
            body = self.rfile.read(size)
            if len(body) != size or (self.command == 'POST' and not text_payload(body)):
                self.send_error(400)
                return
            acquired = slots.acquire(blocking=False)
            if not acquired:
                self.send_error(503)
                return
            connection = GoogleTLS()
            connection.connect()
            sent = True
            connection.request(self.command, self.path, body=body or None, headers={
                'x-goog-api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
            response = connection.getresponse()
            # Redirects are never followed, including redirects to other Google APIs.
            if 300 <= response.status < 400:
                self.send_error(502)
                return
            data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                self.send_error(502)
                return
            self.reply(response.status, data, response.getheader('Retry-After'))
        except (ValueError, TypeError):
            self.send_error(400)
        except (OSError, http.client.HTTPException):
            self.send_error(504 if sent else 503)
        finally:
            if connection:
                connection.close()
            if acquired:
                slots.release()


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 4


if __name__ == '__main__':
    if SOCKET.exists():
        if not SOCKET.is_socket():
            raise RuntimeError('Unexpected gateway socket path')
        SOCKET.unlink()
    os.umask(0o077)
    with Server(str(SOCKET), Handler) as server:
        os.chmod(SOCKET, 0o600)
        server.serve_forever()
