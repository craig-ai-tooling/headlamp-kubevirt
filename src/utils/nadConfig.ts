import { NADConfig } from '../types';

// A CNI conflist ({cniVersion, name, plugins: [...]}) reads as its first plugin.
export function parseNADConfig(raw: string): NADConfig {
  try {
    const x = JSON.parse(raw);
    if (!x || typeof x !== 'object') return {};
    return Array.isArray(x.plugins) && x.plugins[0] ? { ...x.plugins[0], ...x } : x;
  } catch {
    return {};
  }
}
