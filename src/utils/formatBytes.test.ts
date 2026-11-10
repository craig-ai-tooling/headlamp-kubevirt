import { formatBytesPerSecond } from './formatBytes';

describe('formatBytesPerSecond', () => {
  it.each([
    [0, '0 B/s'],
    [999, '999 B/s'],
    [1000, '1.00 KB/s'],
    [1234, '1.23 KB/s'],
    [45_600_000, '45.6 MB/s'],
    [1.2e9, '1.20 GB/s'],
    [999.6, '1.00 KB/s'],
    [999_600_000, '1.00 GB/s'],
    [NaN, '-'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatBytesPerSecond(value)).toBe(expected);
  });
});
