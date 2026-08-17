// ---- GAME STATE ----
    let scores = { 1: 0, 2: 0 };
    let teamNames = { 1: "الفريق 1", 2: "الفريق 2" };
    let teamPlayers = { 1: [], 2: [] };
    let questions = [];
    let allQuestionGroups = [];
    let selectedGroups = [];
    const MIN_GROUPS = 2, MAX_GROUPS = 8;
    const effectiveMinGroups = () => Math.min(MIN_GROUPS, allQuestionGroups.length);

    let currentQuestion = null;
    let currentTeamTurn = 1;
    let answeringTeam = 1;
    let answeringPlayer = 0;
    let currentPlayerIndex = 0;
    let timerInterval = null;
    let timeLeft = 0;
    let mainTimerActive = false;
    let mainTimerPaused = false;
    let shuffledCategories = [];
    let actionLocked = false;
    let lastModeRequested = null;
    let isTeamBTurn = false;
    let lastAnsweringTeam = null;
    let currentRoundId = 0;
    let roundPhase = "picking";
    let wickedEvents = { 1: [], 2: [] };
    let currentEvent = null;
    let forceSameTeamTurn = false;
    let gameEnded = false;

    // Confetti
    let confettiParticles = [];
    let confettiAnimId = null;
    let confettiRunning = false;
    let confettiSpawnUntil = 0;
    const CONFETTI_COLORS = ["#FFC93C", "#FF3D68", "#3DDBFF", "#FF8A3D", "#38E27D", "#F5F3EE"];

    const TEAM_STEAL_MODES = ["teams", "wickedTeams", "teamsHost", "wickedTeamsHost"];
    const HOST_MODES = ["teamsHost", "wickedTeamsHost"];
    const FFA_MODES = ["ffa", "wickedFfa"];
    const EVENT_MESSAGES = {
      pointsDeduction: "⚠️ استقطعت نقاطك! آسف",
      pointsTransferring: "😈 تحولت نقاطك للفريق الثاني",
      noPoints: "🚫 لن تحصل على نقاط",
      myTurnBitch: "🔄 الدور يبقى لهذا الفريق",
      gotYouuu: "🎉 تم الإيقاع بك! تحصل على النقاط مهما حدث",
      doublePoints: "🔥 نقاط مضاعفة! حصلت على نقاط مضاعفة"
    };
    const MEDALS = ["🥇", "🥈", "🥉"];
    // Fallback image for categories without a picture
    const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%232A2F52'/%3E%3Cstop offset='1' stop-color='%2312162B'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' fill='url(%23g)'/%3E%3Ctext x='150' y='165' font-size='64' text-anchor='middle'%3E%E2%AD%90%3C/text%3E%3C/svg%3E";

    const isWickedMode = () => !!lastModeRequested && lastModeRequested.includes("wicked");
    const isFFA = () => FFA_MODES.includes(lastModeRequested);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const shouldTriggerEvent = points => isWickedMode() && [300, 400, 500].includes(points);
    const displayEvent = name => EVENT_MESSAGES[name] || "";

    fetch("questions.json")
      .then(res => res.json())
      .then(data => {
        questions = data;
        allQuestionGroups = [...new Set(questions.map(q => q.group))].filter(Boolean);
      });

    function getRandomEvent(teamNum) {
      if (!isWickedMode()) return null;
      if (!wickedEvents[teamNum]) wickedEvents[teamNum] = [];
      const available = ["pointsDeduction", "pointsTransferring", "noPoints", "myTurnBitch", "doublePoints"]
        .filter(event => !wickedEvents[teamNum].includes(event));
      if (wickedEvents[teamNum].length >= 2 || !available.length || Math.random() > 0.4) return null;
      const event = pick(available);
      wickedEvents[teamNum].push(event);
      return event;
    }

    function getGotYouuuEvent(teamNum) {
      if (!isWickedMode()) return null;
      if (!wickedEvents[teamNum]) wickedEvents[teamNum] = [];
      if (wickedEvents[teamNum].length >= 2 || wickedEvents[teamNum].includes("gotYouuu") || Math.random() > 0.4) return null;
      wickedEvents[teamNum].push("gotYouuu");
      return "gotYouuu";
    }

    // ---- SCREEN MANAGEMENT ----
    const ALL_SCREENS = ["startMenu", "optionsScreen", "exitScreen", "typeMenu", "modeMenuNormal", "modeMenuWicked",
      "playerNamesScreen", "teamAssignmentScreen", "questionGroupsScreen", "gameScreen",
      "soloMenuScreen", "soloGameScreen", "soloGameOverScreen",
      "thirtyRulesScreen", "thirtyCategoryScreen", "thirtyGameScreen", "endGameScreen"];

    function showScreen(screenId) {
      ALL_SCREENS.forEach(id => document.getElementById(id).classList.add("hidden"));
      document.getElementById(screenId).classList.remove("hidden");
      const dockedBars = ["groupsStickyBar", "thirtyStickyBar"];
      if (screenId !== "questionGroupsScreen" && screenId !== "thirtyCategoryScreen") {
        dockedBars.forEach(id => {
          const bar = document.getElementById(id);
          if (bar) {
            bar.classList.add("hidden");
            bar.classList.remove("visible");
          }
        });
      }
      // Mid-game options: only visible during an actual game
      const gameBtn = document.getElementById("gameOptionsBtn");
      if (gameBtn) {
        gameBtn.classList.toggle("hidden", screenId !== "gameScreen" && screenId !== "thirtyGameScreen" && screenId !== "soloGameScreen");
      }
      ["gameOptionsModal", "exitConfirmModal"].forEach(id => {
        document.getElementById(id).classList.add("hidden");
      });
    }

    // ===================== SETTINGS / OPTIONS =====================
    const SETTINGS = {
      timer: { key: "triviatyTimer", options: [30, 45, 60], def: 60, label: "ثانية" },
      rounds: { key: "triviatyRounds", options: [5, 10, 15], def: 10, label: "جولة" }
    };

    function getSetting(key, def) {
      try {
        const value = parseInt(localStorage.getItem(key), 10);
        if (isFinite(value) && value > 0) return value;
      } catch (e) {}
      return def;
    }

    function setSetting(key, value) {
      try { localStorage.setItem(key, String(value)); } catch (e) {}
    }

    function openOptions() {
      renderOptionsScreen();
      showScreen("optionsScreen");
    }

    function syncSoundButtons() {
      const label = soundOn ? "🔊 تشغيل" : "🔇 إيقاف";
      ["optionsSoundBtn", "gameOptionsSoundBtn"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.innerText = label;
      });
    }

    function renderOptionsScreen() {
      syncSoundButtons();
      renderOptionGroup("timerGroup", SETTINGS.timer);
      renderOptionGroup("roundsGroup", SETTINGS.rounds);
    }

    function renderOptionGroup(containerId, setting) {
      document.getElementById(containerId).innerHTML = setting.options.map(value => {
        const active = getSetting(setting.key, setting.def) === value;
        return `<button class="segBtn${active ? " active" : ""}" onclick="chooseSetting('${setting.key}', ${value})">${value} ${setting.label}</button>`;
      }).join("");
    }

    function chooseSetting(key, value) {
      setSetting(key, value);
      renderOptionsScreen();
      sfx("tap");
    }

    function exitGame() {
      sfx("click");
      const screen = document.getElementById("exitScreen");
      if (screen) showScreen("exitScreen");
      else alert("شكراً للعبكم!"); // safety net if an old index.html is still cached
    }

    function closeApp() {
      sfx("click");
      try { window.close(); } catch (e) {}
      // If the browser refused (normal tab), tell the user to close manually
      setTimeout(() => {
        const hint = document.getElementById("exitHint");
        if (hint) hint.innerText = "إذا لم يُغلق تلقائياً، أغلق النافذة يدوياً";
      }, 600);
    }

    // ---- MID-GAME OPTIONS ----
    function openGameOptions() {
      // Pause any running timer while the options are open
      mainTimerPaused = false;
      thirtyTimerPaused = false;
      if (mainTimerActive) { clearInterval(timerInterval); mainTimerPaused = true; }
      if (thirtyTimerActive) { clearInterval(thirtyTimer); thirtyTimerPaused = true; }
      syncSoundButtons();
      document.getElementById("gameOptionsModal").classList.remove("hidden");
      sfx("click");
    }

    function closeGameOptions() {
      document.getElementById("gameOptionsModal").classList.add("hidden");
      // Resume whichever timer was running
      if (mainTimerPaused) { mainTimerPaused = false; startTimer(timeLeft); }
      if (thirtyTimerPaused) { thirtyTimerPaused = false; startThirtyTimer(thirtyTimeLeft); }
      sfx("click");
    }

    function askExitGame() {
      document.getElementById("gameOptionsModal").classList.add("hidden");
      document.getElementById("exitConfirmModal").classList.remove("hidden");
      sfx("click");
    }

    function cancelExitGame() {
      document.getElementById("exitConfirmModal").classList.add("hidden");
      document.getElementById("gameOptionsModal").classList.remove("hidden");
      sfx("click");
    }

    function confirmExitGame() {
      document.getElementById("exitConfirmModal").classList.add("hidden");
      document.getElementById("gameOptionsModal").classList.add("hidden");
      mainTimerPaused = false;
      thirtyTimerPaused = false;
      resetGameState();
      showScreen("startMenu");
      sfx("click");
    }

    // ===================== SOLO MODE =====================
    let soloState = null;
    let soloQuestions = [];
    const SOLO_TIERS = [
      { min: 1, max: 4, tier: 1, label: "سهل جداً", color: "#38E27D" },
      { min: 5, max: 7, tier: 2, label: "سهل", color: "#2EE6C8" },
      { min: 8, max: 10, tier: 3, label: "متوسط", color: "#FFC93C" },
      { min: 11, max: 14, tier: 4, label: "صعب", color: "#FF8A3D" },
      { min: 15, max: Infinity, tier: 5, label: "صعب جداً", color: "#FF3D68" }
    ];

    fetch("solo.json")
      .then(res => res.json())
      .then(data => { soloQuestions = data; });

    function getSoloBest() {
      try { return parseInt(localStorage.getItem("triviatySoloBest"), 10) || 0; } catch (e) { return 0; }
    }

    function setSoloBest(value) {
      try { localStorage.setItem("triviatySoloBest", String(value)); } catch (e) {}
    }

    function openSoloMenu() {
      document.getElementById("soloBestMenu").innerText = getSoloBest();
      showScreen("soloMenuScreen");
    }

    function startSoloGame() {
      if (!soloQuestions.length) {
        alert("لم يتم تحميل أسئلة اللعبة الفردية (solo.json)");
        return;
      }
      soloState = { streak: 0, lastKey: null, locked: false, options: [], current: null };
      updateSoloHud();
      showScreen("soloGameScreen");
      nextSoloQuestion();
    }

    // Difficulty tier of the NEXT question (streak + 1 = question number)
    function soloTier() {
      const next = (soloState ? soloState.streak : 0) + 1;
      return SOLO_TIERS.find(t => next >= t.min && next <= t.max) || SOLO_TIERS[SOLO_TIERS.length - 1];
    }

    function nextSoloQuestion() {
      if (!soloState) return;
      const tier = soloTier();
      // If the bank has no questions at this tier, fall back to easier tiers
      let tierNum = tier.tier;
      let pool = soloQuestions.filter(q => q.tier === tierNum);
      for (let t = tierNum - 1; t >= 1 && !pool.length; t--) {
        tierNum = t;
        pool = soloQuestions.filter(q => q.tier === tierNum);
      }
      let options = pool;
      if (pool.length > 1 && soloState.lastKey) {
        const filtered = pool.filter(q => q.question !== soloState.lastKey);
        if (filtered.length) options = filtered;
      }
      if (!options.length) { alert("لا توجد أسئلة متاحة"); return; }

      const chosen = options[Math.floor(Math.random() * options.length)];
      const text = chosen.question;
      const answer = chosen.answer;

      soloState.current = { question: text, answer: answer, tier, tierNum };
      soloState.lastKey = text;

      // Use the bank's hand-written wrong options; top up from other answers if needed
      let distractors = (chosen.wrong || []).filter(a => a !== answer).slice(0, 3);
      if (distractors.length < 3) {
        for (const q of shuffleArray(soloQuestions)) {
          if (distractors.length >= 3) break;
          if (q.answer !== answer && !distractors.includes(q.answer)) distractors.push(q.answer);
        }
      }
      const all = shuffleArray([answer, ...distractors]);
      soloState.options = all;
      soloState.locked = false;

      document.getElementById("soloQuestionBox").innerText = text;
      document.getElementById("soloGroupLabel").innerText = "";
      document.getElementById("soloOptions").innerHTML = all.map((opt, i) =>
        `<button class="soloOption" onclick="soloAnswer(${i})">${opt}</button>`
      ).join("");
      updateSoloHud();
    }

    function soloAnswer(index) {
      if (!soloState || soloState.locked) return;
      soloState.locked = true;
      const chosenText = soloState.options[index];
      const correct = chosenText === soloState.current.answer;

      const buttons = document.querySelectorAll("#soloOptions .soloOption");
      buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (soloState.options[i] === soloState.current.answer) btn.classList.add("correct");
        else if (i === index) btn.classList.add("wrong");
      });

      if (correct) {
        sfx("success");
        soloState.streak++;
        updateSoloHud();
        setTimeout(() => { if (soloState) nextSoloQuestion(); }, 900);
      } else {
        sfx("fail");
        setTimeout(() => { if (soloState) endSoloGame(); }, 1500);
      }
    }

    function updateSoloHud() {
      if (!soloState) return;
      const tier = soloTier();
      document.getElementById("soloStreak").innerText = soloState.streak;
      document.getElementById("soloBestInGame").innerText = getSoloBest();
      const chip = document.getElementById("soloTierChip");
      chip.innerText = tier.label;
      chip.style.color = tier.color;
      chip.style.borderColor = tier.color;
    }

    function endSoloGame() {
      if (!soloState) return;
      const finalScore = soloState.streak;
      const best = getSoloBest();
      const newRecord = finalScore > best;
      if (newRecord) setSoloBest(finalScore);

      document.getElementById("soloFinalScore").innerText = finalScore;
      document.getElementById("soloOverBest").innerText = "أفضل نتيجة: " + (newRecord ? finalScore : best);
      document.getElementById("soloNewRecord").classList.toggle("hidden", !newRecord);
      document.getElementById("soloOverEmoji").innerText = newRecord ? "👑" : "💥";

      soloState = null;
      showScreen("soloGameOverScreen");
      if (newRecord) {
        startConfetti();
        sfx("victory");
      }
    }

    function selectMode(mode) {
      lastModeRequested = mode;
      initializePlayerNamesScreen();
      showScreen("playerNamesScreen");
    }

    // ---- PLAYER NAMES ----
    function initializePlayerNamesScreen() {
      document.getElementById("playerInputsContainer").innerHTML = "";
      addPlayerInput(true);
      addPlayerInput(true);
      const addBtn = document.getElementById("addPlayerBtn");
      if (addBtn) addBtn.style.display = lastModeRequested === "thirty" ? "none" : "block";
    }

    function addPlayerInput(force) {
      if (lastModeRequested === "thirty" && !force) return; // Thirty Challenge is strictly 2 players
      const container = document.getElementById("playerInputsContainer");

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "أدخل اسم اللاعب";
      input.className = "playerInput";

      const wrapper = document.createElement("div");
      wrapper.className = "playerInputRow";

      const removeBtn = document.createElement("button");
      removeBtn.innerText = "إزالة";
      removeBtn.className = "removeBtn";
      removeBtn.style.display = "none";
      removeBtn.onclick = () => {
        wrapper.remove();
        updateRemoveButtonVisibility();
      };

      wrapper.appendChild(input);
      wrapper.appendChild(removeBtn);
      container.appendChild(wrapper);
      updateRemoveButtonVisibility();
    }

    function updateRemoveButtonVisibility() {
      const count = document.querySelectorAll("#playerInputsContainer input").length;
      document.querySelectorAll("#playerInputsContainer button").forEach(btn => {
        btn.style.display = count >= 3 ? "inline-block" : "none";
      });
    }

    function formTeams() {
      const inputs = [...document.querySelectorAll("#playerInputsContainer input")];
      const players = inputs.map(input => input.value.trim()).filter(Boolean);

      if (players.length < 2) { alert("الرجاء إدخال اسم لاعبين اثنين على الأقل"); return; }
      if (inputs.some(input => input.value.trim() === "")) {
        alert("يجب ملء جميع حقول الأسماء. احذف الحقول الفارغة أو أضف أسماء.");
        return;
      }

      if (isFFA() || lastModeRequested === "thirty") {
        if (lastModeRequested === "thirty") {
          if (players.length !== 2) {
            alert("تحدي الثلاثين يتطلب لاعبين اثنين فقط");
            return;
          }
          startThirtyFlow(players);
        } else {
          if (players.length > 8) { alert("الحد الأقصى 8 لاعبين"); return; }
          startFFAGame(players);
        }
        return;
      }

      if (players.length === 2) {
        teamPlayers = { 1: [players[0]], 2: [players[1]] };
        setTeams(players[0], players[1]);
        showGroupSelectionScreen();
        return;
      }

      startTeamRoulette(players);
    }

    function setTeams(name1, name2) {
      scores = { 1: 0, 2: 0 };
      teamNames = { 1: name1, 2: name2 };
      wickedEvents = { 1: [], 2: [] };
      currentTeamTurn = 1;
      document.getElementById("teamLabel1").innerText = name1;
      document.getElementById("teamLabel2").innerText = name2;
      document.getElementById("score1").innerText = "0";
      document.getElementById("score2").innerText = "0";
    }

    function startFFAGame(players) {
      scores = {};
      teamNames = {};
      wickedEvents = {};
      currentPlayerIndex = 0;
      players.forEach((player, index) => {
        scores[index] = 0;
        teamNames[index] = player;
        wickedEvents[index] = [];
      });
      updateFFAScoreboard();
      showGroupSelectionScreen();
    }

    function updateFFAScoreboard(sel = ".scores") {
      document.querySelector(sel).innerHTML = Object.keys(scores)
        .map(k => `<div class="scoreChip">${teamNames[k]}: <span>${scores[k]}</span></div>`)
        .join("");
    }

    function updateScoreboard() {
      document.getElementById("score1").innerText = scores[1];
      document.getElementById("score2").innerText = scores[2];
    }

    function updateScores() {
      if (isFFA()) updateFFAScoreboard();
      else updateScoreboard();
    }

    // ===================== TEAM ROULETTE =====================
    const ROULETTE_COLORS = ["#FFC93C", "#3DDBFF", "#FF8A3D", "#FF3D68", "#38E27D", "#9B7BFF", "#FF5C5C", "#2EE6C8"];
    let rouletteState = null;

    function startTeamRoulette(players) {
      teamPlayers = { 1: [], 2: [] };
      const t1 = Math.floor(players.length / 2);
      const t2 = players.length - t1;
      // Alternate target teams, starting with the bigger team (keeps balanced sizes)
      const targets = [];
      let team = t2 > t1 ? 2 : 1;
      for (let i = 0; i < players.length; i++) { targets.push(team); team = team === 1 ? 2 : 1; }

      rouletteState = {
        remaining: shuffleArray(players), targets, idx: 0,
        rot: Math.random() * Math.PI * 2, spinning: false, flashTimer: null, autoTimer: null
      };
      document.getElementById("teamAssignTitle").innerText = "عجلة الفرق";
      document.getElementById("roulettePanel").classList.remove("hidden");
      document.getElementById("teamsResultPanel").classList.add("hidden");
      showScreen("teamAssignmentScreen");
      setupRouletteCanvas();
      drawRoulette();
      updateRouletteHub();
    }

    function setupRouletteCanvas() {
      const canvas = document.getElementById("rouletteCanvas");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = 300 * dpr;
      canvas.height = 300 * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawRoulette() {
      const canvas = document.getElementById("rouletteCanvas");
      const ctx = canvas.getContext("2d");
      const cx = 150, cy = 150, R = 144;
      ctx.clearRect(0, 0, 300, 300);

      const players = rouletteState ? rouletteState.remaining : [];
      const n = players.length;
      if (n) {
        const seg = (Math.PI * 2) / n;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rouletteState.rot || 0);
        players.forEach((name, i) => {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, R, i * seg, (i + 1) * seg);
          ctx.closePath();
          ctx.fillStyle = ROULETTE_COLORS[i % ROULETTE_COLORS.length];
          ctx.fill();
          ctx.strokeStyle = "#0B0E1A";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.save();
          ctx.rotate(i * seg + seg / 2);
          ctx.fillStyle = "#0B0E1A";
          ctx.font = "700 13px Tajawal, sans-serif";
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(name.length > 11 ? name.slice(0, 10) + "…" : name, R - 12, 0);
          ctx.restore();
        });
        ctx.restore();
      }

      // Center hub
      ctx.beginPath();
      ctx.arc(cx, cy, 58, 0, Math.PI * 2);
      ctx.fillStyle = "#12162B";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#FFC93C";
      ctx.stroke();

      // Pointer (top, pointing down into the wheel)
      ctx.beginPath();
      ctx.moveTo(cx - 15, 4);
      ctx.lineTo(cx + 15, 4);
      ctx.lineTo(cx, 42);
      ctx.closePath();
      ctx.fillStyle = "#FFC93C";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0B0E1A";
      ctx.stroke();
    }

    function updateRouletteHub() {
      if (!rouletteState) return;
      const team = rouletteState.targets[rouletteState.idx];
      const hub = document.getElementById("rouletteHubTeam");
      hub.innerText = "الفريق " + team;
      hub.style.color = team === 1 ? "var(--team1)" : "var(--team2)";
      const status = document.getElementById("rouletteStatus");
      status.style.color = "var(--text-dim)";
      status.innerText = rouletteState.idx > 0
        ? "اختيار لاعب الفريق " + team + "…"
        : "اضغط لفّ لاختيار لاعب الفريق " + team;
      document.getElementById("rouletteSpinBtn").classList.remove("spinning");
    }

    function spinRoulette() {
      if (!rouletteState || rouletteState.spinning || !rouletteState.remaining.length) return;
      if (rouletteState.remaining.length === 1) {
        rouletteAssignLast(); // no need to spin for the last player
        return;
      }
      const state = rouletteState;
      clearTimeout(state.autoTimer); // user pressed manually -> cancel the auto-spin
      state.autoTimer = null;
      state.spinning = true;
      document.getElementById("rouletteSpinBtn").classList.add("spinning");
      document.getElementById("rouletteStatus").innerText = "…";
      sfx("bid");

      const n = state.remaining.length;
      const seg = (Math.PI * 2) / n;
      const chosenIdx = Math.floor(Math.random() * n);
      const startRot = state.rot;
      // End rotation so the chosen segment's center lands exactly under the pointer,
      // after at least 4 full extra spins
      const base = -Math.PI / 2 - chosenIdx * seg - seg / 2;
      const diff = ((startRot - base) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const targetRot = startRot - diff - 4 * Math.PI * 2;
      const DURATION = 3800;
      let nextTickRot = startRot - seg;

      const startTime = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
      const frame = now => {
        if (state !== rouletteState || !state.spinning) return;
        const t = Math.min(1, (now - startTime) / DURATION);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
        state.rot = startRot + (targetRot - startRot) * ease;
        while (state.rot <= nextTickRot) { sfx("tick"); nextTickRot -= seg; }
        drawRoulette();
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          state.rot = targetRot;
          rouletteLanded(chosenIdx);
        }
      };
      requestAnimationFrame(frame);
    }

    function rouletteLanded(chosenIdx) {
      const state = rouletteState;
      const player = state.remaining.splice(chosenIdx, 1)[0];
      const team = state.targets[state.idx];
      state.idx++;
      teamPlayers[team].push(player);
      state.spinning = false;
      sfx("success");

      const hub = document.getElementById("rouletteHubTeam");
      hub.innerText = "✓";
      hub.style.color = "#38E27D";
      const status = document.getElementById("rouletteStatus");
      status.style.color = team === 1 ? "var(--team1)" : "var(--team2)";
      status.innerText = player + " انضم إلى الفريق " + team;

      state.flashTimer = setTimeout(() => {
        if (state !== rouletteState) return;
        if (state.remaining.length > 1) {
          updateRouletteHub();
          drawRoulette();
          // auto-spin for the next player after a short pause
          state.autoTimer = setTimeout(() => {
            if (state === rouletteState) spinRoulette();
          }, 900);
        } else if (state.remaining.length === 1) {
          rouletteAssignLast();
        } else {
          showTeamsResult();
        }
      }, 1400);
    }

    // The last player left joins the next target team without spinning
    function rouletteAssignLast() {
      const state = rouletteState;
      if (!state || state.remaining.length !== 1) return;
      const player = state.remaining[0];
      const team = state.targets[state.idx];
      state.remaining = [];
      state.idx++;
      teamPlayers[team].push(player);
      sfx("success");

      const hub = document.getElementById("rouletteHubTeam");
      hub.innerText = "✓";
      hub.style.color = "#38E27D";
      const status = document.getElementById("rouletteStatus");
      status.style.color = team === 1 ? "var(--team1)" : "var(--team2)";
      status.innerText = player + " انضم إلى الفريق " + team;

      state.flashTimer = setTimeout(() => {
        if (state !== rouletteState) return;
        showTeamsResult();
      }, 1100);
    }

    function showTeamsResult() {
      document.getElementById("teamAssignTitle").innerText = "تم تكوين الفرق!";
      document.getElementById("roulettePanel").classList.add("hidden");
      document.getElementById("teamsResultPanel").classList.remove("hidden");
      document.getElementById("teamName1").innerText = "الفريق 1";
      document.getElementById("teamName2").innerText = "الفريق 2";
      renderPlayerList("teamList1", teamPlayers[1]);
      renderPlayerList("teamList2", teamPlayers[2]);
      sfx("victory");
    }

    function rouletteAgain() {
      if (!rouletteState) return;
      clearTimeout(rouletteState.flashTimer);
      clearTimeout(rouletteState.autoTimer);
      startTeamRoulette(teamPlayers[1].concat(teamPlayers[2]));
    }

    function showTeamAssignmentScreen() {
      if (rouletteState && rouletteState.remaining.length) {
        document.getElementById("teamAssignTitle").innerText = "عجلة الفرق";
        document.getElementById("roulettePanel").classList.remove("hidden");
        document.getElementById("teamsResultPanel").classList.add("hidden");
        showScreen("teamAssignmentScreen");
        setupRouletteCanvas();
        drawRoulette();
        updateRouletteHub();
      } else if (teamPlayers[1].length || teamPlayers[2].length) {
        showScreen("teamAssignmentScreen");
        showTeamsResult();
      } else {
        showScreen("playerNamesScreen");
      }
    }

    function renderPlayerList(listId, players) {
      document.getElementById(listId).innerHTML = players.map(player => `<li>${player}</li>`).join("");
    }

    function goBackFromPlayerNames() {
      if (lastModeRequested === "thirty") showScreen("typeMenu");
      else showScreen(isWickedMode() ? "modeMenuWicked" : "modeMenuNormal");
    }

    function startGameWithTeams() {
      setTeams(makeTeamName(pick(teamPlayers[1])), makeTeamName(pick(teamPlayers[2])));
      showGroupSelectionScreen();
    }

    // ---- QUESTION GROUPS ----
    function showGroupSelectionScreen() {
      selectedGroups = [];
      const container = document.getElementById("groupsContainer");
      container.innerHTML = "";
      document.getElementById("groupsHint").innerText = "اختر من مجموعتين الى ثمان مجموعات";

      const groupImages = {
        "الجغرافيا": "images/الجغرافيا.png",
        "الموسيقى": "images/الموسيقى.png",
        "الموسيقى العربية": "images/الموسيقى العربية.png",
        "التاريخ": "images/التاريخ.png",
        "الطب": "images/الطب.png",
        "كأس العالم": "images/كأس العالم.png",
        "الأفلام": "images/الأفلام.png",
        "الذكاء الاصطناعي": "images/الذكاء الاصطناعي.png",
        "الاكس بوكس": "images/الاكس بوكس.png",
        "الصيدلة": "images/الصيدلة.png",
        "الايفون": "images/الايفون.png",
        "القرآن الكريم": "images/القرآن الكريم.png",
        "سيرة الرسول": "images/سيرة الرسول.jpg"
      };

      allQuestionGroups.forEach(group => {
        const option = document.createElement("div");
        option.className = "groupOption";
        option.innerHTML = `
          <input type="checkbox" id="group-${group}" value="${group}" class="groupCheckbox">
          <label class="groupLabel" for="group-${group}">
            <img class="groupImage" src="${groupImages[group] || FALLBACK_IMG}" alt="${group}" onerror="this.onerror=null;this.src=FALLBACK_IMG">
            <span class="groupName">${group}</span>
          </label>`;
        option.querySelector("input").addEventListener("change", updateGroupsStartBar);
        container.appendChild(option);
      });

      document.getElementById("groupsStickyBar").classList.remove("hidden");
      showScreen("questionGroupsScreen");
      updateGroupsStartBar();
    }

    function updateGroupsStartBar() {
      const selectedCount = document.querySelectorAll("#groupsContainer input[type='checkbox']:checked").length;
      document.getElementById("groupsStickyBar").classList.toggle("visible", selectedCount >= effectiveMinGroups());
    }

    function startGameWithSelectedGroups() {
      selectedGroups = [...document.querySelectorAll("#groupsContainer input[type='checkbox']:checked")].map(cb => cb.value);
      const minGroups = effectiveMinGroups();
      if (selectedGroups.length < minGroups) { alert(`الرجاء اختيار ${minGroups} مجموعات على الأقل`); return; }
      if (selectedGroups.length > MAX_GROUPS) { alert(`الرجاء اختيار ${MAX_GROUPS} مجموعات كحد أقصى`); return; }
      showScreen("gameScreen");
      buildBoard();
      updateTurnBanner();
    }

    function goBackFromGroups() {
      const oneOnOne = teamPlayers[1].length === 1 && teamPlayers[2].length === 1;
      if (oneOnOne) showScreen("playerNamesScreen");
      else showTeamAssignmentScreen();
    }

    function isArabic(text) { return /[؀-ۿ]/.test(text); }

    // Team name from a player name: "فريق أحمد" for Arabic, "Ahmed's Team" for Latin names
    function makeTeamName(player) {
      return isArabic(player) ? "فريق " + player : player + "'s Team";
    }

    function shuffleArray(array) {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function updateTurnBanner() {
      const banner = document.getElementById("turnBanner");
      if (isFFA()) {
        const name = teamNames[currentPlayerIndex];
        banner.innerText = isArabic(name) ? "دور " + name + " ليختار فئة" : name;
        banner.className = "";
      } else {
        const name = teamNames[currentTeamTurn];
        banner.innerText = isArabic(name) ? "دور " + name + " ليختار فئة" : name + "'s turn to pick a category";
        banner.className = currentTeamTurn === 1 ? "team1turn" : "team2turn";
      }
    }

    // ---- GAME BOARD ----
    function buildBoard() {
      const pool = questions.filter(q => selectedGroups.includes(q.group));
      shuffledCategories = shuffleArray([...new Set(pool.map(q => q.group))].filter(Boolean));

      const head = shuffledCategories.map(group => `<th>${group}</th>`).join("");
      const rows = [100, 200, 300, 400, 500].map(points =>
        `<tr>${shuffledCategories.map(group =>
          `<td class="cell" id="cell-${group}-${points}" onclick="selectQuestion('${group}', ${points})">${points}</td>`
        ).join("")}</tr>`
      ).join("");

      document.getElementById("board").innerHTML = `<table><tr>${head}</tr>${rows}</table>`;
    }

    function selectQuestion(group, points) {
      if (actionLocked) return;
      actionLocked = true;
      currentRoundId++;
      roundPhase = "picking";

      const pool = questions.filter(q => selectedGroups.includes(q.group) && q.group === group && q.points === points);
      if (!pool.length) { actionLocked = false; return; }

      const chosen = pool[Math.floor(Math.random() * pool.length)];
      if (chosen.isRandomized && chosen.questions) {
        const rq = chosen.questions[Math.floor(Math.random() * chosen.questions.length)];
        currentQuestion = { group: chosen.group, points: chosen.points, question: rq.template, answer: rq.answer };
      } else {
        currentQuestion = chosen;
      }

      currentEvent = null;
      isTeamBTurn = false;

      document.getElementById("board").style.display = "none";
      document.querySelector(".scores").style.display = "none";
      document.getElementById("turnBanner").style.display = "none";

      document.getElementById("questionBox").innerText = currentQuestion.question;
      document.getElementById("answerBox").innerText = "";
      document.getElementById(`cell-${group}-${points}`).classList.add("used");

      if (isFFA()) {
        answeringPlayer = currentPlayerIndex;
        document.getElementById("teamButtons").style.display = "none";
      } else {
        answeringTeam = currentTeamTurn;
        if (HOST_MODES.includes(lastModeRequested)) showHostPeekButton();
        else document.getElementById("teamButtons").style.display = "none";
      }

      document.getElementById("skipBtn").style.display = "inline";
      startTimer(getSetting(SETTINGS.timer.key, SETTINGS.timer.def));
    }

    function showHostPeekButton() {
      const buttons = document.getElementById("teamButtons");
      buttons.innerHTML = `<button class="teamBtn" onclick="hostReveal()">كشف الاجابة (المضيف فقط)</button>`;
      buttons.style.display = "block";
    }

    function hostReveal() {
      const roundAtClick = currentRoundId;
      document.getElementById("teamButtons").innerHTML = `<div class="peekAnswer">الإجابة: ${currentQuestion.answer}</div>`;
      setTimeout(() => {
        if (currentRoundId === roundAtClick && roundPhase === "picking") showHostPeekButton();
      }, 10000);
    }

    // ---- TIMER ----
    function startTimer(seconds) {
      clearInterval(timerInterval);
      mainTimerActive = true;
      timeLeft = seconds;
      updateTimerDisplay();
      timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          sfx("timeUp");
          handleTimeUp();
        } else if (timeLeft <= 5) {
          sfx("tick");
        }
      }, 1000);
    }

    function skipTimer() {
      clearInterval(timerInterval);
      handleTimeUp();
    }

    function handleTimeUp() {
      mainTimerActive = false;
      if (isFFA()) {
        revealAnswer();
      } else if (!isTeamBTurn) {
        isTeamBTurn = true;
        answeringTeam = currentTeamTurn === 1 ? 2 : 1;
        startTimer(30);
      } else {
        revealAnswer();
      }
    }

    function updateTimerDisplay() {
      const name = isFFA() ? teamNames[answeringPlayer] : teamNames[answeringTeam];
      const box = document.getElementById("timerBox");
      box.innerText = "⏱ " + timeLeft + " ثانية — " + name + " يجيب";
      box.classList.toggle("urgent", timeLeft <= 10);
    }

    // ---- JUDGING / SCORING ----
    function revealAnswer() {
      roundPhase = "judging";
      document.getElementById("timerBox").innerText = "";
      document.getElementById("skipBtn").style.display = "none";
      document.getElementById("answerBox").innerText = "الإجابة: " + currentQuestion.answer;

      const buttons = document.getElementById("teamButtons");
      buttons.innerHTML = isFFA()
        ? `<button class="teamBtn" onclick="awardPoints(currentPlayerIndex)">صحيح</button>
           <button class="teamBtn" onclick="noOneCorrect()">خطأ</button>`
        : `<button class="teamBtn" onclick="awardPoints(1)">${teamNames[1]} صحيح</button>
           <button class="teamBtn" onclick="awardPoints(2)">${teamNames[2]} صحيح</button>
           <button class="teamBtn" onclick="noOneCorrect()">لا أحد</button>`;
      buttons.style.display = "block";
    }

    function awardPoints(targetKey) {
      if (roundPhase !== "judging") return; // ignore stray taps after the question was judged
      lastAnsweringTeam = targetKey;
      currentEvent = shouldTriggerEvent(currentQuestion.points) ? getRandomEvent(targetKey) : null;

      const pts = currentQuestion.points;
      if (currentEvent === "doublePoints") {
        scores[targetKey] += pts * 2;
      } else if (currentEvent === "myTurnBitch") {
        scores[targetKey] += pts;
        forceSameTeamTurn = true;
      } else if (currentEvent === "pointsDeduction") {
        scores[targetKey] -= pts;
      } else if (currentEvent === "pointsTransferring") {
        const other = isFFA() ? (targetKey + 1) % Object.keys(scores).length : (targetKey === 1 ? 2 : 1);
        scores[other] += pts;
        lastAnsweringTeam = other;
      } else if (currentEvent !== "noPoints") {
        scores[targetKey] += pts;
      }

      updateScores();
      if (currentEvent === "pointsDeduction" || currentEvent === "pointsTransferring" || currentEvent === "noPoints") {
        sfx("fail");
      } else {
        sfx("success");
      }
      nextAfterAnswer();
    }

    function noOneCorrect() {
      if (roundPhase !== "judging") return; // ignore stray taps after the question was judged
      lastAnsweringTeam = null;
      const key = isFFA() ? currentPlayerIndex : answeringTeam;
      currentEvent = shouldTriggerEvent(currentQuestion.points) ? getGotYouuuEvent(key) : null;
      if (currentEvent === "gotYouuu") {
        scores[key] += currentQuestion.points;
        lastAnsweringTeam = key;
        updateScores();
      } else {
        sfx("fail");
      }
      nextAfterAnswer();
    }

    function nextAfterAnswer() {
      roundPhase = "closing"; // lock the scoring buttons once the question is judged
      const advance = () => {
        markQuestionAsUsed();
        if (!checkGameEnd()) {
          moveToNext();
          showBoardAfterDelay();
        }
      };
      if (currentEvent) {
        document.getElementById("teamButtons").style.display = "none";
        document.getElementById("answerBox").innerHTML += "<br><br><strong>" + displayEvent(currentEvent) + "</strong>";
        if (["doublePoints", "myTurnBitch", "gotYouuu"].includes(currentEvent)) sfx("event");
        setTimeout(advance, 5000);
      } else {
        advance();
      }
    }

    function showBoardAfterDelay() {
      document.getElementById("board").style.display = "block";
      document.querySelector(".scores").style.display = "flex";
      document.getElementById("turnBanner").style.display = "block";
    }

    function markQuestionAsUsed() {
      const cell = document.getElementById(`cell-${currentQuestion.group}-${currentQuestion.points}`);
      if (cell) {
        cell.classList.add("used");
        cell.onclick = null;
        if (lastAnsweringTeam !== null && lastAnsweringTeam !== undefined) {
          cell.innerText = teamNames[lastAnsweringTeam];
        }
      }
    }

    function moveToNext() {
      document.getElementById("timerBox").innerText = "";
      document.getElementById("skipBtn").style.display = "none";
      document.getElementById("teamButtons").style.display = "none";

      if (!forceSameTeamTurn) {
        if (isFFA()) currentPlayerIndex = (currentPlayerIndex + 1) % Object.keys(scores).length;
        else currentTeamTurn = currentTeamTurn === 1 ? 2 : 1;
      }
      forceSameTeamTurn = false;
      isTeamBTurn = false;
      actionLocked = false;

      updateTurnBanner();
      document.getElementById("questionBox").innerText = "";
      document.getElementById("answerBox").innerText = "";
    }

    // ---- END GAME ----
    function checkGameEnd() {
      const total = document.querySelectorAll("#board td.cell").length;
      const used = document.querySelectorAll("#board td.cell.used").length;
      if (total > 0 && used >= total) {
        endGame();
        return true;
      }
      return false;
    }

    function endGame() {
      if (gameEnded) return;
      gameEnded = true;
      clearInterval(timerInterval);
      document.getElementById("teamButtons").style.display = "none";
      document.getElementById("skipBtn").style.display = "none";
      document.getElementById("timerBox").innerText = "";

      const entries = Object.keys(scores)
        .map(key => ({ name: teamNames[key], points: scores[key] }))
        .sort((a, b) => b.points - a.points);
      const top = entries[0].points;
      const winners = entries.filter(entry => entry.points === top);
      const tie = winners.length > 1;

      document.getElementById("winnerLabel").innerText = tie ? "🤝 تعادل!" : "🏆 الفائز";
      document.getElementById("winnerName").innerText = tie ? winners.map(w => w.name).join(" و ") : winners[0].name;
      document.getElementById("winnerPoints").innerText = top + " نقطة";
      document.getElementById("finalStandings").innerHTML = entries.map((entry, index) =>
        `<div class="standingRow${entry.points === top ? " winnerRow" : ""}">` +
        `<span class="standingName">${MEDALS[index] || (index + 1) + "."} ${entry.name}</span>` +
        `<span class="standingPoints">${entry.points}</span></div>`
      ).join("");

      showScreen("endGameScreen");
      startConfetti();
      sfx("victory");
    }

    function resetGameState() {
      scores = { 1: 0, 2: 0 };
      teamNames = { 1: "الفريق 1", 2: "الفريق 2" };
      teamPlayers = { 1: [], 2: [] };
      currentPlayerIndex = 0;
      currentTeamTurn = 1;
      wickedEvents = { 1: [], 2: [] };
      currentQuestion = null;
      currentEvent = null;
      forceSameTeamTurn = false;
      isTeamBTurn = false;
      lastAnsweringTeam = null;
      lastModeRequested = null;
      actionLocked = false;
      gameEnded = false;
      mainTimerActive = false;
      mainTimerPaused = false;
      thirtyTimerActive = false;
      thirtyTimerPaused = false;
      clearInterval(timerInterval);
      clearInterval(thirtyTimer);
      thirtyState = null;
      thirtySelectedCategories = [];
      rouletteState = null;
      soloState = null;
      hideThirtyAnswers();
      stopConfetti();
      document.getElementById("board").innerHTML = "";
    }

    function playAgain() {
      const mode = lastModeRequested;
      resetGameState();
      if (mode === "thirty") showScreen("typeMenu");
      else showScreen(mode && mode.includes("wicked") ? "modeMenuWicked" : "modeMenuNormal");
    }

    function goToMainMenu() {
      resetGameState();
      showScreen("startMenu");
    }

    // ===================== THIRTY CHALLENGE (تحدي الثلاثين) =====================
    let thirtyQuestions = [];
    let thirtyState = null;
    let thirtyTimer = null;
    let thirtyTimeLeft = 0;
    let thirtyTimerActive = false;
    let thirtyTimerPaused = false;
    let thirtySelectedCategories = [];

    const THIRTY_CATEGORY_EMOJIS = {
      "اسلاميات": "🕌",
      "جغرافية": "🌍",
      "كرة قدم اوروبية وكأس العالم": "⚽",
      "العاب الفيديو": "🎮",
      "منوعات": "🎲"
    };

    // Category card images: put these files in the "images/" folder next to index.html.
    // If a file is missing, the card falls back to the built-in ⭐ tile automatically.
    const THIRTY_CATEGORY_IMAGES = {
      "اسلاميات": "images/thirty/اسلاميات.png",
      "جغرافية": "images/thirty/الجغرافيا.png",
      "كرة قدم اوروبية وكأس العالم": "images/thirty/كرة قدم اوروبية وكأس العالم.png",
      "العاب الفيديو": "images/thirty/العاب الفيديو.png",
      "منوعات": "images/thirty/منوعات.png"
    };

    fetch("thirty-categories.json")
      .then(res => res.json())
      .then(data => { thirtyQuestions = data; });

    function showThirtyChallenge() {
      lastModeRequested = "thirty";
      initializePlayerNamesScreen();
      showScreen("playerNamesScreen");
    }

    function startThirtyFlow(players) {
      scores = {};
      teamNames = {};
      wickedEvents = {};
      currentPlayerIndex = 0;
      players.forEach((player, index) => {
        scores[index] = 0;
        teamNames[index] = player;
        wickedEvents[index] = [];
      });
      updateFFAScoreboard("#thirtyScores");
      const rounds = getSetting(SETTINGS.rounds.key, SETTINGS.rounds.def);
      document.getElementById("thirtyRoundsRule").innerText =
        "🔟 " + rounds + " جولات، في كل جولة سؤال جديد";
      showScreen("thirtyRulesScreen");
    }

    function showThirtyCategoryScreen() {
      if (!thirtyQuestions.length) {
        alert("لم يتم تحميل أسئلة التحدي (thirty-categories.json)");
        return;
      }
      const container = document.getElementById("thirtyCatContainer");
      container.innerHTML = "";
      const categories = [...new Set(thirtyQuestions.map(q => q.category))].filter(Boolean);

      categories.forEach((category, index) => {
        const inputId = "thirtyCat-" + index;
        const option = document.createElement("div");
        option.className = "groupOption";
        option.innerHTML = `
          <input type="radio" name="thirtyCategory" id="${inputId}" value="${category}" class="groupCheckbox">
          <label class="groupLabel" for="${inputId}">
            <img class="groupImage" src="${THIRTY_CATEGORY_IMAGES[category] || FALLBACK_IMG}" alt="${category}" onerror="this.onerror=null;this.src=FALLBACK_IMG">
            <span class="groupName">${THIRTY_CATEGORY_EMOJIS[category] || "🎯"} ${category}</span>
          </label>`;
        option.querySelector("input").addEventListener("change", updateThirtyStartBar);
        container.appendChild(option);
      });

      document.getElementById("thirtyStickyBar").classList.remove("hidden");
      showScreen("thirtyCategoryScreen");
      updateThirtyStartBar();
    }

    function updateThirtyStartBar() {
      const count = document.querySelectorAll("#thirtyCatContainer input:checked").length;
      document.getElementById("thirtyStickyBar").classList.toggle("visible", count >= 1);
    }

    function startThirtyGame() {
      thirtySelectedCategories = [...document.querySelectorAll("#thirtyCatContainer input:checked")]
        .map(cb => cb.value);
      if (!thirtySelectedCategories.length) {
        alert("الرجاء اختيار فئة واحدة");
        return;
      }
      const pool = thirtyQuestions.filter(q => thirtySelectedCategories.includes(q.category));
      if (!pool.length) {
        alert("لا توجد أسئلة في الفئة المختارة");
        return;
      }
      const maxRounds = getSetting(SETTINGS.rounds.key, SETTINGS.rounds.def);
      const rounds = shuffleArray(pool).slice(0, Math.min(maxRounds, pool.length));
      thirtyState = { questions: rounds, round: 0 };
      showScreen("thirtyGameScreen");
      nextThirtyRound();
    }

    function nextThirtyRound() {
      if (!thirtyState) return;
      if (thirtyState.round >= thirtyState.questions.length) {
        endGame();
        return;
      }
      const question = thirtyState.questions[thirtyState.round];
      document.getElementById("thirtyRoundLabel").innerText =
        `الجولة ${thirtyState.round + 1} / ${thirtyState.questions.length}`;
      document.getElementById("thirtyQuestionBox").innerText = question.question;
      hideThirtyAnswers();

      // Auction setup: rotate the opening bidder every round
      const playerCount = Object.keys(scores).length;
      const order = [];
      for (let i = 0; i < playerCount; i++) order.push((thirtyState.round + i) % playerCount);
      thirtyState.auction = { order, turn: 0, currentBid: 0, bidder: null, active: [...order] };

      setThirtyPhase("auction");
      renderThirtyAuction();
    }

    function setThirtyPhase(phase) {
      thirtyState.phase = phase;
      document.getElementById("thirtyAuctionPanel").classList.toggle("hidden", phase !== "auction");
      document.getElementById("thirtyChallengePanel").classList.toggle("hidden", !["intro", "challenge"].includes(phase));
      document.getElementById("thirtyResultBanner").classList.toggle("hidden", phase !== "result");
    }

    function renderThirtyAuction() {
      const auction = thirtyState.auction;
      const firstBid = auction.currentBid === 0;
      document.getElementById("thirtyBidValue").innerText = firstBid ? "—" : auction.currentBid;
      document.getElementById("thirtyTurnName").innerText = "دور: " + teamNames[auction.order[auction.turn]];
      document.getElementById("thirtyFoldBtn").style.display = firstBid ? "none" : "inline-block";
    }

    function thirtyAuctionAdvance() {
      const auction = thirtyState.auction;
      let turn = auction.turn;
      do { turn = (turn + 1) % auction.order.length; } while (!auction.active.includes(auction.order[turn]));
      auction.turn = turn;
    }

    function thirtyRaise(amount) {
      sfx("bid");
      const auction = thirtyState.auction;
      auction.currentBid += amount;
      auction.bidder = auction.order[auction.turn];
      thirtyAuctionAdvance();
      if (auction.active.length === 1) thirtyChallengeIntro(auction.active[0], auction.currentBid);
      else renderThirtyAuction();
    }

    function thirtyFold() {
      const auction = thirtyState.auction;
      if (auction.currentBid === 0) return; // opening bidder must bid
      auction.active = auction.active.filter(key => key !== auction.order[auction.turn]);
      if (auction.active.length === 1) {
        thirtyChallengeIntro(auction.active[0], auction.currentBid);
      } else {
        thirtyAuctionAdvance();
        renderThirtyAuction();
      }
    }

    function thirtyChallengeIntro(player, bid) {
      thirtyState.challenge = { player, bid, count: 0 };
      setThirtyPhase("intro");
      document.getElementById("thirtyChallengeWho").innerText = "المتحدي: " + teamNames[player];
      document.getElementById("thirtyChallengeBid").innerText =
        "عليه أن يذكر " + bid + " إجابات صحيحة خلال 30 ثانية";
      document.getElementById("thirtyChallengeStartBtnWrap").classList.remove("hidden");
      document.getElementById("thirtyChallengeLive").classList.add("hidden");
    }

    function beginThirtyChallenge() {
      setThirtyPhase("challenge");
      document.getElementById("thirtyChallengeStartBtnWrap").classList.add("hidden");
      document.getElementById("thirtyChallengeLive").classList.remove("hidden");
      thirtyState.challenge.count = 0;
      updateThirtyChallengeDisplay();
      startThirtyTimer(30);
    }

    function startThirtyTimer(seconds) {
      clearInterval(thirtyTimer);
      thirtyTimerActive = true;
      let left = seconds;
      thirtyTimeLeft = seconds;
      const box = document.getElementById("thirtyTimerBox");
      const render = () => {
        box.innerText = "⏱ " + left;
        box.classList.toggle("urgent", left <= 5);
      };
      render();
      thirtyTimer = setInterval(() => {
        left--;
        thirtyTimeLeft = left;
        render();
        if (left <= 0) {
          clearInterval(thirtyTimer);
          sfx("timeUp");
          thirtyTimeUp();
        } else if (left <= 5) {
          sfx("tick");
        }
      }, 1000);
    }

    function updateThirtyChallengeDisplay() {
      const challenge = thirtyState.challenge;
      document.getElementById("thirtyCountBox").innerText = `${challenge.count} / ${challenge.bid}`;
      const pct = Math.min(100, Math.round((challenge.count / challenge.bid) * 100));
      document.getElementById("thirtyProgressFill").style.width = pct + "%";
    }

    function thirtyTapCorrect() {
      if (thirtyState.phase !== "challenge") return;
      sfx("tap");
      const challenge = thirtyState.challenge;
      challenge.count++;
      updateThirtyChallengeDisplay();
      if (challenge.count >= challenge.bid) thirtyChallengeSuccess();
    }

    function thirtyUndo() {
      if (thirtyState.phase !== "challenge") return;
      thirtyState.challenge.count = Math.max(0, thirtyState.challenge.count - 1);
      updateThirtyChallengeDisplay();
    }

    function thirtyEndEarly() {
      if (thirtyState.phase !== "challenge") return;
      clearInterval(thirtyTimer);
      thirtyChallengeFail();
    }

    function thirtyTimeUp() {
      if (thirtyState.phase !== "challenge") return;
      thirtyTimerActive = false;
      thirtyChallengeFail();
    }

    function thirtyChallengeSuccess() {
      clearInterval(thirtyTimer);
      thirtyTimerActive = false;
      sfx("success");
      const challenge = thirtyState.challenge;
      scores[challenge.player] += challenge.bid;
      updateFFAScoreboard("#thirtyScores");
      showThirtyResult(`🎉 نجح ${teamNames[challenge.player]}! +${challenge.bid} نقطة`, false);
    }

    function thirtyChallengeFail() {
      thirtyTimerActive = false;
      sfx("fail");
      const challenge = thirtyState.challenge;
      showThirtyResult(`❌ انتهى الوقت! ${teamNames[challenge.player]} لم يصل إلى ${challenge.bid}`, true);
    }

    function showThirtyResult(text, failed) {
      setThirtyPhase("result");
      const banner = document.getElementById("thirtyResultBanner");
      banner.className = failed ? "thirtyResult fail" : "thirtyResult success";
      document.getElementById("thirtyResultText").innerText = text;
      setTimeout(() => {
        if (thirtyState && thirtyState.phase === "result") {
          thirtyState.round++;
          nextThirtyRound();
        }
      }, 3000);
    }

    function toggleThirtyAnswers() {
      const list = document.getElementById("thirtyAnswersList");
      const opening = list.classList.contains("hidden");
      list.classList.toggle("hidden");
      document.getElementById("thirtyShowAnswersBtn").innerText = opening ? "إخفاء الإجابات" : "عرض الإجابات";
      if (opening) {
        const question = thirtyState.questions[thirtyState.round];
        list.innerHTML = (question.note ? `<div class="thirtyNote">📌 ${question.note}</div>` : "") +
          question.answers
            .map(a => `<span class="thirtyAnswerChip">${a.split("|").join(" / ")}</span>`)
            .join("");
      }
    }

    function hideThirtyAnswers() {
      const list = document.getElementById("thirtyAnswersList");
      list.classList.add("hidden");
      list.innerHTML = "";
      document.getElementById("thirtyShowAnswersBtn").innerText = "عرض الإجابات";
    }

    // ===================== SOUND EFFECTS (Web Audio, no files needed) =====================
    let soundOn = true;
    try { soundOn = localStorage.getItem("triviatySound") !== "off"; } catch (e) {}
    let audioCtx = null;

    function ensureAudio() {
      if (!soundOn) return null;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        return audioCtx;
      } catch (e) { return null; }
    }

    function tone(freq, duration, opts = {}) {
      const ctx = ensureAudio();
      if (!ctx) return;
      const { type = "sine", gain = 0.12, delay = 0, slideTo = null } = opts;
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    }

    function sfx(name) {
      if (!soundOn) return;
      switch (name) {
        case "click": tone(600, 0.05, { type: "square", gain: 0.05 }); break;
        case "tap": tone(880, 0.06, { type: "triangle", gain: 0.12 }); break;
        case "tick": tone(1200, 0.03, { type: "sine", gain: 0.08 }); break;
        case "bid": tone(500, 0.09, { type: "square", gain: 0.08, slideTo: 750 }); break;
        case "timeUp": tone(300, 0.5, { type: "sawtooth", gain: 0.1, slideTo: 120 }); break;
        case "success": [523, 659, 784].forEach((f, i) => tone(f, 0.15, { type: "triangle", gain: 0.14, delay: i * 0.09 })); break;
        case "fail": [330, 262, 196].forEach((f, i) => tone(f, 0.2, { type: "sawtooth", gain: 0.1, delay: i * 0.12 })); break;
        case "event": tone(400, 0.35, { type: "square", gain: 0.09, slideTo: 800 }); break;
        case "victory": [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.15, delay: i * 0.13 })); break;
      }
    }

    function toggleSound() {
      soundOn = !soundOn;
      try { localStorage.setItem("triviatySound", soundOn ? "on" : "off"); } catch (e) {}
      if (soundOn) sfx("success");
    }

    // One delegated listener gives every UI button a click sound
    if (document.addEventListener) {
      document.addEventListener("click", function (e) {
        if (!soundOn || !e.target.closest) return;
        if (e.target.closest(".menuBtn, .teamBtn, .backBtn, .thirtyFoldBtn, .thirtySmallBtn")) sfx("click");
      });
    }

    // ---- CONFETTI ----
    function resizeConfettiCanvas() {
      const canvas = document.getElementById("confettiCanvas");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnConfetti(count) {
      for (let i = 0; i < count; i++) {
        confettiParticles.push({
          x: Math.random() * window.innerWidth,
          y: -20 - Math.random() * window.innerHeight * 0.5,
          size: 6 + Math.random() * 7,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          vx: -1.6 + Math.random() * 3.2,
          vy: 2 + Math.random() * 3.5,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: -0.18 + Math.random() * 0.36,
          shape: Math.random() < 0.55 ? "rect" : "circle"
        });
      }
    }

    function confettiLoop() {
      if (!confettiRunning) return;
      const canvas = document.getElementById("confettiCanvas");
      const ctx = canvas.getContext("2d");
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      if (Date.now() < confettiSpawnUntil) spawnConfetti(5);

      confettiParticles = confettiParticles.filter(p => p.y < h + 50);
      confettiParticles.forEach(p => {
        p.x += p.vx + Math.sin(p.y * 0.02) * 0.6;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 1.4, p.size, p.size / 1.4);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      if (confettiParticles.length > 0 || Date.now() < confettiSpawnUntil) {
        confettiAnimId = requestAnimationFrame(confettiLoop);
      } else {
        confettiRunning = false;
        ctx.clearRect(0, 0, w, h);
      }
    }

    function startConfetti() {
      stopConfetti();
      resizeConfettiCanvas();
      confettiRunning = true;
      confettiSpawnUntil = Date.now() + 4500;
      spawnConfetti(120);
      confettiAnimId = requestAnimationFrame(confettiLoop);
    }

    function stopConfetti() {
      confettiRunning = false;
      confettiParticles = [];
      if (confettiAnimId) {
        cancelAnimationFrame(confettiAnimId);
        confettiAnimId = null;
      }
      const ctx = document.getElementById("confettiCanvas").getContext("2d");
      ctx.clearRect(0, 0, document.getElementById("confettiCanvas").width, document.getElementById("confettiCanvas").height);
    }

    window.addEventListener("resize", function() {
      if (confettiRunning) resizeConfettiCanvas();
    });

    // Install as an app (works on https or localhost; fails silently otherwise).
    // When a NEW version of the app is cached, reload once automatically so
    // players never get stuck on an old version.
    if ("serviceWorker" in navigator) {
      // The ?v= query forces the browser AND CDNs to fetch a fresh sw.js on update
      navigator.serviceWorker.register("sw.js?v=10").catch(() => {});
      try {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!sessionStorage.getItem("triviatyReloaded")) {
            sessionStorage.setItem("triviatyReloaded", "1");
            location.reload();
          }
        });
      } catch (e) {}
    }
