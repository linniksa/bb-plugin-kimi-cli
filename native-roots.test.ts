import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSkillRoots } from './native-roots.ts';

test('native roots follow CLI generation, project root, brand fallback, extras and flat skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimi-roots-'));
  const saved = { KIMI_CODE_HOME: process.env.KIMI_CODE_HOME, KIMI_SHARE_DIR: process.env.KIMI_SHARE_DIR };
  const home = join(root, 'home'), project = join(root, 'project'), data = join(root, 'data');
  const make = async (path: string) => mkdir(path, { recursive: true });
  try {
    process.env.KIMI_CODE_HOME = process.env.KIMI_SHARE_DIR = data;
    for (const path of [data, join(data, 'skills'), join(project, '.git'), join(project, 'src'), join(project, '.agents', 'skills'), join(project, '.kimi', 'skills'), join(project, '.kimi-code', 'skills'), join(project, 'extras'), join(home, '.claude', 'skills'), join(home, '.agents', 'skills')]) await make(path);
    await writeFile(join(data, 'config.toml'), 'extra_skill_dirs=["extras"]\n');
    await writeFile(join(data, 'skills', 'flat.md'), '# A flat skill');
    const legacy = await resolveSkillRoots('python', join(project, 'src'), home);
    assert.ok(legacy.skills.some(r => r.path === join(home, '.claude', 'skills') && r.origin === 'user'));
    assert.ok(legacy.skills.some(r => r.path === join(project, '.kimi', 'skills') && r.origin === 'project'));
    assert.ok(legacy.skills.some(r => r.path === join(project, 'extras')));
    assert.ok(!legacy.skills.some(r => r.path === join(data, 'skills')));
    const modern = await resolveSkillRoots('node', join(project, 'src'), home);
    assert.ok(modern.skills.some(r => r.path === join(data, 'skills', 'flat.md') && r.shape === 'skill-file'));
    assert.ok(modern.skills.some(r => r.path === join(project, '.kimi-code', 'skills')));
    assert.ok(!modern.skills.some(r => r.path === join(home, '.claude', 'skills')));
    assert.deepEqual(modern.commands, []);
    await writeFile(join(data, 'config.toml'), '[broken');
    await assert.rejects(resolveSkillRoots('node', project, home), /configuration could not be read/);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  }
});
