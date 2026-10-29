import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { z } from 'zod';
import {
  experimental_commandOutput as commandOutput,
  experimental_compareVersions as compareVersions,
  experimental_formatCommand as formatCommand,
  experimental_readCliVersion as readCliVersion,
  experimental_resolveExecutablePath as resolveExecutablePath,
  experimental_probeNpmGlobalPackage as probeNpmGlobalPackage,
  experimental_installationVerification as installationVerification,
  type ProviderInstallationCommand,
  type ProviderInstallationStatus,
} from '@get-bb/plugin-sdk/provider-bridge';

export type CliKind = 'python' | 'node';
export type Manager = 'brew' | 'uv' | 'npm' | 'native';
const npmPackage = '@moonshot-ai/kimi-code';

export async function pythonInterpreter(executable: string): Promise<string | null> {
  const file = await open(executable, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').split('\n')[0]?.match(/^#!(\/[^\r\n]+\/python[\d.]*)$/)?.[1] ?? null;
  } finally { await file.close(); }
}

function inside(root: string | null, path: string): boolean {
  if (!root) return false;
  const part = relative(root.trim(), path);
  return part === '' || (!part.startsWith('..') && !isAbsolute(part));
}

export function installationCommand(kind: CliKind, manager: Manager, executable: string, managerPath: string): ProviderInstallationCommand {
  const command = manager === 'native' ? executable : managerPath;
  const args = manager === 'brew' ? ['upgrade', kind === 'python' ? 'kimi-cli' : 'kimi-code']
    : manager === 'uv' ? ['tool', 'upgrade', 'kimi-cli']
    : manager === 'npm' ? ['install', '-g', `${npmPackage}@latest`]
    : ['upgrade', '--yes'];
  return { command, args, displayCommand: formatCommand(command, args) };
}

async function probe() {
  const executablePath = await resolveExecutablePath('kimi');
  const [brew, uv, npm] = await Promise.all(['brew', 'uv', process.platform === 'win32' ? 'npm.cmd' : 'npm'].map(resolveExecutablePath));
  if (!executablePath) {
    const command = npm ? { command: npm, args: ['install', '-g', `${npmPackage}@latest`] }
      : brew ? { command: brew, args: ['install', 'kimi-code'] } : null;
    return { executablePath, kind: 'node' as const, manager: npm ? 'npm' as const : brew ? 'brew' as const : null, command: command && { ...command, displayCommand: formatCommand(command.command, command.args) }, currentVersion: null, npmGlobalPackageVersion: null };
  }
  const resolved = await realpath(executablePath);
  const kind: CliKind = await pythonInterpreter(resolved) ? 'python' : 'node';
  const formula = kind === 'python' ? 'kimi-cli' : 'kimi-code';
  const [currentVersion, brewPrefix, uvRoot, npmProbe] = await Promise.all([
    readCliVersion(executablePath),
    brew ? commandOutput(brew, ['--prefix', formula]) : null,
    kind === 'python' && uv ? commandOutput(uv, ['tool', 'dir']) : null,
    kind === 'node' && npm ? probeNpmGlobalPackage(npmPackage) : { npmBin: null, npmGlobalPackageVersion: null },
  ]);
  const canonicalBrewPrefix = brewPrefix ? await realpath(brewPrefix.trim()).catch(() => null) : null;
  const canonicalUvRoot = uvRoot ? await realpath(uvRoot.trim()).catch(() => null) : null;
  const manager: Manager | null = inside(canonicalBrewPrefix, resolved) ? 'brew'
    : kind === 'python' && canonicalUvRoot && inside(`${canonicalUvRoot}/kimi-cli`, resolved) ? 'uv'
    : kind === 'node' && inside(npmProbe.npmBin, executablePath) && npmProbe.npmGlobalPackageVersion ? 'npm'
    : kind === 'node' && resolved.includes('/kimi-code/') && !resolved.includes('/node_modules/') ? 'native' : null;
  const managerPath = manager === 'brew' ? brew : manager === 'uv' ? uv : manager === 'npm' ? npm : executablePath;
  const command = manager && managerPath ? installationCommand(kind, manager, executablePath, managerPath) : null;
  return { executablePath, kind, manager, command, currentVersion, npmGlobalPackageVersion: npmProbe.npmGlobalPackageVersion };
}

async function latestVersion(kind: CliKind, manager: Manager | null): Promise<string | null> {
  const url = manager === 'brew' ? `https://formulae.brew.sh/api/formula/${kind === 'python' ? 'kimi-cli' : 'kimi-code'}.json`
    : kind === 'python' ? 'https://pypi.org/pypi/kimi-cli/json'
    : 'https://registry.npmjs.org/@moonshot-ai%2Fkimi-code/latest';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const json = await response.json();
    const value = manager === 'brew' ? z.object({ versions: z.object({ stable: z.string() }) }).parse(json).versions.stable
      : kind === 'python' ? z.object({ info: z.object({ version: z.string() }) }).parse(json).info.version
      : z.object({ version: z.string() }).parse(json).version;
    return z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/).parse(value);
  } catch { return null; }
}

export async function inspectInstallation(checkUpdates: boolean) {
  const found = await probe();
  const latest = checkUpdates ? await latestVersion(found.kind, found.manager) : null;
  const installed = found.executablePath !== null;
  const needsUpdate = installed && found.currentVersion !== null && latest !== null && compareVersions(latest, found.currentVersion) > 0;
  const action = !installed ? 'install' : needsUpdate ? 'update' : null;
  const status: ProviderInstallationStatus = {
    executableName: 'kimi', executablePath: found.executablePath, installed,
    installSource: !installed ? 'notInstalled' : found.manager === 'npm' ? 'npmGlobal' : 'external',
    currentVersion: found.currentVersion, latestVersion: latest, minimumSupportedVersion: null,
    npmPackageName: found.kind === 'node' ? npmPackage : null,
    npmGlobalPackageVersion: found.npmGlobalPackageVersion,
    installAction: action && found.command ? { kind: action, label: action === 'install' ? 'Install' : 'Update', command: found.command.displayCommand } : null,
    needsUpdate, versionUnsupported: false,
  };
  return { status, command: found.command, kind: found.kind, manager: found.manager };
}

export async function getInstallationStatus(checkUpdates = true) {
  return (await inspectInstallation(checkUpdates)).status;
}

export async function getInstallationRun(action: 'install' | 'update') {
  const { status, command } = await inspectInstallation(true);
  if (status.installAction?.kind !== action || !command) return { available: false as const, message: `Kimi Code ${action} is no longer available for this installation. Update it with its original package manager.` };
  return { available: true as const, command, verification: installationVerification(status, action) };
}
