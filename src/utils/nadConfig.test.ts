import { describe, expect, it } from 'vitest';
import { parseNADConfig } from './nadConfig';

describe('parseNADConfig', () => {
  it('reads a single-plugin config', () => {
    expect(parseNADConfig('{"type":"bridge","bridge":"br19"}').type).toBe('bridge');
  });

  it('reads a conflist as its first plugin', () => {
    const c = parseNADConfig(
      '{"cniVersion":"0.3.1","name":"vlan19","plugins":[{"type":"bridge","bridge":"br19","ipam":{}},{"type":"tuning"}]}'
    );
    expect(c.type).toBe('bridge');
    expect(c.bridge).toBe('br19');
    expect(c.name).toBe('vlan19');
  });

  it('returns {} for empty or invalid config', () => {
    expect(parseNADConfig('')).toEqual({});
    expect(parseNADConfig('not json')).toEqual({});
    expect(parseNADConfig('null')).toEqual({});
  });
});
