
(function () {
  'use strict';

  var T = window.TOWER;
  var app = null;
  var booted = false;

  var HOOK = {
    '布倫': '門框上刻著第七盾隊的隊徽。你認得那面盾。',
    '希薇': '白鹿蹄印從枯林一路通進塔裡。',
    '芬恩': '有人出一百金，只要你把銅徽帶出來。',
    '米拉': '你帶著錘與禱詞。塔裡有人還沒完全迷失。',
    '奧爾': '你是來討一筆師門舊債的。'
  };

  var TYPE_LABEL = {
    beat: '探索',
    check: '檢定',
    combat: '戰鬥',
    checkpoint: '歇腳',
    end: '結局'
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function sign(n) { return (n >= 0 ? '+' : '−') + Math.abs(n); }

  function markEl(cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var d = {
      '戰士': 'M12 2.5v13M8.5 7.5h7M9 21h6M9 21l3-5.5L15 21',
      '遊俠': 'M4 19L18 5M14 5h5v5',
      '盜賊': 'M12 3l8 9-8 9-8-9z',
      '牧師': 'M12 3.5v17M5.5 9.5h13',
      '法師': 'M12 2.5l1.8 5.2 5.5.6-4.2 3.6 1.4 5.4L12 14.6 7.5 17.3l1.4-5.4L4.7 8.3l5.5-.6z'
    }[cls] || 'M12 4v16M4 12h16';
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function button(label, hint, cls, onClick, disabled) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.appendChild(document.createTextNode(label));
    if (hint) b.appendChild(el('small', null, hint));
    if (disabled) b.disabled = true;
    else if (onClick) b.addEventListener('click', onClick);
    return b;
  }

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

  var adventure = (typeof ADVENTURES === 'object' && ADVENTURES) ? ADVENTURES[DEFAULT_ADVENTURE_ID] : null;

  function resumeLine(save) {
    var sc = null;
    var scenes = (adventure && adventure.scenes) || [];
    var i;
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
    return '你在「' + place + '」醒來，身上還有 ' + n + ' 瓶藥水。';
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

  var engine = null;
  var logEl = null, statusEl = null, actionsEl = null;
  var trayMode = null;
  var sheetOpen = false;
  var openGroups = { everyday: true, big: false, rescue: false, passive: true };
  var openBadge = null;
  var slot = T ? new T.SaveSlot(browserStorage(), T.PREVIEW_STORAGE_KEYS.save) : null;
  var saveNote = '';
  var endingCanvas = null;
  var revealCode = false;

  function clearSheet() {
    var old = document.getElementById('char-sheet');
    if (old) old.remove();
  }

  function setMode(mode) {
    document.body.classList.toggle('playing', mode === 'play');
  }

  function sceneById(id) {
    var scenes = (adventure && adventure.scenes) || [];
    var i;
    for (i = 0; i < scenes.length; i++) if (scenes[i].id === id) return scenes[i];
    return null;
  }

  function floorNum(sc) {
    if (!sc) return 1;
    if (sc.floor) return sc.floor;
    var id = sc.id || '';
    if (id.indexOf('f3') === 0 || id.indexOf('cp_f3') === 0) return 3;
    if (id.indexOf('f2') === 0 || id.indexOf('cp_f2') === 0 || id.indexOf('hide') === 0) return 2;
    return 1;
  }

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
    sheetOpen = false;
    renderPlayShell();
    trayMode = null;
    (engine.rollLog || []).forEach(function (entry) {
      appendLines((entry.lines || []).map(function (text) { return { tone: 'roll', text: text }; }));
    });
    handle(engine.resumeView());
  }

  function renderFatal(list) {
    clear(app);
    clearSheet();
    setMode('gate');
    var box = el('div', 'fatal');
    box.appendChild(el('h1', null, '冒險資料有問題，無法開始'));
    box.appendChild(el('p', null, '啟動檢查在腳本資料中找到以下問題，請修正故事資料後重新載入：'));
    var ul = el('ul');
    list.forEach(function (m) { ul.appendChild(el('li', null, m)); });
    box.appendChild(ul);
    app.appendChild(box);
  }

  function renderSelect() {
    clear(app);
    clearSheet();
    setMode('gate');
    trayMode = null;
    sheetOpen = false;
    var wrap = el('div', 'gate');

    wrap.appendChild(el('p', 'eyebrow', '單人一夜 · 無需主持人 · 約二十分鐘'));
    wrap.appendChild(el('h1', null, adventure.title));
    wrap.appendChild(el('p', 'lede', '規則由程式判定。你只負責選，以及看這一夜怎麼收場。進度會留在這台裝置。'));

    var stored = slot.read();
    var preview = null;
    if (!slot.storage) {
      var bad = el('div', 'resume');
      bad.appendChild(el('p', 'save-error', '這台裝置不能寫入本機存檔。請用下方的存檔碼。'));
      wrap.appendChild(bad);
    } else if (stored) {
      var decoded = T.decodeSaveCode(stored);
      var card = el('div', 'resume');
      if (!decoded.ok) {
        card.appendChild(el('p', 'save-error', decoded.error));
        card.appendChild(button('清除這個存檔', null, 'quiet', function () {
          slot.clear();
          saveNote = '';
          renderSelect();
        }));
      } else {
        preview = decoded.save;
        var who = (preview.character && preview.character.name)
          ? (preview.character.name + ' · ' + (preview.character.cls || ''))
          : '已儲存的進度';
        card.appendChild(el('p', 'who', who));
        card.appendChild(el('p', 'note', resumeLine(preview)));
        card.appendChild(button('繼續這一夜', '從停下的地方接著走', 'primary', function () {
          var loaded = T.loadGame(adventure, stored);
          if (!loaded.ok) { saveNote = loaded.error; renderSelect(); return; }
          saveNote = '';
          beginFromEngine(loaded.engine);
        }));
        var sub = el('div', 'row inline');
        sub.appendChild(button(revealCode ? '收起存檔碼' : '顯示存檔碼', null, 'quiet', function () {
          revealCode = !revealCode;
          renderSelect();
        }));
        sub.appendChild(button('清除存檔', null, 'quiet', function () {
          slot.clear();
          saveNote = '';
          revealCode = false;
          renderSelect();
        }));
        card.appendChild(sub);
        if (revealCode) {
          var shown = document.createElement('textarea');
          shown.className = 'code';
          shown.readOnly = true;
          shown.value = stored;
          card.appendChild(shown);
        }
      }
      if (saveNote) card.appendChild(el('p', 'save-error', saveNote));
      wrap.appendChild(card);
    }

    wrap.appendChild(el('h2', 'sectitle', '選一個身份'));
    var roster = el('div', 'roster');
    adventure.pregens.forEach(function (p, i) {
      var card = el('article', 'hero-card');
      var mark = el('div', 'mark');
      mark.appendChild(markEl(p['class']));
      card.appendChild(mark);
      var idcol = el('div');
      idcol.appendChild(el('h2', null, p.name));
      idcol.appendChild(el('p', 'role', p['class'] + ' · ' + p.race));
      card.appendChild(idcol);
      card.appendChild(el('p', 'hook', HOOK[p.name] || ''));

      var meters = el('div', 'meters');
      [['生命', p.hp_max], ['防禦', p.ac], [p.attack.name, p.attack.damage]].forEach(function (kv) {
        var pill = el('span', 'pill');
        pill.appendChild(document.createTextNode(kv[0] + ' '));
        pill.appendChild(el('b', null, String(kv[1])));
        meters.appendChild(pill);
      });
      card.appendChild(meters);

      var go = button('以' + p.name + '進入', null, 'primary', function () { startRun(i); });
      card.appendChild(go);

      var fold = el('details', 'fold');
      fold.appendChild(el('summary', null, '能力與招式'));
      var ab = el('div', 'ability');
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(function (k) {
        var cell = el('span');
        cell.appendChild(document.createTextNode(T.ABILITY_LABEL[k]));
        cell.appendChild(el('b', null, p[k] + ' ' + sign(T.abilityMod(p[k]))));
        ab.appendChild(cell);
      });
      fold.appendChild(ab);
      var skills = p.skills.map(function (s) { return T.SKILL_LABEL[s] || s; }).join('、');
      var kSkill = el('p', 'kv');
      kSkill.appendChild(document.createTextNode('熟練　'));
      kSkill.appendChild(el('b', null, skills || '無'));
      fold.appendChild(kSkill);
      var kAtk = el('p', 'kv');
      kAtk.appendChild(document.createTextNode('攻擊　'));
      kAtk.appendChild(el('b', null, p.attack.name + ' ' + sign(p.attack.bonus) + '（' + p.attack.damage + '）'));
      fold.appendChild(kAtk);
      var itemNames = p.inventory.map(function (id) {
        var it = null;
        adventure.items.forEach(function (x) { if (x.id === id) it = x; });
        return it ? it.name : id;
      }).join('、');
      var kInv = el('p', 'kv');
      kInv.appendChild(document.createTextNode('起始　'));
      kInv.appendChild(el('b', null, itemNames || '無'));
      fold.appendChild(kInv);
      if (p.features && p.features.length) {
        var moveNames = p.features.filter(function (f) { return f.timing !== 'reaction'; }).map(function (f) {
          if (f.at_will || f.pool || f.per === 'night') return f.name;
          return f.name + ' ×' + f.uses;
        }).join('、');
        var kFeat = el('p', 'kv');
        kFeat.appendChild(document.createTextNode('招式　'));
        kFeat.appendChild(el('b', null, moveNames));
        fold.appendChild(kFeat);
      }
      var shownPassives = (p.passives || []).filter(function (pass) { return pass && (pass.summary || pass.crit_on || pass.ac_bonus || pass.name); });
      if (shownPassives.length) {
        var kPass = el('p', 'kv');
        kPass.appendChild(document.createTextNode('被動　'));
        kPass.appendChild(el('b', null, shownPassives.map(passiveText).join('、')));
        fold.appendChild(kPass);
      }
      card.appendChild(fold);
      roster.appendChild(card);
    });
    wrap.appendChild(roster);

    var tools = el('details', 'tools-fold');
    tools.appendChild(el('summary', null, '匯入存檔碼 · 授權'));
    tools.appendChild(el('p', 'fine', '貼上之前複製的存檔碼。'));
    var importBox = document.createElement('textarea');
    importBox.className = 'code';
    importBox.setAttribute('aria-label', '存檔碼');
    tools.appendChild(importBox);
    tools.appendChild(button('讀取存檔碼', null, null, function () {
      var loaded = T.loadGame(adventure, importBox.value);
      if (!loaded.ok) { saveNote = loaded.error; renderSelect(); return; }
      var code;
      try { code = T.encodeSaveCode(loaded.engine.exportSave()); }
      catch (e) { code = importBox.value.trim(); }
      var wrote = slot.write(code);
      saveNote = wrote.ok ? '' : wrote.error;
      beginFromEngine(loaded.engine);
    }));
    if (saveNote && !stored) tools.appendChild(el('p', 'save-error', saveNote));
    tools.appendChild(button('授權與鳴謝', null, 'quiet', function () { renderCredits(); }));
    wrap.appendChild(tools);
    app.appendChild(wrap);
  }

  function renderCredits() {
    clear(app);
    clearSheet();
    setMode('gate');
    var wrap = el('div', 'credits');
    var src = document.getElementById('credits-src');
    if (src && src.content) wrap.appendChild(src.content.cloneNode(true));
    wrap.appendChild(button('返回', null, 'primary', function () { renderSelect(); }));
    app.appendChild(wrap);
  }

  function renderPlayShell() {
    clear(app);
    clearSheet();
    setMode('play');
    var play = el('div', 'play');
    statusEl = el('header', 'hud');
    logEl = el('div', null);
    logEl.id = 'log';
    actionsEl = el('div', 'dock');
    play.appendChild(statusEl);
    play.appendChild(logEl);
    play.appendChild(actionsEl);
    app.appendChild(play);
  }

  function startRun(pregenIndex) {
    var seed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    engine = new T.Engine(adventure, { seed: seed });
    sheetOpen = false;
    renderPlayShell();
    trayMode = null;
    handle(engine.start(pregenIndex));
  }

  function appendLines(lines) {
    lines.forEach(function (l) {
      logEl.appendChild(el('p', 'line ' + (l.tone || 'narr'), l.text));
    });
  }
  function addDivider() {
    if (!logEl.firstChild) return;
    logEl.appendChild(el('hr', 'divider'));
  }
  function addStamp(text) {
    logEl.appendChild(el('div', 'stamp', text));
  }
  function addBanner(outcome) {
    var kind = outcome === 'won' ? 'win' : (outcome === 'secret_won' ? 'secret' : 'lose');
    var card = engine.endingCard();
    var title = (card && card.endingName) || (outcome === 'won' ? '通關' : (outcome === 'secret_won' ? '隱藏結局' : '失敗'));
    var body = outcome === 'won'
      ? '這一夜結束了。可以再玩一次，或換個身份重來。'
      : (outcome === 'secret_won'
        ? '你清掃了整座廢塔。隱藏結局達成。'
        : '這一場到此為止。可以從歇腳再試，或從頭再來。');
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
    var cap = card.characterName + ' · ' + card.className + ' · ' + card.endingName;
    if (card.endingType) cap += '（' + card.endingType + '）';
    if (card.battlesLabel) cap += ' · ' + card.battlesLabel;
    fig.appendChild(el('figcaption', 'ending-cap', cap));
    logEl.appendChild(fig);
  }

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
      if (ev.t === 'scene') {
        if (ev.sceneType === 'combat' || ev.sceneType === 'checkpoint' || ev.sceneType === 'end' || ev.name) {
          var label = ev.name || TYPE_LABEL[ev.sceneType] || '';
          if (ev.floor) label = '第' + ev.floor + '層 · ' + label;
          addStamp(label);
        } else {
          addDivider();
        }
      }
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
      refresh({ scroll: true });
      return;
    }
    var presented = T.DiceAnim.present(engine, res.events, {
      writeSave: function () { autosave(); }
    });
    function reveal() {
      renderEvents(res.events);
      refresh({ scroll: true });
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

  function moveById(id) {
    var found = null;
    var list = (engine && engine.character && engine.character.features) || [];
    var i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === id) found = list[i];
    return found;
  }

  function targetImmune(featureId, enemy) {
    var feature = moveById(featureId);
    if (!feature || !enemy || !Array.isArray(feature.no_effect) || !enemy.id) return false;
    return feature.no_effect.indexOf(enemy.id) >= 0;
  }

  function statusHint(enemy, base) {
    var hint = base;
    if (enemy && enemy.statuses && enemy.statuses.length) {
      hint += '　' + enemy.statuses.map(function (s) { return s.label; }).join('、');
    }
    return hint;
  }

  function act(action) {
    trayMode = null;
    sheetOpen = false;
    openBadge = null;
    handle(engine.perform(action));
  }

  function renderStatus(st) {
    clear(statusEl);
    var c = st.character;
    if (!c) return;
    var sc = engine.scene || sceneById(st.sceneId);
    var place = (sc && (sc.place || sc.name)) || '廢塔';
    var floor = floorNum(sc);
    var kind = TYPE_LABEL[st.sceneType] || '';

    var whoBtn = button('人物', null, 'sheet-btn', function () {
      sheetOpen = !sheetOpen;
      refresh();
    });
    whoBtn.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false');
    statusEl.appendChild(whoBtn);

    var mid = el('div');
    mid.appendChild(el('h1', 'place-name', place));
    var meta = kind ? ('第' + floor + '層 · ' + kind) : ('第' + floor + '層');
    if (st.sceneType === 'combat' && st.round) meta += ' · 第' + st.round + '回合';
    mid.appendChild(el('p', 'place-meta', meta));
    var floors = el('div', 'floors');
    floors.setAttribute('aria-hidden', 'true');
    var f;
    for (f = 1; f <= 3; f++) floors.appendChild(el('i', f <= floor ? 'on' : ''));
    mid.appendChild(floors);
    var ratio = c.hp_max ? Math.max(0, Math.min(1, c.hp / c.hp_max)) : 0;
    var bar = el('div', 'hpbar');
    var fill = el('div', 'hpfill' + (ratio <= 0.3 ? ' low' : ''));
    fill.style.width = (ratio * 100) + '%';
    bar.appendChild(fill);
    mid.appendChild(bar);
    statusEl.appendChild(mid);

    var nums = el('div', 'hud-nums');
    var hpText = c.hp + '/' + c.hp_max;
    if (c.tempHp) hpText += ' +' + c.tempHp;
    nums.appendChild(el('div', 'hp', hpText));
    nums.appendChild(el('div', 'ac', '防禦 ' + c.ac));
    statusEl.appendChild(nums);
  }

  function passiveText(p) {
    if (!p) return '';
    if (p.summary) return p.name + '（' + p.summary + '）';
    if (p.crit_on) return p.name + '（' + p.crit_on + ' 起暴擊）';
    if (Number.isInteger(p.ac_bonus)) return p.name + '（防禦 +' + p.ac_bonus + '）';
    return p.name || '';
  }

  function itemCounts(names) {
    var counts = {};
    var order = [];
    names.forEach(function (n) {
      if (counts[n] === undefined) { counts[n] = 0; order.push(n); }
      counts[n]++;
    });
    return order.map(function (n) { return n + (counts[n] > 1 ? ' ×' + counts[n] : ''); });
  }

  function renderSheet(st) {
    var old = document.getElementById('char-sheet');
    if (!sheetOpen) {
      if (old) old.remove();
      return;
    }
    if (old) old.remove();
    var c = st.character;
    if (!c) return;
    var scrim = el('div', 'sheet');
    scrim.id = 'char-sheet';
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim) { sheetOpen = false; refresh(); }
    });
    var panel = el('div', 'sheet-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '人物');
    var head = el('div', 'sheet-head');
    var titles = el('div');
    titles.appendChild(el('h2', null, c.name));
    titles.appendChild(el('p', 'role', c.cls + ' · ' + c.race));
    head.appendChild(titles);
    head.appendChild(button('關閉', null, 'quiet', function () {
      sheetOpen = false;
      refresh();
    }));
    panel.appendChild(head);

    var hpBlock = el('div', 'block');
    var hpRow = el('div', 'sheet-hp');
    var hpText = '生命 ' + c.hp + ' / ' + c.hp_max;
    if (c.tempHp) hpText += '（臨時 ' + c.tempHp + '）';
    hpRow.appendChild(el('span', null, hpText));
    hpRow.appendChild(el('span', null, '防禦 ' + c.ac));
    hpBlock.appendChild(hpRow);
    var ratio = c.hp_max ? Math.max(0, Math.min(1, c.hp / c.hp_max)) : 0;
    var bar = el('div', 'hpbar');
    var fill = el('div', 'hpfill' + (ratio <= 0.3 ? ' low' : ''));
    fill.style.width = (ratio * 100) + '%';
    bar.appendChild(fill);
    hpBlock.appendChild(bar);
    if (saveNote) hpBlock.appendChild(el('p', 'save-error', saveNote));
    else hpBlock.appendChild(el('p', 'fine', '進度會自動寫進這台裝置。'));
    panel.appendChild(hpBlock);

    var abBlock = el('div', 'block');
    abBlock.appendChild(el('h3', null, '能力'));
    var ab = el('div', 'ability');
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(function (k) {
      var cell = el('span');
      cell.appendChild(document.createTextNode(T.ABILITY_LABEL[k]));
      cell.appendChild(el('b', null, c.abilities[k] + ' ' + sign(T.abilityMod(c.abilities[k]))));
      ab.appendChild(cell);
    });
    abBlock.appendChild(ab);
    var skills = c.skills.map(function (s) { return T.SKILL_LABEL[s] || s; }).join('、');
    var sk = el('p', 'kv');
    sk.appendChild(document.createTextNode('熟練　'));
    sk.appendChild(el('b', null, skills || '無'));
    abBlock.appendChild(sk);
    var at = el('p', 'kv');
    at.appendChild(document.createTextNode('攻擊　'));
    at.appendChild(el('b', null, c.attack.name + ' ' + sign(c.attack.bonus) + '（' + c.attack.damage + '）'));
    abBlock.appendChild(at);
    panel.appendChild(abBlock);

    var rawPassives = (engine.character && engine.character.passives) || [];
    var visiblePassives = rawPassives.filter(function (p) { return p && (p.summary || p.crit_on || p.ac_bonus || p.name); });
    if (visiblePassives.length) {
      var pb = el('div', 'block');
      pb.appendChild(el('h3', null, '被動'));
      visiblePassives.forEach(function (p) {
        pb.appendChild(el('p', 'kv', passiveText(p)));
      });
      panel.appendChild(pb);
    }

    if (c.features && c.features.length) {
      var fb = el('div', 'block');
      fb.appendChild(el('h3', null, '招式'));
      var chips = el('div', 'chips');
      var shownPool = {};
      c.features.forEach(function (f) {
        if (f.timing === 'reaction') return;
        if (f.pool && c.pools && c.pools[f.pool]) {
          if (shownPool[f.pool]) return;
          shownPool[f.pool] = 1;
          var pool = c.pools[f.pool];
          chips.appendChild(el('span', 'chip' + (pool.uses <= 0 ? ' none' : ''), pool.name + ' ' + pool.uses + '/' + pool.usesMax));
          return;
        }
        if (f.atWill) {
          chips.appendChild(el('span', 'chip', f.name));
          return;
        }
        if (f.per === 'night') {
          chips.appendChild(el('span', 'chip' + (f.uses <= 0 ? ' none' : ''), f.name + (f.uses > 0 ? ' 可用' : ' 已用')));
          return;
        }
        if (f.uses == null) return;
        chips.appendChild(el('span', 'chip' + (f.uses <= 0 ? ' none' : ''), f.name + ' ' + f.uses + '/' + f.usesMax));
      });
      fb.appendChild(chips);
      panel.appendChild(fb);
    }

    var ib = el('div', 'block');
    ib.appendChild(el('h3', null, '行囊'));
    var ichips = el('div', 'chips');
    if (!c.inventoryNames.length) ichips.appendChild(el('span', 'chip none', '空'));
    else itemCounts(c.inventoryNames).forEach(function (n) { ichips.appendChild(el('span', 'chip', n)); });
    ib.appendChild(ichips);
    panel.appendChild(ib);

    if (c.statuses && c.statuses.length) {
      var sb = el('div', 'block');
      sb.appendChild(el('h3', null, '狀態'));
      var schips = el('div', 'chips');
      c.statuses.forEach(function (s) {
        var name = typeof s === 'string' ? s : (s.name || s.id || '');
        if (name) schips.appendChild(el('span', 'chip', name));
      });
      if (schips.firstChild) { sb.appendChild(schips); panel.appendChild(sb); }
    }

    var saveB = el('div', 'block');
    saveB.appendChild(el('h3', null, '存檔碼'));
    var codeBox = document.createElement('textarea');
    codeBox.className = 'code';
    codeBox.readOnly = true;
    try { codeBox.value = T.encodeSaveCode(engine.exportSave()); }
    catch (e) { codeBox.value = ''; }
    saveB.appendChild(codeBox);
    saveB.appendChild(el('p', 'fine', '複製整段。換裝置時，貼回標題畫面的「讀取存檔碼」。'));
    saveB.appendChild(button('複製存檔碼', null, null, function () {
      codeBox.focus();
      codeBox.select();
      var btn = this;
      try { document.execCommand('copy'); } catch (err) {}
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeBox.value).then(function () {}, function () {});
      }
      btn.textContent = '已複製';
    }));
    if (st.status === 'playing') {
      saveB.appendChild(button('離開並儲存', '回到標題，之後可以繼續', 'quiet', function () {
        autosave();
        sheetOpen = false;
        renderSelect();
      }));
    }
    panel.appendChild(saveB);
    scrim.appendChild(panel);
    document.body.appendChild(scrim);
  }

  function renderActions(st) {
    clear(actionsEl);
    actionsEl.appendChild(el('div', 'dock-grip'));

    if (st.sceneType === 'combat' && st.enemies && st.enemies.length) {
      var foes = el('div', 'foes');
      st.enemies.forEach(function (e) {
        var row = el('div', 'foe' + (e.alive ? '' : ' down'));
        row.appendChild(el('b', null, e.name));
        row.appendChild(el('span', 'hp', e.alive ? (e.hp + '/' + e.hp_max) : '倒下'));
        var track = el('div', 'bar');
        var ratio = e.hp_max ? Math.max(0, Math.min(1, e.hp / e.hp_max)) : 0;
        var fill = el('i');
        fill.style.width = (ratio * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        if (e.statuses && e.statuses.length) {
          var badges = el('div', 'foe-badges');
          e.statuses.forEach(function (s) {
            var key = e.index + ':' + s.id;
            var badge = el('button', 'badge ' + s.id, s.label);
            badge.type = 'button';
            badge.addEventListener('click', function () {
              openBadge = openBadge === key ? null : key;
              refresh();
            });
            badges.appendChild(badge);
          });
          row.appendChild(badges);
          e.statuses.forEach(function (s) {
            if (openBadge !== e.index + ':' + s.id) return;
            row.appendChild(el('p', 'badge-note', s.line));
            row.appendChild(el('p', 'badge-note', s.ends));
          });
        }
        foes.appendChild(row);
      });
      actionsEl.appendChild(foes);
    }

    if (st.status === 'won' || st.status === 'secret_won' || st.status === 'lost') {
      var row = el('div', 'row');
      var againLabel = (engine.endingCard() && engine.endingCard().playAgainLabel) || '從頭再玩一次';
      row.appendChild(button('儲存結局圖', '下載一張圖，留給自己', 'primary', function () { downloadEnding(); }));
      row.appendChild(button(againLabel, '同一個身份，全新狀態', null, function () { act({ type: 'restart' }); }));
      if (st.status === 'lost' && engine.checkpointSnap) {
        row.appendChild(button('由這一層歇腳再試', '從歇腳點再走，骰子換一組', null, function () {
          act({ type: 'retry' });
        }));
      }
      row.appendChild(button('換一個身份', null, 'quiet', function () { renderSelect(); }));
      actionsEl.appendChild(row);
      return;
    }

    if (st.sceneType === 'end' && st.status === 'playing') {
      actionsEl.appendChild(el('p', 'save-error', '這個結局的條件還沒有滿足。'));
      actionsEl.appendChild(button('換一個身份', null, 'quiet', function () { renderSelect(); }));
      return;
    }

    var acts = engine.legalActions();
    var main = el('div', 'row');
    var itemActs = [];
    var featureActs = [];
    var attackActs = [];
    var choiceN = 0;

    acts.forEach(function (a) {
      if (a.type === 'use_item') { itemActs.push(a); return; }
      if (a.type === 'use_feature') { featureActs.push(a); return; }
      if (a.type === 'attack') { attackActs.push(a); return; }
      if (st.sceneType === 'combat' && (a.type === 'flee' || a.type === 'defend')) return;
      if (a.type === 'choice') {
        choiceN += 1;
        var choice = button(a.label, null, 'choice', function () { act({ type: 'choice', id: a.id }); });
        var idx = el('span', 'idx', choiceN < 10 ? '0' + choiceN : String(choiceN));
        choice.insertBefore(idx, choice.firstChild);
        main.appendChild(choice);
      } else if (a.type === 'roll') {
        var ability = T.SKILL_ABILITY[a.skill];
        var mod = T.abilityMod(st.character.abilities[ability]);
        var prof = st.character.skills.indexOf(a.skill) >= 0 ? T.PROFICIENCY_BONUS : 0;
        var modeWord = a.mode === 'advantage' ? '　優勢' : (a.mode === 'disadvantage' ? '　劣勢' : '');
        main.appendChild(button(
          '擲骰 · ' + (T.SKILL_LABEL[a.skill] || a.skill),
          '難度 ' + a.dc + '　d20 ' + sign(mod) + '（' + T.ABILITY_LABEL[ability] + '）' + (prof ? ' ' + sign(prof) + '（熟練）' : '') + modeWord,
          'primary',
          function () { act({ type: 'roll' }); }
        ));
      } else if (a.type === 'flee') {
        main.appendChild(button(
          '逃走',
          a.to ? '退回上一個地方' : '這裡沒有退路：整場冒險重來',
          'danger',
          function () { act({ type: 'flee' }); }
        ));
      } else if (a.type === 'continue') {
        main.appendChild(button(a.label || '繼續', '歇夠了就往前', 'primary', function () {
          act({ type: 'continue' });
        }));
      }
    });

    if (st.sceneType === 'checkpoint') {
      main.appendChild(button('先離開', '進度已自動儲存，標題畫面可以繼續', 'quiet', function () {
        autosave();
        renderSelect();
      }));
    }

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
      var usable = itemActs.filter(function (a) { return a.enabled; }).length;
      var itemTrayOpen = trayMode === 'items' || (trayMode && trayMode.slot !== undefined);
      main.appendChild(button(
        itemTrayOpen ? '收起物品' : '使用物品',
        itemActs.length ? ('可用 ' + usable + ' / ' + itemActs.length) : '行囊是空的',
        'quiet',
        function () { trayMode = itemTrayOpen ? null : 'items'; refresh(); },
        itemActs.length === 0
      ));
    }

    if (main.childNodes.length) actionsEl.appendChild(main);

    if (st.sceneType === 'combat') {
      var menu = el('div', 'combat-menu');
      var fleeAct = null;
      acts.forEach(function (a) { if (a.type === 'flee') fleeAct = a; });
      menu.appendChild(button('攻擊', attackActs.length ? (attackActs.length + ' 個目標') : '沒有目標', null, function () {
        if (attackActs.length === 1) act({ actor: 0, action: 'attack', target: attackActs[0].target });
        else { trayMode = 'attack'; refresh(); }
      }, attackActs.length === 0));
      menu.appendChild(button('招式', '平時、大招、救命', null, function () {
        var opening = trayMode !== 'moves' && !(trayMode && trayMode.confirmId);
        trayMode = opening ? 'moves' : null;
        if (opening) openGroups = { everyday: true, big: false, rescue: false, passive: true };
        refresh();
      }, false));
      menu.appendChild(button('防守', '到下次行動前，敵人攻擊有劣勢', null, function () {
        act({ actor: 0, action: 'defend' });
      }));
      var usableItems = itemActs.filter(function (a) { return a.enabled; }).length;
      menu.appendChild(button('道具', itemActs.length ? ('可用 ' + usableItems + ' / ' + itemActs.length) : '空', null, function () {
        trayMode = trayMode === 'items' ? null : 'items';
        refresh();
      }, itemActs.length === 0));
      menu.appendChild(button('逃走', fleeAct && fleeAct.to ? '退回上一個地方' : '這裡沒有退路：整場重來', 'span danger', function () {
        act({ actor: 0, action: 'flee' });
      }));
      actionsEl.appendChild(menu);
    }

    if (!trayMode) return;

    var tray = el('div', 'tray');
    if (trayMode === 'attack') {
      tray.appendChild(el('h3', null, '攻擊哪一個'));
      attackActs.forEach(function (a) {
        var hint = '生命 ' + a.targetHp + '/' + a.targetHpMax;
        (st.enemies || []).forEach(function (e) {
          if (e.index !== a.target) return;
          hint = statusHint(e, hint);
        });
        tray.appendChild(button(a.targetName, hint, null, function () {
          act({ actor: 0, action: 'attack', target: a.target });
        }));
      });
      tray.appendChild(button('取消', null, 'quiet', function () { trayMode = null; refresh(); }));
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
        tray.appendChild(button('取消', null, 'quiet', function () { trayMode = null; refresh(); }));
      } else {
        var picked = null;
        sheet.groups.forEach(function (g) {
          g.moves.forEach(function (m) { if (m.id === trayMode.confirmId) picked = m; });
        });
        tray.appendChild(el('h3', null, picked ? picked.name : '招式'));
        if (picked) {
          tray.appendChild(el('p', 'hint', picked.detail || picked.summary || ''));
          if (picked.hint) tray.appendChild(el('p', 'hint when', picked.hint));
          if (picked.usesLabel) tray.appendChild(el('p', 'hint', picked.usesLabel));
          if (picked.enabled) {
            tray.appendChild(button('確認使用', picked.summary || null, 'primary', function () {
              if (picked.kind === 'defend') { act({ actor: 0, action: 'defend' }); return; }
              if (picked.needsTarget) { trayMode = { featureId: picked.id }; refresh(); return; }
              act({ actor: 0, action: 'move', moveId: picked.id });
            }));
          } else if (picked.reason) {
            tray.appendChild(el('p', 'hint when', picked.reason));
          }
        }
        tray.appendChild(button('返回', null, 'quiet', function () {
          trayMode = 'moves';
          refresh();
        }));
      }
    } else if (trayMode === 'items') {
      tray.appendChild(el('h3', null, '使用哪一件'));
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
      tray.appendChild(button('取消', null, 'quiet', function () { trayMode = null; refresh(); }));
    } else if (trayMode && trayMode.featureId) {
      tray.appendChild(el('h3', null, '用在誰身上'));
      st.enemies.forEach(function (e) {
        if (!e.alive) return;
        var hint = statusHint(e, '生命 ' + e.hp + '/' + e.hp_max);
        if (targetImmune(trayMode.featureId, e)) hint += '　對它無效';
        tray.appendChild(button(e.name, hint, null, function () {
          var id = trayMode.featureId;
          act({ type: 'use_feature', featureId: id, target: e.index });
        }));
      });
      tray.appendChild(button('取消', null, 'quiet', function () { trayMode = null; refresh(); }));
    } else if (trayMode && trayMode.slot !== undefined) {
      tray.appendChild(el('h3', null, '用在誰身上'));
      st.enemies.forEach(function (e) {
        if (!e.alive) return;
        tray.appendChild(button(e.name, '生命 ' + e.hp + '/' + e.hp_max, null, function () {
          act({ type: 'use_item', slot: trayMode.slot, target: e.index });
        }));
      });
      tray.appendChild(button('取消', null, 'quiet', function () { trayMode = 'items'; refresh(); }));
    }
    actionsEl.appendChild(tray);
  }

  function refresh(opts) {
    if (!engine || !statusEl) return;
    var st = engine.uiState();
    renderStatus(st);
    renderActions(st);
    renderSheet(st);
    if (opts && opts.scroll && logEl) logEl.scrollTop = logEl.scrollHeight;
  }

  function mount(node) {
    app = node;
    if (!T) {
      renderFatal(['遊戲引擎沒有載入。']);
      return;
    }
    if (!booted) {
      booted = true;
      if (problems.length) { renderFatal(problems); return; }
    }
    if (problems.length) { renderFatal(problems); return; }
    if (engine && engine.character) {
      renderPlayShell();
      refresh({ scroll: true });
      return;
    }
    renderSelect();
  }

  window.TowerUI = { mount: mount };
})();
