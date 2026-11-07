# Claude Subagent Router

[中文](README.md)

A global multi-model subagent pool for Claude Code in Magpie. Each selected model becomes a named subagent with optional responsibility tags. Claude decides whether to delegate, which agents to use, and whether to run them in parallel. Claude compares, reviews, and synthesizes multiple results itself.

Only Claude Code is supported. Other agents are unchanged, and the plugin never calls model APIs directly.

## Features

- Select multiple models from the catalog Magpie already provides to Claude Code, including providers and routing groups.
- Assign any combination of six fixed responsibilities per model: fast execution, complex reasoning, code implementation, code review, exploration and research, and general tasks.
- With no responsibility tags, the description contains model information without a responsibility preference.
- Chinese and English UI and bilingual agent descriptions.
- Keep Magpie's original single-model Subagent default; generated named agents override only their own model.
- Route default delegation to the named pool while it is active, with strict and prefer modes.
- Configuring N models gives the routing pool N choices. The parent Claude model is separate; default delegation does not add direct Claude Sonnet, Opus, Haiku, or other non-pool model options. Named custom agents retain their own model selection.
- Clear the pool to remove the plugin's untouched definitions, stop routing intervention, and restore the original single-model behavior.

## Requirements and compatibility

- Windows 10/11.
- Tested with **Magpie 0.1.2332 / Claude Code 2.1.318**: plugin installation, host loading, two-model definition generation, and empty-pool fallback. Three different named model agents also completed actual replies in parallel. Strict mode was verified to reroute both omitted types and explicit `general-purpose` to a named router; SessionStart was also verified to make a new session choose `router-*` on its first delegation.
- Claude Code with subagent `model` frontmatter and parallel Agent/Task support.
- The catalog comes from `modelPicker.options` in Claude Code's `settings.json`, as written by Magpie. This compatibility bridge is used because Magpie does not currently expose its complete model catalog to community plugin pages. It is not a stable public Magpie API and other versions may require adaptation.

## Installation

### From GitHub

Run in Windows Terminal:

```powershell
magpie plugin add github:Emilia06120878/magpie-claude-subagent-router
```

The same repository address can be added in Magpie under **Settings → Plugins**. Loading the host registers a no-op hook with an empty pool. Open the plugin page, select models, and click **Apply** to generate agents and enable routing.

### Local development

```powershell
git clone https://github.com/Emilia06120878/magpie-claude-subagent-router.git
magpie plugin add .\magpie-claude-subagent-router
```

A local directory is loaded in place rather than copied. After changing the source, toggle the plugin off and on in Magpie, then reopen its page.

## Usage

1. Configure providers, routing groups, and Claude Code in Magpie, then apply its agent settings.
2. Open **Claude Subagent Router** in Magpie's sidebar, or use the Claude Code row menu on the Agents page.
3. Select models and, optionally, one or more responsibility tags for each.
4. Choose a delegation mode: **Strict** intercepts Agent/Task calls with an omitted type or explicit `general-purpose` and requires a pool selection; **Prefer** intercepts only omitted types and allows explicit `general-purpose`.
5. Click **Apply**. The host reloads, writes the agent definitions and dynamic routing state, and installs Claude Code `SessionStart` and `PreToolUse` hooks.
6. Start a new Claude Code session and verify that the named agents and hook have loaded. Claude can use one, run several in parallel, or choose not to delegate.

To restore the original behavior, click **Clear pool**, then **Apply**. Unsaved page changes do not affect agent definitions.

## How it works

The plugin consists of a Magpie host module and a sandboxed configuration page:

1. The host locates the Claude Code configuration directory using `CLAUDE_CONFIG_DIR`, falling back to `~/.claude`.
2. It reads the Magpie-managed `modelPicker.options` from Claude Code's `settings.json` and projects only `model` and `label`. The page consumes a local static snapshot and makes no network requests.
3. Applying the page saves the normalized global model pool to the plugin's own options, causing Magpie to reload the host.
4. Each model produces a stable `<claude-config-dir>/agents/<name>.md` definition. Its `model` frontmatter preserves the complete model reference; its `description` supplies bilingual responsibility guidance to Claude.
5. Claude Code's native Agent/Task mechanism performs delegation and parallel execution through Magpie's existing model routing. No separate model client or additional review model is created.
6. The plugin adds two uniquely identifiable hooks to Claude Code's user-level `settings.json`. `SessionStart` injects the active pool and selection rules so parent Claude explicitly chooses a `router-*` on its first delegation. `PreToolUse` matches `Agent|Task` as a fallback. Both read `agents/.claude-subagent-router-route.json`, which lists only successfully generated agents. Strict mode intercepts omitted types and explicit `general-purpose`; prefer mode intercepts only omitted types. An explicit `model` outside the pool, including direct Claude `claude-sonnet`, `claude-opus`, or `claude-haiku` references, on a default or `general-purpose` delegation is also rejected rather than bypassing the router. Remove the `model` field and select a pool agent; its definition supplies the model. Other explicit pool model references and `inherit` are allowed. The denial reason returns available names and responsibilities so parent Claude can choose and retry; the hook never chooses a model itself.
7. Explicit `router-*`, Explore, Plan, and other custom agents are allowed. An explicit non-pool `model` is rejected only on default or `general-purpose` delegation; custom agents retain their own model selection. With an empty pool, SessionStart injects nothing and PreToolUse does not intervene. Missing or malformed route state and hook errors also cause no intervention. The hook writes no logs, makes no network requests, and never auto-approves permissions.
8. A named definition's model takes precedence over Magpie's original `CLAUDE_CODE_SUBAGENT_MODEL` default. Definitions without that field retain the original model precedence.

The plugin supplies its own page; it does not replace Magpie's built-in **Tier → Subagent** single-model control.

## File safety

- Stable legal names and model ID hashes keep special characters out of paths.
- `agents/.claude-subagent-router.json` records SHA-256 hashes of generated files.
- Existing same-name user files are never overwritten. A manually edited generated file is no longer updated or removed.
- Writes use a temporary file followed by an atomic rename.
- An unavailable or malformed catalog does not remove existing definitions. A saved selection missing from a temporary catalog is preserved until explicitly deselected, when its untouched definition can be cleaned up.
- Clearing the pool can clean up untouched plugin definitions even when the catalog is unavailable.

## Limitations

- The plugin targets Claude Code's native Windows configuration, not a separate Claude Code configuration inside WSL.
- Reopen the page or apply the configuration to refresh the catalog after changing Magpie's model picker.
- Restart Claude Code after installing the hook, changing the routing mode, or clearing the pool; existing sessions do not hot-reload definitions or hooks.
- The hook runs `node <plugin-directory>/hook.js`, so Node.js 20 or later must be available on the command line.
- Clear the pool and apply before disabling or uninstalling. This stops routing intervention but leaves the installed hook as a no-op. Cleanup is not guaranteed after the host stops. Use the uninstall steps below to remove hooks, route state, and untouched plugin definitions. Manually edited definitions are preserved.
- Name conflicts and manually edited files are listed in the page, never taken over, and excluded from the routable pool.

## Uninstall

### Recommended: clear before removing the plugin

1. On the plugin page, click **Clear pool**, then **Apply**. This removes untouched generated agents and stops routing intervention.
2. In Windows Terminal, run:

```powershell
magpie plugin rm magpie-claude-subagent-router
```

3. Restart Claude Code. Hooks left from the previous configuration do not intervene when the pool is empty.

### Complete cleanup when no longer using the plugin

To remove hooks, route state, and all untouched generated definitions, run this **before uninstalling the plugin**:

```powershell
node "<installed-plugin-directory>\uninstall-hook.js"
magpie plugin rm magpie-claude-subagent-router
```

Find the installed directory in Magpie's plugin details. For a local development installation, it is the cloned project directory. The script removes only this plugin's hooks and definitions that the user has not edited; it never deletes other Claude Code agents or the source directory.

If the plugin was already uninstalled, run `node uninstall-hook.js` from the retained source directory, or manually remove only the SessionStart and PreToolUse entries in Claude Code's `settings.json` that point to this plugin's `hook.js`.

## Privacy

The plugin has no npm dependencies and sends no network requests. It does not read provider credential files. The host reads and writes Claude Code's `settings.json` to read the catalog and maintain its two hook entries while preserving other settings. Page snapshots contain model IDs, display labels, and sync status, excluding descriptions, environment variables, account identifiers, and keys. Model selections, responsibilities, and routing mode are stored in Magpie's plugin options.

Route state contains only named agents, model references, and responsibility descriptions. The hook receives Claude Code's Agent/Task input JSON but does not save task content, write logs, or send content to another service.

Task content is handled by Claude Code and Magpie's existing execution path under the user's configured providers and privacy settings.

## Development

Node.js 20 or later is required. No dependency installation is needed:

```powershell
npm test
npm run test:coverage
```

Tests use temporary directories and do not change the real Claude Code configuration. Coverage includes multiple models and responsibilities, complete model references, empty-pool fallback, file ownership, damaged catalogs, Windows paths, and sensitive-field isolation.

## License

[MIT](LICENSE) © 2026 Emilia06120878 and contributors
