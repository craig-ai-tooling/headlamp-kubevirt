const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytesPerSecond(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0 B/s';

  const unitIndex = Math.min(Math.floor(Math.log10(Math.abs(value)) / 3), BYTE_UNITS.length - 1);
  let normalizedUnitIndex = Math.max(0, unitIndex);
  let scaledValue = value / 1000 ** normalizedUnitIndex;
  // 999.6 rounds to 1000 at 3 digits: move to the next unit instead of printing "1.00e+3".
  if (
    Math.abs(Number(scaledValue.toPrecision(3))) >= 1000 &&
    normalizedUnitIndex < BYTE_UNITS.length - 1
  ) {
    normalizedUnitIndex += 1;
    scaledValue = value / 1000 ** normalizedUnitIndex;
  }

  return `${scaledValue.toPrecision(3)} ${BYTE_UNITS[normalizedUnitIndex]}/s`;
}
