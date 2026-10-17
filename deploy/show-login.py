
"""Display only the independent staging login in the owner's SSH terminal."""
import json
from pathlib import Path
value = json.loads(Path('/var/lib/blackarrow-conversion-02/custody.json').read_text())
print('Email: ' + value['email'])
print('Password: ' + value['password'])
