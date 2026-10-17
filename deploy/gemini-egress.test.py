"""Offline allowlist checks: this test never connects to Google."""
import importlib.util
from pathlib import Path
import json

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).with_name('gemini-egress.py'))
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
assert gateway.allowed('GET', '/v1beta/models?pageSize=100')
assert gateway.allowed('POST', '/v1beta/models/gemini-example:generateContent')
for method, target in [('CONNECT', 'google.com:443'), ('GET', 'https://evil.test/v1beta/models'),
                       ('GET', '/v1beta/models?key=secret'), ('POST', '/v1beta/files'),
                       ('POST', '/v1beta/models/gemini-example:generateContent?alt=sse'),
                       ('POST', '/v1beta/models/gemini-example:streamGenerateContent')]:
    assert not gateway.allowed(method, target), target
valid = {'contents': [{'role': 'user', 'parts': [{'text': 'Offline fixture'}]}]}
assert gateway.text_payload(json.dumps(valid))
assert not gateway.text_payload(json.dumps({**valid, 'tools': []}))
assert not gateway.text_payload(json.dumps({'contents': [{'parts': [{'fileData': {'fileUri': 'https://evil.test'}}]}]}))
print(json.dumps({'offline_gateway_allowlist': True, 'generic_proxy_rejected': True, 'tools_and_media_rejected': True}))
