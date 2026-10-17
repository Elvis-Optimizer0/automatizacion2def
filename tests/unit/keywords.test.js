const { test, expect } = require('@playwright/test');
const {
  DEFAULT_FINANCIAL_TERMS,
  DEFAULT_HIGHLIGHT_COLOR,
  detectKeywords
} = require('../../app/core/keywords.js');

test.describe('keyword detection', () => {
  test('detects numbers, currency and percentages', () => {
    const found = detectKeywords(['La deuda sube 30% y el interes de $1.000 afecta 3 pagos']);
    const terms = found.map(item => item.term.toLowerCase());
    expect(terms).toContain('30%');
    expect(terms).toContain('$1.000');
    expect(terms).toContain('3');
    const kinds = Object.fromEntries(found.map(item => [item.term.toLowerCase(), item.kind]));
    expect(kinds['30%']).toBe('percent');
    expect(kinds['$1.000']).toBe('currency');
    expect(kinds['3']).toBe('number');
  });

  test('detects financial terms from the built-in list', () => {
    const found = detectKeywords(['tu sueldo y el ahorro frente a la inflacion']);
    const terms = found.map(item => item.term.toLowerCase());
    expect(terms).toEqual(expect.arrayContaining(['sueldo', 'ahorro', 'inflacion']));
    expect(DEFAULT_FINANCIAL_TERMS).toContain('deuda');
    expect(DEFAULT_HIGHLIGHT_COLOR).toBe('#ff0000');
  });

  test('respects the number toggles', () => {
    const found = detectKeywords(['paga 500 pesos'], { numbers: false, percent: false, currency: false });
    expect(found).toHaveLength(0);
  });

  test('accepts extra custom terms', () => {
    const found = detectKeywords(['la rentabilidad del negocio'], { terms: ['rentabilidad'] });
    expect(found.map(item => item.term.toLowerCase())).toContain('rentabilidad');
  });

  test('deduplicates repeated words and combines multiple scenes', () => {
    const found = detectKeywords(['deuda deuda', 'deuda 10']);
    const deudas = found.filter(item => item.term.toLowerCase() === 'deuda');
    expect(deudas).toHaveLength(1);
    expect(found.map(item => item.term.toLowerCase())).toContain('10');
  });
});
