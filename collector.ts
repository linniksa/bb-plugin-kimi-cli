// shortcut: uses Python Kimi Code internals, update this adapter when migrating to the newer Node CLI.
export const collector = String.raw`
import asyncio, json
from loguru import logger
logger.remove()
from kimi_cli.config import load_config
from kimi_cli.auth.oauth import OAuthManager, OAuthUnauthorized
from kimi_cli.ui.shell.usage import _fetch_usage
import aiohttp
async def main():
    config = load_config()
    provider = config.providers.get('managed:kimi-code')
    if provider is None:
        return {'status': 'unauthenticated'}
    oauth = OAuthManager(config)
    try:
        await oauth.ensure_fresh()
        key = oauth.resolve_api_key(provider.api_key, provider.oauth)
        if not key:
            return {'status': 'unauthenticated'}
        base_url = provider.base_url.rstrip('/')
        if base_url not in ('https://api.kimi.com/coding/v1', 'https://api.kimi.ai/coding/v1'):
            return {'status': 'error'}
        data = await _fetch_usage(base_url + '/usages', key)
        try:
            profile = await _fetch_usage(base_url + '/me', key)
            account = {field: profile.get(field) for field in ('user_id', 'email', 'nickname', 'user_level_name')}
        except (aiohttp.ClientError, TimeoutError):
            account = None
        return {'status': 'ok', 'payload': data, 'account': account}
    except OAuthUnauthorized:
        return {'status': 'expired'}
    except aiohttp.ClientResponseError as error:
        return {'status': 'expired' if error.status == 401 else 'error'}
try:
    result = asyncio.run(asyncio.wait_for(main(), timeout=25))
except Exception:
    result = {'status': 'error'}
print(json.dumps(result))
`;
