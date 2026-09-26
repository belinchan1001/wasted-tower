
(function () {
  'use strict';

  var T = window.TOWER;
  var app = document.getElementById('app');

  // ------------------------------------------------------------ dom helpers
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function sign(n) { return (n >= 0 ? '+' : '−') + Math.abs(n); }

  // -------------------------------------------------- startup loader/validator
  // Refuses to start when the embedded data is wrong, with a clear message.
  var problems = [];
  if (typeof ADVENTURES !== 'object' || !ADVENTURES) {
    problems.push('找不到冒險資料區塊（ADVENTURES）。');
  } else {
    Object.keys(ADVENTURES).forEach(function (id) {
      var r = T.validateAdventure(ADVENTURES[id]);
      if (!r.ok) r.errors.forEach(function (m) { problems.push('【' + id + '】' + m); });
    });
    if (!ADVENTURES[DEFAULT_ADVENTURE_ID]) {
      problems.push('找不到預設冒險「' + DEFAULT_ADVENTURE_ID + '」。');
    }
  }

  function renderFatal(list) {
    clear(app);
    var box = el('div', 'fatal');
    box.appendChild(el('h1', null, '冒險資料有問題，無法開始'));
    box.appendChild(el('p', null, '啟動檢查在腳本資料中找到以下問題，請修正 data/wasted_tower.js 後重新載入：'));
    var ul = el('ul');
    list.forEach(function (m) { ul.appendChild(el('li', null, m)); });
    box.appendChild(ul);
    app.appendChild(box);
  }

  if (problems.length) { renderFatal(problems); return; }

  var adventure = ADVENTURES[DEFAULT_ADVENTURE_ID];

  function resumeLine(save) {
    var sc = null;
    var i;
    var scenes = (adventure && adventure.scenes) || [];
    for (i = 0; i < scenes.length; i++) {
      if (scenes[i].id === save.sceneId) sc = scenes[i];
    }
    var place = (sc && (sc.place || sc.name)) || '廢塔';
    var n = 0;
    var bag = (save.character && save.character.inventory) || [];
    var items = (adventure && adventure.items) || [];
    bag.forEach(function (id) {
      var it = null;
      var j;
      for (j = 0; j < items.length; j++) if (items[j].id === id) it = items[j];
      if (it && it.kind === 'consumable' && it.name && it.name.indexOf('藥水') >= 0) n++;
    });
    return '你在〔' + place + '〕醒來，身上還有〔' + n + ' 瓶藥水〕。繼續？';
  }

  function browserStorage() {
    try {
      var ls = window.localStorage;
      var probe = T.PREVIEW_STORAGE_KEYS.probe;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- state
  var engine = null;
  var logEl = null, statusEl = null, actionsEl = null;
  var trayMode = null; // null | 'items' | 'moves' | 'export' | 'attack' | {slot:n} | {featureId:id} | {confirmId:id}
  var openGroups = { everyday: true, big: false, rescue: false, passive: true };
  var openBadge = null;
  var slot = new T.SaveSlot(browserStorage(), T.PREVIEW_STORAGE_KEYS.save);
  var saveNote = '';
  var endingCanvas = null;
  var revealCode = false;

  function autosave() {
    if (!engine || engine.status === 'idle' || !engine.character) return;
    var data = engine.exportSave();
    if (!data) return;
    var code;
    try { code = T.encodeSaveCode(data); }
    catch (e) { saveNote = '無法建立存檔碼。'; return; }
    var res = slot.write(code);
    saveNote = res.ok ? '' : res.error;
  }

  function downloadEnding() {
    if (!endingCanvas) return;
    var filename = 'wasted-tower-ending.png';
    function saveUrl(url) {
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    if (endingCanvas.toBlob) {
      endingCanvas.toBlob(function (blob) {
        if (!blob) { saveUrl(endingCanvas.toDataURL('image/png')); return; }
        var url = URL.createObjectURL(blob);
        saveUrl(url);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      }, 'image/png');
    } else {
      saveUrl(endingCanvas.toDataURL('image/png'));
    }
  }

  function beginFromEngine(eng) {
    engine = eng;
    endingCanvas = null;
    renderPlayShell();
    trayMode = null;
    (engine.rollLog || []).forEach(function (entry) {
      appendLines((entry.lines || []).map(function (text) { return { tone: 'roll', text: text }; }));
    });
    handle(engine.resumeView());
  }

  // ---------------------------------------------------------- select screen
  function renderSelect() {
    clear(app);
    trayMode = null;
    var wrap = el('div', 'wrap');

    var hero = el('div', 'hero');
    hero.appendChild(el('h1', null, adventure.title));
    hero.appendChild(el('p', 'sub', '單人一場．無需主持人．約 15–20 分鐘'));
    hero.appendChild(el('p', 'lead', '規則由程式判定：骰子、生命、物品、勝負全部由引擎結算，敘述只負責把結果講出來。進度會自動存在這台裝置；也可以匯出存檔碼，免得瀏覽器清掉記錄。每層結束可以先歇一歇。'));
    wrap.appendChild(hero);

    var saveCard = el('div', 'card save-card');
    saveCard.appendChild(el('h2', null, '存檔欄'));
    var stored = slot.read();
    var preview = null;
    if (!slot.storage) {
      saveCard.appendChild(el('p', 'save-error', '這台裝置不能寫入本機存檔。請用下面的匯入／匯出存檔碼。'));
    } else if (!stored) {
      saveCard.appendChild(el('p', 'save-note', '還沒有進度。開始之後會自動寫入這個欄位。'));
    } else {
      var decoded = T.decodeSaveCode(stored);
      if (!decoded.ok) {
        saveCard.appendChild(el('p', 'save-error', decoded.error));
      } else {
        preview = decoded.save;
        var who = (preview.character && preview.character.name) ? (preview.character.name + '　·　' + (preview.character.cls || '')) : '已儲存的進度';
        saveCard.appendChild(el('p', 'kv', who));
        saveCard.appendChild(el('p', 'save-note', resumeLine(preview)));
        var saveRow = el('div', 'row');
        saveRow.appendChild(button('繼續上次的進度', '從停下的地方接著玩', 'primary', function () {
          var loaded = T.loadGame(adventure, stored);
          if (!loaded.ok) { saveNote = loaded.error; renderSelect(); return; }
          saveNote = '';
          beginFromEngine(loaded.engine);
        }));
        saveRow.appendChild(button(revealCode ? '收起存檔碼' : '顯示存檔碼', '複製文字備份', null, function () {
          revealCode = !revealCode;
          renderSelect();
        }));
        saveRow.appendChild(button('清除這個存檔', null, 'ghost', function () {
          slot.clear();
          saveNote = '';
          revealCode = false;
          renderSelect();
        }));
        saveCard.appendChild(saveRow);
        if (revealCode) {
          var shown = document.createElement('textarea');
          shown.className = 'code';
          shown.readOnly = true;
          shown.value = stored;
          saveCard.appendChild(shown);
        }
      }
      if (!preview && stored) {
        saveCard.appendChild(button('清除這個存檔', null, 'ghost', function () {
          slot.clear();
          saveNote = '';
          renderSelect();
        }));
      }
    }
    if (saveNote) saveCard.appendChild(el('p', 'save-error', saveNote));
    saveCard.appendChild(el('p', 'save-note', '匯入存檔碼'));
    var importBox = document.createElement('textarea');
    importBox.className = 'code';
    importBox.setAttribute('aria-label', '存檔碼');
    saveCard.appendChild(importBox);
    saveCard.appendChild(button('讀取存檔碼', '貼上之前複製的文字', null, function () {
      var loaded = T.loadGame(adventure, importBox.value);
      if (!loaded.ok) { saveNote = loaded.error; renderSelect(); return; }
      var code;
      try { code = T.encodeSaveCode(loaded.engine.exportSave()); }
      catch (e) { code = importBox.value.trim(); }
      var wrote = slot.write(code);
      saveNote = wrote.ok ? '' : wrote.error;
      beginFromEngine(loaded.engine);
    }));
    wrap.appendChild(saveCard);

    wrap.appendChild(el('h2', 'sectitle', '選一個角色開始'));

    var cards = el('div', 'cards');
    adventure.pregens.forEach(function (p, i) {
      var card = el('div', 'card');
      card.appendChild(el('h2', null, p.name));
      card.appendChild(el('div', 'tag', p['class'] + '　·　' + p.race));

      var stats = el('div', 'stats');
      [['生命', p.hp_max], ['防禦 AC', p.ac]].forEach(function (kv) {
        var pill = el('span', 'pill');
        pill.appendChild(document.createTextNode(kv[0] + ' '));
        pill.appendChild(el('b', null, String(kv[1])));
        stats.appendChild(pill);
      });
      card.appendChild(stats);

      var ab = el('div', 'stats');
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(function (k) {
        var pill = el('span', 'pill');
        pill.appendChild(document.createTextNode(T.ABILITY_LABEL[k] + ' '));
        pill.appendChild(el('b', null, p[k] + '（' + sign(T.abilityMod(p[k])) + '）'));
        ab.appendChild(pill);
      });
      card.appendChild(ab);

      var skills = p.skills.map(function (s) { return T.SKILL_LABEL[s] || s; }).join('、');
      var kSkill = el('p', 'kv');
      kSkill.appendChild(document.createTextNode('熟練技能：'));
      kSkill.appendChild(el('b', null, skills || '無'));
      card.appendChild(kSkill);

      var kAtk = el('p', 'kv');
      kAtk.appendChild(document.createTextNode('攻擊：'));
      kAtk.appendChild(el('b', null, p.attack.name + ' ' + sign(p.attack.bonus) + '（' + p.attack.damage + '）'));
      card.appendChild(kAtk);

      var itemNames = p.inventory.map(function (id) {
        var it = null;
        adventure.items.forEach(function (x) { if (x.id === id) it = x; });
        return it ? it.name : id;
      }).join('、');
      var kInv = el('p', 'kv');
      kInv.appendChild(document.createTextNode('起始物品：'));
      kInv.appendChild(el('b', null, itemNames || '無'));
      card.appendChild(kInv);

      if (p.features && p.features.length) {
        var moveNames = p.features.filter(function (f) { return f.timing !== 'reaction'; }).map(function (f) {
          if (f.at_will || f.pool || f.per === 'night') return f.name;
          return f.name + ' ×' + f.uses;
        }).join('、');
        var kFeat = el('p', 'kv');
        kFeat.appendChild(document.createTextNode('職業招式：'));
        kFeat.appendChild(el('b', null, moveNames));
        card.appendChild(kFeat);
      }

      var shownPassives = (p.passives || []).filter(function (pass) { return pass && pass.summary; });
      if (shownPassives.length) {
        var kPass = el('p', 'kv');
        kPass.appendChild(document.createTextNode('被動：'));
        kPass.appendChild(el('b', null, shownPassives.map(function (pass) {
          return pass.name + '（' + pass.summary + '）';
        }).join('、')));
        card.appendChild(kPass);
      }

      var btn = el('button', 'btn primary', '選擇 ' + p.name);
      btn.type = 'button';
      btn.addEventListener('click', function () { startRun(i); });
      card.appendChild(btn);

      cards.appendChild(card);
    });
    wrap.appendChild(cards);
    wrap.appendChild(button('授權與鳴謝', '規則出處', 'ghost', function () { renderCredits(); }));
    app.appendChild(wrap);
  }

  function renderCredits() {
    clear(app);
    var wrap = el('div', 'credits');
    var src = document.getElementById('credits-src');
    if (src && src.content) wrap.appendChild(src.content.cloneNode(true));
    wrap.appendChild(button('返回', null, 'primary', function () { renderSelect(); }));
    app.appendChild(wrap);
  }

  // ------------------------------------------------------------ play screen
  function renderPlayShell() {
    clear(app);
    var play = el('div', 'play');
    statusEl = el('div', 'status');
    logEl = el('div', null);
    logEl.id = 'log';
    actionsEl = el('div', null);
    actionsEl.id = 'actions';
    play.appendChild(statusEl);
    play.appendChild(logEl);
    play.appendChild(actionsEl);
    app.appendChild(play);
  }

  function startRun(pregenIndex) {
    // Seeded rng; the seed is just "whatever this session is".
    var seed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    engine = new T.Engine(adventure, { seed: seed });
    renderPlayShell();
    trayMode = null;
    handle(engine.start(pregenIndex));
  }

  // -------------------------------------------------------------- log output
  function appendLines(lines) {
    lines.forEach(function (l) {
      var p = el('p', 'line ' + (l.tone || 'narr'), l.text);
      logEl.appendChild(p);
    });
  }
  function addDivider() {
    if (!logEl.firstChild) return;
    logEl.appendChild(el('hr', 'divider'));
  }
  function addBanner(outcome) {
    var kind = outcome === 'won' ? 'win' : (outcome === 'secret_won' ? 'secret' : 'lose');
    var card = engine.endingCard();
    var title = (card && card.endingName) || (outcome === 'won' ? '通關' : (outcome === 'secret_won' ? '隱藏結局' : '失敗'));
    var body = outcome === 'won'
      ? '這一夜結束了。可以再玩一次，或換個角色重來。'
      : (outcome === 'secret_won'
        ? '你清掃了整座廢塔。隱藏結局達成。可以再玩一次，或換個角色重來。'
        : '這一場到此為止。從頭再來一次吧。');
    var b = el('div', 'banner ' + kind);
    b.appendChild(el('h2', null, title));
    b.appendChild(el('p', null, body));
    logEl.appendChild(b);
  }
  function addRestBanner(ev) {
    var b = el('div', 'banner rest');
    b.appendChild(el('h2', null, ev.name || '歇腳'));
    b.appendChild(el('p', null, '這一層可以先停下來。進度已自動儲存。'));
    logEl.appendChild(b);
  }
  function cardAlt(card) {
    var lines = [card.title, card.endingName];
    if (card.endingType) lines.push(card.endingType);
    lines.push(card.characterName + '　' + card.className);
    if (card.battlesLabel) lines.push(card.battlesLabel);
    (card.keyChoices || []).forEach(function (k) { lines.push(k.label); });
    (card.branchLines || []).forEach(function (line) { lines.push(line); });
    if (card.hp != null && card.hpMax != null) lines.push(card.hp + '/' + card.hpMax);
    if (card.playTime) lines.push(card.playTime);
    if (card.closing) lines.push(card.closing);
    return lines.join('。');
  }
  function addEndingCard() {
    var card = engine.endingCard();
    if (!card) return;
    var fig = el('figure', 'ending-card');
    var canvas = document.createElement('canvas');
    T.drawEndingCard(canvas, card);
    endingCanvas = canvas;
    var img = el('img', 'ending-img');
    img.alt = cardAlt(card);
    try { img.src = canvas.toDataURL('image/png'); } catch (e) { img.alt = cardAlt(card); }
    fig.appendChild(img);
    var cap = card.characterName + '　·　' + card.className + '　·　' + card.endingName;
    if (card.endingType) cap += '（' + card.endingType + '）';
    if (card.battlesLabel) cap += '　·　' + card.battlesLabel;
    fig.appendChild(el('figcaption', 'ending-cap', cap));
    logEl.appendChild(fig);
  }

  // Compose the frozen narration allowlist for this event: the snapshot the
  // engine took when it settled the event, plus this action's dice result.
  function viewFor(ev) {
    var dice = T.diceOf(ev);
    if (!dice) return ev.view;
    var v = {}, k;
    for (k in ev.view) if (Object.prototype.hasOwnProperty.call(ev.view, k)) v[k] = ev.view[k];
    v.dice = Object.freeze(dice);
    return Object.freeze(v);
  }

  function renderEvents(events) {
    events.forEach(function (ev) {
      if (ev.t === 'scene') addDivider();
      if (ev.t === 'scene' && ev.sceneType === 'checkpoint') addRestBanner(ev);
      appendLines(T.Mechanics.format(ev));
      appendLines(T.narrator.narrate(T.cueOf(ev), viewFor(ev)));
      if (ev.t === 'end') {
        addBanner(ev.outcome);
        addEndingCard();
      }
    });
  }

  function handle(res) {
    if (!res.ok) appendLines([{ tone: 'sys', text: '（' + res.error + '）' }]);
    if (!res.ok || !T.DiceAnim) {
      renderEvents(res.events || []);
      autosave();
      refresh();
      return;
    }
    // The roll is already on the engine. Write the save, then animate that record.
    var presented = T.DiceAnim.present(engine, res.events, {
      writeSave: function () { autosave(); }
    });
    function reveal() {
      renderEvents(res.events);
      refresh();
    }
    if (!presented.records.length || T.DiceAnim.prefersReducedMotion()) {
      reveal();
      return;
    }
    if (actionsEl) clear(actionsEl);
    try {
      T.DiceAnim.play(document.body, presented.records, { onDone: reveal });
    } catch (e) {
      reveal();
    }
  }

  function act(action) {
    trayMode = null;
    handle(engine.perform(action));
  }

  // ------------------------------------------------------------- status bar
  function renderStatus(st) {
    clear(statusEl);
    var c = st.character;
    if (!c) return;

    var who = el('div', 'who', c.name);
    who.appendChild(el('span', null, c.cls + '　·　' + c.race));
    statusEl.appendChild(who);

    var hp = el('div', 'hpwrap');
    hp.appendChild(el('span', 'lab', '生命'));
    var bar = el('div', 'hpbar');
    var ratio = c.hp_max ? Math.max(0, Math.min(1, c.hp / c.hp_max)) : 0;
    var fill = el('div', 'hpfill' + (ratio <= 0.25 ? ' low' : (ratio <= 0.6 ? ' warn' : '')));
    fill.style.width = (ratio * 100) + '%';
    bar.appendChild(fill);
    hp.appendChild(bar);
    var hpText = c.hp + '/' + c.hp_max;
    if (c.tempHp) hpText += '（臨時 ' + c.tempHp + '）';
    hp.appendChild(el('span', null, hpText));
    var acLab = '　AC ' + c.ac;
    if (c.acBonus) acLab += '（+' + c.acBonus + '）';
    hp.appendChild(el('span', 'lab', acLab));
    statusEl.appendChild(hp);

    if (c.features && c.features.length) {
      var feat = el('div', 'inv');
      feat.appendChild(el('span', 'lab', '招式'));
      var shownPool = {};
      c.features.forEach(function (f) {
        if (f.atWill || f.timing === 'reaction') return;
        if (f.pool && c.pools && c.pools[f.pool]) {
          if (shownPool[f.pool]) return;
          shownPool[f.pool] = 1;
          var pool = c.pools[f.pool];
          feat.appendChild(el('span', 'chip' + (pool.uses <= 0 ? ' none' : ''), pool.name + ' ' + pool.uses + '/' + pool.usesMax));
          return;
        }
        if (f.per === 'night') {
          feat.appendChild(el('span', 'chip' + (f.uses <= 0 ? ' none' : ''), f.name + (f.uses > 0 ? ' 可用' : ' 今晚已用')));
          return;
        }
        if (f.uses == null) return;
        feat.appendChild(el('span', 'chip' + (f.uses <= 0 ? ' none' : ''), f.name + ' ' + f.uses + '/' + f.usesMax));
      });
      statusEl.appendChild(feat);
    }

    if (c.passives && c.passives.length) {
      var passiveRow = el('div', 'inv');
      passiveRow.appendChild(el('span', 'lab', '被動'));
      c.passives.forEach(function (p) {
        passiveRow.appendChild(el('span', 'chip', p.name + '　' + p.summary));
      });
      statusEl.appendChild(passiveRow);
    }

    var inv = el('div', 'inv');
    inv.appendChild(el('span', 'lab', '行囊'));
    if (!c.inventoryNames.length) {
      inv.appendChild(el('span', 'chip none', '空'));
    } else {
      var counts = [], order = [];
      c.inventoryNames.forEach(function (n) {
        if (counts[n] === undefined) { counts[n] = 0; order.push(n); }
        counts[n]++;
      });
      order.forEach(function (n) {
        inv.appendChild(el('span', 'chip', n + (counts[n] > 1 ? ' ×' + counts[n] : '')));
      });
    }
    statusEl.appendChild(inv);

    statusEl.appendChild(el('span', saveNote ? 'chip none' : 'chip', saveNote ? '未能儲存' : '已儲存'));
  }

  // ---------------------------------------------------------------- actions
  function button(label, hint, cls, onClick, disabled) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), null);
    b.type = 'button';
    b.appendChild(document.createTextNode(label));
    if (hint) b.appendChild(el('small', null, hint));
    if (disabled) b.disabled = true;
    else b.addEventListener('click', onClick);
    return b;
  }

  function renderActions(st) {
    clear(actionsEl);

    if (st.status === 'won' || st.status === 'secret_won' || st.status === 'lost') {
      var row = el('div', 'row');
      var againLabel = (engine.endingCard() && engine.endingCard().playAgainLabel) || '從頭再玩一次';
      row.appendChild(button('儲存結局圖', '下載一張 PNG，留給自己', 'primary', function () {
        downloadEnding();
      }));
      row.appendChild(button(againLabel, '同一個角色，全新狀態，回到起點', 'play-again', function () {
        act({ type: 'restart' });
      }));
      if (st.status === 'lost' && engine.checkpointSnap) {
        row.appendChild(button('由這一層歇腳再試', '從歇腳點再走，骰子換一組', null, function () {
          act({ type: 'retry' });
        }));
      }
      row.appendChild(button('換一個角色', '回到選角畫面', 'ghost', function () {
        renderSelect();
      }));
      actionsEl.appendChild(row);
      return;
    }

    if (st.sceneType === 'end' && st.status === 'playing') {
      actionsEl.appendChild(el('p', 'save-error', '這個結局的條件還沒有滿足。'));
      var blockedRow = el('div', 'row');
      blockedRow.appendChild(button('換一個角色', '回到選角畫面', 'ghost', function () {
        renderSelect();
      }));
      actionsEl.appendChild(blockedRow);
      return;
    }

    var acts = engine.legalActions();
    var main = el('div', 'row');
    var itemActs = [];
    var featureActs = [];
    var attackActs = [];

    acts.forEach(function (a) {
      if (a.type === 'use_item') { itemActs.push(a); return; }
      if (a.type === 'use_feature') { featureActs.push(a); return; }
      if (a.type === 'attack') { attackActs.push(a); return; }
      if (st.sceneType === 'combat' && (a.type === 'flee' || a.type === 'defend')) return;
      if (a.type === 'choice') {
        main.appendChild(button(a.label, null, null, function () { act({ type: 'choice', id: a.id }); }));
      } else if (a.type === 'roll') {
        var ability = T.SKILL_ABILITY[a.skill];
        var mod = T.abilityMod(st.character.abilities[ability]);
        var prof = st.character.skills.indexOf(a.skill) >= 0 ? T.PROFICIENCY_BONUS : 0;
        var modeWord = a.mode === 'advantage' ? '　優勢' : (a.mode === 'disadvantage' ? '　劣勢' : '');
        main.appendChild(button(
          '擲骰：' + (T.SKILL_LABEL[a.skill] || a.skill) + '檢定（難度 ' + a.dc + '）',
          'd20 ' + sign(mod) + '（' + T.ABILITY_LABEL[ability] + '）' + (prof ? ' ' + sign(prof) + '（熟練）' : '') + modeWord,
          'primary',
          function () { act({ type: 'roll' }); }
        ));
      } else if (a.type === 'attack') {
        main.appendChild(button(
          '攻擊：' + a.targetName,
          st.character.attack.name + ' ' + sign(st.character.attack.bonus) + '（' + st.character.attack.damage + '）　目標生命 ' + a.targetHp + '/' + a.targetHpMax,
          'primary',
          function () { act({ type: 'attack', target: a.target }); }
        ));
      } else if (a.type === 'flee') {
        main.appendChild(button(
          '逃走',
          a.to ? '退回上一個地方' : '這裡沒有退路：整場冒險重來',
          'danger',
          function () { act({ type: 'flee' }); }
        ));
      } else if (a.type === 'continue') {
        main.appendChild(button(a.label, '歇夠了就往前', 'primary', function () {
          act({ type: 'continue' });
        }));
      }
    });
    if (st.sceneType === 'checkpoint') {
      main.appendChild(button('存檔休息', '進度已自動儲存，之後可從標題畫面繼續', 'ghost', function () {
        autosave();
        renderSelect();
      }));
    }
    if (st.sceneType !== 'combat') {
      main.appendChild(button('存檔碼', '複製一份文字備份', null, function () {
        trayMode = trayMode === 'export' ? null : 'export';
        refresh();
      }));
    }

    // Outside combat, heals and items stay on the main row.
    if (st.sceneType === 'beat' || st.sceneType === 'check') {
      featureActs.forEach(function (fa) {
        if (!fa.enabled) return;
        var hint = fa.summary || '';
        if (fa.usesLabel) hint = hint ? (hint + '　' + fa.usesLabel) : fa.usesLabel;
        main.appendChild(button(fa.featureName, hint || null, null, function () {
          if (fa.needsTarget) { trayMode = { featureId: fa.featureId }; refresh(); return; }
          act({ type: 'use_feature', featureId: fa.featureId });
        }, false));
      });
    }

    if (st.sceneType === 'beat' || st.sceneType === 'check') {
      var usable = itemActs.filter(function (a) { return a.enabled; }).length;
      var itemTrayOpen = trayMode === 'items' || (trayMode && trayMode.slot !== undefined);
      main.appendChild(button(
        itemTrayOpen ? '收起物品' : '使用物品',
        itemActs.length ? '可用 ' + usable + ' / ' + itemActs.length + ' 件' : '行囊是空的',
        null,
        function () { trayMode = itemTrayOpen ? null : 'items'; refresh(); },
        itemActs.length === 0
      ));
    }
    actionsEl.appendChild(main);

    if (st.sceneType === 'combat') {
      var foes = el('div', 'foes');
      (st.enemies || []).forEach(function (e) {
        if (!e.alive) return;
        var card = el('div', 'foe');
        var head = el('div', 'foe-head');
        head.appendChild(el('span', 'foe-name', e.name));
        head.appendChild(el('span', 'foe-hp', '生命 ' + e.hp + '/' + e.hp_max));
        (e.statuses || []).forEach(function (s) {
          var key = e.index + ':' + s.id;
          var badge = el('button', 'badge ' + s.id, s.label);
          badge.type = 'button';
          badge.addEventListener('click', function () {
            openBadge = openBadge === key ? null : key;
            refresh();
          });
          head.appendChild(badge);
        });
        card.appendChild(head);
        (e.statuses || []).forEach(function (s) {
          if (openBadge !== e.index + ':' + s.id) return;
          card.appendChild(el('p', 'badge-note', s.line));
          card.appendChild(el('p', 'badge-note', s.ends));
        });
        foes.appendChild(card);
      });
      if (foes.childNodes.length) actionsEl.appendChild(foes);
      var menu = el('div', 'combat-menu');
      var fleeAct = null;
      acts.forEach(function (a) { if (a.type === 'flee') fleeAct = a; });
      menu.appendChild(button('攻擊', attackActs.length ? (attackActs.length + ' 個目標') : '沒有目標', null, function () {
        if (attackActs.length === 1) act({ actor: 0, action: 'attack', target: attackActs[0].target });
        else { trayMode = 'attack'; refresh(); }
      }, attackActs.length === 0));
      menu.appendChild(button('招式', '平時用、大招、救命', null, function () {
        var opening = trayMode !== 'moves' && !(trayMode && trayMode.confirmId);
        trayMode = opening ? 'moves' : null;
        if (opening) openGroups = { everyday: true, big: false, rescue: false, passive: true };
        refresh();
      }, false));
      menu.appendChild(button('防守', '到下次行動前，敵人攻擊有劣勢', null, function () {
        act({ actor: 0, action: 'defend' });
      }));
      var usableItems = itemActs.filter(function (a) { return a.enabled; }).length;
      menu.appendChild(button('道具', itemActs.length ? ('可用 ' + usableItems + ' / ' + itemActs.length) : '行囊是空的', null, function () {
        trayMode = trayMode === 'items' ? null : 'items';
        refresh();
      }, itemActs.length === 0));
      menu.appendChild(button('逃走', fleeAct && fleeAct.to ? '退回上一個地方' : '這裡沒有退路：整場冒險重來', 'span', function () {
        act({ actor: 0, action: 'flee' });
      }));
      actionsEl.appendChild(menu);
      actionsEl.appendChild(button('存檔碼', '複製一份文字備份', 'ghost', function () {
        trayMode = trayMode === 'export' ? null : 'export';
        refresh();
      }));
    }

    if (!trayMode) return;

    var tray = el('div', 'tray');
    if (trayMode === 'export') {
      tray.appendChild(el('h3', null, '存檔碼'));
      var codeBox = document.createElement('textarea');
      codeBox.className = 'code';
      codeBox.readOnly = true;
      try { codeBox.value = T.encodeSaveCode(engine.exportSave()); }
      catch (e) { codeBox.value = ''; }
      tray.appendChild(codeBox);
      tray.appendChild(el('p', 'save-note', '複製整段文字。換了裝置或瀏覽器清掉記錄時，貼回標題畫面的「讀取存檔碼」。'));
      if (saveNote) tray.appendChild(el('p', 'save-error', saveNote));
      tray.appendChild(button('選取存檔碼', null, null, function () {
        codeBox.focus();
        codeBox.select();
        try { document.execCommand('copy'); } catch (e) {}
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(codeBox.value).then(function () {}, function () {});
        }
      }));
      tray.appendChild(button('關閉', null, 'ghost', function () { trayMode = null; refresh(); }));
    } else if (trayMode === 'attack') {
      tray.appendChild(el('h3', null, '攻擊哪一個？'));
      attackActs.forEach(function (a) {
        var hint = '生命 ' + a.targetHp + '/' + a.targetHpMax;
        (st.enemies || []).forEach(function (e) {
          if (e.index !== a.target || !e.statuses || !e.statuses.length) return;
          hint += '　' + e.statuses.map(function (s) { return s.label; }).join('、');
        });
        tray.appendChild(button(a.targetName, hint, null, function () {
          act({ actor: 0, action: 'attack', target: a.target });
        }));
      });
      tray.appendChild(button('取消', null, 'ghost', function () { trayMode = null; refresh(); }));
    } else if (trayMode === 'moves' || (trayMode && trayMode.confirmId)) {
      var sheet = engine.moveSheet();
      if (trayMode === 'moves') {
        tray.appendChild(el('h3', null, '招式'));
        sheet.groups.forEach(function (g) { g.open = !!openGroups[g.id]; });
        T.renderMoveGroups(document, tray, sheet, {
          onToggle: function (id) {
            openGroups[id] = !openGroups[id];
            refresh();
          },
          onMove: function (move) {
            trayMode = { confirmId: move.id };
            refresh();
          }
        });
        tray.appendChild(button('取消', null, 'ghost', function () { trayMode = null; refresh(); }));
      } else {
        var picked = null;
        sheet.groups.forEach(function (g) {
          g.moves.forEach(function (m) { if (m.id === trayMode.confirmId) picked = m; });
        });
        tray.appendChild(el('h3', null, picked ? picked.name : '招式'));
        if (picked) {
          tray.appendChild(el('p', 'hint', picked.detail || picked.summary || ''));
          if (picked.usesLabel) tray.appendChild(el('p', 'hint', picked.usesLabel));
          if (picked.enabled) {
            tray.appendChild(button('確認使用', picked.summary || null, 'primary', function () {
              if (picked.kind === 'defend') { act({ actor: 0, action: 'defend' }); return; }
              if (picked.needsTarget) { trayMode = { featureId: picked.id }; refresh(); return; }
              act({ actor: 0, action: 'move', moveId: picked.id });
            }));
          } else if (picked.reason) {
            tray.appendChild(el('p', 'save-note', picked.reason));
          }
        }
        tray.appendChild(button('返回', null, 'ghost', function () {
          trayMode = 'moves';
          refresh();
        }));
      }
    } else if (trayMode === 'items') {
      tray.appendChild(el('h3', null, '使用哪一件？'));
      itemActs.forEach(function (a) {
        var hint = a.effect === 'heal' ? ('回復 ' + a.amount + ' 點生命')
                 : a.effect === 'damage' ? ('戰鬥中自動命中，傷害 ' + a.amount)
                 : '不能使用';
        if (!a.enabled && a.reason) hint = a.reason;
        tray.appendChild(button(a.itemName, hint, null, function () {
          if (a.needsTarget) { trayMode = { slot: a.slot }; refresh(); return; }
          act({ type: 'use_item', slot: a.slot });
        }, !a.enabled));
      });
      tray.appendChild(button('取消', null, 'ghost', function () { trayMode = null; refresh(); }));
    } else if (trayMode && trayMode.featureId) {
      tray.appendChild(el('h3', null, '用在誰身上？'));
      st.enemies.forEach(function (e) {
        if (!e.alive) return;
        var hint = '生命 ' + e.hp + '/' + e.hp_max;
        if (e.statuses && e.statuses.length) {
          hint += '　' + e.statuses.map(function (s) { return s.label; }).join('、');
        }
        tray.appendChild(button(e.name, hint, null, function () {
          act({ type: 'use_feature', featureId: trayMode.featureId, target: e.index });
        }));
      });
      tray.appendChild(button('取消', null, 'ghost', function () { trayMode = null; refresh(); }));
    } else {
      tray.appendChild(el('h3', null, '用在誰身上？'));
      st.enemies.forEach(function (e) {
        if (!e.alive) return;
        tray.appendChild(button(e.name, '生命 ' + e.hp + '/' + e.hp_max, null, function () {
          act({ type: 'use_item', slot: trayMode.slot, target: e.index });
        }));
      });
      tray.appendChild(button('取消', null, 'ghost', function () { trayMode = 'items'; refresh(); }));
    }
    actionsEl.appendChild(tray);
  }

  function refresh() {
    var st = engine.uiState();
    renderStatus(st);
    renderActions(st);
    logEl.scrollTop = logEl.scrollHeight;
  }

  renderSelect();
})();
