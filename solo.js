// Triviaty solo-mode test suite — run: node tests/solo.js
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'uploads', 'app.js'), 'utf8');

function makeEl(id) {
  return { id, innerHTML: '', innerText: '', style: {}, className: '', children: [], disabled: false,
    classList: { _set: new Set(), add(c){ this._set.add(c); }, remove(c){ this._set.delete(c); },
      toggle(c, force){ if (force === undefined) force = !this._set.has(c); force ? this._set.add(c) : this._set.delete(c); return force; },
      contains(c){ return this._set.has(c); } },
    appendChild(c){ this.children.push(c); }, onclick: null,
    querySelector(){ return makeEl(id + '-q'); }, remove(){}, addEventListener(){} };
}
const els = {};
const makeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ({ setTransform(){}, clearRect(){}, save(){}, restore(){}, translate(){}, rotate(){}, fillRect(){}, beginPath(){}, arc(){}, fill(){}, fillStyle:'' }) });
const store = {};
global.document = {
  getElementById: id => { if (!els[id]) els[id] = (id === 'confettiCanvas' ? makeCanvas() : makeEl(id)); return els[id]; },
  querySelectorAll: sel => {
    if (sel === '#soloOptions .soloOption') {
      const st = global.__soloStateRef ? global.__soloStateRef() : null;
      const n = st && st.options ? st.options.length : 4;
      const out = [];
      for (let i = 0; i < n; i++) out.push(makeEl('soloOpt' + i));
      return out;
    }
    if (sel === '#board td.cell') return [];
    if (sel === '#board td.cell.used') return [];
    if (sel.includes('checkbox') || sel.includes('thirtyCatContainer input')) return [];
    if (sel.startsWith('#playerInputsContainer')) return [];
    return [];
  },
  querySelector: sel => { if (sel.startsWith('#')) return document.getElementById(sel.slice(1)); return makeEl('g'); },
  createElement: tag => makeEl(tag),
  addEventListener: () => {},
};
global.fetch = () => Promise.resolve({ json: () => Promise.resolve([]) });
global.alert = msg => { global.__alerts.push(msg); };
global.__alerts = [];
global.clearInterval = () => {}; global.setInterval = () => 1;
global.__timeouts = [];
global.setTimeout = (fn, delay) => { global.__timeouts.push({ fn, delay, cancelled: false }); return global.__timeouts.length - 1; };
global.clearTimeout = id => { if (global.__timeouts[id]) global.__timeouts[id].cancelled = true; };
global.window = { innerWidth: 400, innerHeight: 800, devicePixelRatio: 2, addEventListener(){}, close: () => {} };
global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
global.navigator = {};
const flush = () => { while (global.__timeouts.length) { const t = global.__timeouts.pop(); if (!t.cancelled) return t.fn(); } return null; };

const testCode = `
  const shown = [];
  const origShowScreen = showScreen;
  showScreen = (id) => { shown.push(id); origShowScreen(id); };
  globalThis.__soloStateRef = () => soloState;
  let failures = [];
  const check = (cond, msg) => { if (!cond) failures.push(msg); };

  // Build a solo bank: tiers 1-5, unique questions/answers
  const bank = [];
  for (let t = 1; t <= 5; t++) {
    for (let i = 1; i <= 20; i++) {
      bank.push({ tier: t, question: 'س' + t + '-' + i, answer: 'ج' + t + '-' + i, wrong: ['خ' + t + '-' + i + 'أ', 'خ' + t + '-' + i + 'ب', 'خ' + t + '-' + i + 'ج'] });
    }
  }
  soloQuestions = bank;

  // ===== 1. menu shows best + screen =====
  store['triviatySoloBest'] = '7';
  openSoloMenu();
  check(shown[shown.length-1] === 'soloMenuScreen', '1: menu not shown');
  check(String(document.getElementById('soloBestMenu').innerText) === '7', '1: best not displayed');

  // ===== 2. start: streak 0 -> tier 1, options from the bank's wrong[] =====
  startSoloGame();
  check(shown[shown.length-1] === 'soloGameScreen', '2: game screen not shown');
  check(soloState.streak === 0, '2: streak not 0');
  check(soloState.current.tier.tier === 1, '2: first tier not 1');
  check(document.getElementById('soloTierChip').innerText === 'سهل جداً', '2: tier chip wrong');
  check(soloState.options.length === 4, '2: not 4 options');
  check(soloState.options.includes(soloState.current.answer), '2: correct answer missing');
  check(new Set(soloState.options).size === 4, '2: duplicate options');

  // ===== 3. correct answer -> streak up, next question =====
  const correctIndex = soloState.options.indexOf(soloState.current.answer);
  soloAnswer(correctIndex);
  check(soloState.streak === 1, '3: streak not incremented');
  flush();
  check(soloState.locked === false, '3: still locked');
  check(soloState.current.tier.tier === 1, '3: streak 1 still tier 1');

  // ===== 4. tier boundaries =====
  const tiers = [[3,1],[4,2],[6,2],[7,3],[9,3],[10,4],[13,4],[14,5],[20,5]];
  for (const [streak, expected] of tiers) {
    soloState.streak = streak;
    check(soloTier().tier === expected, '4: streak ' + streak + ' -> ' + soloTier().tier + ' (expected ' + expected + ')');
  }

  // ===== 5. wrong answer -> game over, best preserved =====
  soloState.streak = 6;
  const wrongIdx = soloState.options.findIndex(o => o !== soloState.current.answer);
  soloAnswer(wrongIdx);
  flush();
  check(soloState === null, '5: soloState not cleared');
  check(shown[shown.length-1] === 'soloGameOverScreen', '5: game over screen not shown');
  check(String(document.getElementById('soloFinalScore').innerText) === '6', '5: final score wrong');
  check(store['triviatySoloBest'] === '7', '5: best wrongly overwritten (6 < 7)');
  check(document.getElementById('soloNewRecord').classList.contains('hidden'), '5: record badge shown without record');
  check(!confettiRunning, '5: confetti without record');

  // ===== 6. new record: saved + celebration =====
  startSoloGame();
  soloState.streak = 9;
  soloAnswer(soloState.options.findIndex(o => o !== soloState.current.answer));
  flush();
  check(store['triviatySoloBest'] === '9', '6: new best not saved');
  check(!document.getElementById('soloNewRecord').classList.contains('hidden'), '6: record badge hidden');
  check(document.getElementById('soloOverEmoji').innerText === '👑', '6: emoji not crown');
  check(confettiRunning, '6: no confetti on record');
  stopConfetti();

  // ===== 7. play again resets =====
  shown.length = 0;
  startSoloGame();
  check(soloState.streak === 0 && shown[shown.length-1] === 'soloGameScreen', '7: play again broken');
  check(soloState.current.tier.tier === 1, '7: restart not tier 1');

  // ===== 8. no back-to-back repeat =====
  const q1 = soloState.lastKey;
  soloAnswer(soloState.options.indexOf(soloState.current.answer));
  flush();
  check(soloState.lastKey !== q1, '8: same question repeated');

  // ===== 9. missing tier falls back to easier tiers =====
  soloQuestions = bank.filter(q => q.tier <= 2); // only tiers 1-2 exist
  startSoloGame();
  soloState.streak = 13; // next question is #14 -> wants tier 4
  check(soloTier().tier === 4, '9: tier math broken');
  nextSoloQuestion();
  check(soloState.current.tierNum === 2, '9: fallback not to nearest tier (got ' + soloState.current.tierNum + ')');
  check(soloState.current.tier.tier === 4, '9: display tier should stay hard');
  soloQuestions = bank; // restore

  globalThis.__failures = failures;
`;

eval(code + '\n' + testCode);
const failures = globalThis.__failures;
if (failures.length) {
  console.log('❌ FAILURES:');
  failures.forEach(f => console.log('   -', f));
  process.exit(1);
} else {
  console.log('✅ ALL 9 SOLO-MODE TESTS PASSED (menu, tiers, bank options, scoring, game over, records, replay, no-repeats, fallback)');
}
