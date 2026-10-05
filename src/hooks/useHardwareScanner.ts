import { useEffect, useRef } from 'react';

const SHIFT_DIGITS = ')!@#$%^&*(';
const PLAIN: Record<string, [string, string]> = {
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Backquote: ['`', '~'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  Space: [' ', ' '],
  NumpadDivide: ['/', '/'],
  NumpadMultiply: ['*', '*'],
  NumpadSubtract: ['-', '-'],
  NumpadAdd: ['+', '+'],
  NumpadDecimal: ['.', '.'],
};

const charFromEvent = (e: KeyboardEvent): string => {
  const { code, shiftKey } = e;
  if (code.startsWith('Key') && code.length === 4) {
    const ch = code[3];
    const upper = shiftKey !== e.getModifierState('CapsLock');
    return upper ? ch : ch.toLowerCase();
  }
  if (code.startsWith('Digit')) {
    const d = Number(code[5]);
    return shiftKey ? SHIFT_DIGITS[d] : String(d);
  }
  if (code.startsWith('Numpad') && /^Numpad\d$/.test(code)) return code[6];
  if (PLAIN[code]) return PLAIN[code][shiftKey ? 1 : 0];
  return e.key.length === 1 ? e.key : '';
};

const MAX_GAP_MS = 60;
const MIN_LENGTH = 3;

const useHardwareScanner = (enabled: boolean, onScan: (code: string) => void) => {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let fastCount = 0;
    let lastAt = 0;

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = performance.now();
      const gap = now - lastAt;
      lastAt = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = buffer;
        const isScan = code.length >= MIN_LENGTH && fastCount >= code.length - 1;
        buffer = '';
        fastCount = 0;
        if (!isScan) return;
        e.preventDefault();
        e.stopPropagation();
        const target = e.target as HTMLInputElement | null;
        if (target && 'value' in target && target.tagName === 'INPUT') {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(target, '');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
        onScanRef.current(code);
        return;
      }

      const ch = charFromEvent(e);
      if (!ch) return;
      if (gap > MAX_GAP_MS) {
        buffer = ch;
        fastCount = 0;
        return;
      }
      buffer += ch;
      fastCount += 1;
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled]);
};

export default useHardwareScanner;
