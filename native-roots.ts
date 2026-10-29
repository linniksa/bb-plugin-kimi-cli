import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { z } from 'zod';
import { experimental_resolveExecutablePath } from '@get-bb/plugin-sdk/provider-bridge';
import { experimental_filterResolvedNativeRoots } from '@get-bb/plugin-sdk/host';
import { pythonInterpreter, type CliKind } from './installation.ts';
import { dataDirectory } from './credentials.ts';
import { providerId } from './provider.ts';

const settings = z.object({ merge_all_available_skills: z.boolean().default(false), extra_skill_dirs: z.array(z.string().min(1)).max(256).default([]) });
const isDir = async (path: string) => (await stat(path).catch(() => null))?.isDirectory() ?? false;

export async function resolveSkillRoots(kind: CliKind, cwd: string | null, home = homedir()) {
  let config: z.infer<typeof settings>;
  try { config = settings.parse(parse(await readFile(join(dataDirectory(kind), 'config.toml'), 'utf8'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Kimi Code skill configuration could not be read.');
    config = settings.parse({});
  }
  let project = cwd ? resolve(cwd) : null;
  if (project) {
    for (let path = project; ; path = dirname(path)) {
      if (await stat(join(path, '.git')).catch(() => null)) { project = path; break; }
      if (dirname(path) === path) break;
    }
  }
  const roots: { path: string; origin: 'project' | 'user'; shape: 'skills' | 'skill-file'; fallbackName?: string }[] = [];
  async function add(paths: string[], origin: 'project' | 'user', first = false) {
    for (const path of paths) {
      if (!(await isDir(path)) || roots.some(r => r.path === path)) continue;
      roots.push({ path, origin, shape: 'skills' });
      // Kimi also loads flat Markdown skills; BB needs each flat file declared explicitly.
      for (const file of await readdir(path, { withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith('.md') && file.name !== 'SKILL.md') roots.push({ path: join(path, file.name), origin, shape: 'skill-file', fallbackName: basename(file.name, '.md') });
      }
      if (first) break;
    }
  }
  const brands = (root: string) => ['.kimi', '.claude', '.codex'].map(dir => join(root, dir, 'skills'));
  if (project) {
    await add(kind === 'python' ? brands(project) : [join(project, '.kimi-code', 'skills')], 'project', !config.merge_all_available_skills);
    await add([join(project, '.agents', 'skills')], 'project');
  }
  await add(kind === 'python' ? brands(home) : [join(dataDirectory(kind), 'skills')], 'user', !config.merge_all_available_skills);
  await add(kind === 'python' ? [join(home, '.config', 'agents', 'skills'), join(home, '.agents', 'skills')] : [join(home, '.agents', 'skills')], 'user', true);
  for (const extra of config.extra_skill_dirs) {
    if (!project && !isAbsolute(extra) && !extra.startsWith('~/')) continue;
    const path = extra.startsWith('~/') ? join(home, extra.slice(2)) : resolve(project ?? home, extra);
    await add([path], isAbsolute(extra) || extra.startsWith('~/') ? 'user' : 'project');
  }
  return experimental_filterResolvedNativeRoots({ skills: roots, commands: [] }, { warn: message => console.warn(message) }).answer;
}

export async function resolveNativeRoots(input: { providerId: string; cwd: string | null }) {
  if (input.providerId !== providerId) return { skills: [], commands: [] };
  const executable = await experimental_resolveExecutablePath('kimi');
  if (!executable) return { skills: [], commands: [] };
  const kind = await pythonInterpreter(await realpath(executable)) ? 'python' : 'node';
  return resolveSkillRoots(kind, input.cwd);
}
