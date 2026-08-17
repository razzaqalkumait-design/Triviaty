// Triviaty sudden-death / random-picker / skip-zero tests — run: node tests/suddendeath.js
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
globalThis.__store = store;
let unusedCells = [];
global.document = {
  getElementById: id => { if (!els[id]) els[id] = (id === 'confettiCanvas' ? makeCanvas() : makeEl(id)); return els[id]; },
  querySelectorAll: sel => {
    if (sel === '#board td.cell:not(.used)') return unusedCells;
    if (sel === '#board td.cell') return unusedCells;
    if (sel === '#board td.cell.used') return [];
    if (sel === '#soloOptions .soloOption') return [];
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
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.navigator = {};
const flush = () => { while (global.__timeouts.length) { const t = global.__timeouts.pop(); if (!t.cancelled) return t.fn(); } return null; };

const testCode = `
  const shown = [];
  const origShowScreen = showScreen;
  showScreen = (id) => { shown.push(id); origShowScreen(id); };
  let failures = [];
  const check = (cond, msg) => { if (!cond) failures.push(msg); };

  // Question bank used by the sudden-death / picker tests
  const bank = [];
  [100, 200, 300, 400, 500].forEach(p => {
    for (let i = 0; i < 3; i++) {
      bank.push({ group: 'g', points: p, question: 'سؤال ' + p + '-' + i, answer: 'ج' + p + '-' + i });
    }
  });
  questions = bank;
  selectedGroups = ['g'];

  // ===== 1. skipped question shows 0 =====
  lastModeRequested = 'teams';
  currentQuestion = { group: 'g', points: 100, question: 'س', answer: 'ج' };
  lastAnsweringTeam = null;
  markQuestionAsUsed();
  check(els['cell-g-100'].innerText === '0', '1: skipped cell not 0 (got ' + els['cell-g-100'].innerText + ')');
  // answered question shows the team name
  lastAnsweringTeam = 1;
  teamNames = { 1: 'فريق أحمد', 2: 'فريق سارة' };
  markQuestionAsUsed();
  check(els['cell-g-100'].innerText === 'فريق أحمد', '1: answered cell not team name');

  // ===== 2. random picker: host modes only =====
  lastModeRequested = 'teams';
  updateRandomPickBtn();
  check(els['randomPickBtn'].style.display === 'none', '2: picker visible in non-host mode');
  lastModeRequested = 'teamsHost';
  updateRandomPickBtn();
  check(els['randomPickBtn'].style.display === 'inline-block', '2: picker hidden in host mode');

  // ===== 3. picker chooses from the easiest available tier =====
  unusedCells = [{ id: 'cell-تاريخ-200' }, { id: 'cell-تاريخ-300' }, { id: 'cell-علوم-100' }];
  questions = bank.filter(q => q.group === 'تاريخ' || q.group === 'علوم');
  bank.forEach(q => q.group = 'تاريخ');
  // rebuild: تاريخ has all tiers, علوم only 100
  questions = [];
  [100, 200, 300, 400, 500].forEach(p => { questions.push({ group: 'تاريخ', points: p, question: 'س' + p, answer: 'ج' }); });
  questions.push({ group: 'علوم', points: 100, question: 'ع100', answer: 'ج' });
  selectedGroups = ['تاريخ', 'علوم'];
  actionLocked = false;
  pickRandomQuestion();
  check(currentQuestion.points === 100, '3: did not pick easiest tier (got ' + currentQuestion.points + ')');
  check(roundPhase === 'picking' && actionLocked === true, '3: selectQuestion not triggered');
  // once 100s are gone -> picks 200
  actionLocked = false;
  unusedCells = [{ id: 'cell-تاريخ-200' }, { id: 'cell-تاريخ-300' }];
  pickRandomQuestion();
  check(currentQuestion.points === 200, '3: tier not advancing (got ' + currentQuestion.points + ')');
  // picker ignored in non-host modes even if called
  lastModeRequested = 'teams';
  actionLocked = false;
  pickRandomQuestion();
  check(roundPhase === 'picking' && currentQuestion.points === 200, '3: picker ran in non-host mode');

  // ===== 4. draw -> sudden death starts, no end screen =====
  delete globalThis.__store['triviatyHistory'];
  questions = [];
  [100, 200, 300, 400, 500].forEach(p => {
    for (let i = 0; i < 3; i++) questions.push({ group: 'g', points: p, question: 'سؤال ' + p + '-' + i, answer: 'ج' + p + '-' + i });
  });
  selectedGroups = ['g'];
  lastModeRequested = 'teams';
  scores = { 1: 500, 2: 500 };
  teamNames = { 1: 'فريق أحمد', 2: 'فريق سارة' };
  gameEnded = false;
  shown.length = 0;
  endGame();
  check(suddenDeathState !== null, '4: sudden death not started');
  check(!shown.includes('endGameScreen'), '4: end screen shown before winner');
  check(document.getElementById('questionBox').innerText.includes('موت مفاجئ') === false, '4: banner overwritten? (first question replaces it)');
  check(document.getElementById('questionBox').innerText.startsWith('سؤال'), '4: question not shown');
  check(document.getElementById('teamButtons').innerHTML.includes('فريق أحمد أجاب صحيحاً'), '4: contender 1 button missing');
  check(document.getElementById('teamButtons').innerHTML.includes('فريق سارة أجاب صحيحاً'), '4: contender 2 button missing');
  check(document.getElementById('teamButtons').innerHTML.includes('لا أحد أجاب'), '4: nobody button missing');
  check(suddenDeathState.usedKeys.size === 1, '4: used key not recorded');

  // ===== 5. nobody answers -> another question pulled =====
  const q1 = document.getElementById('questionBox').innerText;
  suddenDeathNobody();
  const q2 = document.getElementById('questionBox').innerText;
  check(q1 !== q2, '5: same question pulled twice');
  check(suddenDeathState.usedKeys.size === 2, '5: second question not tracked');

  // ===== 6. someone answers -> +500, winner screen =====
  suddenDeathWin(1); // فريق سارة
  check(scores[2] === 1000, '6: 500 points not awarded');
  check(suddenDeathState === null, '6: state not cleared');
  check(shown[shown.length-1] === 'endGameScreen', '6: end screen not shown');
  check(document.getElementById('winnerName').innerText === 'فريق سارة', '6: wrong winner');
  check(document.getElementById('winnerPoints').innerText === '1000 نقطة', '6: wrong points');
  check(document.getElementById('winnerLabel').innerText === '🏆 الفائز', '6: label not winner');
  const hist = getHistory();
  check(hist.length === 1 && hist[0].winner === 'فريق سارة' && hist[0].points === 1000, '6: history not recorded');
  check(confettiRunning, '6: no confetti');

  // ===== 7. questions exhausted -> fallback tie display =====
  stopConfetti();
  questions = [];
  scores = { 1: 300, 2: 300 };
  teamNames = { 1: 'أ', 2: 'ب' };
  gameEnded = false;
  shown.length = 0;
  endGame();
  check(suddenDeathState === null, '7: state not cleared after fallback');
  check(shown[shown.length-1] === 'endGameScreen', '7: no end screen after fallback');
  check(document.getElementById('winnerLabel').innerText === '🤝 تعادل!', '7: fallback not tie');
  check(document.getElementById('winnerName').innerText === 'أ و ب', '7: tie names wrong');

  // ===== 8. thirty-mode tie -> NO sudden death =====
  questions = bank;
  lastModeRequested = 'thirty';
  scores = { 0: 100, 1: 100 };
  teamNames = { 0: 'علي', 1: 'سارة' };
  gameEnded = false;
  shown.length = 0;
  endGame();
  check(suddenDeathState === null, '8: sudden death started in thirty mode');
  check(shown[shown.length-1] === 'endGameScreen' && document.getElementById('winnerLabel').innerText === '🤝 تعادل!', '8: thirty tie not shown');

  globalThis.__failures = failures;
`;

eval(code + '\n' + testCode);
const failures = globalThis.__failures;
if (failures.length) {
  console.log('❌ FAILURES:');
  failures.forEach(f => console.log('   -', f));
  process.exit(1);
} else {
  console.log('✅ ALL 8 SUDDEN-DEATH/PICKER TESTS PASSED (skip=0, host-only picker, easiest-tier, draw->sudden death, nobody->next, win+500, fallback tie, thirty exempt)');
}
