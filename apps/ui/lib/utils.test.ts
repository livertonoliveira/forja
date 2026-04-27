/**
 * Integration tests for apps/ui/lib/utils.ts — cn() utility
 *
 * Covers:
 * - cn() merges class names correctly
 * - cn() handles conditional classes (clsx behavior)
 * - cn() deduplicates conflicting Tailwind classes (tailwind-merge behavior)
 */

import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn() utility', () => {
  it('merges multiple class name strings', () => {
    const result = cn('foo', 'bar', 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('handles a single class name', () => {
    expect(cn('only')).toBe('only');
  });

  it('handles no arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles conditional classes — truthy condition includes the class', () => {
    const active = true;
    const result = cn('base', active && 'active');
    expect(result).toContain('base');
    expect(result).toContain('active');
  });

  it('handles conditional classes — falsy condition excludes the class', () => {
    const active = false;
    const result = cn('base', active && 'active');
    expect(result).toContain('base');
    expect(result).not.toContain('active');
  });

  it('handles undefined and null values gracefully', () => {
    const result = cn('base', undefined, null as unknown as string, 'end');
    expect(result).toBe('base end');
  });

  it('handles object syntax from clsx', () => {
    const result = cn({ foo: true, bar: false, baz: true });
    expect(result).toContain('foo');
    expect(result).not.toContain('bar');
    expect(result).toContain('baz');
  });

  it('handles array syntax from clsx', () => {
    const result = cn(['a', 'b'], 'c');
    expect(result).toBe('a b c');
  });

  // tailwind-merge (twMerge) behavior — last class wins for conflicting utilities
  it('deduplicates conflicting Tailwind padding classes (last wins)', () => {
    const result = cn('p-4', 'p-8');
    expect(result).toBe('p-8');
    expect(result).not.toContain('p-4');
  });

  it('deduplicates conflicting Tailwind text-color classes (last wins)', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
    expect(result).not.toContain('text-red-500');
  });

  it('deduplicates conflicting Tailwind background-color classes (last wins)', () => {
    const result = cn('bg-white', 'bg-black');
    expect(result).toBe('bg-black');
    expect(result).not.toContain('bg-white');
  });

  it('keeps non-conflicting Tailwind classes side by side', () => {
    const result = cn('p-4', 'm-4', 'text-sm');
    expect(result).toContain('p-4');
    expect(result).toContain('m-4');
    expect(result).toContain('text-sm');
  });

  it('deduplicates conflict when combined with conditional', () => {
    const override = true;
    const result = cn('px-2', override && 'px-6');
    expect(result).toBe('px-6');
    expect(result).not.toContain('px-2');
  });
});
