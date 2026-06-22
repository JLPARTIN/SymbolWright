import { describe, expect, it } from 'vitest';

import {
  AJNA_REPO_SCAN_PROFILE_BLOCK_ID,
  buildAjnaRepoScanProfile,
  renderAjnaRepoScanProfile,
} from './ajna-repo-scan-profile.js';
import type { AjnaRepoScanProfileInput } from './ajna-repo-scan-profile.js';

const READY_SCAN: AjnaRepoScanProfileInput = {
  topLevelDirs: ['docs', 'src'],
  tsFileCount: 120,
  specFileCount: 42,
  hasTypeScriptConfig: true,
  hasEslintConfig: true,
  hasPrettierConfig: true,
};

describe('buildAjnaRepoScanProfile', () => {
  it('emits canonical scan profile metadata', () => {
    const profile = buildAjnaRepoScanProfile(READY_SCAN);

    expect(profile.blockId).toBe(AJNA_REPO_SCAN_PROFILE_BLOCK_ID);
    expect(profile.runtimeBoundary.providerInvocationAllowed).toBe(false);
    expect(profile.runtimeBoundary.repoMutationAllowed).toBe(false);
    expect(profile.runtimeBoundary.githubWriteAllowed).toBe(false);
    expect(profile.runtimeBoundary.commandExecutionAllowed).toBe(false);
  });

  it('marks a guarded TypeScript repository as ready for Ajna scan-derived work', () => {
    const profile = buildAjnaRepoScanProfile(READY_SCAN);

    expect(profile.status).toBe('READY');
    expect(profile.summary).toContain('ready');
    expect(profile.signals.every((signal) => signal.status === 'PASS')).toBe(true);
    expect(profile.recommendations).toEqual([
      'Safe to continue read-only Ajna CLI capability development from the scan profile.',
    ]);
  });

  it('blocks when required source and TypeScript proof signals are missing', () => {
    const profile = buildAjnaRepoScanProfile({
      ...READY_SCAN,
      topLevelDirs: ['docs'],
      tsFileCount: 0,
      hasTypeScriptConfig: false,
    });

    expect(profile.status).toBe('BLOCKED');
    expect(profile.signals.filter((signal) => signal.status === 'FAIL').map((signal) => signal.id)).toEqual([
      'source.root',
      'source.typescript',
      'tooling.typescript',
    ]);
    expect(profile.recommendations).toContain(
      'Add TypeScript source files before advancing Ajna CLI review capabilities.',
    );
  });

  it('needs attention when optional proof guardrails are incomplete', () => {
    const profile = buildAjnaRepoScanProfile({
      ...READY_SCAN,
      specFileCount: 0,
      hasEslintConfig: false,
      hasPrettierConfig: false,
    });

    expect(profile.status).toBe('NEEDS_ATTENTION');
    expect(profile.signals.filter((signal) => signal.status === 'WARN').map((signal) => signal.id)).toEqual([
      'tests.present',
      'tooling.lint',
      'tooling.format',
    ]);
    expect(profile.recommendations).toContain(
      'Add regression tests before promoting new Ajna scan-derived behavior.',
    );
  });
});

describe('renderAjnaRepoScanProfile', () => {
  it('renders status, signals, recommendations, and read-only mode', () => {
    const output = renderAjnaRepoScanProfile(buildAjnaRepoScanProfile(READY_SCAN));

    expect(output).toContain('Ajna scan profile');
    expect(output).toContain('Status: READY');
    expect(output).toContain('Signals:');
    expect(output).toContain('source.root');
    expect(output).toContain('Recommendations:');
    expect(output).toContain('READ_ONLY');
    expect(output).toContain('no providers, writes, commands, or GitHub mutations allowed');
  });
});
