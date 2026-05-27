import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function ensureParentDir(path: string): void {
  ensureDir(dirname(path));
}

export function writeJsonFile(path: string, value: unknown): void {
  ensureParentDir(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeTextFile(path: string, value: string): void {
  ensureParentDir(path);
  writeFileSync(path, value, 'utf8');
}

export function average(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  if (present.length === 0) {
    return null;
  }
  return round(present.reduce((sum, value) => sum + value, 0) / present.length, 4);
}

export function processingRatioDisplay(ratio: number | null): string | null {
  if (ratio === null) {
    return null;
  }
  return `1:${round(ratio, 3)}`;
}
