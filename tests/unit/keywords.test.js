const { test, expect } = require('@playwright/test');
const {
  DEFAULT_FINANCIAL_TERMS,
  ENGLISH_FINANCIAL_TERMS,
  ENGLISH_STOPWORDS,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_TOP_N,
  normalizeWord,
  isStopword,
  detectKeywords
} = require('../../app/core/keywords.js');

const ENGLISH_SCRIPT = [
  'The debt is the biggest problem of the debt',
  'Interest rates affect the debt of families',
  'Families pay interest and debt every month',
  'Managing the debt and interest is the goal'
];

const SAMPLE_SCRIPT = [
  'El presupuesto familiar es la base del presupuesto',
  'La tasa de interés sube y la tasa de interés preocupa',
  'El presupuesto crece y la deuda baja',
  'Controlar el presupuesto y la tasa de interés ayuda'
];

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

  test('proposes relevant words from the whole script, not only symbols', () => {
    const found = detectKeywords(SAMPLE_SCRIPT);
    expect(found.length).toBeGreaterThan(0);

    const words = found.filter(item => item.kind === 'word' || item.kind === 'phrase');
    expect(words.length).toBeGreaterThan(0);

    for (const item of words) {
      expect(item.kind === 'word' || item.kind === 'phrase').toBe(true);
      expect(DEFAULT_FINANCIAL_TERMS).not.toContain(item.term.toLowerCase());
      expect(item.term).not.toMatch(/\d|[$%]/);
    }

    const presupuesto = found.find(item => normalizeWord(item.term) === 'presupuesto');
    expect(presupuesto).toBeTruthy();
    expect(presupuesto.kind).toBe('word');
    expect(presupuesto.count).toBe(4);
    expect(presupuesto.scene).toBe(1);
  });

  test('ignores stopwords and does not surface plain single-use words', () => {
    const found = detectKeywords(SAMPLE_SCRIPT);
    const normalized = found.map(item => normalizeWord(item.term));
    for (const stopword of ['el', 'la', 'de', 'del', 'es', 'y']) {
      expect(normalized).not.toContain(stopword);
    }
    expect(found.find(item => normalizeWord(item.term) === 'controlar')).toBeUndefined();
    expect(found.find(item => normalizeWord(item.term) === 'familiar')).toBeUndefined();
  });

  test('detects frequent bigrams and trigrams such as "tasa de interés"', () => {
    const found = detectKeywords(SAMPLE_SCRIPT);
    const phrase = found.find(item => normalizeWord(item.term) === 'tasa de interes');
    expect(phrase).toBeTruthy();
    expect(phrase.kind).toBe('phrase');
    expect(phrase.count).toBe(3);
  });

  test('orders proposals by score and honors the configurable limit', () => {
    const found = detectKeywords(SAMPLE_SCRIPT, { topN: 2 });
    expect(found).toHaveLength(2);
    for (let i = 1; i < found.length; i++) {
      expect(found[i - 1].score).toBeGreaterThanOrEqual(found[i].score);
    }
    const phrase = found.find(item => normalizeWord(item.term) === 'tasa de interes');
    const presupuesto = found.find(item => normalizeWord(item.term) === 'presupuesto');
    if (phrase && presupuesto) {
      expect(phrase.score).toBeGreaterThan(presupuesto.score);
    }

    const all = detectKeywords(SAMPLE_SCRIPT);
    expect(all.length).toBeLessThanOrEqual(DEFAULT_TOP_N);
  });

  test('detects English financial terms with the English list', () => {
    expect(ENGLISH_FINANCIAL_TERMS).toContain('debt');
    const found = detectKeywords(['tu deuda y the debt'], { language: 'en' });
    const debt = found.find(item => normalizeWord(item.term) === 'debt');
    expect(debt).toBeTruthy();
    expect(debt.kind).toBe('term');

    expect(isStopword('the', 'en')).toBe(true);
    expect(isStopword('the', 'es')).toBe(false);
    expect(ENGLISH_STOPWORDS).toContain('the');
  });

  test('uses the Spanish stopword list by default and ignores English-only words', () => {
    const spanish = detectKeywords(['debt'], { language: 'es' });
    expect(spanish.find(item => normalizeWord(item.term) === 'debt')).toBeUndefined();
  });

  test('proposes relevant English words while ignoring stopwords', () => {
    const found = detectKeywords(ENGLISH_SCRIPT, { language: 'en' });
    const normalized = found.map(item => normalizeWord(item.term));
    for (const stopword of ['the', 'is', 'of', 'and', 'every']) {
      expect(normalized).not.toContain(stopword);
    }
    const debt = found.find(item => normalizeWord(item.term) === 'debt');
    expect(debt).toBeTruthy();
    expect(debt.count).toBe(5);

    const families = found.find(item => normalizeWord(item.term) === 'families');
    expect(families).toBeTruthy();
    expect(families.kind).toBe('word');
  });
});
