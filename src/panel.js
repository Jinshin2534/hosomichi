import { formatPercent, formatKm, formatDetour, NO_IMPROVEMENT_NOTE } from './lib/format.js';

const $ = (id) => document.getElementById(id);

export function createPanel({ onGo, onDetourChange, onLocate }) {
  $('go').addEventListener('click', onGo);
  $('locate').addEventListener('click', onLocate);
  $('panel-toggle').addEventListener('click', () => $('panel').classList.toggle('collapsed'));
  for (const radio of document.querySelectorAll('input[name="detour"]')) {
    radio.addEventListener('change', () => onDetourChange(Number(radio.value)));
  }

  return {
    setPoints({ startLabel, goalLabel }) {
      $('start-label').textContent = startLabel;
      $('goal-label').textContent = goalLabel;
    },
    setGoEnabled(enabled) {
      $('go').disabled = !enabled;
    },
    setStatus(text, kind = 'info') {
      const el = $('status');
      el.textContent = text;
      el.classList.toggle('error', kind === 'error');
    },
    showResult(stats, noImprovement) {
      $('r-share').textContent = formatPercent(stats.narrowShare);
      $('r-short-share').textContent = formatPercent(stats.shortestNarrowShare);
      $('r-detour').textContent = formatDetour(stats.detour);
      $('r-length').textContent = formatKm(stats.lengthM);
      $('r-measured').textContent = formatPercent(stats.measuredShare);
      $('r-estimated').textContent = formatPercent(stats.estimatedShare);
      const note = $('r-note');
      note.textContent = noImprovement ? NO_IMPROVEMENT_NOTE : '';
      note.hidden = !noImprovement;
      $('result').hidden = false;
    },
    hideResult() {
      $('result').hidden = true;
    },
    insets() {
      const rect = $('panel').getBoundingClientRect();
      return window.innerWidth >= 768
        ? { left: rect.right + 16, bottom: 0 }
        : { left: 0, bottom: rect.height };
    },
  };
}
