
(function (global) {
  'use strict';

  // Presentational d20 playback. Faces come from an already-resolved roll
  // record. This file does not draw dice and does not touch the game rng.
  var PLAYER_MS = 1000;
  var ENEMY_MS = 500;
  var RESULT_HOLD_MS = 420;
  var FLICK_MS = 50;

  function prefersReducedMotion(query) {
    if (typeof query === 'function') return !!query('(prefers-reduced-motion: reduce)');
    var win = typeof window !== 'undefined' ? window : null;
    if (!win || typeof win.matchMedia !== 'function') return false;
    try { return !!win.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function recordFromEvent(ev) {
    if (!ev) return null;
    if (ev.t !== 'check' && ev.t !== 'attack' && ev.t !== 'enemy_attack') return null;
    if (!Number.isInteger(ev.d20) || ev.d20 < 1 || ev.d20 > 20) return null;
    var dice = [];
    if (Array.isArray(ev.dice)) {
      ev.dice.forEach(function (n) {
        if (Number.isInteger(n) && n >= 1 && n <= 20) dice.push(n);
      });
    }
    if (!dice.length) dice = [ev.d20];
    var mode = ev.mode === 'advantage' || ev.mode === 'disadvantage' ? ev.mode : 'normal';
    return {
      kind: ev.t,
      side: ev.t === 'enemy_attack' ? 'enemy' : 'player',
      d20: ev.d20,
      dice: dice,
      mode: mode
    };
  }

  function normalizeRecord(roll) {
    if (!roll || typeof roll !== 'object') return null;
    return recordFromEvent({
      t: roll.side === 'enemy' ? 'enemy_attack' : (roll.kind || 'check'),
      d20: roll.d20,
      dice: roll.dice,
      mode: roll.mode
    });
  }

  function sameRoll(a, b) {
    if (!a || !b) return false;
    if (a.d20 !== b.d20 || a.mode !== b.mode || a.side !== b.side) return false;
    if (a.dice.length !== b.dice.length) return false;
    for (var i = 0; i < a.dice.length; i++) if (a.dice[i] !== b.dice[i]) return false;
    return true;
  }

  // Records for this action, read from the save (not from a new roll).
  function recordsFromSave(save, events) {
    var wanted = [];
    (events || []).forEach(function (ev) {
      var rec = recordFromEvent(ev);
      if (rec) wanted.push(rec);
    });
    if (!wanted.length || !save || !Array.isArray(save.rollLog)) return [];
    var saved = [];
    save.rollLog.forEach(function (row) {
      var rec = row && normalizeRecord(row.roll);
      if (rec) saved.push(rec);
    });
    if (saved.length < wanted.length) return [];
    var tail = saved.slice(saved.length - wanted.length);
    for (var i = 0; i < wanted.length; i++) if (!sameRoll(tail[i], wanted[i])) return [];
    return tail;
  }

  // Snapshot the save first. Persistence runs next. The animation hook is last.
  function present(engine, events, hooks) {
    hooks = hooks || {};
    var save = (engine && typeof engine.exportSave === 'function') ? engine.exportSave() : null;
    if (typeof hooks.writeSave === 'function') hooks.writeSave(save);
    var records = recordsFromSave(save, events);
    if (records.length && typeof hooks.animate === 'function') hooks.animate(records, save);
    return { save: save, records: records };
  }

  function durationOf(record, reduced) {
    if (reduced) return 0;
    return record && record.side === 'enemy' ? ENEMY_MS : PLAYER_MS;
  }

  function decorativeFace(step, index, real) {
    var n = ((step + 1) * (3 + index) + index * 5) % 20 + 1;
    if (n === real) n = (n % 20) + 1;
    return n;
  }

  function keptIndexOf(dice, face) {
    var i;
    for (i = 0; i < dice.length; i++) if (dice[i] === face) return i;
    return 0;
  }

  function resultView(record, meta) {
    var dice = record.dice.slice();
    var keptIndex = keptIndexOf(dice, record.d20);
    var paired = record.mode === 'advantage' || record.mode === 'disadvantage';
    var flags = dice.map(function (n) { return paired && n === record.d20; });
    return {
      phase: 'result',
      faces: dice,
      text: dice.map(function (n) { return String(n); }),
      kept: record.d20,
      keptIndex: keptIndex,
      keptFlags: flags,
      mode: record.mode,
      enlarged: true,
      highlightKept: paired,
      duration: meta.duration,
      elapsed: meta.elapsed,
      skipped: meta.skipped,
      reducedMotion: meta.reduced
    };
  }

  function createAnimation(record, options) {
    options = options || {};
    record = normalizeRecord(record) || {
      kind: 'check', side: 'player', d20: 1, dice: [1], mode: 'normal'
    };
    var reduced = !!options.reducedMotion;
    var duration = durationOf(record, reduced);
    var elapsed = 0;
    var skipped = false;
    var phase = reduced ? 'result' : 'spinning';

    function view() {
      if (phase === 'result') {
        return resultView(record, { duration: duration, elapsed: elapsed, skipped: skipped, reduced: reduced });
      }
      var step = Math.floor(elapsed / FLICK_MS);
      var faces = record.dice.map(function (real, i) { return decorativeFace(step, i, real); });
      return {
        phase: 'spinning',
        faces: faces,
        text: faces.map(function (n) { return String(n); }),
        kept: null,
        keptIndex: -1,
        keptFlags: faces.map(function () { return false; }),
        mode: record.mode,
        enlarged: false,
        highlightKept: false,
        duration: duration,
        elapsed: elapsed,
        skipped: false,
        reducedMotion: reduced
      };
    }

    function tick(ms) {
      if (phase !== 'spinning') return view();
      var add = typeof ms === 'number' && ms > 0 ? ms : 0;
      elapsed += add;
      if (elapsed >= duration) {
        elapsed = duration;
        phase = 'result';
      }
      return view();
    }

    function skip() {
      skipped = true;
      phase = 'result';
      return view();
    }

    return { duration: duration, record: record, tick: tick, skip: skip, view: view };
  }

  function svgPoly(doc, points, cls) {
    var p = doc.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', points);
    p.setAttribute('class', cls);
    return p;
  }

  function makeDie(doc) {
    var root = doc.createElement('div');
    root.className = 'd20';
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 110');
    svg.setAttribute('class', 'shape');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(svgPoly(doc, '50,3 97,29 97,81 50,107 3,81 3,29', 'outer'));
    svg.appendChild(svgPoly(doc, '50,3 97,29 50,40', 'edge'));
    svg.appendChild(svgPoly(doc, '97,29 97,81 50,40', 'edge'));
    svg.appendChild(svgPoly(doc, '97,81 50,107 50,40', 'edge'));
    svg.appendChild(svgPoly(doc, '50,107 3,81 50,40', 'edge'));
    svg.appendChild(svgPoly(doc, '3,81 3,29 50,40', 'edge'));
    svg.appendChild(svgPoly(doc, '3,29 50,3 50,40', 'edge'));
    root.appendChild(svg);
    var num = doc.createElement('span');
    num.className = 'face';
    root.appendChild(num);
    return { root: root, num: num };
  }

  function paintDice(nodes, view) {
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      node.num.textContent = view.text[i];
      node.root.classList.toggle('spinning', view.phase === 'spinning');
      node.root.classList.toggle('settled', view.phase === 'result');
      node.root.classList.toggle('kept', !!(view.highlightKept && view.keptFlags[i]));
    }
  }

  // Full-screen playback. Click or tap resolves to the saved faces and returns.
  function play(parent, records, options) {
    options = options || {};
    var reduced = !!(options.reducedMotion || prefersReducedMotion(options.matchMedia));
    var finished = false;
    var raf = 0;
    var holdTimer = 0;
    var safety = 0;
    var skipTimer = 0;
    var overlay = null;
    var anim = null;

    function finish() {
      if (finished) return;
      finished = true;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = 0;
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = 0;
      if (skipTimer) clearTimeout(skipTimer);
      skipTimer = 0;
      if (safety) clearTimeout(safety);
      safety = 0;
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      if (typeof options.onDone === 'function') options.onDone();
    }

    if (reduced || !records || !records.length || typeof document === 'undefined' || !parent || typeof parent.appendChild !== 'function') {
      finish();
      return { skip: function () {}, reduced: reduced, duration: 0 };
    }

    var doc = parent.ownerDocument || document;
    overlay = doc.createElement('div');
    overlay.className = 'dice-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '擲骰');
    var row = doc.createElement('div');
    row.className = 'dice-row';
    overlay.appendChild(row);
    parent.appendChild(overlay);

    var index = 0;
    var nodes = [];
    var lastTs = 0;

    function budget() {
      var sum = 800;
      records.forEach(function (rec) { sum += durationOf(rec, false) + RESULT_HOLD_MS; });
      return sum;
    }
    safety = setTimeout(finish, budget());

    function rebuild(record) {
      while (row.firstChild) row.removeChild(row.firstChild);
      nodes = [];
      row.classList.toggle('multi', record.dice.length > 1);
      record.dice.forEach(function () {
        var die = makeDie(doc);
        nodes.push(die);
        row.appendChild(die.root);
      });
    }

    function advance() {
      if (finished) return;
      index += 1;
      if (index >= records.length) finish();
      else startOne();
    }

    function holdThenAdvance() {
      if (finished) return;
      holdTimer = setTimeout(advance, RESULT_HOLD_MS);
    }

    function startOne() {
      if (finished) return;
      anim = createAnimation(records[index], { reducedMotion: false });
      rebuild(anim.record);
      lastTs = 0;
      paintDice(nodes, anim.view());
      if (anim.duration === 0) {
        holdThenAdvance();
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    function loop(ts) {
      if (finished || !anim) return;
      if (!lastTs) {
        lastTs = ts;
        raf = requestAnimationFrame(loop);
        return;
      }
      var dt = ts - lastTs;
      if (dt < 0) dt = 0;
      if (dt > 48) dt = 48;
      lastTs = ts;
      var view = anim.tick(dt);
      paintDice(nodes, view);
      if (view.phase === 'result') {
        raf = 0;
        holdThenAdvance();
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    function showFinal() {
      if (anim && nodes.length) paintDice(nodes, anim.skip());
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = 0;
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = 0;
    }
    // Keep the overlay through the rest of the tap so the click cannot land on a
    // button that reappears underneath. The faces are already the saved result.
    function skipSoon() {
      if (finished) return;
      showFinal();
      if (skipTimer) return;
      skipTimer = setTimeout(finish, 280);
    }
    function skipNow(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      if (skipTimer) { clearTimeout(skipTimer); skipTimer = 0; }
      showFinal();
      finish();
    }
    overlay.tabIndex = -1;
    overlay.addEventListener('pointerup', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      skipSoon();
    });
    overlay.addEventListener('click', skipNow);
    overlay.addEventListener('keydown', function (e) {
      if (!e) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') skipNow(e);
    });
    try { overlay.focus({ preventScroll: true }); } catch (e) { try { overlay.focus(); } catch (e2) {} }

    startOne();
    return { skip: skipNow, reduced: false, duration: durationOf(records[0], false) };
  }

  var api = {
    PLAYER_MS: PLAYER_MS,
    ENEMY_MS: ENEMY_MS,
    RESULT_HOLD_MS: RESULT_HOLD_MS,
    prefersReducedMotion: prefersReducedMotion,
    recordFromEvent: recordFromEvent,
    recordsFromSave: recordsFromSave,
    present: present,
    durationOf: durationOf,
    createAnimation: createAnimation,
    play: play
  };

  global.TOWER = global.TOWER || {};
  global.TOWER.DiceAnim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
