import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { collector } from './collector.ts';

const fixture = String.raw`
import sys, types, os
for name in ['loguru', 'aiohttp', 'kimi_cli', 'kimi_cli.config', 'kimi_cli.auth', 'kimi_cli.auth.oauth', 'kimi_cli.ui', 'kimi_cli.ui.shell', 'kimi_cli.ui.shell.usage']:
    sys.modules[name] = types.ModuleType(name)
sys.modules['loguru'].logger = types.SimpleNamespace(remove=lambda: None)
class ClientError(Exception): pass
class ClientResponseError(ClientError): pass
sys.modules['aiohttp'].ClientError = ClientError
sys.modules['aiohttp'].ClientResponseError = ClientResponseError
provider = types.SimpleNamespace(base_url='https://api.kimi.com/coding/v1', api_key='', oauth=None)
sys.modules['kimi_cli.config'].load_config = lambda: types.SimpleNamespace(providers={'managed:kimi-code': provider})
class OAuthManager:
    def __init__(self, config): pass
    async def ensure_fresh(self): pass
    def resolve_api_key(self, key, ref): return 'fixture-secret'
sys.modules['kimi_cli.auth.oauth'].OAuthManager = OAuthManager
sys.modules['kimi_cli.auth.oauth'].OAuthUnauthorized = type('OAuthUnauthorized', (Exception,), {})
async def fetch(url, key):
    if url.endswith('/usages'):
        return {'usage': {'limit': 100, 'used': 37}}
    if os.environ['PROFILE_FAILURE'] == 'json': raise ValueError('malformed profile')
    raise TimeoutError('slow profile')
sys.modules['kimi_cli.ui.shell.usage']._fetch_usage = fetch
exec(sys.stdin.read())
`;

test('legacy profile JSON and timeout failures preserve successful quota', () => {
  for (const failure of ['json', 'timeout']) {
    const result = spawnSync('/usr/bin/python3', ['-c', fixture], {
      input: collector, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PROFILE_FAILURE: failure },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'ok');
    assert.equal(output.payload.usage.used, 37);
    assert.equal(output.account, null);
    assert.ok(!result.stdout.includes('fixture-secret'));
  }
});
