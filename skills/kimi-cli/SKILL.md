---
name: kimi-cli
description: Diagnose the Kimi Code provider, account, subscription and quota integration in BB.
---

# Kimi Code

The plugin, provider and skill use `kimi-cli`; BB displays **Kimi Code**. The package is `bb-plugin-kimi-cli`. No custom ACP registration is required. See the package README before upgrading an earlier registration: old thread provider IDs are not migrated automatically.

Use `bb provider list`, `bb provider models kimi-cli`, and `bb settings usage --refresh` to inspect registration, model discovery and quota. Use `kimi login` on the affected machine for an expired login. Never print credentials or raw tokens.

Permissions follow BB's thread mode; consult the package README for the supported modes and their boundaries. Do not equate availability of an MCP tool with permission to call it without confirmation. There is no global trusted-tool policy in this plugin.

Use `bb kimi status --help` for machine selection, local readiness and update guidance. Registry checks are opt-in; diagnostics never install updates or expose credentials. CLI installation/update actions use BB's provider maintenance UI and preserve the detected package manager. Tracking Git/npm plugin updates use `bb plugin update kimi-cli`; local path sources must be rebuilt and reloaded from their checkout. Neither path enables automatic update application. An unknown install source is not automatically replaced.

Native skills are resolved on the workspace host using the detected CLI generation. See the package README for supported CLI versions, installation and development checks. Use bb-cli for standard plugin build, install and reload procedures.

Model and Thinking controls support both CLI generations. Legacy Python offers only binary Thinking; Node uses native per-model effort. Keep model IDs distinct from display names and do not merge Highspeed models by suffix. See the README for catalog fallback, tested versions and the Python adapter boundary. BB discovery and selections do not rewrite interactive CLI defaults.
