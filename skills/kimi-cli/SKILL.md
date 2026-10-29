---
name: kimi-cli
description: Diagnose the Kimi Code provider, account, subscription and quota integration in BB.
---

# Kimi Code

The plugin, provider and skill use `kimi-cli`; BB displays **Kimi Code**. The package is `bb-plugin-kimi-cli`. No custom ACP registration is required. See the package README before upgrading an earlier registration: old thread provider IDs are not migrated automatically.

Use `bb provider list`, `bb provider models kimi-cli`, and `bb settings usage --refresh` to inspect registration, model discovery and quota. Use `kimi login` on the affected machine for an expired login. Never print credentials or raw tokens.

Permissions follow BB's thread mode; consult the package README for the supported modes and their boundaries. Do not equate availability of an MCP tool with permission to call it without confirmation. There is no global trusted-tool policy in this plugin.

CLI installation/update actions use BB provider maintenance and preserve the detected package manager. Plugin and CLI updates are separate; consult the README for their supported paths.

Native skills are resolved on the workspace host using the detected CLI generation. See the package README for supported CLI versions, installation and development checks. Use bb-cli for standard plugin build, install and reload procedures.
