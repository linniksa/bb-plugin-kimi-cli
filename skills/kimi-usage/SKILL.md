---
name: kimi-usage
description: Diagnose the Kimi Code provider, account, subscription and quota integration in BB.
---

# Kimi Code

This plugin owns provider `acp-kimi` directly. Do not also register Kimi in ACP providers' customAgents setting. The plugin ID remains `kimi-usage` for compatibility with earlier installations.

Use `bb provider list`, `bb provider models acp-kimi`, and `bb settings usage --refresh` to inspect registration, model discovery and quota. Use `kimi login` on the affected machine for an expired login. Never print credentials or raw tokens.

Permissions follow BB's thread mode; consult the package README for the supported modes and their boundaries. Do not equate availability of an MCP tool with permission to call it without confirmation. There is no global trusted-tool policy in this plugin.

See the package README for supported CLI versions, installation and development checks. Use bb-cli for standard plugin build, install and reload procedures.
