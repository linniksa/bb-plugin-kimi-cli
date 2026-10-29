// shortcut: legacy ACP extends Python 1.50's server/router; reverify these internals when supporting another Python release.
export const pythonAcp = String.raw`
import asyncio, json, os
import acp
import acp.agent.connection as connection
from acp.agent.router import build_agent_router
from acp.schema import SessionConfigOption, SetSessionConfigOptionRequest, SetSessionConfigOptionResponse
from kimi_cli.acp.server import ACPServer, _ModelIDConv, _expand_llm_models
from kimi_cli.app import enable_logging
from kimi_cli.llm import create_llm

metadata = json.loads(os.environ.pop('KIMI_BB_MODEL_METADATA', '{}'))

class KimiServer(ACPServer):
    def state(self, session_id):
        if session_id not in self.sessions:
            raise acp.RequestError.invalid_params({'sessionId': 'Unknown session'})
        session, current = self.sessions[session_id]
        config = session.cli.soul.runtime.config
        variants = {}
        for row in _expand_llm_models(config.models):
            variant = _ModelIDConv.from_acp_model_id(row.model_id)
            variants.setdefault(variant.model_key, set()).add('on' if variant.thinking else 'off')
        return session, current, config, variants

    def levels(self, key, variants):
        allowed = variants.get(key, set())
        thinking = metadata.get(key, {}).get('thinking')
        return [level for level in ['off', 'on'] if level in allowed
                and not ((thinking == 'always' or metadata.get(key, {}).get('allowOff') is False) and level == 'off')
                and not (thinking == 'none' and level == 'on')]

    def options(self, session_id):
        _, current, config, variants = self.state(session_id)
        models = [{'value': key, 'name': metadata.get(key, {}).get('label') or model.display_name or model.model}
                  for key, model in config.models.items() if key in variants]
        levels = self.levels(current.model_key, variants)
        return [SessionConfigOption.model_validate(option) for option in [
            {'id': 'model', 'name': 'Model', 'category': 'model', 'type': 'select',
             'currentValue': current.model_key, 'options': models},
            {'id': 'thinking', 'name': 'Thinking', 'category': 'thought_level', 'type': 'select',
             'currentValue': 'on' if current.thinking else 'off',
             'options': [{'value': level, 'name': level.title()} for level in levels]},
        ]]

    async def normalize(self, session_id):
        _, current, _, variants = self.state(session_id)
        levels = self.levels(current.model_key, variants)
        if not levels:
            raise acp.RequestError.invalid_params({'modelId': 'Model has no supported Thinking mode'})
        if ('on' if current.thinking else 'off') not in levels:
            await self.set_session_model(_ModelIDConv(current.model_key, levels[-1] == 'on').to_acp_model_id(), session_id)

    async def new_session(self, *args, **kwargs):
        result = await super().new_session(*args, **kwargs)
        await self.normalize(result.session_id)
        return result.model_copy(update={'models': None, 'config_options': self.options(result.session_id)})

    async def load_session(self, cwd, session_id, mcp_servers=None, **kwargs):
        await super().load_session(cwd, session_id, mcp_servers, **kwargs)
        await self.normalize(session_id)
        return acp.schema.LoadSessionResponse(config_options=self.options(session_id))

    async def resume_session(self, cwd, session_id, mcp_servers=None, **kwargs):
        result = await super().resume_session(cwd, session_id, mcp_servers, **kwargs)
        await self.normalize(session_id)
        return result.model_copy(update={'models': None, 'config_options': self.options(session_id)})

    async def set_session_model(self, model_id, session_id, **kwargs):
        session, current, config, _ = self.state(session_id)
        selected = _ModelIDConv.from_acp_model_id(model_id)
        model = config.models.get(selected.model_key)
        provider = config.providers.get(model.provider) if model else None
        if model is None or provider is None:
            raise acp.RequestError.invalid_params({'modelId': 'Unknown model or provider'})
        if selected == current:
            return
        runtime = session.cli.soul.runtime
        runtime.llm = create_llm(provider, model, session_id=session_id, thinking=selected.thinking, oauth=runtime.oauth)
        # Catalog probing and thread selections must not rewrite the interactive CLI's defaults.
        config.default_model, config.default_thinking = selected
        self.sessions[session_id] = (session, selected)

    async def set_config_option(self, config_id, session_id, value, **kwargs):
        _, current, config, variants = self.state(session_id)
        key, thinking = current.model_key, current.thinking
        if config_id == 'model':
            if not isinstance(value, str):
                raise acp.RequestError.invalid_params({'value': 'Expected a model ID'})
            selected = _ModelIDConv.from_acp_model_id(value)
            key = value if value in config.models else selected.model_key
            if key not in variants:
                raise acp.RequestError.invalid_params({'value': 'Unknown model'})
            levels = self.levels(key, variants)
            if not levels:
                raise acp.RequestError.invalid_params({'value': 'Model has no supported Thinking mode'})
            if value not in config.models:
                thinking = selected.thinking
            if ('on' if thinking else 'off') not in levels:
                thinking = levels[-1] == 'on'
        elif config_id == 'thinking':
            if value not in self.levels(key, variants):
                raise acp.RequestError.invalid_params({'value': 'Unsupported Thinking mode'})
            thinking = value == 'on'
        else:
            raise acp.RequestError.invalid_params({'configId': 'Unknown configuration option'})
        await self.set_session_model(_ModelIDConv(key, thinking).to_acp_model_id(), session_id)
        options = self.options(session_id)
        await self.conn.session_update(session_id=session_id, update=acp.schema.ConfigOptionUpdate(session_update='config_option_update', config_options=options))
        return SetSessionConfigOptionResponse(config_options=options)

def router(agent, use_unstable_protocol=False):
    result = build_agent_router(agent, use_unstable_protocol=use_unstable_protocol)
    result.route_request('session/set_config_option', SetSessionConfigOptionRequest, agent, 'set_config_option')
    return result

connection.build_agent_router = router
enable_logging()
asyncio.run(acp.run_agent(KimiServer(), use_unstable_protocol=True))
`;
