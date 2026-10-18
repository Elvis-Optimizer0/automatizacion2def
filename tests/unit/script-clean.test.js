const { test, expect } = require('@playwright/test');
const { cleanLine, cleanScriptForVoice, normalizeLanguage } = require('../../app/core/script-clean.js');

test.describe('script cleaner for voice', () => {
  test('strips Spanish scene markers, times and stage directions', () => {
    const script = [
      '[Escena 1] 0:00 - 0:03 El presupuesto familiar manda',
      '(plano general)',
      '[Escena 2] 0:03 - 0:06 La tasa de interés sube',
      'Cierre con la tasa de interés'
    ].join('\n');

    const cleaned = cleanScriptForVoice(script, 'es');
    expect(cleaned).toBe([
      'El presupuesto familiar manda',
      'La tasa de interés sube',
      'Cierre con la tasa de interés'
    ].join('\n'));
    expect(cleaned).not.toMatch(/escena/i);
    expect(cleaned).not.toMatch(/\d:\d{2}/);
  });

  test('strips English scene markers and "from ... to ..." ranges', () => {
    const script = [
      '[Scene 1] 0:00 - 0:03 The household budget rules',
      'VOICEOVER: This is the intro',
      '[Scene 2] from 0:03 to 0:06 Interest rates rise'
    ].join('\n');

    const cleaned = cleanScriptForVoice(script, 'en');
    expect(cleaned).toBe([
      'The household budget rules',
      'This is the intro',
      'Interest rates rise'
    ].join('\n'));
    expect(cleaned).not.toMatch(/scene/i);
    expect(cleaned).not.toMatch(/voice ?over/i);
  });

  test('removes standalone timestamps and technical labels', () => {
    const script = [
      '0:00 - 0:03',
      'NARRADOR: Bienvenidos al programa',
      '[Música de fondo]',
      'Hoy veremos tres consejos'
    ].join('\n');

    const cleaned = cleanScriptForVoice(script);
    expect(cleaned).toBe(['Bienvenidos al programa', 'Hoy veremos tres consejos'].join('\n'));
  });

  test('cleanLine leaves plain narration untouched', () => {
    expect(cleanLine('El ahorro mensual importa')).toBe('El ahorro mensual importa');
  });

  test('returns empty string for empty input', () => {
    expect(cleanScriptForVoice('')).toBe('');
    expect(cleanScriptForVoice(null)).toBe('');
  });

  test('normalizes the language code', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('ENGLISH')).toBe('en');
    expect(normalizeLanguage('es')).toBe('es');
    expect(normalizeLanguage('')).toBe('es');
  });
});
