

(function (global) {
  'use strict';

  // ---------------------------------------------------------------- constants
  var PROFICIENCY_BONUS = 2;

  // The only skills that exist, mapped to the ability they use.
  var SKILL_ABILITY = {
    athletics: 'str',
    stealth: 'dex',
    sleight_of_hand: 'dex',
    perception: 'wis',
    insight: 'wis',
    survival: 'wis',
    history: 'int',
    arcana: 'int',
    investigation: 'int',
    religion: 'int',
    persuasion: 'cha',
    intimidation: 'cha',
    deception: 'cha'
  };

  var SKILL_LABEL = {
    athletics: '運動', stealth: '隱匿', sleight_of_hand: '巧手',
    perception: '察覺', insight: '洞察', survival: '求生',
    history: '歷史', arcana: '奧秘', investigation: '調查', religion: '宗教',
    persuasion: '說服', intimidation: '威嚇', deception: '欺瞞'
  };

  var ABILITY_LABEL = {
    str: '力量', dex: '敏捷', con: '體質', int: '智力', wis: '感知', cha: '魅力'
  };

  var SCENE_TYPES = ['beat', 'check', 'combat', 'checkpoint', 'end'];
  var SAVE_VERSION = 7;
  var HERO_INITIATIVE_BONUS = 2;
  var ITEM_KINDS = ['gear', 'key', 'consumable'];
  var ENDING_TYPES = ['lose', 'main', 'variant', 'class', 'secret'];
  // Card title when more than one ending applies. Higher wins.
  var ENDING_PRIORITY = { lose: 5, secret: 4, 'class': 3, variant: 2, main: 1 };
  var FLEE_CHECKPOINT = '@checkpoint';

  // ---------------------------------------------------------------------- rng
  // Every die in the game goes through an rng object exposing die(sides).
  // makeRng is a seeded mulberry32 so a seed replays an identical run.
  function makeRng(seed) {
    var usedSeed = (seed >>> 0) || 0x9e3779b9;
    var s = usedSeed;
    var count = 0;
    function next() {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      kind: 'seeded',
      seed: usedSeed,
      next: next,
      rolled: function () { return count; },
      die: function (sides) { count++; return Math.floor(next() * sides) + 1; },
      exportState: function () { return { kind: 'seeded', seed: usedSeed, s: s >>> 0, count: count }; },
      importState: function (st) {
        if (!st || st.kind !== 'seeded' || typeof st.s !== 'number' || !isFinite(st.s)) return false;
        if (!Number.isInteger(st.count) || st.count < 0) return false;
        s = (st.s >>> 0) | 0;
        count = st.count;
        return true;
      }
    };
  }

  // Fixed-sequence rng: same interface, used by tests that need exact faces.
  function makeFixedRng(values) {
    var i = 0;
    return {
      kind: 'fixed',
      next: function () { return 0; },
      rolled: function () { return i; },
      die: function (sides) {
        if (i >= values.length) throw new Error('fixed rng exhausted');
        var v = values[i++];
        return Math.max(1, Math.min(sides, v));
      }
    };
  }

  // --------------------------------------------------------------------- dice
  var DICE_RE = /^\s*(\d+)\s*[dD]\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/;

  function parseDice(spec) {
    if (typeof spec !== 'string') return null;
    var m = DICE_RE.exec(spec);
    if (!m) return null;
    var count = parseInt(m[1], 10);
    var sides = parseInt(m[2], 10);
    var mod = m[4] ? parseInt(m[4], 10) * (m[3] === '-' ? -1 : 1) : 0;
    if (!(count >= 1) || !(sides >= 2)) return null;
    return { count: count, sides: sides, mod: mod };
  }

  function rollDice(spec, rng) {
    var p = parseDice(spec);
    if (!p) throw new Error('bad dice spec: ' + spec);
    var rolls = [], total = 0;
    for (var i = 0; i < p.count; i++) {
      var r = rng.die(p.sides);
      rolls.push(r);
      total += r;
    }
    total += p.mod;
    return { spec: spec, rolls: rolls, mod: p.mod, total: total };
  }

  function abilityMod(score) { return Math.floor((score - 10) / 2); }

  var MOVE_ROLLS = { attack: 1, spell_attack: 1, auto: 1, check: 1, save: 1 };
  var MOVE_TARGETS = { self: 1, ally: 1, enemy: 1, enemies: 1 };
  var MOVE_GROUPS = { everyday: 1, big: 1, rescue: 1 };
  var SAVE_ABILITIES = { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 };
  var SUMMARY_BAN = [
    '\u5605', '\u5572', '\u5497', '\u5594', '\u4f62', '\u54cb', '\u5514', '\u4fc2', '\u5187', '\u563f',
    '\u54a9', '\u9ede\u6a23', '\u5629', '\u55ba', '\u5622', '\u7747', '\u651e', '\u756a', '\u843d\u5230', '\u4ed4'
  ];

  // Advantage: two d20s, keep the higher. Disadvantage: keep the lower.
  // A natural 1 on the kept die always misses. A natural 20 always hits and crits.
  function rollD20(rng, mode) {
    var a = rng.die(20);
    if (!mode || mode === 'normal') return { dice: [a], face: a, mode: 'normal' };
    var b = rng.die(20);
    var face = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
    return { dice: [a, b], face: face, mode: mode };
  }

  // Advantage and disadvantage together cancel. The DC is never changed.
  function checkMode(sc, pass) {
    var adv = !!(sc && sc.advantage && pass(sc.advantage));
    var dis = !!(sc && sc.disadvantage && pass(sc.disadvantage));
    if (adv && !dis) return 'advantage';
    if (dis && !adv) return 'disadvantage';
    return 'normal';
  }

  function resolveNarration(base, variants, state) {
    if (Array.isArray(variants)) {
      for (var i = 0; i < variants.length; i++) {
        var v = variants[i];
        if (!v || typeof v.text !== 'string' || !v.text) continue;
        if (conditionsPass(v.when, state)) return v.text;
      }
    }
    return typeof base === 'string' ? base : '';
  }

  // Optional prose for the choice that opens a fight. Absent fields stay empty
  // so a combat without them keeps the old win and flee log.
  function combatTransitionNarr(source) {
    if (!source || typeof source !== 'object') return null;
    var winText = typeof source.winText === 'string' ? source.winText : '';
    var fleeText = typeof source.fleeText === 'string' ? source.fleeText : '';
    if (!winText && !fleeText) return null;
    return { winText: winText, fleeText: fleeText };
  }

  // A flag-only bundle still shares the hall's one destination. HP or items do not.
  function effectIsFlagOnly(effect) {
    if (!effect) return true;
    var keys = Object.keys(effect);
    var i;
    for (i = 0; i < keys.length; i++) if (keys[i] !== 'set_flag') return false;
    return true;
  }
  function checkBreaksSharedGate(check) {
    return !effectIsFlagOnly(check.on_success) || !effectIsFlagOnly(check.on_failure);
  }

  // Crits roll the damage dice twice and add the modifier once.
  function rollDamage(spec, rng, crit) {
    var p = parseDice(spec);
    if (!p) throw new Error('bad dice spec: ' + spec);
    var count = p.count * (crit ? 2 : 1);
    var rolls = [];
    var total = 0;
    var i, r;
    for (i = 0; i < count; i++) {
      r = rng.die(p.sides);
      rolls.push(r);
      total += r;
    }
    total += p.mod;
    return { spec: crit ? (count + 'd' + p.sides + (p.mod ? (p.mod > 0 ? '+' : '') + p.mod : '')) : spec, rolls: rolls, mod: p.mod, total: total, crit: !!crit };
  }

  function sumDamage(parts) {
    var rolls = [];
    var total = 0;
    var specs = [];
    (parts || []).forEach(function (p) {
      if (!p) return;
      specs.push(p.spec);
      rolls = rolls.concat(p.rolls || []);
      total += p.total;
    });
    return { spec: specs.join(' + '), rolls: rolls, mod: 0, total: total, parts: parts || [] };
  }

  function featureIsLegacy(f) {
    return !!(f && f.effect && typeof f.effect === 'object' && !f.roll);
  }

  function charLen(text) {
    return Array.from(String(text)).length;
  }

  function poolDots(pool) {
    var dots = '';
    var i;
    for (i = 0; i < pool.usesMax; i++) dots += i < pool.uses ? '●' : '○';
    return pool.name + ' ' + dots;
  }

  function fractionThreshold(hpMax, num, den) {
    if (!Number.isInteger(hpMax) || !den) return 0;
    return Math.floor(hpMax * num / den);
  }

  // Every resolved action is { actor, action, target }, no matter who sent it.
  function normalizeCommand(action) {
    if (!action || typeof action !== 'object') return null;
    var name = action.action || action.type;
    if (name === 'use_feature') name = 'move';
    if (name === 'use_item') name = 'item';
    return {
      actor: action.actor == null ? 0 : action.actor,
      action: name,
      target: action.target,
      targets: action.targets || null,
      moveId: action.moveId || action.featureId || null,
      slot: action.slot,
      id: action.id,
      outcome: action.outcome || null
    };
  }

  function copyMap(obj) {
    var out = {};
    if (!obj) return out;
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  function deepCopy(v) { return JSON.parse(JSON.stringify(v)); }

  function countCompare(map, obj, get, cmp) {
    if (!map) return true;
    var k, n, need;
    for (k in map) if (Object.prototype.hasOwnProperty.call(map, k)) {
      n = get(obj, k);
      need = map[k];
      if (cmp === 'min' && !(n >= need)) return false;
      if (cmp === 'max' && !(n <= need)) return false;
      if (cmp === 'eq' && n !== need) return false;
    }
    return true;
  }

  // Flag / class / item conditions. `when` omitted means always true.
  // state: { cls, flags, inventory, cleared }
  function conditionsPass(when, state) {
    if (when == null) return true;
    if (!when || typeof when !== 'object') return false;
    state = state || {};
    var flags = state.flags || {};
    var inventory = state.inventory || [];
    var cleared = state.cleared || {};
    var cls = state.cls || '';
    var i, k, list, cur;
    if (when['class'] != null) {
      list = Array.isArray(when['class']) ? when['class'] : [when['class']];
      if (list.indexOf(cls) < 0) return false;
    }
    list = when.all_flags;
    if (list) {
      for (i = 0; i < list.length; i++) if (!flags[list[i]]) return false;
    }
    list = when.none_flags;
    if (list) {
      for (i = 0; i < list.length; i++) if (flags[list[i]]) return false;
    }
    if (when.flag_eq) {
      for (k in when.flag_eq) if (Object.prototype.hasOwnProperty.call(when.flag_eq, k)) {
        if (flags[k] !== when.flag_eq[k]) return false;
      }
    }
    if (when.flag_min) {
      for (k in when.flag_min) if (Object.prototype.hasOwnProperty.call(when.flag_min, k)) {
        cur = typeof flags[k] === 'number' ? flags[k] : 0;
        if (!(cur >= when.flag_min[k])) return false;
      }
    }
    if (when.flag_max) {
      for (k in when.flag_max) if (Object.prototype.hasOwnProperty.call(when.flag_max, k)) {
        cur = typeof flags[k] === 'number' ? flags[k] : 0;
        if (!(cur <= when.flag_max[k])) return false;
      }
    }
    list = when.has_item;
    if (list) {
      for (i = 0; i < list.length; i++) if (inventory.indexOf(list[i]) < 0) return false;
    }
    list = when.missing_item;
    if (list) {
      for (i = 0; i < list.length; i++) if (inventory.indexOf(list[i]) >= 0) return false;
    }
    if (!countCompare(when.item_min, inventory, itemCount, 'min')) return false;
    if (!countCompare(when.item_max, inventory, itemCount, 'max')) return false;
    if (!countCompare(when.item_eq, inventory, itemCount, 'eq')) return false;
    var stats = state.stats || {};
    if (!countCompare(when.stat_min, stats, function (obj, id) {
      return typeof obj[id] === 'number' ? obj[id] : 0;
    }, 'min')) return false;
    if (!countCompare(when.stat_max, stats, function (obj, id) {
      return typeof obj[id] === 'number' ? obj[id] : 0;
    }, 'max')) return false;
    if (!countCompare(when.stat_eq, stats, function (obj, id) {
      return typeof obj[id] === 'number' ? obj[id] : 0;
    }, 'eq')) return false;
    list = when.cleared;
    if (list) {
      for (i = 0; i < list.length; i++) if (!cleared[list[i]]) return false;
    }
    // Composed conditions. Sibling keys still AND together.
    if (when.not != null && conditionsPass(when.not, state)) return false;
    if (Array.isArray(when.all)) {
      for (i = 0; i < when.all.length; i++) if (!conditionsPass(when.all[i], state)) return false;
    }
    if (Array.isArray(when.any)) {
      var anyOk = false;
      for (i = 0; i < when.any.length; i++) if (conditionsPass(when.any[i], state)) anyOk = true;
      if (!anyOk) return false;
    }
    return true;
  }

  function resolveFacts(facts, state) {
    var out = [];
    var replacements = [];
    if (!Array.isArray(facts)) return out;
    facts.forEach(function (f) {
      if (typeof f === 'string') out.push(f);
      else if (f && typeof f.text === 'string') {
        if (typeof f.replace === 'string') replacements.push(f);
        else if (conditionsPass(f.when, state)) out.push(f.text);
      }
    });
    replacements.forEach(function (f) {
      if (!conditionsPass(f.when, state)) return;
      var at = out.indexOf(f.replace);
      if (at >= 0) out[at] = f.text;
    });
    return out;
  }

  function clampCounter(value, def) {
    if (!def || typeof value !== 'number') return value;
    if (Number.isInteger(def.min) && value < def.min) value = def.min;
    if (Number.isInteger(def.max) && value > def.max) value = def.max;
    return value;
  }

  function applyFlagWrites(flags, choice, flagDefs) {
    var out = copyMap(flags);
    var k;
    choice = choice || {};
    (choice.set_flag || []).forEach(function (f) { out[f] = true; });
    if (choice.set && typeof choice.set === 'object') {
      for (k in choice.set) if (Object.prototype.hasOwnProperty.call(choice.set, k)) out[k] = choice.set[k];
    }
    if (choice.inc && typeof choice.inc === 'object') {
      for (k in choice.inc) if (Object.prototype.hasOwnProperty.call(choice.inc, k)) {
        var cur = typeof out[k] === 'number' ? out[k] : 0;
        out[k] = clampCounter(cur + choice.inc[k], flagDefs && flagDefs[k]);
      }
    }
    if (choice.dec && typeof choice.dec === 'object') {
      for (k in choice.dec) if (Object.prototype.hasOwnProperty.call(choice.dec, k)) {
        var base = typeof out[k] === 'number' ? out[k] : 0;
        out[k] = clampCounter(base - choice.dec[k], flagDefs && flagDefs[k]);
      }
    }
    if (flagDefs) {
      Object.keys(flagDefs).forEach(function (id) {
        if (typeof out[id] === 'number') out[id] = clampCounter(out[id], flagDefs[id]);
      });
    }
    return out;
  }

  function hpFloorOf(effect) {
    if (!effect) return null;
    if (Number.isInteger(effect.min_hp)) return effect.min_hp;
    if (Number.isInteger(effect.minHp)) return effect.minHp;
    return null;
  }

  function itemCount(list, id) {
    var n = 0;
    if (!list) return 0;
    for (var i = 0; i < list.length; i++) if (list[i] === id) n++;
    return n;
  }

  function hasReward(node) {
    if (!node) return false;
    if (Array.isArray(node.give) && node.give.length) return true;
    if (Array.isArray(node.take) && node.take.length) return true;
    if (Array.isArray(node.set_flag) && node.set_flag.length) return true;
    if (node.set && typeof node.set === 'object' && !Array.isArray(node.set) && Object.keys(node.set).length) return true;
    if (node.inc && typeof node.inc === 'object' && !Array.isArray(node.inc) && Object.keys(node.inc).length) return true;
    if (node.dec && typeof node.dec === 'object' && !Array.isArray(node.dec) && Object.keys(node.dec).length) return true;
    if (node.hp_delta) return true;
    if (node.rest && typeof node.rest === 'object') return true;
    return false;
  }

  function optedOut(node) {
    return !!(node && (node.repeatable === true || node.once === false));
  }

  // Reward bundles and skill checks run once unless the writer opts out.
  function choiceIsOnce(choice) {
    if (!choice || optedOut(choice)) return false;
    if (choice.once === true) return true;
    return hasReward(choice);
  }

  function checkIsOnce(sc) {
    if (!sc || optedOut(sc)) return false;
    return true;
  }

  function enterIsOnce(effect) {
    if (!effect || optedOut(effect)) return false;
    if (effect.once === true) return true;
    return hasReward(effect);
  }

  function restIsOnce(rest) {
    if (!rest || optedOut(rest)) return false;
    return true;
  }

  // "half" is floor(hp_max / 2). A positive integer is a flat amount.
  function restHealAmount(rest, hpMax) {
    if (!rest) return 0;
    if (rest.heal === 'half') return Math.floor((hpMax || 0) / 2);
    if (Number.isInteger(rest.heal) && rest.heal > 0) return rest.heal;
    return 0;
  }

  function choiceDoneId(sceneId, choiceId) { return 'choice:' + sceneId + '/' + choiceId; }
  function checkDoneId(sceneId) { return 'check:' + sceneId; }
  function enterDoneId(sceneId) { return 'enter:' + sceneId; }
  function restDoneId(sceneId) { return 'rest:' + sceneId; }
  function promptDoneId(sceneId, promptId) { return 'prompt:' + sceneId + '/' + promptId; }

  function copyCheckRecord(v) {
    var out = { success: !!v.success };
    ['d20', 'mod', 'prof', 'total', 'dc', 'mode', 'skill', 'ability', 'narr'].forEach(function (key) {
      if (v[key] !== undefined) out[key] = v[key];
    });
    if (Array.isArray(v.dice)) out.dice = v.dice.slice();
    return out;
  }

  function copyDone(done) {
    var out = {};
    if (!done) return out;
    Object.keys(done).forEach(function (k) {
      var v = done[k];
      if (v && typeof v === 'object') out[k] = copyCheckRecord(v);
      else if (v) out[k] = true;
    });
    return out;
  }

  var STAT_NAMES = { hp: 1, hp_max: 1, str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1, ac: 1 };

  function defaultEndingType(endId) {
    if (endId === 'secret_win') return 'secret';
    if (endId === 'lose') return 'lose';
    return 'main';
  }

  function formatPlayTime(ms) {
    if (!Number.isInteger(ms) || ms < 0) return '';
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function refreshSecretFlags(flags, cleared, adventure) {
    var next = copyMap(flags);
    var req = (adventure.meta && adventure.meta.required_for_secret) || [];
    if (!req.length) return next;
    var i;
    for (i = 0; i < req.length; i++) {
      if (!cleared[req[i]]) {
        if (next.secret_ready) delete next.secret_ready;
        return next;
      }
    }
    next.secret_ready = true;
    return next;
  }

  // ---------------------------------------------------------------- save format
  // Save codes are `WT<version>.<base64 json>`. formatMigrations[N] upgrades a
  // save of version N to N+1. scriptMigrations[N] upgrades scriptVersion N when
  // adventure.meta.script_version has moved on (scene renames and similar).
  function SaveError(message) {
    this.name = 'SaveError';
    this.message = message;
  }
  SaveError.prototype = Object.create(Error.prototype);
  SaveError.prototype.constructor = SaveError;

  // Rebuild move definitions from the pregen, keeping resources already spent.
  function refreshSavedBuild(c, pre) {
    var built = buildCharacter(pre);
    var oldFeat = {};
    (c.features || []).forEach(function (f) {
      if (f && typeof f.id === 'string') oldFeat[f.id] = f;
    });
    var oldPools = (c.pools && typeof c.pools === 'object' && !Array.isArray(c.pools)) ? c.pools : {};
    Object.keys(built.pools).forEach(function (id) {
      var old = oldPools[id];
      if (!old || !Number.isInteger(old.uses)) return;
      var max = built.pools[id].usesMax;
      var n = old.uses;
      if (n < 0) n = 0;
      if (n > max) n = max;
      built.pools[id].uses = n;
    });
    built.features.forEach(function (f) {
      if (f.pool && built.pools[f.pool]) {
        f.uses = built.pools[f.pool].uses;
        f.usesMax = built.pools[f.pool].usesMax;
        return;
      }
      var old = oldFeat[f.id];
      if (!old || f.at_will) return;
      if (f.per === 'night') {
        if (Number.isInteger(old.uses)) f.uses = old.uses > 0 ? 1 : 0;
        return;
      }
      if (Number.isInteger(old.uses) && Number.isInteger(f.usesMax)) {
        var u = old.uses;
        if (u < 0) u = 0;
        if (u > f.usesMax) u = f.usesMax;
        f.uses = u;
      }
    });
    c.features = built.features;
    c.pools = built.pools;
    c.passives = built.passives;
    c.attack = built.attack;
  }

  var formatMigrations = {
    0: function (save) {
      var next = deepCopy(save);
      next.v = 1;
      if (!next.flags || typeof next.flags !== 'object' || Array.isArray(next.flags)) next.flags = {};
      if (!next.clearedCombats || typeof next.clearedCombats !== 'object' || Array.isArray(next.clearedCombats)) {
        next.clearedCombats = {};
      }
      if (!Array.isArray(next.keyChoices)) next.keyChoices = [];
      if (!Number.isInteger(next.scriptVersion) || next.scriptVersion < 1) next.scriptVersion = 1;
      return next;
    },
    1: function (save, adventure) {
      var next = deepCopy(save);
      next.v = 2;
      if (typeof next.lastCheckpoint !== 'string') next.lastCheckpoint = null;
      if (!Number.isInteger(next.playMs) || next.playMs < 0) next.playMs = null;
      if (!next.flags || typeof next.flags !== 'object' || Array.isArray(next.flags)) next.flags = {};
      var map = (adventure && adventure.meta && adventure.meta.class_flags) || {};
      var cls = next.character && next.character.cls;
      var flag = cls && map[cls];
      if (typeof flag === 'string' && flag && !next.flags[flag]) next.flags[flag] = true;
      return next;
    },
    2: function (save) {
      var next = deepCopy(save);
      next.v = 3;
      if (!next.done || typeof next.done !== 'object' || Array.isArray(next.done)) next.done = {};
      return next;
    },
    3: function (save, adventure) {
      var next = deepCopy(save);
      next.v = 4;
      var c = next.character;
      if (c && typeof c === 'object') {
        if (!Array.isArray(c.statuses)) c.statuses = [];
        if (!Number.isInteger(c.hpMaxReduction) || c.hpMaxReduction < 0) c.hpMaxReduction = 0;
        var pre = adventure && adventure.pregens && adventure.pregens[next.pregenIndex];
        if (pre) {
          var built = buildCharacter(pre);
          c.features = built.features;
          c.pools = built.pools;
          c.passives = built.passives;
          if (!c.attack) c.attack = built.attack;
        } else {
          if (!c.pools || typeof c.pools !== 'object') c.pools = {};
          if (!Array.isArray(c.passives)) c.passives = [];
        }
      }
      if (!Array.isArray(next.allies)) next.allies = [];
      if (!next.rng || typeof next.rng !== 'object') next.rng = next.rng || null;
      backfillResolvedChecks(next, adventure);
      return next;
    },
    4: function (save, adventure) {
      var next = deepCopy(save);
      next.v = 5;
      var c = next.character;
      if (!c || typeof c !== 'object') return next;
      if (!Number.isInteger(c.tempHp) || c.tempHp < 0) c.tempHp = 0;
      var pre = adventure && adventure.pregens && adventure.pregens[next.pregenIndex];
      if (!pre) return next;
      refreshSavedBuild(c, pre);
      return next;
    },
    5: function (save, adventure) {
      var next = deepCopy(save);
      next.v = 6;
      var c = next.character;
      if (!c || typeof c !== 'object') return next;
      if (c.reactionUsed !== true) c.reactionUsed = false;
      var pre = adventure && adventure.pregens && adventure.pregens[next.pregenIndex];
      if (!pre) return next;
      refreshSavedBuild(c, pre);
      return next;
    },
    // The weapon used to be named 神聖打擊. That name now belongs to the passive,
    // so a saved feature or attack with the old name must not sit beside it.
    6: function (save, adventure) {
      var next = deepCopy(save);
      next.v = 7;
      var c = next.character;
      if (!c || typeof c !== 'object') return next;
      c.divineStrikeUsed = false;
      var pre = adventure && adventure.pregens && adventure.pregens[next.pregenIndex];
      if (!pre) return next;
      refreshSavedBuild(c, pre);
      var takenId = {};
      var takenName = {};
      (c.passives || []).forEach(function (p) {
        if (!p || typeof p.id !== 'string') return;
        takenId[p.id] = 1;
        if (typeof p.name === 'string') takenName[p.name] = 1;
      });
      c.features = (c.features || []).filter(function (f) {
        if (!f) return false;
        if (takenId[f.id] || takenName[f.name]) return false;
        return true;
      });
      var seenPassive = {};
      c.passives = (c.passives || []).filter(function (p) {
        if (!p || typeof p.id !== 'string' || !p.id || seenPassive[p.id]) return false;
        seenPassive[p.id] = 1;
        return true;
      });
      return next;
    }
  };

  // Older saves recorded the hall approach as a flag, not as a finished check.
  // Fill the missing check records so a resolved check is not offered again.
  // A save still standing on that check is left alone, so the roll can happen.
  function backfillResolvedChecks(save, adventure) {
    if (!save.done || typeof save.done !== 'object' || Array.isArray(save.done)) save.done = {};
    var scenes = {};
    ((adventure && adventure.scenes) || []).forEach(function (sc) {
      if (sc && sc.id) scenes[sc.id] = sc;
    });
    var flags = (save.flags && typeof save.flags === 'object' && !Array.isArray(save.flags)) ? save.flags : {};
    Object.keys(scenes).forEach(function (id) {
      var beat = scenes[id];
      if (!beat || beat.type !== 'beat' || !Array.isArray(beat.choices)) return;
      var shared = null;
      var rows = [];
      var i;
      for (i = 0; i < beat.choices.length; i++) {
        var choice = beat.choices[i];
        if (!choice || typeof choice.to !== 'string') continue;
        var check = scenes[choice.to];
        if (!check || check.type !== 'check' || !checkIsOnce(check)) continue;
        if (checkBreaksSharedGate(check)) return;
        if (typeof check.success_to !== 'string' || check.success_to !== check.fail_to) return;
        if (shared == null) shared = check.success_to;
        else if (shared !== check.success_to) return;
        rows.push({ choice: choice, check: check });
      }
      if (!rows.length || typeof shared !== 'string') return;
      var anyFlag = false;
      rows.forEach(function (row) {
        var flagged = false;
        (row.choice.set_flag || []).forEach(function (f) { if (flags[f]) flagged = true; });
        var cid = row.choice.id ? choiceDoneId(id, row.choice.id) : null;
        if (cid && save.done[cid]) flagged = true;
        if (!flagged) return;
        anyFlag = true;
        if (cid && !save.done[cid]) save.done[cid] = true;
        if (save.sceneId === row.check.id) return;
        var kid = checkDoneId(row.check.id);
        if (!save.done[kid]) save.done[kid] = { success: true };
      });
      var cleared = save.clearedCombats && save.clearedCombats[shared];
      // Standing on the beat that offers the checks is not "already past" them.
      var past = (save.sceneId === shared && save.sceneId !== id) || save.sceneId === (shared + '_after') || !!cleared;
      // Older saves crossed the hall straight into the bandit fight.
      if (shared === 'f1_bandit_front' && (save.sceneId === 'f1_bandit' || save.sceneId === 'f1_bandit_after' ||
          (save.clearedCombats && save.clearedCombats.f1_bandit))) past = true;
      if (anyFlag || !past) return;
      rows.forEach(function (row) {
        if (save.sceneId === row.check.id) return;
        var cid = row.choice.id ? choiceDoneId(id, row.choice.id) : null;
        if (cid && !save.done[cid]) save.done[cid] = true;
        var kid = checkDoneId(row.check.id);
        if (!save.done[kid]) save.done[kid] = { success: true };
      });
    });
  }

  var scriptMigrations = {
    // 1: function (save, adventure) { save.scriptVersion = 2; return save; }
  };

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function encodeSaveCode(save) {
    if (!save || !Number.isInteger(save.v)) throw new SaveError('存檔缺少版本號。');
    return 'WT' + save.v + '.' + utf8ToB64(JSON.stringify(save));
  }

  function decodeSaveCode(text) {
    if (typeof text !== 'string') return { ok: false, error: '存檔碼格式不正確。', save: null };
    var t = text.replace(/\s+/g, '');
    if (!t) return { ok: false, error: '存檔碼是空的。', save: null };
    var m = /^WT(\d+)\.([A-Za-z0-9+/]+=*)$/.exec(t);
    if (!m) return { ok: false, error: '存檔碼格式不正確。', save: null };
    var obj;
    try {
      obj = JSON.parse(b64ToUtf8(m[2]));
    } catch (e) {
      return { ok: false, error: '存檔碼無法讀取。', save: null };
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: '存檔碼內容不正確。', save: null };
    }
    if (!Number.isInteger(obj.v)) return { ok: false, error: '存檔缺少版本號。', save: null };
    if (String(obj.v) !== m[1]) return { ok: false, error: '存檔碼版本對不上。', save: null };
    return { ok: true, error: null, save: obj };
  }

  function migrateSave(save, adventure, hooks) {
    if (!save || typeof save !== 'object' || Array.isArray(save)) throw new SaveError('存檔是空的。');
    if (!Number.isInteger(save.v)) throw new SaveError('存檔缺少版本號。');
    if (save.v > SAVE_VERSION) throw new SaveError('這份存檔來自較新的版本，無法讀取。');
    if (save.v < 0) throw new SaveError('存檔版本不正確。');
    var fmt = (hooks && hooks.formatMigrations) || formatMigrations;
    var cur = deepCopy(save);
    var guard = 0;
    while (cur.v < SAVE_VERSION) {
      var fn = fmt[cur.v];
      if (typeof fn !== 'function') throw new SaveError('這份存檔太舊，找不到對應的升級。');
      var from = cur.v;
      cur = fn(cur, adventure);
      if (!cur || cur.v !== from + 1) throw new SaveError('存檔升級沒有前進到下一版。');
      if (++guard > 20) throw new SaveError('存檔升級未能完成。');
    }
    var scripts = (hooks && hooks.scriptMigrations) || scriptMigrations;
    var target = (adventure && adventure.meta && adventure.meta.script_version) || 1;
    if (!Number.isInteger(target) || target < 1) target = 1;
    if (!Number.isInteger(cur.scriptVersion) || cur.scriptVersion < 1) cur.scriptVersion = 1;
    if (cur.scriptVersion > target) throw new SaveError('這份存檔對應較新的腳本，無法讀取。');
    guard = 0;
    while (cur.scriptVersion < target) {
      var sfn = scripts[cur.scriptVersion];
      if (typeof sfn !== 'function') throw new SaveError('腳本已更新，但這份舊存檔無法升級。');
      var sfrom = cur.scriptVersion;
      cur = sfn(cur, adventure);
      if (!cur || !Number.isInteger(cur.scriptVersion) || cur.scriptVersion <= sfrom) {
        throw new SaveError('腳本存檔升級沒有前進。');
      }
      if (++guard > 20) throw new SaveError('腳本存檔升級未能完成。');
    }
    return cur;
  }

  // localStorage is shared by every site on this GitHub Pages origin.
  // Preview keys must not match the public game or any other project.
  var PREVIEW_STORAGE_PREFIX = 'wasted-tower-preview-';
  var PREVIEW_STORAGE_KEYS = {
    save: 'wasted-tower-preview-save',
    probe: 'wasted-tower-preview-probe'
  };
  function previewStorageKeys() {
    return Object.keys(PREVIEW_STORAGE_KEYS).map(function (name) {
      return PREVIEW_STORAGE_KEYS[name];
    });
  }

  function SaveSlot(storage, key) {
    this.storage = storage || null;
    this.key = key || PREVIEW_STORAGE_KEYS.save;
  }
  SaveSlot.prototype.read = function () {
    if (!this.storage) return null;
    try { return this.storage.getItem(this.key); } catch (e) { return null; }
  };
  SaveSlot.prototype.write = function (code) {
    if (!this.storage) return { ok: false, error: '這個瀏覽器不能儲存進度，請改用匯出存檔碼。' };
    try {
      this.storage.setItem(this.key, code);
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: '無法寫入本機存檔，請改用匯出存檔碼。' };
    }
  };
  SaveSlot.prototype.clear = function () {
    if (!this.storage) return;
    try { this.storage.removeItem(this.key); } catch (e) {}
  };

  function layoutEndingCard(card) {
    card = card || {};
    var choices = (card.keyChoices || []).map(function (k) {
      return typeof k === 'string' ? k : (k && k.label) || '';
    }).filter(function (t) { return !!t; });
    return {
      title: card.title || '',
      endingName: card.endingName || '',
      endingType: card.endingType || '',
      identity: (card.characterName || '') + '　·　' + (card.className || ''),
      race: card.race || '',
      battles: card.battlesLabel || '',
      keyChoices: choices,
      branches: (card.branchLines || []).slice(),
      hp: (card.hp != null && card.hpMax != null) ? ('剩餘生命　' + card.hp + '/' + card.hpMax) : '',
      playTime: card.playTime || '',
      closing: card.closing || ''
    };
  }

  // Draws the ending card into a 2D context. Returns the layout it painted.
  // width is the CSS pixel width; the caller sizes the canvas.
  function paintEndingCard(ctx, width, card) {
    var layout = layoutEndingCard(card);
    var pad = 40;
    var maxText = width - pad * 2;
    var lineH = 32;
    function wrap(text, font) {
      ctx.font = font;
      var lines = [];
      var cur = '';
      var i;
      for (i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ctx.measureText(cur + ch).width > maxText && cur) {
          lines.push(cur);
          cur = ch;
        } else cur += ch;
      }
      if (cur) lines.push(cur);
      if (!lines.length) lines.push('');
      return lines;
    }
    var blocks = [];
    function add(text, font, color, gap) {
      var lines = wrap(String(text), font);
      for (var i = 0; i < lines.length; i++) {
        blocks.push({ text: lines[i], font: font, color: color, gap: i === 0 ? gap : 4 });
      }
    }
    add(layout.title, '600 26px sans-serif', '#e3b04b', 0);
    add(layout.endingName, '700 42px sans-serif', '#f4f1e8', 18);
    if (layout.endingType) add('類型　' + layout.endingType, '500 18px sans-serif', '#e3b04b', 8);
    add(layout.identity, '500 24px sans-serif', '#d5dbe6', 14);
    if (layout.race) add(layout.race, '400 18px sans-serif', '#98a1af', 6);
    if (layout.battles) add(layout.battles, '500 20px sans-serif', '#d5dbe6', 16);
    if (layout.hp) add(layout.hp, '500 20px sans-serif', '#d5dbe6', 8);
    if (layout.playTime) add('遊玩時間　' + layout.playTime, '400 18px sans-serif', '#98a1af', 8);
    add('關鍵選擇', '600 16px sans-serif', '#e3b04b', 26);
    if (!layout.keyChoices.length) add('（這場沒有記下關鍵選擇）', '400 22px sans-serif', '#98a1af', 12);
    layout.keyChoices.forEach(function (t) { add('· ' + t, '400 22px sans-serif', '#e8eaee', 8); });
    if (layout.branches.length) {
      add('職業分支', '600 16px sans-serif', '#e3b04b', 22);
      layout.branches.forEach(function (t) { add(t, '400 20px sans-serif', '#e8eaee', 8); });
    }
    if (layout.closing) add(layout.closing, '400 20px sans-serif', '#c9d1dd', 22);

    var y = pad;
    var i;
    for (i = 0; i < blocks.length; i++) y += blocks[i].gap + lineH;
    var height = y + pad;

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#141820';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e3b04b';
    ctx.lineWidth = 3;
    if (ctx.strokeRect) ctx.strokeRect(10, 10, width - 20, height - 20);

    y = pad;
    for (i = 0; i < blocks.length; i++) {
      y += blocks[i].gap;
      ctx.font = blocks[i].font;
      ctx.fillStyle = blocks[i].color;
      ctx.fillText(blocks[i].text, pad, y);
      y += lineH;
    }
    return { width: width, height: height, blocks: blocks, layout: layout };
  }

  function drawEndingCard(canvas, card) {
    var width = 720;
    var dpr = 1;
    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      dpr = Math.min(2, window.devicePixelRatio || 1);
    }
    var probe = canvas.getContext('2d');
    var measured = paintEndingCard(probe, width, card);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(measured.height * dpr);
    if (canvas.style) {
      canvas.style.width = '100%';
      canvas.style.maxWidth = width + 'px';
      canvas.style.height = 'auto';
    }
    var ctx = canvas.getContext('2d');
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return paintEndingCard(ctx, width, card);
  }

  // ---------------------------------------------------------------- graph walk
  // Proves every ending can be reached and that no reachable state is stuck.
  // Combat is assumed winnable; both check outcomes are taken. HP is ignored.
  function walkScript(adventure) {
    var errors = [];
    var scenes = {};
    (adventure.scenes || []).forEach(function (sc) { if (sc && sc.id) scenes[sc.id] = sc; });
    var pregens = adventure.pregens || [];
    var reachableScenes = {};
    var reached = {};
    var deadScenes = {};
    var blockedEnds = {};

    // Only flags/items/clears that conditions actually read affect reachability.
    // Key-choice flags that nothing tests must not multiply the graph.
    var relevantFlags = { secret_ready: 1 };
    var flagMode = { secret_ready: 'bool' };
    var flagCap = {};
    var eqValues = {};
    var relevantItems = {};
    var countedItems = {};
    var itemCap = {};
    var relevantDoneIds = [];
    var doneOwner = {};
    var endings = [];
    var relevantCleared = {};
    var currentBag = null;
    var sceneBags = {};
    function noteFlag(id, mode, cap) {
      if (typeof id !== 'string' || !id) return;
      relevantFlags[id] = 1;
      if (currentBag) currentBag.flags[id] = 1;
      if (mode === 'num') {
        flagMode[id] = 'num';
        if (typeof cap === 'number' && (flagCap[id] == null || cap > flagCap[id])) flagCap[id] = cap;
      } else if (mode === 'eq') {
        if (flagMode[id] !== 'num') flagMode[id] = 'eq';
      } else if (!flagMode[id]) flagMode[id] = 'bool';
    }
    function noteWhen(when) {
      if (!when || typeof when !== 'object') return;
      if (when.not) noteWhen(when.not);
      (when.all || []).forEach(noteWhen);
      (when.any || []).forEach(noteWhen);
      (when.all_flags || []).forEach(function (f) { noteFlag(f, 'bool'); });
      (when.none_flags || []).forEach(function (f) { noteFlag(f, 'bool'); });
      if (when.flag_eq) Object.keys(when.flag_eq).forEach(function (k) {
        var v = when.flag_eq[k];
        if (typeof v === 'number') noteFlag(k, 'num', Math.abs(v) + 1);
        else {
          noteFlag(k, 'eq');
          eqValues[k] = eqValues[k] || {};
          eqValues[k][JSON.stringify(v)] = 1;
        }
      });
      if (when.flag_min) Object.keys(when.flag_min).forEach(function (k) {
        noteFlag(k, 'num', when.flag_min[k]);
      });
      if (when.flag_max) Object.keys(when.flag_max).forEach(function (k) {
        noteFlag(k, 'num', when.flag_max[k] + 1);
      });
      (when.has_item || []).forEach(function (id) {
        relevantItems[id] = 1;
        if (currentBag) currentBag.items[id] = 1;
      });
      (when.missing_item || []).forEach(function (id) {
        relevantItems[id] = 1;
        if (currentBag) currentBag.items[id] = 1;
      });
      (when.cleared || []).forEach(function (id) {
        relevantCleared[id] = 1;
        if (currentBag) currentBag.cleared[id] = 1;
      });
      function noteItemMap(map, extra) {
        if (!map || typeof map !== 'object') return;
        Object.keys(map).forEach(function (id) {
          relevantItems[id] = 1;
          countedItems[id] = 1;
          if (currentBag) { currentBag.items[id] = 1; currentBag.counted[id] = 1; }
          var n = typeof map[id] === 'number' ? map[id] : 0;
          var need = n + extra;
          if (need < 0) need = 0;
          if (itemCap[id] == null || need > itemCap[id]) itemCap[id] = need;
        });
      }
      noteItemMap(when.item_min, 0);
      noteItemMap(when.item_max, 1);
      noteItemMap(when.item_eq, 1);
    }
    ((adventure.meta && adventure.meta.required_for_secret) || []).forEach(function (id) {
      relevantCleared[id] = 1;
    });
    (adventure.class_branches || []).forEach(function (b) {
      if (!b) return;
      noteWhen(b.when);
      noteWhen(b.completed_when);
    });
    var trackCheckpoint = false;
    (adventure.scenes || []).forEach(function (sc) {
      if (sc && sc.flee_to === FLEE_CHECKPOINT) trackCheckpoint = true;
    });
    (adventure.scenes || []).forEach(function (sc) {
      if (!sc) return;
      currentBag = { flags: {}, items: {}, counted: {}, cleared: {} };
      if (sc.id) sceneBags[sc.id] = currentBag;
      noteWhen(sc.when);
      (sc.facts || []).forEach(function (f) { if (f && typeof f === 'object') noteWhen(f.when); });
      if (sc.rest) noteWhen(sc.rest.when);
      noteWhen(sc.on_success && sc.on_success.when);
      noteWhen(sc.on_failure && sc.on_failure.when);
      noteWhen(sc.advantage);
      noteWhen(sc.disadvantage);
      (sc.success_narr_variants || []).forEach(function (v) { if (v) noteWhen(v.when); });
      (sc.fail_narr_variants || []).forEach(function (v) { if (v) noteWhen(v.when); });
      function noteChoice(c) {
        if (!c) return;
        noteWhen(c.when);
        (c.require_flag || []).forEach(function (f) { noteFlag(f, 'bool'); });
        (c.require_item || []).forEach(function (id) {
          relevantItems[id] = 1;
          if (currentBag) currentBag.items[id] = 1;
        });
      }
      (sc.choices || []).forEach(noteChoice);
      (sc.prompts || []).forEach(function (pr) {
        if (!pr) return;
        noteWhen(pr.when);
        (pr.choices || []).forEach(noteChoice);
      });
      currentBag = null;
    });
    (adventure.scenes || []).forEach(function (sc) {
      if (!sc || sc.type !== 'end' || !sceneBags[sc.id]) return;
      currentBag = sceneBags[sc.id];
      (adventure.class_branches || []).forEach(function (b) {
        if (!b) return;
        noteWhen(b.when);
        noteWhen(b.completed_when);
      });
      currentBag = null;
    });
    var nextIds = {};
    function linkScenes(from, to) {
      if (!from || typeof to !== 'string' || !scenes[to]) return;
      if (!nextIds[from]) nextIds[from] = {};
      nextIds[from][to] = 1;
    }
    (adventure.scenes || []).forEach(function (sc) {
      if (!sc || !sc.id) return;
      (sc.choices || []).forEach(function (c) { if (c) linkScenes(sc.id, c.to); });
      (sc.prompts || []).forEach(function (pr) {
        if (!pr) return;
        (pr.choices || []).forEach(function (c) { if (c) linkScenes(sc.id, c.to); });
      });
      linkScenes(sc.id, sc.next);
      linkScenes(sc.id, sc.win_to);
      if (sc.flee_to && sc.flee_to !== FLEE_CHECKPOINT) linkScenes(sc.id, sc.flee_to);
      linkScenes(sc.id, sc.success_to);
      linkScenes(sc.id, sc.fail_to);
      linkScenes(sc.id, sc.continue_to);
      linkScenes(sc.id, sc.choice_to);
    });
    if (trackCheckpoint) {
      var checkpointIds = [];
      Object.keys(scenes).forEach(function (id) {
        if (scenes[id].type === 'checkpoint') checkpointIds.push(id);
      });
      Object.keys(scenes).forEach(function (id) {
        if (scenes[id].flee_to === FLEE_CHECKPOINT) {
          checkpointIds.forEach(function (cp) { linkScenes(id, cp); });
        }
      });
    }
    var futureOf = {};
    function futureScenes(id) {
      if (futureOf[id]) return futureOf[id];
      var seen = {};
      var stack = [id];
      seen[id] = 1;
      while (stack.length) {
        var cur = stack.pop();
        var nxt = nextIds[cur] || {};
        Object.keys(nxt).forEach(function (to) {
          if (!seen[to]) { seen[to] = 1; stack.push(to); }
        });
      }
      futureOf[id] = seen;
      return seen;
    }
    var readCache = {};
    function readsFor(sceneId) {
      if (readCache[sceneId]) return readCache[sceneId];
      var flags = {};
      var items = {};
      var counted = {};
      var cleared = {};
      var fut = futureScenes(sceneId);
      var readsSecret = false;
      Object.keys(fut).forEach(function (id) {
        var bag = sceneBags[id];
        if (!bag) return;
        Object.keys(bag.flags).forEach(function (f) { flags[f] = 1; });
        Object.keys(bag.items).forEach(function (f) { items[f] = 1; });
        Object.keys(bag.counted).forEach(function (f) { counted[f] = 1; });
        Object.keys(bag.cleared).forEach(function (f) { cleared[f] = 1; });
        if (bag.flags.secret_ready) readsSecret = true;
      });
      if (readsSecret) {
        ((adventure.meta && adventure.meta.required_for_secret) || []).forEach(function (id) {
          cleared[id] = 1;
        });
      }
      readCache[sceneId] = { flags: flags, items: items, counted: counted, cleared: cleared, scenes: fut };
      return readCache[sceneId];
    }
    function rewardNeedsLock(node) {
      if (!node) return false;
      var i, id;
      var give = node.give || [];
      for (i = 0; i < give.length; i++) if (countedItems[give[i]]) return true;
      var take = node.take || [];
      for (i = 0; i < take.length; i++) if (countedItems[take[i]]) return true;
      var maps = [node.inc, node.dec, node.set];
      for (i = 0; i < maps.length; i++) {
        var m = maps[i];
        if (!m || typeof m !== 'object') continue;
        for (id in m) {
          if (Object.prototype.hasOwnProperty.call(m, id) && flagMode[id] === 'num') return true;
        }
      }
      return false;
    }
    (adventure.scenes || []).forEach(function (sc) {
      if (!sc || !sc.id) return;
      (sc.prompts || []).forEach(function (pr) {
        if (!pr || !pr.id) return;
        var promptKey = promptDoneId(sc.id, pr.id);
        relevantDoneIds.push(promptKey);
        doneOwner[promptKey] = sc.id;
        (pr.choices || []).forEach(function (c) {
          if (c && choiceIsOnce(c) && rewardNeedsLock(c)) {
            var cid = choiceDoneId(sc.id, c.id);
            relevantDoneIds.push(cid);
            doneOwner[cid] = sc.id;
          }
        });
      });
      (sc.choices || []).forEach(function (c) {
        if (c && choiceIsOnce(c) && rewardNeedsLock(c)) {
          var cid = choiceDoneId(sc.id, c.id);
          relevantDoneIds.push(cid);
          doneOwner[cid] = sc.id;
        }
      });
      if (sc.on_enter && enterIsOnce(sc.on_enter) && rewardNeedsLock(sc.on_enter)) {
        var eid = enterDoneId(sc.id);
        relevantDoneIds.push(eid);
        doneOwner[eid] = sc.id;
      }
    });
    function projectFlag(id, value) {
      if (flagMode[id] === 'num') {
        var n = typeof value === 'number' ? value : 0;
        var cap = flagCap[id] == null ? n : flagCap[id];
        if (n > cap) n = cap;
        if (n < -Math.abs(cap)) n = -Math.abs(cap);
        return String(n);
      }
      if (flagMode[id] === 'eq') {
        var s = JSON.stringify(value);
        if (eqValues[id] && eqValues[id][s]) return s;
        return '"*"';
      }
      return value ? '1' : '0';
    }

    function pass(when, st) {
      return conditionsPass(when, {
        cls: st.cls, flags: st.flags, inventory: st.items, cleared: st.cleared, stats: st.stats
      });
    }
    function choiceOpen(st, c) {
      var i;
      if (!c) return false;
      if (typeof c.to !== 'string' && !c._prompt) return false;
      if (choiceIsOnce(c) && st.done[choiceDoneId(st.scene, c.id)]) return false;
      if (Array.isArray(c.require_flag)) {
        for (i = 0; i < c.require_flag.length; i++) if (!st.flags[c.require_flag[i]]) return false;
      }
      if (Array.isArray(c.require_item)) {
        for (i = 0; i < c.require_item.length; i++) if (st.items.indexOf(c.require_item[i]) < 0) return false;
      }
      return pass(c.when, st);
    }
    function stateKey(st) {
      var live = readsFor(st.scene);
      var flagPart = Object.keys(relevantFlags).filter(function (k) {
        return live.flags[k];
      }).sort().map(function (k) {
        return k + ':' + projectFlag(k, st.flags[k]);
      }).join('&');
      var counts = {};
      st.items.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      var itemPart = [];
      Object.keys(relevantItems).sort().forEach(function (id) {
        if (!live.items[id]) return;
        var n = counts[id] || 0;
        if (countedItems[id] && live.counted[id]) {
          var cap = itemCap[id] == null ? n : itemCap[id];
          if (n > cap) n = cap;
          itemPart.push(id + ':' + n);
        } else if (n > 0) itemPart.push(id);
      });
      var clearPart = Object.keys(st.cleared).filter(function (id) {
        return live.cleared[id];
      }).sort().join('&');
      var donePart = [];
      var here = scenes[st.scene];
      if (here && here.type === 'check' && checkIsOnce(here) && st.done[checkDoneId(st.scene)]) {
        var lock = st.done[checkDoneId(st.scene)];
        donePart.push('check:' + (lock && lock.success ? 's' : 'f'));
      }
      relevantDoneIds.forEach(function (id) {
        if (!st.done[id]) return;
        var owner = doneOwner[id];
        if (owner && !live.scenes[owner]) return;
        donePart.push(id);
      });
      var cpPart = trackCheckpoint ? ('|' + (st.lastCheckpoint || '')) : '';
      return st.pregen + '|' + st.scene + '|' + itemPart.join(',') + '|' + flagPart + '|' + clearPart + '|' + donePart.join(',') + cpPart;
    }
    function cloneState(st) {
      return {
        scene: st.scene, cls: st.cls, pregen: st.pregen,
        items: st.items.slice(), flags: copyMap(st.flags), cleared: copyMap(st.cleared),
        lastCheckpoint: st.lastCheckpoint || null,
        done: copyDone(st.done),
        stats: st.stats
      };
    }
    function arrive(st, sceneId) {
      var n = cloneState(st);
      n.scene = sceneId;
      if (scenes[sceneId] && scenes[sceneId].type === 'checkpoint') n.lastCheckpoint = sceneId;
      n.flags = refreshSecretFlags(n.flags, n.cleared, adventure);
      var sc = scenes[sceneId];
      if (sc && sc.on_enter && !(enterIsOnce(sc.on_enter) && n.done[enterDoneId(sceneId)])) {
        n = applyBundle(n, sc.on_enter);
        if (enterIsOnce(sc.on_enter)) n.done[enterDoneId(sceneId)] = true;
        if (sc.type === 'checkpoint') n.lastCheckpoint = sceneId;
        n.flags = refreshSecretFlags(n.flags, n.cleared, adventure);
      }
      return n;
    }
    function applyBundle(st, effect) {
      var n = cloneState(st);
      if (effect) {
        n.flags = applyFlagWrites(n.flags, effect, adventure.flag_defs);
        (effect.give || []).forEach(function (id) { n.items.push(id); });
        (effect.take || []).forEach(function (id) {
          var at = n.items.indexOf(id);
          if (at >= 0) n.items.splice(at, 1);
        });
      }
      return n;
    }
    function afterChoice(st, choice) {
      var n = applyBundle(st, choice);
      if (choice._prompt && !choice._promptRepeatable) n.done[promptDoneId(st.scene, choice._prompt)] = true;
      if (choiceIsOnce(choice) && choice.id) n.done[choiceDoneId(st.scene, choice.id)] = true;
      if (typeof choice.to === 'string' && choice.to) return arrive(n, choice.to);
      return arrive(n, st.scene);
    }
    function branchInfo(st) {
      var branches = [];
      var lines = [];
      (adventure.class_branches || []).forEach(function (b) {
        if (!b || !pass(b.when, st)) return;
        var completed = pass(b.completed_when, st);
        branches.push({ id: b.id, completed: !!completed, label: b.label });
        if (completed) lines.push('支線：' + b.label + '（已完成）');
        else lines.push('支線：' + b.label + '（錯過）：' + b.miss_reason);
      });
      return { branches: branches, branchLines: lines };
    }

    var exploded = false;
    for (var pi = 0; pi < pregens.length; pi++) {
      if (exploded) break;
      var p = pregens[pi];
      var startFlags = {};
      var classFlag = p.class_flag;
      if (!classFlag && adventure.meta && adventure.meta.class_flags) {
        classFlag = adventure.meta.class_flags[p['class']];
      }
      if (typeof classFlag === 'string' && classFlag) startFlags[classFlag] = true;
      var start = {
        scene: adventure.start,
        cls: p['class'],
        pregen: pi,
        items: (p.inventory || []).slice(),
        flags: startFlags,
        cleared: {},
        lastCheckpoint: null,
        done: {},
        stats: {
          hp: p.hp_max, hp_max: p.hp_max,
          str: p.str, dex: p.dex, con: p.con, int: p['int'], wis: p.wis, cha: p.cha, ac: p.ac
        }
      };
      start.flags = refreshSecretFlags(start.flags, start.cleared, adventure);
      start = arrive(start, adventure.start);
      var queue = [start];
      var seen = {};
      var localStates = {};
      var edges = [];
      seen[stateKey(start)] = true;
      localStates[stateKey(start)] = start;
      var qi = 0;
      while (qi < queue.length) {
        if (queue.length > 25000) {
          errors.push('腳本圖太大，無法在上限內走完。');
          exploded = true;
          break;
        }
        var st = queue[qi++];
        var key = stateKey(st);
        reachableScenes[st.scene] = true;
        var sc = scenes[st.scene];
        if (!sc) {
          errors.push('走到不存在的場景「' + st.scene + '」。');
          continue;
        }
        if (sc.type === 'end') {
          if (pass(sc.when, st)) {
            if (!reached[sc.id]) reached[sc.id] = {};
            reached[sc.id][p['class']] = true;
            var info = branchInfo(st);
            endings.push({
              'class': st.cls,
              pregen: st.pregen,
              endingId: sc.id,
              endingType: sc.ending_type || defaultEndingType(sc.end),
              flags: copyMap(st.flags),
              items: st.items.slice(),
              branches: info.branches,
              branchLines: info.branchLines
            });
          }
          continue;
        }
        var nexts = [];
        if (sc.type === 'beat') {
          if (Array.isArray(sc.prompts) && sc.prompts.length) {
            var opened = null;
            var pri;
            for (pri = 0; pri < sc.prompts.length && !opened; pri++) {
              var pr = sc.prompts[pri];
              if (!pr) continue;
              if (!pr.repeatable && st.done[promptDoneId(sc.id, pr.id)]) continue;
              if (!pass(pr.when, st)) continue;
              var visible = [];
              (pr.choices || []).forEach(function (c) {
                if (!c) return;
                var tagged = {};
                var ck;
                for (ck in c) if (Object.prototype.hasOwnProperty.call(c, ck)) tagged[ck] = c[ck];
                tagged._prompt = pr.id;
                tagged._promptRepeatable = !!pr.repeatable;
                if (choiceOpen(st, tagged)) visible.push(tagged);
              });
              if (visible.length) opened = visible;
            }
            if (!opened) {
              if (typeof sc.next === 'string') nexts.push(arrive(st, sc.next));
            } else {
              opened.forEach(function (c) { nexts.push(afterChoice(st, c)); });
            }
          } else {
            var choices = [];
            if (sc.choices_from === 'other_pregens') choices.push({ id: '_rival', to: sc.choice_to });
            else choices = sc.choices || [];
            choices.forEach(function (c) {
              if (!choiceOpen(st, c)) return;
              nexts.push(afterChoice(st, c));
            });
          }
        } else if (sc.type === 'check') {
          var cid = checkDoneId(sc.id);
          var locked = checkIsOnce(sc) && st.done[cid] && typeof st.done[cid] === 'object';
          var takeBranch = function (success) {
            var dest = success ? sc.success_to : sc.fail_to;
            if (typeof dest !== 'string') return;
            var n;
            if (locked) n = cloneState(st);
            else {
              n = applyBundle(st, success ? sc.on_success : sc.on_failure);
              if (checkIsOnce(sc)) n.done[cid] = { success: !!success };
            }
            nexts.push(arrive(n, dest));
          };
          if (locked) takeBranch(!!st.done[cid].success);
          else { takeBranch(true); takeBranch(false); }
        } else if (sc.type === 'combat') {
          var won = cloneState(st);
          won.cleared[sc.id] = true;
          won.flags = refreshSecretFlags(won.flags, won.cleared, adventure);
          nexts.push(arrive(won, sc.win_to));
          if (sc.flee_to === FLEE_CHECKPOINT) {
            if (st.lastCheckpoint) nexts.push(arrive(st, st.lastCheckpoint));
          } else if (sc.flee_to) nexts.push(arrive(st, sc.flee_to));
        } else if (sc.type === 'checkpoint') {
          if (typeof sc.continue_to === 'string') nexts.push(arrive(st, sc.continue_to));
        }
        if (!nexts.length) deadScenes[st.scene] = true;
        nexts.forEach(function (n) {
          var nk = stateKey(n);
          edges.push([key, nk]);
          if (!seen[nk]) {
            seen[nk] = true;
            localStates[nk] = n;
            queue.push(n);
          }
        });
      }
      if (exploded) break;

      var rev = {};
      edges.forEach(function (e) { (rev[e[1]] = rev[e[1]] || []).push(e[0]); });
      var good = {};
      var rq = [];
      Object.keys(localStates).forEach(function (k) {
        var node = localStates[k];
        var nodeSc = scenes[node.scene];
        if (nodeSc && nodeSc.type === 'end' && pass(nodeSc.when, node)) {
          good[k] = true;
          rq.push(k);
        }
      });
      var ri = 0;
      while (ri < rq.length) {
        var gk = rq[ri++];
        (rev[gk] || []).forEach(function (prev) {
          if (!good[prev]) { good[prev] = true; rq.push(prev); }
        });
      }
      Object.keys(seen).forEach(function (k) {
        if (good[k]) return;
        var node = localStates[k];
        var nodeSc = scenes[node.scene];
        if (nodeSc && nodeSc.type === 'end') blockedEnds[node.scene] = true;
        else if (node) deadScenes[node.scene] = true;
      });
    }

    if (!exploded) {
      (adventure.scenes || []).forEach(function (sc) {
        if (!sc || !sc.id) return;
        if (!reachableScenes[sc.id]) errors.push('場景「' + sc.id + '」從起點走不到。');
        if (sc.type === 'end' && !reached[sc.id]) errors.push('結局場景「' + sc.id + '」從起點走不到。');
        if (sc.type === 'end' && sc.when && sc.when['class'] != null && reached[sc.id]) {
          var list = Array.isArray(sc.when['class']) ? sc.when['class'] : [sc.when['class']];
          list.forEach(function (cls) {
            var has = false;
            pregens.forEach(function (p) { if (p['class'] === cls) has = true; });
            if (has && !reached[sc.id][cls]) errors.push('結局場景「' + sc.id + '」在職業「' + cls + '」走不到。');
          });
        }
      });
      Object.keys(deadScenes).forEach(function (id) {
        var sc = scenes[id];
        if (sc && sc.type === 'end') return;
        errors.push('場景「' + id + '」有走不出去的狀態（死路）。');
      });
      Object.keys(blockedEnds).forEach(function (id) {
        errors.push('結局「' + id + '」有條件未滿足就到達的路徑，玩家會停在那裡。');
      });
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      reached: reached,
      reachable: Object.keys(reachableScenes),
      endings: endings
    };
  }

  // Writer helper: prove a class / ending / flag combination is reachable.
  // `flags` matches the listed keys exactly. `allFlags` requires those flags
  // to be truthy. `itemMin` is a minimum count. `branchCompleted` is a branch
  // id or a list of ids. `branchLine` is a substring of a card branch line.
  // The walker uses each pregen's starting attributes and does not simulate
  // hit-point loss, so stat checks see full health.
  function assertReachable(adventure, spec) {
    var walk = walkScript(adventure);
    spec = spec || {};
    var matches = (walk.endings || []).filter(function (e) {
      if (spec['class'] && e['class'] !== spec['class']) return false;
      if (spec.endingId && e.endingId !== spec.endingId) return false;
      if (spec.endingType && e.endingType !== spec.endingType) return false;
      var k, i, found;
      if (spec.flags) {
        for (k in spec.flags) if (Object.prototype.hasOwnProperty.call(spec.flags, k)) {
          if (e.flags[k] !== spec.flags[k]) return false;
        }
      }
      if (spec.allFlags) {
        for (i = 0; i < spec.allFlags.length; i++) if (!e.flags[spec.allFlags[i]]) return false;
      }
      if (spec.itemMin) {
        for (k in spec.itemMin) if (Object.prototype.hasOwnProperty.call(spec.itemMin, k)) {
          if (itemCount(e.items, k) < spec.itemMin[k]) return false;
        }
      }
      if (spec.branchCompleted) {
        var ids = Array.isArray(spec.branchCompleted) ? spec.branchCompleted : [spec.branchCompleted];
        for (i = 0; i < ids.length; i++) {
          found = false;
          (e.branches || []).forEach(function (b) {
            if (b.id === ids[i] && b.completed) found = true;
          });
          if (!found) return false;
        }
      }
      if (spec.branchLine) {
        found = false;
        (e.branchLines || []).forEach(function (line) {
          if (String(line).indexOf(spec.branchLine) >= 0) found = true;
        });
        if (!found) return false;
      }
      return true;
    });
    return { ok: !!(walk.ok && matches.length), matches: matches, errors: walk.errors, walkOk: walk.ok };
  }

  // ---------------------------------------------------------------- validator
  // Runs over the embedded data at startup. If it returns ok:false the UI
  // refuses to start and prints the messages.
  function validateAdventure(adv, options) {
    options = options || {};
    var errors = [];
    function err(msg) { errors.push(msg); }

    if (!adv || typeof adv !== 'object') {
      return { ok: false, errors: ['冒險資料不存在或格式錯誤。'] };
    }
    if (typeof adv.title !== 'string' || !adv.title) err('冒險缺少 title。');
    if (typeof adv.start !== 'string' || !adv.start) err('冒險缺少 start（起始場景）。');

    // --- items
    var items = {};
    if (!Array.isArray(adv.items)) {
      err('冒險缺少 items 陣列。');
    } else {
      adv.items.forEach(function (it, i) {
        var where = '物品 #' + i;
        if (!it || typeof it.id !== 'string' || !it.id) { err(where + ' 缺少 id。'); return; }
        where = '物品「' + it.id + '」';
        if (items[it.id]) err(where + ' 的 id 重複。');
        items[it.id] = it;
        if (typeof it.name !== 'string' || !it.name) err(where + ' 缺少 name。');
        if (ITEM_KINDS.indexOf(it.kind) < 0) err(where + ' 的 kind「' + it.kind + '」不合法（只能是 gear / key / consumable）。');
        var hasHeal = it.heal !== undefined && it.heal !== null;
        var hasDmg = it.damage !== undefined && it.damage !== null;
        if (it.kind === 'consumable') {
          if (hasHeal && hasDmg) err(where + ' 同時有 heal 和 damage，消耗品只能二擇其一。');
          if (!hasHeal && !hasDmg) err(where + ' 既沒有 heal 也沒有 damage，消耗品必須二擇其一。');
          if (hasHeal && !Number.isInteger(it.heal)) err(where + ' 的 heal 必須是整數。');
          if (hasDmg && !Number.isInteger(it.damage)) err(where + ' 的 damage 必須是整數。');
        } else if (hasHeal || hasDmg) {
          err(where + ' 不是消耗品，卻有 heal / damage。');
        }
      });
    }
    function checkItem(id, where) {
      if (!items[id]) err(where + ' 指向不存在的物品「' + id + '」。');
    }

    // --- scenes
    var scenes = {};
    if (!Array.isArray(adv.scenes) || adv.scenes.length === 0) {
      err('冒險缺少 scenes 陣列。');
    } else {
      adv.scenes.forEach(function (sc, i) {
        if (!sc || typeof sc.id !== 'string' || !sc.id) { err('場景 #' + i + ' 缺少 id。'); return; }
        if (scenes[sc.id]) err('場景「' + sc.id + '」的 id 重複。');
        scenes[sc.id] = sc;
      });
    }
    function checkScene(id, where) {
      if (typeof id !== 'string' || !scenes[id]) err(where + ' 指向不存在的場景「' + id + '」。');
    }

    var WHEN_KEYS = {
      'class': 1, all_flags: 1, none_flags: 1, flag_eq: 1, flag_min: 1, flag_max: 1,
      has_item: 1, missing_item: 1, item_min: 1, item_max: 1, item_eq: 1,
      stat_min: 1, stat_max: 1, stat_eq: 1, cleared: 1, not: 1, all: 1, any: 1
    };
    function validateWhen(when, where) {
      if (!when || typeof when !== 'object' || Array.isArray(when)) {
        err(where + ' 的 when 必須是物件。');
        return;
      }
      Object.keys(when).forEach(function (k) {
        if (!WHEN_KEYS[k]) err(where + ' 的 when 含有未知欄位「' + k + '」。');
      });
      if (when['class'] !== undefined) {
        var classes = Array.isArray(when['class']) ? when['class'] : [when['class']];
        if (!classes.length) err(where + ' 的 when.class 是空的。');
        classes.forEach(function (c) {
          if (typeof c !== 'string' || !c) err(where + ' 的 when.class 必須是職業名稱。');
        });
      }
      ['all_flags', 'none_flags'].forEach(function (f) {
        if (when[f] === undefined) return;
        if (!Array.isArray(when[f])) { err(where + ' 的 when.' + f + ' 必須是陣列。'); return; }
        when[f].forEach(function (id) {
          if (typeof id !== 'string' || !id) err(where + ' 的 when.' + f + ' 必須是旗標名稱。');
        });
      });
      ['flag_eq', 'flag_min', 'flag_max'].forEach(function (f) {
        if (when[f] === undefined) return;
        if (!when[f] || typeof when[f] !== 'object' || Array.isArray(when[f])) {
          err(where + ' 的 when.' + f + ' 必須是物件。');
          return;
        }
        Object.keys(when[f]).forEach(function (k) {
          var v = when[f][k];
          if (f === 'flag_eq') {
            if (typeof v !== 'boolean' && typeof v !== 'number' && typeof v !== 'string') {
              err(where + ' 的 when.flag_eq.' + k + ' 必須是布林、數字或字串。');
            }
          } else if (typeof v !== 'number') {
            err(where + ' 的 when.' + f + '.' + k + ' 必須是數字。');
          }
        });
      });
      ['has_item', 'missing_item'].forEach(function (f) {
        if (when[f] === undefined) return;
        if (!Array.isArray(when[f])) { err(where + ' 的 when.' + f + ' 必須是陣列。'); return; }
        when[f].forEach(function (id) { checkItem(id, where + ' 的 when.' + f); });
      });
      function validateNumMap(map, field, idCheck) {
        if (map === undefined) return;
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
          err(where + ' 的 when.' + field + ' 必須是物件。');
          return;
        }
        Object.keys(map).forEach(function (k) {
          if (typeof map[k] !== 'number') err(where + ' 的 when.' + field + '.' + k + ' 必須是數字。');
          if (idCheck) idCheck(k, where + ' 的 when.' + field);
        });
      }
      ['item_min', 'item_max', 'item_eq'].forEach(function (f) {
        validateNumMap(when[f], f, function (id, w) { checkItem(id, w); });
      });
      ['stat_min', 'stat_max', 'stat_eq'].forEach(function (f) {
        validateNumMap(when[f], f, function (id, w) {
          if (!STAT_NAMES[id]) err(w + ' 的屬性「' + id + '」只能是 hp、hp_max、str、dex、con、int、wis、cha、ac。');
        });
      });
      if (when.cleared !== undefined) {
        if (!Array.isArray(when.cleared)) err(where + ' 的 when.cleared 必須是陣列。');
        else when.cleared.forEach(function (id) {
          if (!scenes[id]) err(where + ' 的 when.cleared 指向不存在的場景「' + id + '」。');
          else if (scenes[id].type !== 'combat') err(where + ' 的 when.cleared「' + id + '」必須是 combat。');
        });
      }
      if (when.not !== undefined) validateWhen(when.not, where + ' 的 when.not');
      ['all', 'any'].forEach(function (f) {
        if (when[f] === undefined) return;
        if (!Array.isArray(when[f])) { err(where + ' 的 when.' + f + ' 必須是陣列。'); return; }
        when[f].forEach(function (inner, i) { validateWhen(inner, where + ' 的 when.' + f + '[' + i + ']'); });
      });
    }
    var EFFECT_KEYS = {
      set_flag: 1, set: 1, inc: 1, dec: 1, give: 1, take: 1, hp_delta: 1, min_hp: 1, minHp: 1,
      once: 1, repeatable: 1
    };
    function validateEffect(effect, where) {
      if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
        err(where + ' 必須是物件。');
        return;
      }
      Object.keys(effect).forEach(function (k) {
        if (!EFFECT_KEYS[k]) err(where + ' 含有未知欄位「' + k + '」。');
      });
      if (effect.set_flag !== undefined) {
        if (!Array.isArray(effect.set_flag)) err(where + ' 的 set_flag 必須是陣列。');
        else effect.set_flag.forEach(function (id) {
          if (typeof id !== 'string' || !id) err(where + ' 的 set_flag 必須是旗標名稱。');
        });
      }
      if (effect.set !== undefined) {
        if (!effect.set || typeof effect.set !== 'object' || Array.isArray(effect.set)) err(where + ' 的 set 必須是物件。');
        else Object.keys(effect.set).forEach(function (k) {
          var v = effect.set[k];
          if (typeof v !== 'boolean' && typeof v !== 'number' && typeof v !== 'string') {
            err(where + ' 的 set.' + k + ' 必須是布林、數字或字串。');
          }
        });
      }
      ['inc', 'dec'].forEach(function (f) {
        if (effect[f] === undefined) return;
        if (!effect[f] || typeof effect[f] !== 'object' || Array.isArray(effect[f])) {
          err(where + ' 的 ' + f + ' 必須是物件。');
          return;
        }
        Object.keys(effect[f]).forEach(function (k) {
          if (typeof effect[f][k] !== 'number') err(where + ' 的 ' + f + '.' + k + ' 必須是數字。');
        });
      });
      ['give', 'take'].forEach(function (f) {
        if (effect[f] === undefined) return;
        if (!Array.isArray(effect[f])) { err(where + ' 的 ' + f + ' 必須是陣列。'); return; }
        effect[f].forEach(function (id) { checkItem(id, where + ' 的 ' + f); });
      });
      if (effect.hp_delta !== undefined && !Number.isInteger(effect.hp_delta)) err(where + ' 的 hp_delta 必須是整數。');
      if (effect.min_hp !== undefined && !Number.isInteger(effect.min_hp)) err(where + ' 的 min_hp 必須是整數。');
      if (effect.minHp !== undefined && !Number.isInteger(effect.minHp)) err(where + ' 的 minHp 必須是整數。');
      if (effect.min_hp !== undefined && effect.minHp !== undefined) err(where + ' 的 min_hp 與 minHp 請只留一個。');
      if (effect.once !== undefined && typeof effect.once !== 'boolean') err(where + ' 的 once 必須是布林。');
      if (effect.repeatable !== undefined && typeof effect.repeatable !== 'boolean') err(where + ' 的 repeatable 必須是布林。');
    }
    function validateOnceFlags(node, where) {
      if (!node) return;
      if (node.once !== undefined && typeof node.once !== 'boolean') err(where + ' 的 once 必須是布林。');
      if (node.repeatable !== undefined && typeof node.repeatable !== 'boolean') err(where + ' 的 repeatable 必須是布林。');
    }
    // clear_status is applied: it clears the status list and does not heal by itself.
    function validateRestSpec(rest, where) {
      if (!rest || typeof rest !== 'object' || Array.isArray(rest)) {
        err(where + ' 必須是物件。');
        return;
      }
      var healOk = (Number.isInteger(rest.heal) && rest.heal >= 1) || rest.heal === 'half';
      if (!healOk) err(where + ' 的 heal 必須是正整數或 half。');
      if (rest.when !== undefined) validateWhen(rest.when, where);
      if (rest.clear_status !== undefined && typeof rest.clear_status !== 'boolean') {
        err(where + ' 的 clear_status 必須是布林。');
      }
      Object.keys(rest).forEach(function (k) {
        if (k !== 'heal' && k !== 'when' && k !== 'once' && k !== 'repeatable' && k !== 'clear_status') {
          err(where + ' 含有未知欄位「' + k + '」。');
        }
      });
      validateOnceFlags(rest, where);
    }
    function checkFacts(facts, where) {
      if (facts === undefined) return;
      if (!Array.isArray(facts)) { err(where + ' 的 facts 必須是陣列。'); return; }
      facts.forEach(function (f, i) {
        if (typeof f === 'string') return;
        if (!f || typeof f !== 'object' || typeof f.text !== 'string' || !f.text) {
          err(where + ' 的 facts[' + i + '] 必須是字串，或含有 text 的物件。');
          return;
        }
        if (f.when !== undefined) validateWhen(f.when, where + ' 的 facts[' + i + ']');
        if (f.replace !== undefined && (typeof f.replace !== 'string' || !f.replace)) {
          err(where + ' 的 facts[' + i + '].replace 必須是要被換掉的原句。');
        }
      });
    }

    if (typeof adv.start === 'string' && adv.start && !scenes[adv.start]) {
      err('起始場景「' + adv.start + '」不存在。');
    }

    (Array.isArray(adv.scenes) ? adv.scenes : []).forEach(function (sc) {
      if (!sc || typeof sc.id !== 'string') return;
      var where = '場景「' + sc.id + '」';
      if (SCENE_TYPES.indexOf(sc.type) < 0) { err(where + ' 的 type「' + sc.type + '」不合法。'); return; }
      checkFacts(sc.facts, where);
      if (sc.when !== undefined) validateWhen(sc.when, where);

      function validateNarrVariants(list, label) {
        if (!Array.isArray(list)) { err(label + ' 必須是陣列。'); return; }
        list.forEach(function (v, i) {
          if (!v || typeof v !== 'object' || typeof v.text !== 'string' || !v.text) {
            err(label + ' #' + i + ' 必須有文字。');
            return;
          }
          if (v.when !== undefined) validateWhen(v.when, label + ' #' + i);
        });
      }

      function validateChoice(c, cw, allowMissingTo) {
        if (!c || typeof c.id !== 'string' || !c.id) err(cw + ' 缺少 id。');
        else cw = cw.replace(/選項 #\d+$/, '選項「' + c.id + '」');
        if (!c || typeof c.label !== 'string' || !c.label) err(cw + ' 缺少 label。');
        if (!c) return false;
        var missingTo = c.to === undefined || c.to === null || c.to === '';
        if (missingTo) {
          if (!allowMissingTo) err(cw + ' 缺少 to。');
        } else checkScene(c.to, cw + ' 的 to');
        validateOnceFlags(c, cw);
        ['give', 'take', 'require_item'].forEach(function (f) {
          if (c[f] === undefined) return;
          if (!Array.isArray(c[f])) { err(cw + ' 的 ' + f + ' 必須是陣列。'); return; }
          c[f].forEach(function (id) { checkItem(id, cw + ' 的 ' + f); });
        });
        ['require_flag', 'set_flag'].forEach(function (f) {
          if (c[f] === undefined) return;
          if (!Array.isArray(c[f])) { err(cw + ' 的 ' + f + ' 必須是陣列。'); return; }
          c[f].forEach(function (id) {
            if (typeof id !== 'string' || !id) err(cw + ' 的 ' + f + ' 必須是旗標名稱。');
          });
        });
        if (c.when !== undefined) validateWhen(c.when, cw);
        if (c.narr !== undefined && typeof c.narr !== 'string') err(cw + ' 的 narr 必須是字串。');
        if (c.narr_variants !== undefined) validateNarrVariants(c.narr_variants, cw + ' 的 narr_variants');
        if (c.winText !== undefined && (typeof c.winText !== 'string' || !c.winText)) {
          err(cw + ' 的 winText 必須是非空字串。');
        }
        if (c.fleeText !== undefined && (typeof c.fleeText !== 'string' || !c.fleeText)) {
          err(cw + ' 的 fleeText 必須是非空字串。');
        }
        if (c.winText !== undefined || c.fleeText !== undefined) {
          var fight = typeof c.to === 'string' ? scenes[c.to] : null;
          if (!fight || fight.type !== 'combat') {
            err(cw + ' 的 winText 與 fleeText 只能寫在進入戰鬥的選項上。');
          }
        }
        if (c.set !== undefined) {
          if (!c.set || typeof c.set !== 'object' || Array.isArray(c.set)) err(cw + ' 的 set 必須是物件。');
          else Object.keys(c.set).forEach(function (k) {
            var v = c.set[k];
            if (typeof v !== 'boolean' && typeof v !== 'number' && typeof v !== 'string') {
              err(cw + ' 的 set.' + k + ' 必須是布林、數字或字串。');
            }
          });
        }
        if (c.inc !== undefined || c.dec !== undefined || c.min_hp !== undefined || c.minHp !== undefined) {
          validateEffect({
            inc: c.inc, dec: c.dec, min_hp: c.min_hp, minHp: c.minHp
          }, cw);
        }
        if (c.hp_delta !== undefined && !Number.isInteger(c.hp_delta)) err(cw + ' 的 hp_delta 必須是整數。');
        if (c.rest !== undefined) validateRestSpec(c.rest, cw + ' 的 rest');
        return missingTo;
      }
      if (sc.type === 'beat') {
        var fromPregens = sc.choices_from === 'other_pregens';
        var hasPrompts = sc.prompts !== undefined;
        if (hasPrompts && fromPregens) err(where + ' 的 prompts 不能和 choices_from 一起用。');
        if (hasPrompts && Array.isArray(sc.choices) && sc.choices.length) err(where + ' 的 prompts 不能和 choices 一起用。');
        if (hasPrompts) {
          if (!Array.isArray(sc.prompts) || sc.prompts.length === 0) err(where + ' 的 prompts 必須是非空陣列。');
          var promptIds = {};
          var choiceIds = {};
          var needsNext = false;
          (Array.isArray(sc.prompts) ? sc.prompts : []).forEach(function (pr, pi) {
            var pw = where + ' 的提問 #' + pi;
            if (!pr || typeof pr !== 'object') { err(pw + ' 必須是物件。'); return; }
            if (typeof pr.id !== 'string' || !pr.id) err(pw + ' 缺少 id。');
            else {
              pw = where + ' 的提問「' + pr.id + '」';
              if (promptIds[pr.id]) err(pw + ' 的 id 重複。');
              promptIds[pr.id] = 1;
            }
            validateOnceFlags(pr, pw);
            if (pr.when !== undefined) validateWhen(pr.when, pw);
            if (!Array.isArray(pr.choices) || pr.choices.length === 0) err(pw + ' 沒有 choices。');
            (pr.choices || []).forEach(function (c, ci) {
              var cw = pw + ' 的選項 #' + ci;
              if (c && c.id && choiceIds[c.id]) err(cw + ' 的 id 與同一場的其他選項重複。');
              if (c && c.id) choiceIds[c.id] = 1;
              if (validateChoice(c, cw, true)) needsNext = true;
            });
          });
          if (needsNext) {
            if (typeof sc.next !== 'string' || !sc.next) err(where + ' 有選項沒有 to，必須寫 next。');
            else checkScene(sc.next, where + ' 的 next');
          } else if (sc.next !== undefined) checkScene(sc.next, where + ' 的 next');
        } else if (fromPregens) {
          if (typeof sc.choice_to !== 'string' || !sc.choice_to) err(where + ' 使用 choices_from 時必須有 choice_to。');
          else checkScene(sc.choice_to, where + ' 的 choice_to');
        } else if (!Array.isArray(sc.choices) || sc.choices.length === 0) {
          err(where + ' 沒有 choices。');
        } else {
          var seenChoice = {};
          sc.choices.forEach(function (c, ci) {
            var cw = where + ' 的選項 #' + ci;
            if (c && c.id && seenChoice[c.id]) err(cw + ' 的 id 重複。');
            if (c && c.id) seenChoice[c.id] = 1;
            validateChoice(c, cw, false);
          });
        }
      } else if (sc.type === 'check') {
        if (!SKILL_ABILITY[sc.skill]) {
          err(where + ' 的 skill「' + sc.skill + '」不在允許的技能內。');
        }
        if (!Number.isInteger(sc.dc)) err(where + ' 的 dc 必須是整數。');
        checkScene(sc.success_to, where + ' 的 success_to');
        checkScene(sc.fail_to, where + ' 的 fail_to');
        if (sc.fail_hp_delta !== undefined && !Number.isInteger(sc.fail_hp_delta)) err(where + ' 的 fail_hp_delta 必須是整數。');
        if (sc.min_hp !== undefined && !Number.isInteger(sc.min_hp)) err(where + ' 的 min_hp 必須是整數。');
        if (sc.minHp !== undefined && !Number.isInteger(sc.minHp)) err(where + ' 的 minHp 必須是整數。');
        if (sc.on_success !== undefined) validateEffect(sc.on_success, where + ' 的 on_success');
        if (sc.on_failure !== undefined) validateEffect(sc.on_failure, where + ' 的 on_failure');
        ['advantage', 'disadvantage'].forEach(function (key) {
          if (sc[key] === undefined) return;
          if (typeof sc[key] === 'number' || !sc[key] || typeof sc[key] !== 'object' || Array.isArray(sc[key])) {
            err(where + ' 的優勢或劣勢不能寫成數字。禁止用降低難度代替重擲。');
            return;
          }
          validateWhen(sc[key], where + ' 的 ' + key);
        });
        if (sc.success_narr !== undefined && typeof sc.success_narr !== 'string') err(where + ' 的 success_narr 必須是字串。');
        if (sc.fail_narr !== undefined && typeof sc.fail_narr !== 'string') err(where + ' 的 fail_narr 必須是字串。');
        if (sc.success_narr_variants !== undefined) validateNarrVariants(sc.success_narr_variants, where + ' 的 success_narr_variants');
        if (sc.fail_narr_variants !== undefined) validateNarrVariants(sc.fail_narr_variants, where + ' 的 fail_narr_variants');
        validateOnceFlags(sc, where);
      } else if (sc.type === 'combat') {
        if (!Array.isArray(sc.enemies) || sc.enemies.length === 0) err(where + ' 沒有 enemies。');
        else sc.enemies.forEach(function (e, ei) {
          var ew = where + ' 的敵人 #' + ei;
          if (!e) { err(ew + ' 缺少資料。'); return; }
          if (e.skills !== undefined && !Array.isArray(e.skills)) {
            err(ew + ' 的 skills 必須是陣列（預留，本階段不會發動）。');
          }
          if (e.from_pregen) {
            if (e.from_pregen !== 'selected_rival') err(ew + ' 的 from_pregen 只接受 selected_rival。');
            return;
          }
          if (typeof e.name !== 'string' || !e.name) err(ew + ' 缺少 name。');
          ['ac', 'hp', 'atk'].forEach(function (f) {
            if (!Number.isInteger(e[f])) err(ew + ' 的 ' + f + ' 必須是整數。');
          });
          if (!parseDice(e.damage)) err(ew + ' 的 damage「' + e.damage + '」不是合法骰子字串。');
        });
        checkScene(sc.win_to, where + ' 的 win_to');
        if (sc.hidden !== undefined && typeof sc.hidden !== 'boolean') err(where + ' 的 hidden 必須是布林。');
        if (sc.omit_from_tally !== undefined && typeof sc.omit_from_tally !== 'boolean') {
          err(where + ' 的 omit_from_tally 必須是布林。');
        }
        if (sc.flee_to !== undefined && sc.flee_to !== null && sc.flee_to !== FLEE_CHECKPOINT) {
          checkScene(sc.flee_to, where + ' 的 flee_to');
        }
      } else if (sc.type === 'checkpoint') {
        if (!Number.isInteger(sc.floor) || sc.floor < 1) err(where + ' 的 floor 必須是正整數。');
        if (typeof sc.name !== 'string' || !sc.name) err(where + ' 缺少 name。');
        if (!Array.isArray(sc.facts)) err(where + ' 的 facts 必須是陣列。');
        checkScene(sc.continue_to, where + ' 的 continue_to');
        if (sc.continue_label !== undefined && (typeof sc.continue_label !== 'string' || !sc.continue_label)) {
          err(where + ' 的 continue_label 必須是非空字串。');
        }
      } else if (sc.type === 'end') {
        if (sc.end !== 'win' && sc.end !== 'lose' && sc.end !== 'secret_win') {
          err(where + ' 的 end 必須是 win / lose / secret_win。');
        }
        if (typeof sc.name !== 'string' || !sc.name) err(where + ' 缺少 name（結局卡上的名字）。');
        if (sc.ending_type !== undefined && ENDING_TYPES.indexOf(sc.ending_type) < 0) {
          err(where + ' 的 ending_type 必須是 lose / main / variant / class / secret。');
        }
        if (sc.closing !== undefined && typeof sc.closing !== 'string') err(where + ' 的 closing 必須是字串。');
      }
      if (sc.rest !== undefined) validateRestSpec(sc.rest, where + ' 的 rest');
      if (sc.on_enter !== undefined) validateEffect(sc.on_enter, where + ' 的 on_enter');
    });

    // --- meta.required_for_secret
    if (adv.meta !== undefined && adv.meta !== null) {
      if (typeof adv.meta !== 'object' || Array.isArray(adv.meta)) {
        err('meta 必須是物件。');
      } else {
        ['schema_version', 'script_version'].forEach(function (f) {
          if (adv.meta[f] === undefined) return;
          if (!Number.isInteger(adv.meta[f]) || adv.meta[f] < 1) err('meta.' + f + ' 必須是正整數。');
        });
        if (adv.meta.required_for_secret !== undefined) {
          var req = adv.meta.required_for_secret;
          if (!Array.isArray(req)) err('meta.required_for_secret 必須是陣列。');
          else req.forEach(function (id, i) {
            if (typeof id !== 'string' || !id) { err('meta.required_for_secret[' + i + '] 必須是非空字串。'); return; }
            if (!scenes[id]) err('meta.required_for_secret 指向不存在的場景「' + id + '」。');
            else if (scenes[id].type !== 'combat') err('meta.required_for_secret 的「' + id + '」必須是 combat 場景。');
          });
        }
        if (adv.meta.class_flags !== undefined) {
          var classFlags = adv.meta.class_flags;
          if (!classFlags || typeof classFlags !== 'object' || Array.isArray(classFlags)) {
            err('meta.class_flags 必須是物件。');
          } else {
            Object.keys(classFlags).forEach(function (cls) {
              if (typeof cls !== 'string' || !cls) err('meta.class_flags 的職業名稱是空的。');
              if (typeof classFlags[cls] !== 'string' || !classFlags[cls]) {
                err('meta.class_flags「' + cls + '」必須是旗標 id。');
              }
            });
          }
        }
        if (adv.meta.lose_ending !== undefined) {
          var loseEnding = adv.meta.lose_ending;
          if (!loseEnding || typeof loseEnding !== 'object' || Array.isArray(loseEnding)) {
            err('meta.lose_ending 必須是物件。');
          } else {
            if (loseEnding.name !== undefined && (typeof loseEnding.name !== 'string' || !loseEnding.name)) {
              err('meta.lose_ending.name 必須是非空字串。');
            }
            if (loseEnding.closing !== undefined && typeof loseEnding.closing !== 'string') {
              err('meta.lose_ending.closing 必須是字串。');
            }
          }
        }
      }
    }

    if (adv.flag_defs !== undefined) {
      if (!adv.flag_defs || typeof adv.flag_defs !== 'object' || Array.isArray(adv.flag_defs)) {
        err('flag_defs 必須是物件。');
      } else {
        Object.keys(adv.flag_defs).forEach(function (id) {
          var d = adv.flag_defs[id];
          var w = '旗標「' + id + '」';
          if (!d || typeof d !== 'object' || Array.isArray(d)) { err(w + ' 必須是物件。'); return; }
          if (d.key !== undefined && typeof d.key !== 'boolean') err(w + ' 的 key 必須是布林。');
          if (d.label !== undefined && typeof d.label !== 'string') err(w + ' 的 label 必須是字串。');
          if (d.key && (typeof d.label !== 'string' || !d.label)) err(w + ' 標成關鍵選擇時必須有 label。');
          if (d.min !== undefined && !Number.isInteger(d.min)) err(w + ' 的 min 必須是整數。');
          if (d.max !== undefined && !Number.isInteger(d.max)) err(w + ' 的 max 必須是整數。');
          if (Number.isInteger(d.min) && Number.isInteger(d.max) && d.min > d.max) {
            err(w + ' 的 min 不能大於 max。');
          }
        });
      }
    }
    if (adv.class_branches !== undefined) {
      if (!Array.isArray(adv.class_branches)) err('class_branches 必須是陣列。');
      else adv.class_branches.forEach(function (b, i) {
        var bw = '職業分支 #' + i;
        if (!b || typeof b !== 'object') { err(bw + ' 必須是物件。'); return; }
        if (typeof b.id !== 'string' || !b.id) err(bw + ' 缺少 id。');
        else bw = '職業分支「' + b.id + '」';
        if (typeof b.label !== 'string' || !b.label) err(bw + ' 缺少 label。');
        if (b.when === undefined) err(bw + ' 缺少 when。');
        else validateWhen(b.when, bw);
        if (b.completed_when === undefined) err(bw + ' 缺少 completed_when。');
        else validateWhen(b.completed_when, bw + ' 的 completed_when');
        if (typeof b.miss_reason !== 'string' || !b.miss_reason) err(bw + ' 缺少 miss_reason。');
      });
    }
    if (adv.achievements !== undefined && !Array.isArray(adv.achievements)) {
      err('achievements 必須是陣列（預留，本階段不會結算）。');
    }
    if (adv.bestiary !== undefined && !Array.isArray(adv.bestiary)) {
      err('bestiary 必須是陣列（預留，本階段不會結算）。');
    }

    // --- pregens
    if (!Array.isArray(adv.pregens) || adv.pregens.length === 0) {
      err('冒險缺少 pregens 陣列。');
    } else {
      adv.pregens.forEach(function (p, i) {
        var pw = '角色 #' + i;
        if (!p || typeof p.name !== 'string' || !p.name) { err(pw + ' 缺少 name。'); return; }
        pw = '角色「' + p.name + '」';
        ['class', 'race'].forEach(function (f) {
          if (typeof p[f] !== 'string' || !p[f]) err(pw + ' 缺少 ' + f + '。');
        });
        if (p.class_flag !== undefined && (typeof p.class_flag !== 'string' || !p.class_flag)) {
          err(pw + ' 的 class_flag 必須是旗標 id。');
        }
        ['str', 'dex', 'con', 'int', 'wis', 'cha', 'ac', 'hp_max'].forEach(function (f) {
          if (!Number.isInteger(p[f])) err(pw + ' 的 ' + f + ' 必須是整數。');
        });
        if (!Array.isArray(p.skills)) err(pw + ' 的 skills 必須是陣列。');
        else p.skills.forEach(function (s) {
          if (!SKILL_ABILITY[s]) err(pw + ' 的技能「' + s + '」不在允許的技能內。');
        });
        if (!p.attack || typeof p.attack !== 'object') err(pw + ' 缺少 attack。');
        else {
          if (typeof p.attack.name !== 'string' || !p.attack.name) err(pw + ' 的 attack 缺少 name。');
          if (!Number.isInteger(p.attack.bonus)) err(pw + ' 的 attack.bonus 必須是整數。');
          if (!parseDice(p.attack.damage)) err(pw + ' 的 attack.damage「' + p.attack.damage + '」不是合法骰子字串。');
        }
        if (!Array.isArray(p.inventory)) err(pw + ' 的 inventory 必須是陣列。');
        else p.inventory.forEach(function (id) { checkItem(id, pw + ' 的 inventory'); });
        var poolIds = {};
        if (p.pools !== undefined) {
          if (!Array.isArray(p.pools)) err(pw + ' 的 pools 必須是陣列。');
          else p.pools.forEach(function (pool, pi) {
            var qw = pw + ' 的資源 #' + pi;
            if (!pool || typeof pool.id !== 'string' || !pool.id) { err(qw + ' 缺少 id。'); return; }
            if (poolIds[pool.id]) err(qw + ' 的 id 重複。');
            poolIds[pool.id] = 1;
            if (typeof pool.name !== 'string' || !pool.name) err(qw + ' 缺少 name。');
            if (!Number.isInteger(pool.uses) || pool.uses < 1) err(qw + ' 的 uses 必須是正整數。');
          });
        }
        var passiveIds = {};
        var passiveNames = {};
        if (p.passives !== undefined) {
          if (!Array.isArray(p.passives)) err(pw + ' 的 passives 必須是陣列。');
          else p.passives.forEach(function (pass, pi) {
            var bw = pw + ' 的被動 #' + pi;
            if (!pass || typeof pass.id !== 'string' || !pass.id) { err(bw + ' 缺少 id。'); return; }
            if (passiveIds[pass.id]) err(bw + ' 的 id 重複。');
            passiveIds[pass.id] = 1;
            if (typeof pass.name !== 'string' || !pass.name) { err(bw + ' 缺少 name。'); return; }
            if (passiveNames[pass.name]) err(bw + ' 的名稱與另一個被動重複。');
            passiveNames[pass.name] = 1;
            if (pass.dice !== undefined && !parseDice(pass.dice)) err(bw + ' 的 dice 不是合法骰子字串。');
            if (pass.summary !== undefined) {
              if (typeof pass.summary !== 'string' || charLen(pass.summary) < 1 || charLen(pass.summary) > 14) {
                err(bw + ' 的 summary 必須是 1 到 14 字。');
              } else {
                SUMMARY_BAN.forEach(function (needle) {
                  if (pass.summary.indexOf(needle) >= 0) err(bw + ' 的 summary 含有口語字「' + needle + '」。');
                });
              }
            }
            if (pass.detail !== undefined) {
              if (typeof pass.detail !== 'string' || !pass.detail) err(bw + ' 缺少 detail。');
              else SUMMARY_BAN.forEach(function (needle) {
                if (pass.detail.indexOf(needle) >= 0) err(bw + ' 的 detail 含有口語字「' + needle + '」。');
              });
            }
            if (pass.narr !== undefined) {
              if (typeof pass.narr !== 'string' || charLen(pass.narr) < 1 || charLen(pass.narr) > 14) {
                err(bw + ' 的 narr 必須是 1 到 14 字。');
              } else SUMMARY_BAN.forEach(function (needle) {
                if (pass.narr.indexOf(needle) >= 0) err(bw + ' 的 narr 含有口語字「' + needle + '」。');
              });
            }
          });
        }
        if (p.attack && passiveNames[p.attack.name]) err(pw + ' 的攻擊名稱與被動同名。');
        if (!Array.isArray(p.features) || p.features.length < 1) {
          err(pw + ' 的 features 必須是至少一招的陣列。');
        } else {
          var seenFeat = {};
          p.features.forEach(function (f, fi) {
            var fw = pw + ' 的招式 #' + fi;
            if (!f || typeof f.id !== 'string' || !f.id) { err(fw + ' 缺少 id。'); return; }
            fw = pw + ' 的招式「' + f.id + '」';
            if (seenFeat[f.id]) err(fw + ' 的 id 重複。');
            seenFeat[f.id] = 1;
            if (passiveIds[f.id]) err(fw + ' 的 id 與被動重複。');
            if (typeof f.name !== 'string' || !f.name) err(fw + ' 缺少 name。');
            if (passiveNames[f.name]) err(fw + ' 的名稱與被動同名。');
            if (featureIsLegacy(f)) {
              if (f.uses !== 3) err(fw + ' 的 uses 必須是 3。');
              var et = f.effect.type;
              if (et === 'damage' || et === 'heal' || et === 'ac_bonus') {
                if (!Number.isInteger(f.effect.amount) || f.effect.amount < 1) {
                  err(fw + ' 的 effect.amount 必須是正整數。');
                }
                if (et === 'ac_bonus' && f.effect.duration !== 'combat') {
                  err(fw + ' 的 effect.duration 必須是 "combat"。');
                }
              } else {
                err(fw + ' 的 effect.type 必須是 damage / heal / ac_bonus。');
              }
              return;
            }
            if (!MOVE_ROLLS[f.roll]) err(fw + ' 的 roll 必須是 attack / spell_attack / auto / check / save。');
            if (!MOVE_TARGETS[f.target]) err(fw + ' 的 target 必須是 self / ally / enemy / enemies。');
            if (typeof f.costs_turn !== 'boolean') err(fw + ' 的 costs_turn 必須是布林。');
            if (!MOVE_GROUPS[f.group]) err(fw + ' 的 group 必須是 everyday / big / rescue。');
            if (typeof f.summary !== 'string' || charLen(f.summary) < 1 || charLen(f.summary) > 14) {
              err(fw + ' 的 summary 必須是 1 到 14 字。');
            } else {
              SUMMARY_BAN.forEach(function (needle) {
                if (f.summary.indexOf(needle) >= 0) err(fw + ' 的 summary 含有口語字「' + needle + '」。');
              });
            }
            if (typeof f.detail !== 'string' || !f.detail) err(fw + ' 缺少 detail。');
            else {
              SUMMARY_BAN.forEach(function (needle) {
                if (f.detail.indexOf(needle) >= 0) err(fw + ' 的 detail 含有口語字「' + needle + '」。');
              });
            }
            if (f.at_will) {
              if (f.pool) err(fw + ' 是無限次，不能再用法術位。');
              if (f.per) err(fw + ' 是無限次，不能再標全晚一次。');
            } else if (f.per !== undefined) {
              if (f.per !== 'night') err(fw + ' 的 per 必須是 night。');
              if (f.pool) err(fw + ' 全晚一次不能再用法術位。');
            } else if (f.pool !== undefined) {
              if (typeof f.pool !== 'string' || !poolIds[f.pool]) err(fw + ' 的 pool 指向不存在的資源。');
              if (!Number.isInteger(f.cost) || f.cost < 1) err(fw + ' 的 cost 必須是正整數。');
            } else if (!Number.isInteger(f.uses) || f.uses < 1) {
              err(fw + ' 的 uses 必須是正整數（每層次數）。');
            }
            if (f.damage_dice !== undefined) {
              if (!parseDice(f.damage_dice)) err(fw + ' 的 damage_dice 不是合法骰子字串。');
              if (typeof f.damage_type !== 'string' || !f.damage_type) err(fw + ' 有傷害骰時必須寫 damage_type。');
            }
            if (f.heal_dice !== undefined && !parseDice(f.heal_dice)) err(fw + ' 的 heal_dice 不是合法骰子字串。');
            if (f.temp_hp_dice !== undefined && !parseDice(f.temp_hp_dice)) err(fw + ' 的 temp_hp_dice 不是合法骰子字串。');
            if (f.timing !== undefined && f.timing !== 'action' && f.timing !== 'reaction' && f.timing !== 'ready' && f.timing !== 'free') {
              err(fw + ' 的 timing 必須是 action / reaction / ready / free。');
            }
            if (f.combat !== undefined && typeof f.combat !== 'boolean') err(fw + ' 的 combat 必須是布林。');
            if (f.restore_pool !== undefined && (typeof f.restore_pool !== 'string' || !poolIds[f.restore_pool])) {
              err(fw + ' 的 restore_pool 指向不存在的資源。');
            }
            if (f.roll === 'save') {
              if (!SAVE_ABILITIES[f.save]) err(fw + ' 的 save 必須是六項屬性之一。');
              if (!Number.isInteger(f.dc) || f.dc < 1) err(fw + ' 的 dc 必須是正整數。');
              if (f.on_success !== 'none' && f.on_success !== 'half') err(fw + ' 的 on_success 必須是 none / half。');
              if (!parseDice(f.damage_dice)) err(fw + ' 的豁免傷害缺少 damage_dice。');
              if (f.target !== 'enemy' && f.target !== 'enemies') err(fw + ' 的豁免傷害目標必須是 enemy / enemies。');
            }
            if (f.strikes !== undefined) {
              if (!Array.isArray(f.strikes) || f.strikes.length < 2) err(fw + ' 的 strikes 至少要兩擊。');
              else f.strikes.forEach(function (s, si) {
                if (!s || typeof s !== 'object') { err(fw + ' 的第 ' + (si + 1) + ' 擊不正確。'); return; }
                if (!s.uses_weapon && !parseDice(s.damage_dice)) err(fw + ' 的第 ' + (si + 1) + ' 擊缺少傷害。');
              });
            }
          });
          var modern = p.features.some(function (f) { return f && !featureIsLegacy(f); });
          if (modern) {
            var tally = { everyday: 0, big: 0, rescue: 1 };
            p.features.forEach(function (f) {
              if (f && tally[f.group] !== undefined) tally[f.group] += 1;
            });
            if (tally.everyday < 1 || tally.big < 1 || tally.rescue < 1) {
              err(pw + ' 的平時用、大招、救命都要至少有一招。');
            }
          }
        }
      });
    }

    if (options.walk !== false && errors.length === 0) {
      var walked = walkScript(adv);
      if (!walked.ok) walked.errors.forEach(err);
    }

    return { ok: errors.length === 0, errors: errors };
  }

  // ------------------------------------------------------------------- engine
  // status: 'idle' (no run yet) | 'playing' | 'won' | 'secret_won' | 'lost'
  function Engine(adventure, options) {
    options = options || {};
    var report = validateAdventure(adventure, { walk: false });
    if (!report.ok) throw new Error('invalid adventure: ' + report.errors.join(' / '));
    this.adventure = adventure;
    this.rng = options.rng || makeRng(options.seed == null ? 20260904 : options.seed);
    this.items = {};
    adventure.items.forEach(function (it) { this.items[it.id] = it; }, this);
    this.scenes = {};
    adventure.scenes.forEach(function (sc) { this.scenes[sc.id] = sc; }, this);
    this.status = 'idle';
    this.pregenIndex = null;
    this.character = null;
    this.scene = null;
    this.sceneId = null;
    this.flags = {};
    this.done = {};
    this.clearedCombats = {};
    this.keyChoices = [];
    this.rivalPregenIndex = null;
    this.encounter = null;
    this.round = 0;
    this.events = [];
    this.rollLog = [];
    this.lastCheckpoint = null;
    this.startedAt = null;
    this.playMs = 0;
    this.playFrozen = false;
    this.playTimeKnown = false;
    this.partySize = Number.isInteger(options.partySize) && options.partySize >= 1 ? options.partySize : 1;
    this.party = [];
    this.checkpointSnap = null;
    this.retryCount = 0;
    this._combatEntry = null;
  }

  function buildCharacter(p) {
    var pools = {};
    (p.pools || []).forEach(function (pool) {
      pools[pool.id] = { id: pool.id, name: pool.name, uses: pool.uses, usesMax: pool.uses };
    });
    var features = (p.features || []).map(function (f) {
      var copy = deepCopy(f);
      if (f.at_will) {
        copy.at_will = true;
        copy.uses = 0;
        copy.usesMax = 0;
      } else if (f.per === 'night') {
        copy.per = 'night';
        copy.uses = 1;
        copy.usesMax = 1;
      } else if (f.pool && pools[f.pool]) {
        copy.uses = pools[f.pool].uses;
        copy.usesMax = pools[f.pool].usesMax;
        copy.cost = f.cost || 1;
      } else if (featureIsLegacy(f)) {
        copy.uses = f.uses;
        copy.usesMax = f.uses;
      } else {
        copy.uses = f.uses;
        copy.usesMax = f.uses;
      }
      return copy;
    });
    return {
      name: p.name, cls: p['class'], race: p.race,
      str: p.str, dex: p.dex, con: p.con, int: p['int'], wis: p.wis, cha: p.cha,
      ac: p.ac, acBonus: 0, hp: p.hp_max, hp_max: p.hp_max, hpMaxReduction: 0, tempHp: 0,
      skills: (p.skills || []).slice(),
      attack: { name: p.attack.name, bonus: p.attack.bonus, damage: p.attack.damage },
      inventory: (p.inventory || []).slice(),
      features: features,
      pools: pools,
      passives: deepCopy(p.passives || []),
      statuses: [],
      dodging: false,
      sneakUsed: false,
      reactionUsed: false,
      divineStrikeUsed: false
    };
  }

  // --- internal plumbing -----------------------------------------------------
  // Every event carries the frozen narration allowlist exactly as it stood the
  // moment the engine settled that event, so prose can never read later state.
  Engine.prototype.emit = function (ev) {
    ev.view = this.narrationView(null);
    this.events.push(ev);
    this.captureRoll(ev);
    return ev;
  };

  // Structured d20 result for the save. The UI may animate it later; this does not roll.
  function persistedRoll(ev) {
    if (!ev) return null;
    if (ev.t !== 'check' && ev.t !== 'attack' && ev.t !== 'enemy_attack' && ev.t !== 'save') return null;
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

  function sanitizeSavedRoll(roll) {
    if (!roll || typeof roll !== 'object') return null;
    var kind = roll.kind === 'attack' || roll.kind === 'enemy_attack' || roll.kind === 'check' || roll.kind === 'save'
      ? roll.kind : null;
    if (!kind) return null;
    if (roll.side === 'enemy' && kind !== 'save') kind = 'enemy_attack';
    return persistedRoll({ t: kind, d20: roll.d20, dice: roll.dice, mode: roll.mode });
  }

  // Store the sentences the player already saw. Later loads print these
  // strings and do not draw the dice again. The numeric roll is stored too,
  // so a reload during a purely visual animation shows the same faces.
  Engine.prototype.captureRoll = function (ev) {
    var roll = persistedRoll(ev);
    var root = typeof globalThis !== 'undefined' ? globalThis : this;
    var mechanics = root.TOWER && root.TOWER.Mechanics;
    var lines = [];
    if (mechanics && typeof mechanics.rollLines === 'function') {
      lines = mechanics.rollLines(ev) || [];
    }
    if ((!lines || !lines.length) && !roll) return;
    if (!this.rollLog) this.rollLog = [];
    var copy = lines.slice();
    if (copy.length) ev.rollLines = copy;
    var entry = { t: ev.t, lines: copy };
    if (roll) entry.roll = roll;
    this.rollLog.push(entry);
  };
  Engine.prototype.ok = function () { return { ok: true, error: null, events: this.events.slice() }; };
  // reject() never mutates game state; the caller's attempt simply did not happen.
  Engine.prototype.reject = function (msg) { return { ok: false, error: msg, events: this.events.slice() }; };

  Engine.prototype.itemName = function (id) {
    return this.items[id] ? this.items[id].name : id;
  };

  Engine.prototype.inventoryNames = function () {
    return this.character ? this.character.inventory.map(this.itemName, this) : [];
  };

  Engine.prototype.livingEnemies = function () {
    if (!this.encounter) return [];
    var out = [];
    this.encounter.enemies.forEach(function (e, i) {
      if (e.hp > 0 && !e.yielded) out.push({ index: i, ref: e, name: e.name, hp: e.hp, hp_max: e.hp_max });
    });
    return out;
  };

  Engine.prototype.enemySnapshot = function () {
    if (!this.encounter) return [];
    return this.encounter.enemies.map(function (e, i) {
      return { index: i, name: e.name, hp: e.hp, hp_max: e.hp_max, alive: e.hp > 0 && !e.yielded, yielded: !!e.yielded };
    });
  };

  // --- run lifecycle ---------------------------------------------------------
  Engine.prototype.characterFromPregen = function (p) {
    return buildCharacter(p);
  };

  Engine.prototype.makeAlly = function (n) {
    return {
      name: '同伴' + n, cls: '同伴', race: '人類',
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      ac: 12, acBonus: 0, hp: 10, hp_max: 10, hpMaxReduction: 0, tempHp: 0,
      skills: [], attack: { name: '短劍', bonus: 2, damage: '1d4' },
      inventory: [], features: [], pools: {}, passives: [], statuses: [],
      dodging: false, sneakUsed: false, reactionUsed: false, divineStrikeUsed: false, ally: true
    };
  };

  Engine.prototype.syncPartyLeader = function () {
    if (this.party && this.party.length) this.party[0] = this.character;
  };

  Engine.prototype.effectiveAc = function () {
    var c = this.character;
    if (!c) return 0;
    return c.ac + this.passiveAcBonus(c) + (c.acBonus || 0);
  };

  Engine.prototype.passiveAcBonus = function (hero) {
    var n = 0;
    ((hero || this.character).passives || []).forEach(function (p) {
      if (p && Number.isInteger(p.ac_bonus)) n += p.ac_bonus;
    });
    return n;
  };

  Engine.prototype.critFloor = function (hero) {
    var floor = 20;
    ((hero || this.character).passives || []).forEach(function (p) {
      if (p && Number.isInteger(p.crit_on) && p.crit_on >= 1 && p.crit_on < floor) floor = p.crit_on;
    });
    return floor;
  };

  Engine.prototype.clearCombatBonuses = function () {
    if (!this.character) return;
    this.character.acBonus = 0;
    this.character.dodging = false;
    this.character.sneakUsed = false;
    this.character.reactionUsed = false;
    this.character.divineStrikeUsed = false;
  };

  Engine.prototype.restoreMoveUses = function (hero) {
    var c = hero || this.character;
    if (!c) return;
    Object.keys(c.pools || {}).forEach(function (id) {
      c.pools[id].uses = c.pools[id].usesMax;
    });
    (c.features || []).forEach(function (f) {
      if (f.at_will || f.per === 'night') return;
      if (f.pool && c.pools[f.pool]) f.uses = c.pools[f.pool].uses;
      else if (Number.isInteger(f.usesMax) && f.usesMax > 0) f.uses = f.usesMax;
    });
    c.tempHp = 0;
  };

  Engine.prototype.clearStatuses = function (hero) {
    var c = hero || this.character;
    if (!c) return;
    c.statuses = [];
  };

  Engine.prototype.refreshSecretReady = function () {
    this.flags = refreshSecretFlags(this.flags, this.clearedCombats, this.adventure);
  };

  Engine.prototype.conditionState = function () {
    var c = this.character;
    return {
      cls: c ? c.cls : '',
      flags: this.flags,
      inventory: c ? c.inventory : [],
      cleared: this.clearedCombats,
      stats: c ? {
        hp: c.hp, hp_max: c.hp_max,
        str: c.str, dex: c.dex, con: c.con, int: c['int'], wis: c.wis, cha: c.cha, ac: c.ac
      } : {}
    };
  };

  Engine.prototype.conditionsPass = function (when) {
    return conditionsPass(when, this.conditionState());
  };

  Engine.prototype.noteKey = function (id, label) {
    var defs = (this.adventure && this.adventure.flag_defs) || {};
    var def = defs[id];
    if (!def || !def.key) return;
    var text = label || def.label || id;
    var i;
    for (i = 0; i < this.keyChoices.length; i++) {
      if (this.keyChoices[i].id === id) return;
    }
    this.keyChoices.push({ id: id, label: text });
  };

  Engine.prototype.applyFlagEffects = function (choice) {
    this.flags = applyFlagWrites(this.flags, choice, this.adventure.flag_defs);
    var self = this;
    (choice.set_flag || []).forEach(function (f) { self.noteKey(f); });
    if (choice.set && typeof choice.set === 'object') {
      Object.keys(choice.set).forEach(function (k) {
        var v = choice.set[k];
        if (v !== false && v !== '' && v !== 0 && v !== null) self.noteKey(k);
      });
    }
    if (choice.inc && typeof choice.inc === 'object') {
      Object.keys(choice.inc).forEach(function (k) { self.noteKey(k); });
    }
    if (choice.dec && typeof choice.dec === 'object') {
      Object.keys(choice.dec).forEach(function (k) { self.noteKey(k); });
    }
  };

  Engine.prototype.classFlagId = function () {
    var p = this.adventure.pregens[this.pregenIndex];
    if (p && typeof p.class_flag === 'string' && p.class_flag) return p.class_flag;
    var map = this.adventure.meta && this.adventure.meta.class_flags;
    var cls = this.character && this.character.cls;
    if (map && cls && typeof map[cls] === 'string') return map[cls];
    return '';
  };

  Engine.prototype.applyClassFlag = function () {
    var id = this.classFlagId();
    if (id) this.flags[id] = true;
  };

  Engine.prototype.currentPlayMs = function () {
    if (!this.playTimeKnown) return null;
    if (this.playFrozen) return this.playMs || 0;
    if (!Number.isInteger(this.startedAt)) return this.playMs || 0;
    return Math.max(0, Date.now() - this.startedAt);
  };

  Engine.prototype.freezePlayTime = function () {
    if (!this.playTimeKnown || this.playFrozen) return;
    this.playMs = this.currentPlayMs() || 0;
    this.playFrozen = true;
  };

  Engine.prototype.markCombatCleared = function (sceneId) {
    if (sceneId) this.clearedCombats[sceneId] = true;
    this.refreshSecretReady();
  };

  Engine.prototype.extraHeroes = function () {
    return Math.max(0, (this.party ? this.party.length : 1) - 1);
  };

  Engine.prototype.scaleTemplate = function (e) {
    var extra = this.extraHeroes();
    var per = (e && e.per_extra) || { hp: 0, copies: 0 };
    var hpBonus = (Number.isInteger(per.hp) ? per.hp : 0) * extra;
    var copies = (Number.isInteger(per.copies) ? per.copies : 0) * extra;
    return { hpBonus: hpBonus, copies: copies, per: per };
  };

  Engine.prototype.resolveEnemy = function (e, index) {
    var scaled = this.scaleTemplate(e || {});
    if (e && e.from_pregen === 'selected_rival') {
      var idx = this.rivalPregenIndex;
      if (idx === null || idx === undefined) throw new Error('selected_rival but no rival chosen');
      var p = this.adventure.pregens[idx];
      if (!p) throw new Error('invalid rival pregen index');
      var rivalHp = p.hp_max + scaled.hpBonus;
      return {
        id: 'rival',
        name: p.name,
        cls: p.class,
        race: p.race,
        ac: p.ac + (this.passiveAcFrom(p)),
        hp: rivalHp,
        hp_max: rivalHp,
        atk: p.attack.bonus,
        damage: p.attack.damage,
        dex: p.dex,
        wis: p.wis,
        per_extra: { hp: scaled.per.hp || 0, copies: scaled.per.copies || 0 },
        yield: e.yield ? deepCopy(e.yield) : null,
        statuses: [],
        yielded: false
      };
    }
    var hp = e.hp + scaled.hpBonus;
    return {
      id: e.id || ('enemy_' + index),
      name: e.name,
      cls: e.class || null,
      race: e.race || null,
      ac: e.ac,
      hp: hp,
      hp_max: hp,
      atk: e.atk,
      damage: e.damage,
      dex: Number.isInteger(e.dex) ? e.dex : 10,
      wis: Number.isInteger(e.wis) ? e.wis : 10,
      per_extra: { hp: scaled.per.hp || 0, copies: scaled.per.copies || 0 },
      yield: e.yield ? deepCopy(e.yield) : null,
      statuses: [],
      yielded: false,
      grantAdvantage: false,
      disadvantageNext: false,
      mark: null
    };
  };

  Engine.prototype.passiveAcFrom = function (pregen) {
    var n = 0;
    (pregen.passives || []).forEach(function (p) {
      if (p && Number.isInteger(p.ac_bonus)) n += p.ac_bonus;
    });
    return n;
  };

  Engine.prototype.expandEnemyTemplates = function (list) {
    var out = [];
    var self = this;
    (list || []).forEach(function (e) {
      var copies = 1 + self.scaleTemplate(e || {}).copies;
      var n;
      for (n = 0; n < copies; n++) out.push(e);
    });
    return out;
  };

  Engine.prototype.currentPrompt = function () {
    var sc = this.scene;
    if (!sc || !Array.isArray(sc.prompts)) return null;
    var i, j, pr, choices;
    for (i = 0; i < sc.prompts.length; i++) {
      pr = sc.prompts[i];
      if (!pr || !pr.id) continue;
      if (!pr.repeatable && this.done[promptDoneId(sc.id, pr.id)]) continue;
      if (!this.conditionsPass(pr.when)) continue;
      choices = pr.choices || [];
      for (j = 0; j < choices.length; j++) {
        if (this.choiceVisible(choices[j])) return pr;
      }
    }
    return null;
  };

  Engine.prototype.resolvedChoices = function () {
    var sc = this.scene;
    if (!sc || sc.type !== 'beat') return [];
    if (Array.isArray(sc.prompts) && sc.prompts.length) {
      var pr = this.currentPrompt();
      if (!pr) return [];
      return (pr.choices || []).map(function (c) {
        var copy = {};
        var k;
        for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) copy[k] = c[k];
        copy._prompt = pr.id;
        return copy;
      });
    }
    if (sc.choices_from === 'other_pregens') {
      var out = [];
      var self = this;
      var to = sc.choice_to;
      this.adventure.pregens.forEach(function (p, i) {
        if (i === self.pregenIndex) return;
        out.push({
          id: 'rival_' + i,
          label: p.name + '（' + p.class + '／' + p.race + '）',
          to: to,
          _rival_index: i
        });
      });
      return out;
    }
    return (sc.choices || []).slice();
  };

  // Fresh character state, flags cleared, back to the start scene.
  Engine.prototype.beginRun = function (pregenIndex) {
    var p = this.adventure.pregens[pregenIndex];
    if (!p) return this.reject('沒有這個角色。');
    this.pregenIndex = pregenIndex;
    this.character = this.characterFromPregen(p);
    this.party = [this.character];
    var allyN;
    for (allyN = 1; allyN < this.partySize; allyN++) this.party.push(this.makeAlly(allyN));
    this.checkpointSnap = null;
    this.retryCount = 0;
    this.rollLog = [];
    this.flags = {};
    this.done = {};
    this._autoHops = 0;
    this.clearedCombats = {};
    this.keyChoices = [];
    this.rivalPregenIndex = null;
    this.encounter = null;
    this.round = 0;
    this._combatEntry = null;
    this.lastCheckpoint = null;
    this.startedAt = Date.now();
    this.playMs = 0;
    this.playFrozen = false;
    this.playTimeKnown = true;
    this.status = 'playing';
    this.applyClassFlag();
    this.emit({
      t: 'run_start',
      name: this.character.name, cls: this.character.cls, race: this.character.race,
      hp: this.character.hp, hp_max: this.character.hp_max,
      inventory: this.inventoryNames()
    });
    this.enterScene(this.adventure.start);
    return this.ok();
  };

  Engine.prototype.start = function (pregenIndex) {
    this.events = [];
    return this.beginRun(pregenIndex);
  };

  // Full restart from the start scene with fresh character state.
  Engine.prototype.restart = function () {
    this.events = [];
    if (this.pregenIndex == null) return this.reject('還沒有選角色。');
    return this.beginRun(this.pregenIndex);
  };

  Engine.prototype.lose = function (cause) {
    this.status = 'lost';
    this.freezePlayTime();
    this.emit({ t: 'end', outcome: 'lost', cause: cause || 'hp' });
  };

  Engine.prototype.enterScene = function (id) {
    var combatEntry = this._combatEntry || null;
    this._combatEntry = null;
    if (!Number.isInteger(this._autoHops)) this._autoHops = 0;
    var sc = this.scenes[id];
    if (!sc) throw new Error('unknown scene: ' + id); // validator makes this unreachable
    // Combat-only AC bonus ends when leaving combat (flee or all enemies dead).
    this.clearCombatBonuses();
    this.sceneId = id;
    this.scene = sc;
    this.encounter = null;
    if (sc.type === 'checkpoint') this.lastCheckpoint = id;
    this.refreshSecretReady();
    if (sc.type === 'checkpoint') {
      this.restoreMoveUses(this.character);
      this.emit({ t: 'move_refresh', floor: sc.floor || null, healed: 0 });
    }
    if (sc.type === 'combat') {
      this.round = 1;
      var self = this;
      var templates = this.expandEnemyTemplates(sc.enemies);
      this.encounter = {
        enemies: templates.map(function (e, i) { return self.resolveEnemy(e, i); }),
        order: [],
        acted: {},
        round: 1,
        ambush: null,
        heroReady: false
      };
      if (combatEntry) this.encounter.outcomeNarr = combatEntry;
      this.rollInitiative();
    }
    if (sc.type === 'end' && sc.when && !this.conditionsPass(sc.when)) {
      this.emit({
        t: 'scene',
        sceneType: sc.type,
        facts: resolveFacts(sc.facts, this.conditionState()),
        name: sc.name || null,
        floor: sc.floor || null,
        enemies: [],
        blocked: true
      });
      this.emit({ t: 'end_blocked', name: sc.name || sc.id });
      return;
    }
    if (sc.type === 'check' && checkIsOnce(sc)) {
      var lock = this.done[checkDoneId(id)];
      if (lock && typeof lock === 'object' && this._autoHops < 12) {
        this.emit({ t: 'check_locked', success: !!lock.success, skill: sc.skill, dc: sc.dc });
        this._autoHops++;
        this.enterScene(lock.success ? sc.success_to : sc.fail_to);
        return;
      }
    }
    if (sc.on_enter && !(enterIsOnce(sc.on_enter) && this.done[enterDoneId(id)])) {
      if (enterIsOnce(sc.on_enter)) this.done[enterDoneId(id)] = true;
      if (!this.applyEffectBundle(sc.on_enter, 'enter')) return;
    }
    if (this.status !== 'playing') return;
    if (sc.type === 'beat' && Array.isArray(sc.prompts) && sc.prompts.length &&
        !this.currentPrompt() && typeof sc.next === 'string' && this._autoHops < 12) {
      this._autoHops++;
      this.enterScene(sc.next);
      return;
    }
    if (sc.rest && this.conditionsPass(sc.rest.when)) {
      var rid = restDoneId(id);
      if (!(restIsOnce(sc.rest) && this.done[rid])) {
        if (restIsOnce(sc.rest)) this.done[rid] = true;
        this.applyRest(sc.rest);
      }
    }
    if (sc.type === 'checkpoint') this.captureCheckpoint();
    this.emit({
      t: 'scene',
      sceneType: sc.type,
      facts: resolveFacts(sc.facts, this.conditionState()),
      name: sc.name || null,
      floor: sc.floor || null,
      enemies: this.enemySnapshot()
    });
    if (sc.type === 'end') {
      if (sc.end === 'win') this.status = 'won';
      else if (sc.end === 'secret_win') this.status = 'secret_won';
      else this.status = 'lost';
      this.freezePlayTime();
      this.emit({ t: 'end', outcome: this.status, cause: 'scene' });
    }
  };

  // --- hp helper -------------------------------------------------------------
  // Single place where player HP moves outside of combat damage.
  // clear_status clears the status list. Floor checkpoints do not set heal,
  // so they restore move uses only.
  Engine.prototype.applyRest = function (rest) {
    if (!rest) return;
    if (rest.clear_status) {
      this.clearStatuses(this.character);
      this.emit({ t: 'clear_status' });
    }
    var amount = restHealAmount(rest, this.character.hp_max);
    if (amount < 1) return;
    var beforeHp = this.character.hp;
    var healed = Math.min(amount, this.character.hp_max - beforeHp);
    if (healed > 0) {
      this.character.hp = beforeHp + healed;
      this.emit({ t: 'rest', healed: healed, hp: this.character.hp, hp_max: this.character.hp_max });
    }
  };

  Engine.prototype.captureCheckpoint = function () {
    var snap = this.exportSave();
    if (!snap) return;
    delete snap.checkpointSnap;
    this.checkpointSnap = snap;
  };

  Engine.prototype.applyHpDelta = function (delta, reason, floor) {
    var c = this.character;
    var next = c.hp + delta;
    if (next > c.hp_max) next = c.hp_max;
    if (Number.isInteger(floor) && next < floor) next = floor;
    if (next < 0) next = 0;
    c.hp = next;
    this.emit({ t: 'hp', delta: delta, hp: c.hp, hp_max: c.hp_max, reason: reason || null });
    if (c.hp <= 0) { this.lose('hp'); return false; }
    return true;
  };

  Engine.prototype.applyEffectBundle = function (effect, reason) {
    if (!effect) return true;
    var self = this;
    this.applyFlagEffects(effect);
    (effect.give || []).forEach(function (itemId) {
      self.character.inventory.push(itemId);
      self.emit({ t: 'give', itemName: self.itemName(itemId) });
    });
    (effect.take || []).forEach(function (itemId) {
      var i = self.character.inventory.indexOf(itemId);
      if (i >= 0) {
        self.character.inventory.splice(i, 1);
        self.emit({ t: 'take', itemName: self.itemName(itemId) });
      }
    });
    if (effect.hp_delta != null && effect.hp_delta !== 0) {
      if (!this.applyHpDelta(effect.hp_delta, reason || 'effect', hpFloorOf(effect))) return false;
    }
    return true;
  };

  // A choice that opens a once-only check, or null.
  Engine.prototype.choiceLeadsToOnceCheck = function (choice) {
    if (!choice || typeof choice.to !== 'string') return null;
    var dest = this.scenes[choice.to];
    if (!dest || dest.type !== 'check' || !checkIsOnce(dest)) return null;
    return dest;
  };

  // Hall-style gate: every check from this beat shares one destination and
  // none of them carry their own success or failure bundle. Once any of
  // those checks has a result, the way forward is that destination.
  Engine.prototype.gateDestination = function (scene) {
    var choices = (scene && scene.choices) || [];
    var shared = null;
    var settled = false;
    var i;
    for (i = 0; i < choices.length; i++) {
      var check = this.choiceLeadsToOnceCheck(choices[i]);
      if (!check) continue;
      if (checkBreaksSharedGate(check)) return null;
      if (typeof check.success_to !== 'string' || check.success_to !== check.fail_to) return null;
      if (shared == null) shared = check.success_to;
      else if (shared !== check.success_to) return null;
      var lock = this.done[checkDoneId(check.id)];
      if (lock && typeof lock === 'object') settled = true;
    }
    if (!settled || typeof shared !== 'string' || !this.scenes[shared]) return null;
    return shared;
  };

  // --- legal actions ---------------------------------------------------------
  Engine.prototype.choiceVisible = function (c) {
    var i;
    if (!c) return false;
    if (choiceIsOnce(c) && this.sceneId && this.done[choiceDoneId(this.sceneId, c.id)]) return false;
    if (!this.conditionsPass(c.when)) return false;
    if (Array.isArray(c.require_flag)) {
      for (i = 0; i < c.require_flag.length; i++) if (!this.flags[c.require_flag[i]]) return false;
    }
    if (Array.isArray(c.require_item)) {
      for (i = 0; i < c.require_item.length; i++) {
        if (this.character.inventory.indexOf(c.require_item[i]) < 0) return false;
      }
    }
    return true;
  };

  // Every inventory slot, with whether use_item on it is legal right now.
  // use_item is always offered in beat / check / combat scenes; it is never
  // authored as a choice in the data.
  Engine.prototype.itemActions = function () {
    var self = this;
    var inCombat = this.scene && this.scene.type === 'combat';
    var living = this.livingEnemies();
    return this.character.inventory.map(function (id, slot) {
      var it = self.items[id];
      var act = {
        type: 'use_item', slot: slot, itemId: id, itemName: it.name, kind: it.kind,
        effect: null, amount: 0, enabled: false, needsTarget: false, reason: null
      };
      if (it.kind !== 'consumable') {
        act.reason = '這件物品不能使用。';
        return act;
      }
      if (it.heal !== undefined && it.heal !== null) {
        act.effect = 'heal';
        act.amount = it.heal;
        act.enabled = true;
      } else {
        act.effect = 'damage';
        act.amount = it.damage;
        if (!inCombat) act.reason = '只能在戰鬥中使用。';
        else if (living.length === 0) act.reason = '沒有目標。';
        else { act.enabled = true; act.needsTarget = living.length > 1; }
      }
      return act;
    });
  };

  // Moves still in the action list. Reactions stay off this list and fire on their own.
  // The move sheet still shows them, including when they are out of uses.
  Engine.prototype.featureActions = function () {
    var self = this;
    var features = (this.character && this.character.features) || [];
    return features.filter(function (f) { return f.timing !== 'reaction'; }).map(function (f) {
      if (featureIsLegacy(f)) return self.legacyFeatureAction(f);
      var d = self.describeMove(f);
      return {
        type: 'use_feature', featureId: f.id, featureName: f.name,
        uses: d.atWill ? null : self.moveUsesLeft(self.character, f),
        usesMax: f.at_will ? null : f.usesMax,
        effect: f.heal_dice ? 'heal' : (f.temp_hp_dice ? 'temp' : (f.roll || 'move')),
        amount: 0,
        costsTurn: d.costsTurn,
        targetType: f.target || null,
        enabled: d.enabled,
        needsTarget: d.needsTarget,
        reason: d.reason,
        summary: d.summary,
        detail: d.detail,
        group: d.group,
        usesLabel: d.usesLabel,
        grey: d.grey,
        atWill: d.atWill
      };
    });
  };

  Engine.prototype.legacyFeatureAction = function (f) {
    var inCombat = this.scene && this.scene.type === 'combat';
    var living = this.livingEnemies();
    var act = {
      type: 'use_feature', featureId: f.id, featureName: f.name,
      uses: f.uses, usesMax: f.usesMax,
      effect: f.effect.type, amount: f.effect.amount,
      costsTurn: true, targetType: null,
      enabled: false, needsTarget: false, reason: null,
      summary: '', detail: '', group: null,
      usesLabel: f.uses > 0 ? ('剩 ' + f.uses + '／' + f.usesMax) : '需休息',
      grey: f.uses <= 0, atWill: false
    };
    if (f.uses <= 0) {
      act.reason = '需休息';
      return act;
    }
    if (f.effect.type === 'heal') act.enabled = this.character.hp < this.character.hp_max;
    else if (f.effect.type === 'damage') {
      if (!inCombat) act.reason = '只能在戰鬥中使用。';
      else if (!living.length) act.reason = '沒有目標。';
      else { act.enabled = true; act.needsTarget = living.length > 1; }
    } else if (f.effect.type === 'ac_bonus') {
      if (!inCombat) act.reason = '只能在戰鬥中使用。';
      else if ((this.character.acBonus || 0) > 0) act.reason = '這一場已經有護甲加成。';
      else act.enabled = true;
    }
    if (!act.enabled && !act.reason && f.effect.type === 'heal') act.reason = '生命已滿。';
    return act;
  };

  Engine.prototype.legalActions = function () {
    if (this.status !== 'playing' || !this.scene) return [];
    var sc = this.scene, acts = [], self = this;
    if (sc.type === 'beat') {
      this.refreshSecretReady();
      var gate = this.gateDestination(sc);
      this.resolvedChoices().forEach(function (c) {
        if (!self.choiceVisible(c)) return; // hidden when requirements unmet
        if (gate && self.choiceLeadsToOnceCheck(c)) return;
        acts.push({ type: 'choice', id: c.id, label: c.label });
      });
      if (gate && !acts.some(function (a) { return a.type === 'choice'; })) {
        acts.push({ type: 'choice', id: '__return_path__', label: '繼續前進' });
      }
    } else if (sc.type === 'check') {
      // No roll happens on entry: the player presses this.
      // A once-only check that already has a result is skipped on re-entry.
      if (!(checkIsOnce(sc) && this.done[checkDoneId(sc.id)])) {
        acts.push({
          type: 'roll', skill: sc.skill, dc: sc.dc,
          mode: checkMode(sc, function (when) { return self.conditionsPass(when); })
        });
      }
    } else if (sc.type === 'combat') {
      this.livingEnemies().forEach(function (e) {
        acts.push({ type: 'attack', target: e.index, targetName: e.name, targetHp: e.hp, targetHpMax: e.hp_max });
      });
      acts.push({ type: 'defend' });
      acts.push({ type: 'flee', to: sc.flee_to || null });
    } else if (sc.type === 'checkpoint') {
      acts.push({ type: 'continue', label: sc.continue_label || '繼續前進' });
    }
    if (sc.type === 'beat' || sc.type === 'check' || sc.type === 'combat') {
      acts = acts.concat(this.itemActions());
      acts = acts.concat(this.featureActions());
    }
    return acts;
  };

  // --- actions ---------------------------------------------------------------
  Engine.prototype.perform = function (action) {
    this.events = [];
    this._autoHops = 0;
    var cmd = normalizeCommand(action);
    if (!cmd || typeof cmd.action !== 'string') return this.reject('未知的行動。');
    if (cmd.action === 'restart') return this.restart();
    if (cmd.action === 'retry') return this.doRetry();
    if (this.status !== 'playing') return this.reject('這一場已經結束了。');
    if (cmd.actor !== 0 && cmd.actor !== '0') return this.reject('現在不能替這個角色行動。');
    switch (cmd.action) {
      case 'choice':   return this.doChoice(cmd.id);
      case 'roll':     return this.doRoll();
      case 'attack':   return this.doAttack(cmd.target);
      case 'item':     return this.doUseItem(cmd.slot, cmd.target);
      case 'move':     return this.doMove(cmd);
      case 'defend':   return this.doDefend();
      case 'flee':     return this.doFlee();
      case 'continue': return this.doContinue();
      case 'ambush':   return this.doAmbush(cmd.outcome);
      default:         return this.reject('未知的行動。');
    }
  };

  Engine.prototype.doChoice = function (id) {
    var sc = this.scene, self = this;
    if (sc.type !== 'beat') return this.reject('現在不能做這個選擇。');
    if (id === '__return_path__') {
      var dest = this.gateDestination(sc);
      if (!dest) return this.reject('現在沒有路可以走。');
      this.emit({ t: 'choice', label: '繼續前進' });
      this.enterScene(dest);
      return this.ok();
    }
    this.refreshSecretReady();
    var choice = null;
    this.resolvedChoices().forEach(function (c) { if (c.id === id) choice = c; });
    if (!choice) return this.reject('沒有這個選項。');
    if (!this.choiceVisible(choice)) return this.reject('現在還做不到這件事。');

    var choiceNarr = resolveNarration(choice.narr, choice.narr_variants, this.conditionState());
    this.emit({ t: 'choice', label: choice.label, narr: choiceNarr || '' });
    if (choice._prompt) {
      var prompts = sc.prompts || [];
      var pr = null;
      prompts.forEach(function (p) { if (p && p.id === choice._prompt) pr = p; });
      if (pr && !pr.repeatable) this.done[promptDoneId(sc.id, pr.id)] = true;
    }
    if (choiceIsOnce(choice) && choice.id) this.done[choiceDoneId(sc.id, choice.id)] = true;
    if (choice._rival_index !== undefined && choice._rival_index !== null) {
      self.rivalPregenIndex = choice._rival_index;
      var rp = self.adventure.pregens[choice._rival_index];
      if (rp) {
        self.flags.rival = rp.name;
        self.noteKey('rival', '對手：' + rp.name + '（' + rp['class'] + '）');
      }
    }
    if (!this.applyEffectBundle(choice, 'choice')) return this.ok();
    if (choice.rest && this.conditionsPass(choice.rest.when)) this.applyRest(choice.rest);
    if (typeof choice.to === 'string' && choice.to) {
      if (this.scenes[choice.to] && this.scenes[choice.to].type === 'combat') {
        this._combatEntry = combatTransitionNarr(choice);
      }
      this.enterScene(choice.to);
      return this.ok();
    }
    if (Array.isArray(sc.prompts) && sc.prompts.length) {
      if (!this.currentPrompt() && typeof sc.next === 'string') this.enterScene(sc.next);
      return this.ok();
    }
    return this.reject('這個選項沒有去向。');
  };

  Engine.prototype.doContinue = function () {
    var sc = this.scene;
    if (!sc || sc.type !== 'checkpoint') return this.reject('現在不是歇腳點。');
    this.emit({ t: 'checkpoint', action: 'continue', floor: sc.floor || null, name: sc.name || '' });
    this.enterScene(sc.continue_to);
    return this.ok();
  };

  Engine.prototype.doRoll = function () {
    var sc = this.scene, c = this.character, self = this;
    if (sc.type !== 'check') return this.reject('現在不需要擲骰。');
    if (checkIsOnce(sc) && this.done[checkDoneId(sc.id)]) return this.reject('這個檢定已經擲過了。');
    var ability = SKILL_ABILITY[sc.skill];
    var mod = abilityMod(c[ability]);
    var prof = c.skills.indexOf(sc.skill) >= 0 ? PROFICIENCY_BONUS : 0;
    var mode = checkMode(sc, function (when) { return self.conditionsPass(when); });
    var rolled = rollD20(this.rng, mode);
    var d20 = rolled.face;
    var total = d20 + mod + prof;
    var success = total >= sc.dc; // landing exactly on the DC succeeds
    var narr = resolveNarration(
      success ? sc.success_narr : sc.fail_narr,
      success ? sc.success_narr_variants : sc.fail_narr_variants,
      this.conditionState()
    );
    var record = {
      success: success, d20: d20, dice: rolled.dice.slice(), mode: rolled.mode,
      mod: mod, prof: prof, total: total, dc: sc.dc, skill: sc.skill, ability: ability, narr: narr
    };
    this.emit({
      t: 'check', skill: sc.skill, ability: ability,
      d20: d20, dice: rolled.dice, mode: rolled.mode,
      mod: mod, prof: prof, total: total, dc: sc.dc, success: success, narr: narr
    });
    if (checkIsOnce(sc)) this.done[checkDoneId(sc.id)] = record;
    var branch = success ? sc.on_success : sc.on_failure;
    var branchSetsHp = branch && branch.hp_delta != null;
    if (!success && sc.fail_hp_delta && !branchSetsHp) {
      if (!this.applyHpDelta(sc.fail_hp_delta, 'check_fail', hpFloorOf(sc))) return this.ok();
    }
    if (branch && !this.applyEffectBundle(branch, success ? 'check_success' : 'check_fail')) return this.ok();
    this.enterScene(success ? sc.success_to : sc.fail_to);
    return this.ok();
  };

  function actorKey(entry) { return entry.kind + ':' + entry.index; }

  // Initiative uses a stream derived from the save seed and how many dice
  // have already been rolled. The result is stored on the encounter, so a
  // reload does not roll it again, and attack dice stay on the main stream.
  Engine.prototype.initiativeRng = function () {
    var seed = (this.rng && this.rng.seed) ? this.rng.seed : 1;
    var n = this.rng && this.rng.rolled ? this.rng.rolled() : 0;
    var id = this.sceneId || '';
    var h = 2166136261;
    var i;
    for (i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    var mixed = (seed ^ Math.imul(n + 1, 0x9e3779b9) ^ h) >>> 0;
    return makeRng(mixed || 1);
  };

  Engine.prototype.rollInitiative = function () {
    var order = [];
    var self = this;
    var rng = this.initiativeRng();
    (this.party || []).forEach(function (m, i) {
      if (!m || m.hp <= 0) return;
      var d20 = rng.die(20);
      var bonus = abilityMod(m.dex || 10) + HERO_INITIATIVE_BONUS;
      order.push({ kind: 'hero', index: i, roll: d20, bonus: bonus, total: d20 + bonus });
    });
    this.encounter.enemies.forEach(function (e, i) {
      var d20 = rng.die(20);
      var bonus = abilityMod(e.dex != null ? e.dex : 10);
      order.push({ kind: 'enemy', index: i, roll: d20, bonus: bonus, total: d20 + bonus });
    });
    order.sort(function (a, b) {
      if (b.total !== a.total) return b.total - a.total;
      if (a.kind !== b.kind) return a.kind === 'hero' ? -1 : 1;
      return a.index - b.index;
    });
    this.encounter.order = order;
    this.encounter.acted = {};
    this.encounter.round = 1;
    this.round = 1;
    this.emit({
      t: 'initiative',
      order: order.map(function (entry) {
        var name = entry.kind === 'hero'
          ? self.party[entry.index].name
          : self.encounter.enemies[entry.index].name;
        return { kind: entry.kind, index: entry.index, name: name, roll: entry.roll, bonus: entry.bonus, total: entry.total };
      })
    });
  };

  Engine.prototype.entrySurprised = function (entry, round) {
    var ambush = this.encounter && this.encounter.ambush;
    var r = round == null ? this.encounter.round : round;
    if (!ambush || r > 1) return false;
    if (ambush === 'success' && entry.kind === 'enemy') return true;
    if (ambush === 'failure' && entry.kind === 'hero') return true;
    return false;
  };

  Engine.prototype.entryAlive = function (entry) {
    if (!entry || !this.encounter) return false;
    if (entry.kind === 'hero') {
      var m = this.party[entry.index];
      return !!(m && m.hp > 0);
    }
    var e = this.encounter.enemies[entry.index];
    return !!(e && e.hp > 0 && !e.yielded);
  };

  Engine.prototype.allResolved = function (acted, round) {
    var order = this.encounter.order || [];
    var i, entry;
    for (i = 0; i < order.length; i++) {
      entry = order[i];
      if (!this.entryAlive(entry)) continue;
      if (this.entrySurprised(entry, round)) continue;
      if (!acted[actorKey(entry)]) return false;
    }
    return true;
  };

  // Mutates state. Opens the next round when everyone who can act has acted.
  Engine.prototype.takeNext = function (state) {
    if (this.allResolved(state.acted, state.round)) {
      state.round += 1;
      state.acted = {};
    }
    var order = this.encounter.order || [];
    var i, entry;
    for (i = 0; i < order.length; i++) {
      entry = order[i];
      if (!this.entryAlive(entry)) continue;
      if (this.entrySurprised(entry, state.round)) continue;
      if (state.acted[actorKey(entry)]) continue;
      return entry;
    }
    return null;
  };

  Engine.prototype.queueState = function () {
    return { acted: copyMap(this.encounter.acted), round: this.encounter.round };
  };

  Engine.prototype.commitQueue = function (state) {
    this.encounter.acted = state.acted;
    this.encounter.round = state.round;
    this.round = state.round;
  };

  Engine.prototype.enemySwingCounts = function () {
    var before = 0;
    var after = 0;
    if (!this.encounter || !this.encounter.order) return { before: 0, after: 0 };
    var state = this.queueState();
    var phase = 'before';
    var restRound = null;
    var guard = 0;
    while (guard++ < 40) {
      var entry = this.takeNext(state);
      if (!entry) break;
      if (entry.kind === 'hero' && entry.index === 0) {
        if (phase === 'before') {
          phase = 'after';
          restRound = state.round;
          state.acted[actorKey(entry)] = true;
          continue;
        }
        break;
      }
      if (phase === 'after' && state.round !== restRound) break;
      if (entry.kind === 'enemy') {
        if (phase === 'before') before++;
        else after++;
      }
      state.acted[actorKey(entry)] = true;
    }
    return { before: before, after: after };
  };

  Engine.prototype.enemyAttacksBeforeHero = function () {
    return this.enemySwingCounts().before;
  };

  Engine.prototype.enemyAttacksAfterHero = function () {
    return this.enemySwingCounts().after;
  };

  Engine.prototype.combatResult = function () {
    if (!this.encounter || !this.encounter.enemies.length) return null;
    var enemies = this.encounter.enemies;
    var unresolved = false;
    var yielded = false;
    enemies.forEach(function (e) {
      if (e.yielded) yielded = true;
      else if (e.hp > 0) unresolved = true;
    });
    if (unresolved) return null;
    return yielded ? 'yield' : 'defeat';
  };

  Engine.prototype.combatOutcomeLine = function (kind) {
    var narr = this.encounter && this.encounter.outcomeNarr;
    if (!narr) return '';
    var text = kind === 'flee' ? narr.fleeText : narr.winText;
    return typeof text === 'string' ? text : '';
  };

  Engine.prototype.winCombat = function (reason) {
    var why = reason || 'defeat';
    var ev = { t: 'combat_win', reason: why };
    var line = this.combatOutcomeLine('win');
    if (line) ev.narr = line;
    this.emit(ev);
    var dest = this.scene.win_to;
    this.markCombatCleared(this.sceneId);
    this.enterScene(dest);
    return this.ok();
  };

  Engine.prototype.findMove = function (hero, id) {
    var found = null;
    ((hero || this.character).features || []).forEach(function (f) {
      if (f.id === id) found = f;
    });
    return found;
  };

  Engine.prototype.moveUsesLeft = function (hero, feature) {
    if (!feature) return 0;
    if (feature.at_will) return 99;
    if (feature.pool && hero.pools && hero.pools[feature.pool]) return hero.pools[feature.pool].uses;
    return feature.uses || 0;
  };

  Engine.prototype.spendMove = function (hero, feature) {
    if (feature.at_will) return 99;
    if (feature.pool && hero.pools && hero.pools[feature.pool]) {
      var pool = hero.pools[feature.pool];
      var cost = feature.cost || 1;
      if (pool.uses < cost) return -1;
      pool.uses -= cost;
      (hero.features || []).forEach(function (f) {
        if (f.pool === feature.pool) f.uses = pool.uses;
      });
      return pool.uses;
    }
    if ((feature.uses || 0) < 1) return -1;
    feature.uses -= 1;
    return feature.uses;
  };

  Engine.prototype.describeMove = function (feature) {
    var c = this.character;
    var inCombat = !!(this.scene && this.scene.type === 'combat');
    var uses = this.moveUsesLeft(c, feature);
    var cost = feature.cost || 1;
    var pool = feature.pool && c.pools ? c.pools[feature.pool] : null;
    var out = {
      id: feature.id,
      name: feature.name,
      summary: feature.summary || '',
      detail: feature.detail || '',
      group: feature.group || null,
      atWill: !!feature.at_will,
      per: feature.per || null,
      timing: feature.timing || 'action',
      needsTarget: false,
      costsTurn: feature.costs_turn !== false,
      grey: false,
      enabled: false,
      reason: null,
      usesLabel: '',
      kind: 'move'
    };
    var living = this.livingEnemies();
    function depleted() { return feature.per === 'night' ? '今晚已用' : '需休息'; }
    if (!feature.at_will && uses < cost) {
      out.grey = true;
      out.usesLabel = depleted();
      out.reason = out.usesLabel;
      return out;
    }
    if (feature.at_will) out.usesLabel = '';
    else if (pool) out.usesLabel = poolDots(pool);
    else out.usesLabel = '剩 ' + uses + '／' + feature.usesMax;
    if (feature.timing === 'reaction') {
      out.enabled = false;
      if (feature.effect && feature.effect.type === 'ac_bonus') {
        out.grey = true;
        out.reason = '攻擊將失時自動施放';
      } else {
        out.reason = '受創時自動發動';
      }
      return out;
    }
    if (feature.combat === false) {
      if (inCombat) {
        out.grey = true;
        out.usesLabel = '戰鬥外使用';
        out.reason = '戰鬥外使用';
        return out;
      }
      if (feature.restore_pool) {
        var rp = c.pools[feature.restore_pool];
        if (rp && rp.uses >= rp.usesMax) {
          out.reason = rp.name + '已滿';
          return out;
        }
      }
      out.enabled = true;
      return out;
    }
    if (feature.temp_hp_dice) {
      out.enabled = true;
      return out;
    }
    if (feature.heal_dice) {
      if (c.hp >= c.hp_max) out.reason = '生命已滿';
      else out.enabled = true;
      return out;
    }
    if (feature.timing === 'ready' || (feature.effect && feature.effect.type === 'ac_bonus')) {
      if (!inCombat) { out.reason = '只能在戰鬥中使用'; return out; }
      if ((c.acBonus || 0) > 0) { out.reason = '這一場已經有護甲加成'; return out; }
      out.enabled = true;
      return out;
    }
    if (!inCombat) { out.reason = '只能在戰鬥中使用'; return out; }
    if (!living.length) { out.reason = '沒有目標'; return out; }
    out.enabled = true;
    if (feature.missiles) out.needsTarget = living.length > 1;
    else if (feature.target === 'enemy') out.needsTarget = living.length > 1;
    return out;
  };

  Engine.prototype.moveSheet = function () {
    var self = this;
    var c = this.character;
    var inCombat = !!(this.scene && this.scene.type === 'combat');
    var groups = [
      { id: 'everyday', label: '平時用', open: false, moves: [] },
      { id: 'big', label: '大招', open: false, moves: [] },
      { id: 'rescue', label: '救命', open: false, moves: [] }
    ];
    var byId = { everyday: groups[0], big: groups[1], rescue: groups[2] };
    ((c && c.features) || []).forEach(function (f) {
      if (!f || !byId[f.group]) return;
      byId[f.group].moves.push(self.describeMove(f));
    });
    var passiveMoves = [];
    ((c && c.passives) || []).forEach(function (p) {
      if (!p || !p.summary) return;
      passiveMoves.push({
        id: p.id,
        name: p.name,
        summary: p.summary,
        detail: p.detail || p.summary,
        group: 'passive',
        atWill: true,
        per: null,
        timing: 'passive',
        needsTarget: false,
        costsTurn: false,
        grey: false,
        enabled: false,
        reason: '自動生效',
        usesLabel: '',
        kind: 'passive'
      });
    });
    if (passiveMoves.length) {
      groups.push({ id: 'passive', label: '被動', open: false, moves: passiveMoves });
    }
    if (inCombat) {
      byId.rescue.moves.push({
        id: 'defend',
        name: '防守',
        summary: '敵人攻擊你有劣勢',
        detail: '直到你下次行動前，敵人攻擊你有劣勢。',
        group: 'rescue',
        atWill: true,
        per: null,
        timing: 'action',
        needsTarget: false,
        costsTurn: true,
        grey: false,
        enabled: true,
        reason: null,
        usesLabel: '',
        kind: 'defend'
      });
    }
    return { groups: groups, inCombat: inCombat };
  };

  function renderMoveGroups(doc, parent, sheet, handlers) {
    handlers = handlers || {};
    (sheet.groups || []).forEach(function (group) {
      var block = doc.createElement('div');
      block.className = 'move-group' + (group.open ? ' open' : '');
      var head = doc.createElement('button');
      head.type = 'button';
      head.className = 'btn move-toggle';
      head.textContent = group.label;
      head.setAttribute('aria-expanded', group.open ? 'true' : 'false');
      head.setAttribute('data-group', group.id);
      head.addEventListener('click', function () {
        if (handlers.onToggle) handlers.onToggle(group.id);
      });
      block.appendChild(head);
      if (group.open) {
        var list = doc.createElement('div');
        list.className = 'move-list';
        (group.moves || []).forEach(function (move) {
          var b = doc.createElement('button');
          b.type = 'button';
          b.className = 'btn move' + (move.grey ? ' spent' : '');
          b.setAttribute('data-move', move.id);
          b.setAttribute('data-group', group.id);
          if (move.grey) b.setAttribute('data-spent', '1');
          b.appendChild(doc.createTextNode(move.name));
          if (move.summary) {
            var summary = doc.createElement('small');
            summary.className = 'summary';
            summary.textContent = move.summary;
            b.appendChild(summary);
          }
          if (move.usesLabel) {
            var uses = doc.createElement('small');
            uses.className = 'uses';
            uses.textContent = move.usesLabel;
            b.appendChild(uses);
          }
          b.addEventListener('click', function () {
            if (handlers.onMove) handlers.onMove(move);
          });
          list.appendChild(b);
        });
        block.appendChild(list);
      }
      parent.appendChild(block);
    });
  }

  Engine.prototype.hurtEnemy = function (enemy, amount) {
    var rule = enemy.yield;
    var before = enemy.hp;
    if (rule && rule.kind === 'hp_fraction') {
      var threshold = fractionThreshold(enemy.hp_max, rule.num, rule.den);
      if (threshold > 0 && before - amount <= threshold) {
        enemy.hp = threshold;
        enemy.yielded = true;
        return { yielded: true, hp: enemy.hp, stopped: true, threshold: threshold };
      }
    }
    enemy.hp = Math.max(0, before - amount);
    return { yielded: false, hp: enemy.hp, stopped: false, threshold: null };
  };

  Engine.prototype.checkGroupYield = function () {
    if (!this.encounter) return false;
    var groups = {};
    this.encounter.enemies.forEach(function (e) {
      if (!e.yield || e.yield.kind !== 'last_standing') return;
      var g = e.yield.group || e.name;
      if (!groups[g]) groups[g] = [];
      groups[g].push(e);
    });
    var triggered = false;
    Object.keys(groups).forEach(function (g) {
      var members = groups[g];
      if (members.length < 2) return;
      if (members.some(function (e) { return e.yielded; })) return;
      var living = members.filter(function (e) { return e.hp > 0; });
      if (living.length === 1) {
        living[0].yielded = true;
        triggered = true;
      } else if (living.length === 0) {
        var last = members[members.length - 1];
        members.forEach(function (e) { if (e.hp <= 0) last = e; });
        last.hp = 1;
        last.yielded = true;
        triggered = true;
      }
    });
    return triggered;
  };

  Engine.prototype.hurtHero = function (hero, amount) {
    var feature = this.findMove(hero, 'uncanny_dodge');
    var original = amount;
    var halved = false;
    if (feature && this.moveUsesLeft(hero, feature) > 0 && amount >= 4 &&
        feature.trigger && feature.trigger.damage_at_least && amount >= feature.trigger.damage_at_least) {
      amount = Math.floor(amount / 2);
      this.spendMove(hero, feature);
      halved = true;
      this.emit({
        t: 'reaction', featureId: feature.id, featureName: feature.name,
        original: original, amount: amount, uses: feature.uses, usesMax: feature.usesMax
      });
    }
    var absorbed = 0;
    var temp = hero.tempHp || 0;
    if (temp > 0 && amount > 0) {
      absorbed = Math.min(temp, amount);
      hero.tempHp = temp - absorbed;
      amount -= absorbed;
    }
    var full = hero.hp > 0 && hero.hp >= hero.hp_max;
    var massive = false;
    if (amount > 0 && full && hero.hp - amount <= 0) {
      hero.hp = 1;
      massive = true;
    } else if (amount > 0) {
      hero.hp = Math.max(0, hero.hp - amount);
    }
    return {
      amount: amount, original: original, halved: halved, massive: massive, hp: hero.hp,
      tempAbsorbed: absorbed, tempHp: hero.tempHp || 0
    };
  };

  Engine.prototype.sneakBonus = function (hero, target, hadAdvantage, crit) {
    var passive = null;
    (hero.passives || []).forEach(function (p) { if (p && p.id === 'sneak_attack') passive = p; });
    if (!passive || hero.sneakUsed) return null;
    var afflicted = target.statuses && target.statuses.length > 0;
    var ally = (this.party || []).some(function (m) { return m && m !== hero && m.hp > 0; });
    if (!(hadAdvantage || afflicted || ally)) return null;
    hero.sneakUsed = true;
    return rollDamage(passive.dice || '2d6', this.rng, !!crit);
  };

  // Shield (SRD): +5 AC against the triggering attack, until your next turn.
  // Only when that +5 turns a hit into a miss. A natural 20 still hits.
  Engine.prototype.acReaction = function (hero) {
    var found = null;
    ((hero && hero.features) || []).forEach(function (f) {
      if (found || !f || f.timing !== 'reaction') return;
      if (!f.effect || f.effect.type !== 'ac_bonus') return;
      found = f;
    });
    return found;
  };

  Engine.prototype.maybeCastShield = function (hero, face, total) {
    if (!hero || face === 1 || face === 20 || hero.reactionUsed) return false;
    var feature = this.acReaction(hero);
    if (!feature) return false;
    var bonus = feature.effect && Number.isInteger(feature.effect.amount) ? feature.effect.amount : 5;
    if (bonus < 1) bonus = 5;
    var ac = this.effectiveAc();
    if (total < ac || total >= ac + bonus) return false;
    if (this.moveUsesLeft(hero, feature) < (feature.cost || 1)) return false;
    if (this.spendMove(hero, feature) < 0) return false;
    hero.acBonus = (hero.acBonus || 0) + bonus;
    hero.reactionUsed = true;
    this.emit({
      t: 'reaction',
      featureId: feature.id,
      featureName: feature.name,
      shield: true,
      amount: bonus,
      ac: this.effectiveAc(),
      uses: this.moveUsesLeft(hero, feature),
      usesMax: feature.usesMax,
      narr: '護盾術擋下攻擊（用去一個法術位）'
    });
    return true;
  };

  Engine.prototype.runEnemyTurn = function (index) {
    var enemy = this.encounter.enemies[index];
    var hero = this.character;
    if (!enemy || enemy.hp <= 0 || enemy.yielded) return;
    if (this.status !== 'playing') return;
    var mode = 'normal';
    if (hero.dodging || enemy.disadvantageNext) mode = 'disadvantage';
    if (enemy.disadvantageNext) enemy.disadvantageNext = false;
    var rolled = rollD20(this.rng, mode);
    var face = rolled.face;
    var total = face + enemy.atk;
    this.maybeCastShield(hero, face, total);
    var ac = this.effectiveAc();
    var hit = face !== 1 && (face === 20 || total >= ac);
    var crit = hit && face === 20;
    var dmg = null;
    var hurt = null;
    if (hit) {
      dmg = rollDamage(enemy.damage, this.rng, crit);
      hurt = this.hurtHero(hero, dmg.total);
    }
    this.emit({
      t: 'enemy_attack', enemyName: enemy.name, d20: face, dice: rolled.dice, mode: rolled.mode,
      bonus: enemy.atk, total: total, ac: ac, hit: hit, crit: crit, nat: face,
      dc: ac, damage: dmg, hp: hero.hp, hp_max: hero.hp_max,
      massive: !!(hurt && hurt.massive), halved: !!(hurt && hurt.halved),
      tempAbsorbed: hurt ? hurt.tempAbsorbed : 0, tempHp: hero.tempHp || 0
    });
    if (hero.hp <= 0) this.lose('hp');
  };

  Engine.prototype.resolveUntilHero = function () {
    var guard = 0;
    while (this.status === 'playing' && this.encounter && guard++ < 40) {
      if (this.combatResult()) return;
      var state = this.queueState();
      var entry = this.takeNext(state);
      if (!entry) return;
      if (entry.kind === 'hero' && entry.index === 0) {
        if (state.round !== this.encounter.round || state.acted !== this.encounter.acted) {
          if (state.round !== this.encounter.round) {
            this.encounter.round = state.round;
            this.round = state.round;
            this.encounter.acted = {};
          }
        }
        return;
      }
      state.acted[actorKey(entry)] = true;
      this.commitQueue(state);
      if (entry.kind === 'enemy') {
        this.emit({ t: 'enemy_phase', round: this.encounter.round });
        this.runEnemyTurn(entry.index);
      }
    }
  };

  Engine.prototype.resolveRestOfRound = function () {
    var guard = 0;
    var round = this.encounter.round;
    while (this.status === 'playing' && this.encounter && guard++ < 40) {
      if (this.combatResult()) return;
      var state = this.queueState();
      if (this.allResolved(state.acted, state.round)) return;
      var entry = this.takeNext(state);
      if (!entry) return;
      if (state.round !== round) return;
      if (entry.kind === 'hero' && entry.index === 0) return;
      state.acted[actorKey(entry)] = true;
      this.commitQueue(state);
      if (entry.kind === 'enemy') {
        this.emit({ t: 'enemy_phase', round: this.encounter.round });
        this.runEnemyTurn(entry.index);
      }
    }
  };

  Engine.prototype.beginHeroTurn = function () {
    var c = this.character;
    if (!c) return;
    c.dodging = false;
    c.acBonus = 0;
    c.sneakUsed = false;
    c.reactionUsed = false;
    c.divineStrikeUsed = false;
  };

  // Original adaptation of SRD 5.1 Divine Strike (8th level, 1d8, p.17):
  // once each turn, the first weapon hit adds 1d4 radiant. Spells do not trigger it.
  Engine.prototype.divineStrikeBonus = function (hero, crit) {
    var passive = null;
    (hero.passives || []).forEach(function (p) {
      if (p && p.id === 'divine_strike') passive = p;
    });
    if (!passive || hero.divineStrikeUsed) return null;
    hero.divineStrikeUsed = true;
    return {
      id: passive.id,
      name: passive.name,
      narr: passive.narr || '錘上迸出聖光。',
      roll: rollDamage(passive.dice || '1d4', this.rng, !!crit)
    };
  };

  Engine.prototype.openTurn = function () {
    if (!this.encounter) return true;
    if (!this.encounter.order || !this.encounter.order.length) this.rollInitiative();
    this.resolveUntilHero();
    if (this.status !== 'playing') return false;
    var over = this.combatResult();
    if (over) { this.winCombat(over); return false; }
    if (!this.encounter.heroReady) {
      this.beginHeroTurn();
      this.encounter.heroReady = true;
    }
    return this.status === 'playing';
  };

  Engine.prototype.spendTurn = function () {
    if (!this.encounter) return this.ok();
    var state = this.queueState();
    var hero = null;
    (this.encounter.order || []).forEach(function (entry) {
      if (entry.kind === 'hero' && entry.index === 0) hero = entry;
    });
    if (hero) state.acted[actorKey(hero)] = true;
    this.commitQueue(state);
    this.encounter.heroReady = false;
    var over = this.combatResult();
    if (over) return this.winCombat(over);
    this.resolveRestOfRound();
    if (this.status !== 'playing') return this.ok();
    over = this.combatResult();
    if (over) return this.winCombat(over);
    return this.ok();
  };

  Engine.prototype.pickEnemy = function (targetIndex) {
    var living = this.livingEnemies();
    if (!living.length) return { error: '沒有目標。' };
    if (targetIndex === undefined || targetIndex === null) {
      if (living.length > 1) return { error: '要先選一個目標。' };
      return { enemy: living[0].ref, index: living[0].index };
    }
    var e = this.encounter.enemies[targetIndex];
    if (!e || e.hp <= 0 || e.yielded) return { error: '這個目標不能攻擊。' };
    return { enemy: e, index: targetIndex };
  };

  Engine.prototype.resolveStrike = function (hero, target, move, mode, strikeSpec) {
    var bonus = hero.attack.bonus;
    if (strikeSpec && Number.isInteger(strikeSpec.attack_bonus)) bonus = strikeSpec.attack_bonus;
    else if (move && Number.isInteger(move.attack_bonus)) bonus = move.attack_bonus;
    var attackMode = mode || 'normal';
    if (target.grantAdvantage) {
      target.grantAdvantage = false;
      if (attackMode === 'disadvantage') attackMode = 'normal';
      else if (attackMode !== 'advantage') attackMode = 'advantage';
    }
    var rolled = rollD20(this.rng, attackMode);
    var face = rolled.face;
    var total = face + bonus;
    var acBefore = target.ac;
    var miss = face === 1;
    var hit = !miss && (face === 20 || total >= acBefore);
    var crit = hit && face >= this.critFloor(hero);
    var parts = [];
    var holy = null;
    if (hit) {
      var useWeapon = strikeSpec ? !!strikeSpec.uses_weapon : (!move || !!move.uses_weapon);
      var extra = strikeSpec ? strikeSpec.damage_dice : (move && move.damage_dice);
      if (useWeapon) parts.push(rollDamage(hero.attack.damage, this.rng, crit));
      if (useWeapon) holy = this.divineStrikeBonus(hero, crit);
      if (holy) parts.push(holy.roll);
      if (extra) parts.push(rollDamage(extra, this.rng, crit));
      if (move && move.mark) {
        target.mark = { dice: move.mark.bonus_dice, type: move.mark.damage_type || null };
      }
      if (target.mark && target.mark.dice) parts.push(rollDamage(target.mark.dice, this.rng, crit));
      var sneak = this.sneakBonus(hero, target, attackMode === 'advantage', crit);
      if (sneak) parts.push(sneak);
      if (move && move.on_hit && !strikeSpec) {
        if (Number.isInteger(move.on_hit.ac_delta)) target.ac = Math.max(1, target.ac + move.on_hit.ac_delta);
        if (move.on_hit.next_attack_advantage) target.grantAdvantage = true;
      } else if (move && move.on_hit && strikeSpec) {
        if (Number.isInteger(move.on_hit.ac_delta)) target.ac = Math.max(1, target.ac + move.on_hit.ac_delta);
        if (move.on_hit.next_attack_advantage) target.grantAdvantage = true;
      }
    }
    var dmg = hit ? sumDamage(parts) : null;
    var before = target.hp;
    if (hit && dmg) this.hurtEnemy(target, dmg.total);
    var group = this.checkGroupYield();
    return {
      rolled: rolled, face: face, bonus: bonus, total: total, hit: hit, crit: crit,
      dmg: dmg, before: before, ac: acBefore, yielded: !!(target.yielded || group),
      label: strikeSpec && strikeSpec.name ? strikeSpec.name : null,
      holy: holy
    };
  };

  Engine.prototype.emitStrike = function (hero, target, move, strike) {
    this.emit({
      t: 'attack',
      attackName: (strike && strike.label) || (move ? move.name : hero.attack.name),
      attackerName: hero.name,
      featureId: move ? move.id : null,
      d20: strike.face,
      dice: strike.rolled.dice,
      mode: strike.rolled.mode,
      bonus: strike.bonus,
      total: strike.total,
      ac: strike.ac,
      dc: strike.ac,
      hit: strike.hit,
      crit: strike.crit,
      nat: strike.face,
      damage: strike.dmg,
      damageType: move && move.damage_type ? move.damage_type : null,
      targetName: target.name,
      targetHpBefore: strike.before,
      targetHp: target.hp,
      targetHpMax: target.hp_max,
      targetDown: target.hp <= 0,
      yielded: !!target.yielded
    });
    if (strike.holy) {
      this.emit({
        t: 'passive',
        passiveId: strike.holy.id,
        passiveName: strike.holy.name,
        narr: strike.holy.narr
      });
    }
  };

  Engine.prototype.doAttack = function (targetIndex) {
    var sc = this.scene;
    if (!sc || sc.type !== 'combat') return this.reject('這裡沒有可以攻擊的對象。');
    var picked = this.pickEnemy(targetIndex);
    if (picked.error) return this.reject(picked.error);
    if (!this.openTurn()) return this.ok();
    if (!this.encounter) return this.ok();
    picked = this.pickEnemy(picked.index);
    if (picked.error) return this.reject(picked.error);
    var strike = this.resolveStrike(this.character, picked.enemy, null, 'normal');
    this.emitStrike(this.character, picked.enemy, null, strike);
    if (this.combatResult()) return this.winCombat(this.combatResult());
    return this.spendTurn();
  };

  Engine.prototype.doDefend = function () {
    if (!this.scene || this.scene.type !== 'combat') return this.reject('這裡沒有需要防守的東西。');
    if (!this.openTurn()) return this.ok();
    if (!this.encounter) return this.ok();
    this.character.dodging = true;
    this.emit({ t: 'defend', name: this.character.name });
    return this.spendTurn();
  };

  Engine.prototype.doAmbush = function (outcome) {
    if (!this.encounter) return this.reject('現在沒有戰鬥。');
    if (outcome !== 'success' && outcome !== 'failure') return this.reject('埋伏結果不正確。');
    var acted = this.encounter.acted || {};
    var started = Object.keys(acted).some(function (k) { return acted[k]; });
    if (started || this.encounter.round > 1) return this.reject('戰鬥已經開始，來不及埋伏。');
    this.encounter.ambush = outcome;
    this.emit({ t: 'ambush', outcome: outcome });
    return this.ok();
  };

  Engine.prototype.castTempHp = function (feature, inCombat) {
    var c = this.character;
    if (inCombat && !this.openTurn()) return this.ok();
    if (inCombat && !this.encounter) return this.ok();
    var rolled = rollDamage(feature.temp_hp_dice, this.rng, false);
    var before = c.tempHp || 0;
    var next = Math.max(before, rolled.total);
    c.tempHp = next;
    this.spendMove(c, feature);
    this.emit({
      t: 'feature_temp', featureId: feature.id, featureName: feature.name,
      amount: rolled.total, tempHp: next, gained: next - before,
      uses: feature.at_will ? null : this.moveUsesLeft(c, feature),
      usesMax: feature.at_will ? null : feature.usesMax,
      dice: rolled, hp: c.hp, hp_max: c.hp_max
    });
    if (inCombat && feature.costs_turn) return this.spendTurn();
    return this.ok();
  };

  Engine.prototype.castRecover = function (feature, inCombat) {
    var c = this.character;
    if (inCombat) return this.reject(feature.name + '只能在戰鬥以外使用。');
    var pool = c.pools && c.pools[feature.restore_pool];
    if (!pool) return this.reject('沒有這個法術位。');
    if (pool.uses >= pool.usesMax) return this.reject(pool.name + '已滿，沒有使用。');
    this.spendMove(c, feature);
    pool.uses = Math.min(pool.usesMax, pool.uses + (feature.restore_amount || 1));
    (c.features || []).forEach(function (f) {
      if (f.pool === pool.id) f.uses = pool.uses;
    });
    this.emit({
      t: 'feature_recover', featureId: feature.id, featureName: feature.name,
      poolName: pool.name, amount: feature.restore_amount || 1,
      uses: pool.uses, usesMax: pool.usesMax,
      nightLeft: this.moveUsesLeft(c, feature)
    });
    return this.ok();
  };

  // Enemy save bonus stays +0. Do not read an enemy saves field.
  Engine.prototype.castSave = function (feature, cmd, inCombat) {
    var c = this.character;
    if (!inCombat) return this.reject(feature.name + '只能在戰鬥中使用。');
    var targets = [];
    if (feature.target === 'enemies') {
      this.livingEnemies().forEach(function (e) { targets.push(e); });
      if (!targets.length) return this.reject('沒有目標。');
    } else {
      var picked = this.pickEnemy(cmd.target);
      if (picked.error) return this.reject(picked.error);
      targets = [{ index: picked.index, ref: picked.enemy, name: picked.enemy.name }];
    }
    if (!this.openTurn()) return this.ok();
    if (!this.encounter) return this.ok();
    if (feature.target === 'enemies') {
      targets = [];
      this.livingEnemies().forEach(function (e) { targets.push(e); });
    } else {
      var again = this.pickEnemy(targets[0].index);
      if (again.error) return this.reject(again.error);
      targets = [{ index: again.index, ref: again.enemy, name: again.enemy.name }];
    }
    if (!targets.length) return this.reject('沒有目標。');
    this.spendMove(c, feature);
    var shared = feature.target === 'enemies' ? rollDamage(feature.damage_dice, this.rng, false) : null;
    var i;
    for (i = 0; i < targets.length; i++) {
      var foe = this.encounter.enemies[targets[i].index];
      if (!foe || foe.hp <= 0 || foe.yielded) continue;
      var rolled = rollD20(this.rng, 'normal');
      var bonus = 0;
      var total = rolled.face + bonus;
      var success = rolled.face !== 1 && (rolled.face === 20 || total >= feature.dc);
      var dmg = shared;
      var amount = 0;
      if (!success || feature.on_success === 'half') {
        if (!dmg) dmg = rollDamage(feature.damage_dice, this.rng, false);
        amount = dmg.total;
        if (success && feature.on_success === 'half') amount = Math.floor(amount / 2);
      }
      var before = foe.hp;
      if (amount > 0) this.hurtEnemy(foe, amount);
      this.checkGroupYield();
      this.emit({
        t: 'save', featureId: feature.id, featureName: feature.name,
        save: feature.save, onSuccess: feature.on_success,
        d20: rolled.face, dice: rolled.dice.slice(), mode: rolled.mode,
        bonus: bonus, total: total, dc: feature.dc, success: success, nat: rolled.face,
        damage: dmg, amount: amount,
        targetName: foe.name, targetHpBefore: before, targetHp: foe.hp, targetHpMax: foe.hp_max,
        targetDown: foe.hp <= 0, yielded: !!foe.yielded
      });
      if (this.combatResult()) return this.winCombat(this.combatResult());
    }
    return this.spendTurn();
  };

  Engine.prototype.castStrikes = function (feature, cmd, inCombat) {
    var c = this.character;
    if (!inCombat) return this.reject(feature.name + '只能在戰鬥中使用。');
    var picked = this.pickEnemy(cmd.target);
    if (picked.error) return this.reject(picked.error);
    if (!this.openTurn()) return this.ok();
    if (!this.encounter) return this.ok();
    picked = this.pickEnemy(picked.index);
    if (picked.error) return this.reject(picked.error);
    this.spendMove(c, feature);
    var mode = feature.advantage ? 'advantage' : 'normal';
    var i;
    for (i = 0; i < feature.strikes.length; i++) {
      var foe = this.encounter.enemies[picked.index];
      if (!foe || foe.hp <= 0 || foe.yielded) break;
      var strike = this.resolveStrike(c, foe, feature, mode, feature.strikes[i]);
      this.emitStrike(c, foe, feature, strike);
      if (this.combatResult()) return this.winCombat(this.combatResult());
    }
    if (feature.costs_turn) return this.spendTurn();
    return this.ok();
  };

  Engine.prototype.doMove = function (cmd) {
    var c = this.character;
    var sc = this.scene;
    if (!sc || (sc.type !== 'beat' && sc.type !== 'check' && sc.type !== 'combat')) {
      return this.reject('現在不能使用招式。');
    }
    var feature = this.findMove(c, cmd.moveId);
    if (!feature && (cmd.moveId === undefined || cmd.moveId === null || cmd.moveId === '')) {
      var usable = (c.features || []).filter(function (f) {
        return f.timing !== 'reaction' && (f.uses || 0) > 0;
      });
      if (usable.length === 1) feature = usable[0];
    }
    if (!feature) return this.reject('沒有這個招式。');
    if (featureIsLegacy(feature)) return this.doUseFeature(feature.id, cmd.target);
    if (feature.timing === 'reaction') return this.reject(feature.name + '會自動發動。');
    if (!feature.at_will && this.moveUsesLeft(c, feature) < (feature.cost || 1)) {
      return this.reject(feature.name + (feature.per === 'night' ? '今晚已用。' : '需休息。'));
    }
    var inCombat = sc.type === 'combat';
    if (feature.combat === false && inCombat) return this.reject(feature.name + '只能在戰鬥以外使用。');
    if ((feature.target === 'enemy' || feature.target === 'enemies' || feature.roll === 'attack' || feature.roll === 'spell_attack') && !inCombat) {
      return this.reject(feature.name + '只能在戰鬥中使用。');
    }
    if (feature.timing === 'ready' || (feature.effect && feature.effect.type === 'ac_bonus')) {
      if (!inCombat) return this.reject(feature.name + '只能在戰鬥中使用。');
      if (!this.openTurn()) return this.ok();
      if (!this.encounter) return this.ok();
      if ((c.acBonus || 0) > 0) return this.reject(feature.name + '：這一場已經有護甲加成。');
      this.spendMove(c, feature);
      c.acBonus = feature.effect && feature.effect.amount ? feature.effect.amount : 5;
      this.emit({
        t: 'feature_ac', featureId: feature.id, featureName: feature.name,
        amount: c.acBonus, uses: this.moveUsesLeft(c, feature), usesMax: feature.usesMax,
        ac: this.effectiveAc(), acBase: c.ac, acBonus: c.acBonus, ready: true
      });
      return this.spendTurn();
    }
    if (feature.temp_hp_dice) return this.castTempHp(feature, inCombat);
    if (feature.restore_pool) return this.castRecover(feature, inCombat);
    if (feature.roll === 'save') return this.castSave(feature, cmd, inCombat);
    if (feature.strikes && feature.strikes.length) return this.castStrikes(feature, cmd, inCombat);
    if (feature.heal_dice || (feature.roll === 'auto' && feature.target === 'self') || feature.target === 'ally' && feature.heal_dice) {
      var patient = c;
      if (feature.target === 'ally' && cmd.target !== undefined && cmd.target !== null && this.party[cmd.target]) {
        patient = this.party[cmd.target];
      }
      if (patient.hp >= patient.hp_max) return this.reject(feature.name + '：生命已滿，沒有使用。');
      if (inCombat && !this.openTurn()) return this.ok();
      if (inCombat && !this.encounter) return this.ok();
      var healedRoll = rollDamage(feature.heal_dice, this.rng, false);
      var before = patient.hp;
      patient.hp = Math.min(patient.hp_max, patient.hp + healedRoll.total);
      this.spendMove(c, feature);
      this.emit({
        t: 'feature_heal', featureId: feature.id, featureName: feature.name,
        amount: healedRoll.total, healed: patient.hp - before,
        uses: this.moveUsesLeft(c, feature), usesMax: feature.usesMax,
        hp: patient.hp, hp_max: patient.hp_max, dice: healedRoll,
        targetName: patient.name
      });
      if (inCombat && feature.costs_turn) return this.spendTurn();
      return this.ok();
    }
    if (feature.missiles) {
      if (!inCombat) return this.reject(feature.name + '只能在戰鬥中使用。');
      var living = this.livingEnemies();
      if (!living.length) return this.reject('沒有目標。');
      var targets = cmd.targets;
      if (!targets) {
        var one = cmd.target;
        if (one === undefined || one === null) {
          if (living.length > 1) return this.reject('要先選一個目標。');
          one = living[0].index;
        }
        targets = [];
        var n;
        for (n = 0; n < feature.missiles; n++) targets.push(one);
      }
      if (!this.openTurn()) return this.ok();
      if (!this.encounter) return this.ok();
      this.spendMove(c, feature);
      var mi;
      for (mi = 0; mi < targets.length; mi++) {
        var foe = this.encounter.enemies[targets[mi]];
        if (!foe || foe.hp <= 0 || foe.yielded) continue;
        var shot = rollDamage(feature.damage_dice, this.rng, false);
        var beforeHp = foe.hp;
        this.hurtEnemy(foe, shot.total);
        this.checkGroupYield();
        this.emit({
          t: 'attack', attackName: feature.name, attackerName: c.name, featureId: feature.id,
          d20: null, dice: [], mode: 'auto', bonus: 0, total: null, ac: foe.ac, dc: null,
          hit: true, crit: false, nat: null, damage: shot, damageType: feature.damage_type || null,
          targetName: foe.name, targetHpBefore: beforeHp, targetHp: foe.hp, targetHpMax: foe.hp_max,
          targetDown: foe.hp <= 0, yielded: !!foe.yielded, missile: mi + 1
        });
        if (this.combatResult()) return this.winCombat(this.combatResult());
      }
      return this.spendTurn();
    }
    if (!inCombat) return this.reject(feature.name + '只能在戰鬥中使用。');
    var picked = this.pickEnemy(cmd.target);
    if (picked.error) return this.reject(picked.error);
    if (!this.openTurn()) return this.ok();
    if (!this.encounter) return this.ok();
    picked = this.pickEnemy(picked.index);
    if (picked.error) return this.reject(picked.error);
    var mode = feature.advantage ? 'advantage' : 'normal';
    if (feature.stealth_dc) {
      var wis = picked.enemy.wis != null ? picked.enemy.wis : 10;
      var dc = 10 + abilityMod(wis);
      var checkRoll = rollD20(this.rng, 'normal');
      var mod = abilityMod(c.dex);
      var prof = c.skills.indexOf('stealth') >= 0 ? PROFICIENCY_BONUS : 0;
      var checkTotal = checkRoll.face + mod + prof;
      var success = checkRoll.face !== 1 && (checkRoll.face === 20 || checkTotal >= dc);
      this.emit({
        t: 'check', skill: 'stealth', ability: 'dex',
        d20: checkRoll.face, dice: checkRoll.dice, mode: checkRoll.mode,
        mod: mod, prof: prof, total: checkTotal, dc: dc, success: success, nat: checkRoll.face
      });
      if (success) {
        mode = 'advantage';
        picked.enemy.disadvantageNext = true;
      }
    }
    this.spendMove(c, feature);
    var strike = this.resolveStrike(c, picked.enemy, feature, mode);
    this.emitStrike(c, picked.enemy, feature, strike);
    if (this.combatResult()) return this.winCombat(this.combatResult());
    if (feature.costs_turn) return this.spendTurn();
    return this.ok();
  };

  Engine.prototype.doUseItem = function (slot, targetIndex) {
    var c = this.character, sc = this.scene;
    if (sc.type !== 'beat' && sc.type !== 'check' && sc.type !== 'combat') {
      return this.reject('現在不能使用物品。');
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= c.inventory.length) {
      return this.reject('沒有這件物品。');
    }
    var item = this.items[c.inventory[slot]];
    if (!item) return this.reject('沒有這件物品。');
    if (item.kind !== 'consumable') return this.reject(item.name + '不能使用。');

    var isDamage = item.damage !== undefined && item.damage !== null;
    if (isDamage) {
      if (sc.type !== 'combat') return this.reject(item.name + '只能在戰鬥中使用。');
      var picked = this.pickEnemy(targetIndex);
      if (picked.error) return this.reject(picked.error);
      if (!this.openTurn()) return this.ok();
      if (!this.encounter) return this.ok();
      picked = this.pickEnemy(picked.index);
      if (picked.error) return this.reject(picked.error);
      var before = picked.enemy.hp;
      this.hurtEnemy(picked.enemy, item.damage);
      this.checkGroupYield();
      c.inventory.splice(slot, 1);
      this.emit({
        t: 'item_damage', itemName: item.name, amount: item.damage,
        targetName: picked.enemy.name, targetHpBefore: before, targetHp: picked.enemy.hp,
        targetHpMax: picked.enemy.hp_max, targetDown: picked.enemy.hp <= 0,
        yielded: !!picked.enemy.yielded,
        inventory: this.inventoryNames()
      });
      if (this.combatResult()) return this.winCombat(this.combatResult());
      return this.spendTurn();
    }

    if (sc.type === 'combat') {
      if (!this.openTurn()) return this.ok();
      if (!this.encounter) return this.ok();
    }
    var hpBefore = c.hp;
    c.hp = Math.min(c.hp_max, c.hp + item.heal);
    c.inventory.splice(slot, 1);
    this.emit({
      t: 'item_heal', itemName: item.name, amount: item.heal,
      healed: c.hp - hpBefore, hp: c.hp, hp_max: c.hp_max,
      inventory: this.inventoryNames()
    });
    if (sc.type === 'combat') return this.spendTurn();
    return this.ok();
  };

  Engine.prototype.doUseFeature = function (featureId, targetIndex) {
    var c = this.character, sc = this.scene;
    if (sc.type !== 'beat' && sc.type !== 'check' && sc.type !== 'combat') {
      return this.reject('現在不能使用特性。');
    }
    var features = c.features || [];
    var feature = null;
    if (featureId === undefined || featureId === null || featureId === '') {
      var usable = features.filter(function (f) { return featureIsLegacy(f) && f.uses > 0; });
      if (usable.length !== 1) return this.reject('要先選一個特性。');
      feature = usable[0];
    } else {
      features.forEach(function (f) { if (f.id === featureId) feature = f; });
    }
    if (!feature || !featureIsLegacy(feature)) return this.reject('沒有這個特性。');
    if (feature.uses <= 0) return this.reject(feature.name + '已經沒有次數了。');
    var effect = feature.effect;

    if (effect.type === 'damage') {
      if (sc.type !== 'combat') return this.reject(feature.name + '只能在戰鬥中使用。');
      var picked = this.pickEnemy(targetIndex);
      if (picked.error) return this.reject(picked.error);
      if (!this.openTurn()) return this.ok();
      if (!this.encounter) return this.ok();
      picked = this.pickEnemy(picked.index);
      if (picked.error) return this.reject(picked.error);
      var before = picked.enemy.hp;
      this.hurtEnemy(picked.enemy, effect.amount);
      this.checkGroupYield();
      feature.uses -= 1;
      this.emit({
        t: 'feature_damage', featureId: feature.id, featureName: feature.name,
        amount: effect.amount, uses: feature.uses, usesMax: feature.usesMax,
        targetName: picked.enemy.name, targetHpBefore: before, targetHp: picked.enemy.hp,
        targetHpMax: picked.enemy.hp_max, targetDown: picked.enemy.hp <= 0
      });
      if (this.combatResult()) return this.winCombat(this.combatResult());
      return this.spendTurn();
    }

    if (effect.type === 'heal') {
      if (c.hp >= c.hp_max) return this.reject(feature.name + '：生命已滿，沒有使用。');
      var hpBefore = c.hp;
      c.hp = Math.min(c.hp_max, c.hp + effect.amount);
      feature.uses -= 1;
      this.emit({
        t: 'feature_heal', featureId: feature.id, featureName: feature.name,
        amount: effect.amount, healed: c.hp - hpBefore,
        uses: feature.uses, usesMax: feature.usesMax,
        hp: c.hp, hp_max: c.hp_max
      });
      if (sc.type === 'combat') {
        if (!this.openTurn()) return this.ok();
        return this.spendTurn();
      }
      return this.ok();
    }

    if (effect.type === 'ac_bonus') {
      if (sc.type !== 'combat') return this.reject(feature.name + '只能在戰鬥中使用。');
      if ((c.acBonus || 0) > 0) return this.reject(feature.name + '：這一場已經有護甲加成。');
      if (!this.openTurn()) return this.ok();
      if (!this.encounter) return this.ok();
      c.acBonus = effect.amount;
      feature.uses -= 1;
      this.emit({
        t: 'feature_ac', featureId: feature.id, featureName: feature.name,
        amount: effect.amount, uses: feature.uses, usesMax: feature.usesMax,
        ac: this.effectiveAc(), acBase: c.ac, acBonus: c.acBonus
      });
      return this.spendTurn();
    }

    return this.reject('未知的特性效果。');
  };

  Engine.prototype.doFlee = function () {
    var sc = this.scene;
    if (!sc || sc.type !== 'combat') return this.reject('這裡沒有要逃走的東西。');
    var dest = sc.flee_to;
    if (dest === FLEE_CHECKPOINT) dest = this.lastCheckpoint;
    if (dest && this.scenes[dest]) {
      var ev = { t: 'flee', escaped: true };
      var line = this.combatOutcomeLine('flee');
      if (line) ev.narr = line;
      this.emit(ev);
      this.enterScene(dest);
      return this.ok();
    }
    this.emit({ t: 'flee', escaped: false });
    this.emit({ t: 'run_restart', reason: 'flee' });
    return this.beginRun(this.pregenIndex);
  };

  Engine.prototype.doRetry = function () {
    if (this.status !== 'lost') return this.reject('現在不必重試。');
    if (!this.checkpointSnap) return this.reject('還沒有歇腳點可以返回。');
    var snap = deepCopy(this.checkpointSnap);
    var oldSeed = (this.rng && this.rng.seed) || 1;
    var nextCount = (this.retryCount || 0) + 1;
    var nextSeed = (oldSeed + (0x6d2b79f5 * nextCount)) >>> 0;
    if (!nextSeed) nextSeed = 1;
    if (nextSeed === oldSeed) nextSeed = (oldSeed + 1) >>> 0;
    var applied = this.applySave(snap);
    if (!applied.ok) return this.reject(applied.error);
    this.rng = makeRng(nextSeed);
    this.retryCount = nextCount;
    this.status = 'playing';
    this.playFrozen = false;
    this.playTimeKnown = true;
    this.startedAt = Date.now();
    this.events = [];
    this.emit({ t: 'retry', seed: nextSeed });
    this.emit({
      t: 'scene',
      sceneType: this.scene.type,
      facts: resolveFacts(this.scene.facts, this.conditionState()),
      name: this.scene.name || null,
      floor: this.scene.floor || null,
      enemies: this.enemySnapshot()
    });
    return this.ok();
  };

  // --- views -----------------------------------------------------------------
  // Everything the UI needs to draw the screen.
  Engine.prototype.uiState = function () {
    var c = this.character;
    return {
      status: this.status,
      sceneId: this.sceneId,
      sceneType: this.scene ? this.scene.type : null,
      round: this.round,
      character: c ? {
        name: c.name, cls: c.cls, race: c.race,
        ac: this.effectiveAc(), acBase: c.ac, acBonus: c.acBonus || 0,
        hp: c.hp, hp_max: c.hp_max, tempHp: c.tempHp || 0,
        abilities: { str: c.str, dex: c.dex, con: c.con, int: c.int, wis: c.wis, cha: c.cha },
        skills: c.skills.slice(),
        inventory: c.inventory.slice(), inventoryNames: this.inventoryNames(),
        attack: { name: c.attack.name, bonus: c.attack.bonus, damage: c.attack.damage },
        features: (c.features || []).map(function (f) {
          return {
            id: f.id, name: f.name, uses: f.at_will ? null : f.uses, usesMax: f.at_will ? null : f.usesMax,
            effect: (f.effect && f.effect.type) || (f.heal_dice ? 'heal' : (f.temp_hp_dice ? 'temp' : (f.roll || 'move'))),
            amount: f.effect ? f.effect.amount : 0,
            costsTurn: f.costs_turn !== false,
            timing: f.timing || 'action',
            group: f.group || null,
            summary: f.summary || '',
            atWill: !!f.at_will,
            per: f.per || null,
            pool: f.pool || null
          };
        }),
        pools: c.pools || {},
        statuses: (c.statuses || []).slice(),
        passives: (c.passives || []).filter(function (p) { return p && p.summary; }).map(function (p) {
          return { id: p.id, name: p.name, summary: p.summary, detail: p.detail || '' };
        })
      } : null,
      enemies: this.enemySnapshot()
    };
  };

  // STRICT narration allowlist. The narrator sees nothing else: scene facts,
  // name/class/race, hp/hp_max, inventory item names, encounter enemy
  // names/HP, and this action's dice result. Frozen so it cannot be a channel
  // back into engine state.
  Engine.prototype.narrationView = function (dice) {
    var c = this.character;
    var enemies = (this.encounter ? this.encounter.enemies : []).map(function (e) {
      return Object.freeze({ name: e.name, hp: e.hp });
    });
    return Object.freeze({
      facts: Object.freeze(resolveFacts(this.scene && this.scene.facts, this.conditionState())),
      name: c ? c.name : '', cls: c ? c.cls : '', race: c ? c.race : '',
      hp: c ? c.hp : 0, hp_max: c ? c.hp_max : 0,
      inventory: Object.freeze(this.inventoryNames()),
      enemies: Object.freeze(enemies),
      dice: dice ? Object.freeze(dice) : null
    });
  };

  Engine.prototype.battleCounts = function () {
    var total = 0;
    var hidden = 0;
    var cleared = 0;
    var self = this;
    (this.adventure.scenes || []).forEach(function (sc) {
      if (!sc || sc.type !== 'combat' || sc.omit_from_tally) return;
      total += 1;
      if (sc.hidden) hidden += 1;
      if (self.clearedCombats[sc.id]) cleared += 1;
    });
    return { cleared: cleared, total: total, hidden: hidden };
  };

  Engine.prototype.endingCandidates = function () {
    var list = [];
    var self = this;
    if (this.status === 'lost') {
      var loseMeta = (this.adventure.meta && this.adventure.meta.lose_ending) || {};
      list.push({
        type: 'lose',
        name: loseMeta.name || '失敗',
        closing: loseMeta.closing || '',
        sceneId: null,
        priority: ENDING_PRIORITY.lose
      });
    }
    (this.adventure.scenes || []).forEach(function (sc) {
      if (!sc || sc.type !== 'end') return;
      if (sc.when && !self.conditionsPass(sc.when)) return;
      var type = sc.ending_type || defaultEndingType(sc.end);
      list.push({
        type: type,
        name: sc.name || '',
        closing: sc.closing || '',
        sceneId: sc.id,
        priority: ENDING_PRIORITY[type] || 0
      });
    });
    return list;
  };

  Engine.prototype.branchLines = function () {
    var lines = [];
    var self = this;
    (this.adventure.class_branches || []).forEach(function (b) {
      if (!b || !self.conditionsPass(b.when)) return;
      var done = self.conditionsPass(b.completed_when);
      if (done) lines.push('支線：' + b.label + '（已完成）');
      else lines.push('支線：' + b.label + '（錯過）：' + b.miss_reason);
    });
    return lines;
  };

  Engine.prototype.endingCard = function () {
    if (!this.character) return null;
    if (this.status !== 'won' && this.status !== 'secret_won' && this.status !== 'lost') return null;
    var best = null;
    this.endingCandidates().forEach(function (c) {
      if (!best || c.priority > best.priority) best = c;
      else if (c.priority === best.priority && c.sceneId && c.sceneId === this.sceneId) best = c;
    }, this);
    var endingName = best ? best.name : (this.status === 'lost' ? '失敗' : '通關');
    var endingType = best ? best.type : (this.status === 'lost' ? 'lose' : 'main');
    var battles = this.battleCounts();
    var battlesLabel = '戰鬥 ' + battles.cleared + '/' + battles.total;
    if (battles.hidden > 0) battlesLabel += '（含隱藏）';
    var playMs = this.currentPlayMs();
    return {
      title: this.adventure.title,
      endingName: endingName,
      endingType: endingType,
      outcome: this.status,
      className: this.character.cls,
      characterName: this.character.name,
      race: this.character.race,
      keyChoices: this.keyChoices.slice(),
      battlesCleared: battles.cleared,
      battlesTotal: battles.total,
      battlesHidden: battles.hidden,
      battlesLabel: battlesLabel,
      branchLines: this.branchLines(),
      hp: this.character.hp,
      hpMax: this.character.hp_max,
      playMs: playMs,
      playTime: playMs == null ? '' : formatPlayTime(playMs),
      closing: best && best.closing ? best.closing : '',
      playAgainLabel: '試試第二個職業？'
    };
  };

  Engine.prototype.exportSave = function () {
    if (!this.character || this.status === 'idle') return null;
    return {
      v: SAVE_VERSION,
      adventureId: this.adventure.id || null,
      scriptVersion: (this.adventure.meta && this.adventure.meta.script_version) || 1,
      pregenIndex: this.pregenIndex,
      character: deepCopy(this.character),
      sceneId: this.sceneId,
      flags: deepCopy(this.flags),
      done: copyDone(this.done),
      clearedCombats: deepCopy(this.clearedCombats),
      keyChoices: deepCopy(this.keyChoices),
      rivalPregenIndex: this.rivalPregenIndex,
      encounter: this.encounter ? deepCopy(this.encounter) : null,
      round: this.round,
      status: this.status,
      lastCheckpoint: this.lastCheckpoint || null,
      playMs: this.playTimeKnown ? this.currentPlayMs() : null,
      rng: (this.rng && this.rng.exportState) ? this.rng.exportState() : null,
      allies: (this.party || []).slice(1).map(function (a) { return deepCopy(a); }),
      checkpointSnap: this.checkpointSnap ? deepCopy(this.checkpointSnap) : null,
      retryCount: this.retryCount || 0,
      rollLog: deepCopy(this.rollLog || [])
    };
  };

  Engine.prototype.applySave = function (save) {
    if (!save || typeof save !== 'object') return { ok: false, error: '存檔是空的。' };
    var aid = this.adventure.id || null;
    if (save.adventureId && aid && save.adventureId !== aid) {
      return { ok: false, error: '這份存檔屬於另一個冒險。' };
    }
    if (!Number.isInteger(save.pregenIndex) || !this.adventure.pregens[save.pregenIndex]) {
      return { ok: false, error: '存檔裡的角色已經不存在。' };
    }
    var sc = this.scenes[save.sceneId];
    if (!sc) return { ok: false, error: '存檔裡的場景已經不存在。' };
    var statuses = { playing: 1, won: 1, secret_won: 1, lost: 1 };
    if (!statuses[save.status]) return { ok: false, error: '存檔狀態不正確。' };
    var c = save.character;
    if (!c || typeof c.name !== 'string' || typeof c.cls !== 'string' || typeof c.race !== 'string') {
      return { ok: false, error: '存檔裡的角色資料不完整。' };
    }
    var scores = ['str', 'dex', 'con', 'int', 'wis', 'cha', 'ac', 'hp', 'hp_max'];
    var si;
    for (si = 0; si < scores.length; si++) {
      if (!Number.isInteger(c[scores[si]])) return { ok: false, error: '存檔裡的角色資料不完整。' };
    }
    if (c.hp_max < 1 || !Array.isArray(c.inventory) || !Array.isArray(c.skills) || !Array.isArray(c.features)) {
      return { ok: false, error: '存檔裡的角色資料不完整。' };
    }
    if (!c.attack || typeof c.attack.name !== 'string' || !Number.isInteger(c.attack.bonus) || !parseDice(c.attack.damage)) {
      return { ok: false, error: '存檔裡的角色資料不完整。' };
    }
    var ii;
    for (ii = 0; ii < c.inventory.length; ii++) {
      if (!this.items[c.inventory[ii]]) return { ok: false, error: '存檔裡的物品已經不存在。' };
    }
    if (save.status === 'playing' && c.hp <= 0) return { ok: false, error: '存檔狀態互相矛盾。' };
    if (save.status === 'playing' && sc.type === 'end') return { ok: false, error: '存檔狀態互相矛盾。' };
    if (save.status === 'won' && !(sc.type === 'end' && sc.end === 'win')) return { ok: false, error: '存檔狀態互相矛盾。' };
    if (save.status === 'secret_won' && !(sc.type === 'end' && sc.end === 'secret_win')) {
      return { ok: false, error: '存檔狀態互相矛盾。' };
    }
    if (sc.type === 'combat') {
      if (!save.encounter || !Array.isArray(save.encounter.enemies) || save.encounter.enemies.length < sc.enemies.length) {
        return { ok: false, error: '存檔與腳本對不上，無法還原這場戰鬥。' };
      }
      for (ii = 0; ii < save.encounter.enemies.length; ii++) {
        var e = save.encounter.enemies[ii];
        if (!e || typeof e.name !== 'string' || !Number.isInteger(e.ac) || !Number.isInteger(e.hp) ||
            !Number.isInteger(e.hp_max) || !Number.isInteger(e.atk) || !parseDice(e.damage)) {
          return { ok: false, error: '存檔與腳本對不上，無法還原這場戰鬥。' };
        }
      }
    }
    if (save.rivalPregenIndex != null) {
      if (!Number.isInteger(save.rivalPregenIndex) || !this.adventure.pregens[save.rivalPregenIndex]) {
        return { ok: false, error: '存檔裡的對手已經不存在。' };
      }
    }

    var character = deepCopy(c);
    if (character.hp > character.hp_max) character.hp = character.hp_max;
    if (character.hp < 0) character.hp = 0;
    if (!Number.isInteger(character.acBonus) || character.acBonus < 0) character.acBonus = 0;
    if (!Number.isInteger(character.tempHp) || character.tempHp < 0) character.tempHp = 0;
    character.reactionUsed = character.reactionUsed === true;
    character.divineStrikeUsed = character.divineStrikeUsed === true;

    this.pregenIndex = save.pregenIndex;
    this.character = character;
    this.sceneId = save.sceneId;
    this.scene = sc;
    this.flags = (save.flags && typeof save.flags === 'object' && !Array.isArray(save.flags)) ? deepCopy(save.flags) : {};
    this.done = copyDone(save.done);
    this.clearedCombats = {};
    if (save.clearedCombats && typeof save.clearedCombats === 'object') {
      Object.keys(save.clearedCombats).forEach(function (id) {
        if (save.clearedCombats[id]) this.clearedCombats[id] = true;
      }, this);
    }
    this.keyChoices = [];
    if (Array.isArray(save.keyChoices)) {
      save.keyChoices.forEach(function (k) {
        if (k && typeof k.id === 'string' && typeof k.label === 'string' && k.label) {
          this.keyChoices.push({ id: k.id, label: k.label });
        }
      }, this);
    }
    this.rivalPregenIndex = save.rivalPregenIndex == null ? null : save.rivalPregenIndex;
    this.lastCheckpoint = null;
    if (typeof save.lastCheckpoint === 'string' && this.scenes[save.lastCheckpoint] &&
        this.scenes[save.lastCheckpoint].type === 'checkpoint') {
      this.lastCheckpoint = save.lastCheckpoint;
    } else if (sc.type === 'checkpoint') {
      this.lastCheckpoint = sc.id;
    }
    this.playTimeKnown = Number.isInteger(save.playMs) && save.playMs >= 0;
    this.playMs = this.playTimeKnown ? save.playMs : 0;
    this.playFrozen = save.status !== 'playing';
    this.startedAt = (!this.playFrozen && this.playTimeKnown) ? (Date.now() - this.playMs) : null;
    if (!this.classFlagId() || !this.flags[this.classFlagId()]) this.applyClassFlag();
    this.encounter = sc.type === 'combat' ? deepCopy(save.encounter) : null;
    if (this.encounter) {
      if (!this.encounter.acted) this.encounter.acted = {};
      if (!Number.isInteger(this.encounter.round)) this.encounter.round = 1;
      if (!Array.isArray(this.encounter.order)) this.encounter.order = [];
      this.encounter.enemies.forEach(function (e) {
        if (!e.per_extra) e.per_extra = { hp: 0, copies: 0 };
        if (!Array.isArray(e.statuses)) e.statuses = [];
        if (e.yielded === undefined) e.yielded = false;
      });
      var rawNarr = this.encounter.outcomeNarr;
      if (rawNarr && typeof rawNarr === 'object' && !Array.isArray(rawNarr)) {
        var kept = {};
        if (typeof rawNarr.winText === 'string' && rawNarr.winText) kept.winText = rawNarr.winText;
        if (typeof rawNarr.fleeText === 'string' && rawNarr.fleeText) kept.fleeText = rawNarr.fleeText;
        if (kept.winText || kept.fleeText) this.encounter.outcomeNarr = kept;
        else delete this.encounter.outcomeNarr;
      } else if (rawNarr) {
        delete this.encounter.outcomeNarr;
      }
    }
    this.round = sc.type === 'combat' && Number.isInteger(save.round) && save.round > 0 ? save.round : (sc.type === 'combat' ? 1 : 0);
    this.party = [this.character];
    if (Array.isArray(save.allies)) {
      save.allies.forEach(function (a) { if (a && typeof a === 'object') this.party.push(deepCopy(a)); }, this);
    }
    this.checkpointSnap = save.checkpointSnap && typeof save.checkpointSnap === 'object' ? deepCopy(save.checkpointSnap) : null;
    this.retryCount = Number.isInteger(save.retryCount) && save.retryCount > 0 ? save.retryCount : 0;
    this.rollLog = [];
    if (Array.isArray(save.rollLog)) {
      save.rollLog.forEach(function (row) {
        if (!row || !Array.isArray(row.lines)) return;
        var restored = {
          t: typeof row.t === 'string' ? row.t : 'roll',
          lines: row.lines.map(function (line) { return String(line); })
        };
        var roll = sanitizeSavedRoll(row.roll);
        if (roll) restored.roll = roll;
        this.rollLog.push(restored);
      }, this);
    }
    this.status = save.status;
    this.events = [];
    if (save.rng && this.rng && typeof this.rng.importState === 'function') this.rng.importState(save.rng);
    this.refreshSecretReady();
    return { ok: true, error: null };
  };

  Engine.prototype.resumeView = function () {
    this.events = [];
    if (!this.character || !this.scene) return this.reject('沒有可以讀取的進度。');
    this.emit({
      t: 'resume',
      name: this.character.name,
      cls: this.character.cls,
      sceneType: this.scene.type
    });
    this.emit({
      t: 'scene',
      sceneType: this.scene.type,
      facts: resolveFacts(this.scene.facts, this.conditionState()),
      name: this.scene.name || null,
      floor: this.scene.floor || null,
      enemies: this.enemySnapshot()
    });
    if (this.status === 'won' || this.status === 'secret_won' || this.status === 'lost') {
      this.emit({ t: 'end', outcome: this.status, cause: 'resume' });
    }
    return this.ok();
  };

  function loadGame(adventure, code, options) {
    options = options || {};
    var decoded = decodeSaveCode(code);
    if (!decoded.ok) return { ok: false, error: decoded.error, engine: null };
    try {
      var save = migrateSave(decoded.save, adventure, options.hooks);
      var eng = new Engine(adventure, options);
      var applied = eng.applySave(save);
      if (!applied.ok) return { ok: false, error: applied.error, engine: null };
      return { ok: true, error: null, engine: eng };
    } catch (e) {
      var msg = (e && e.name === 'SaveError' && e.message) ? e.message : '存檔無法讀取。';
      return { ok: false, error: msg, engine: null };
    }
  }

  // ------------------------------------------------------------------- exports
  var api = {
    PROFICIENCY_BONUS: PROFICIENCY_BONUS,
    SKILL_ABILITY: SKILL_ABILITY,
    SKILL_LABEL: SKILL_LABEL,
    ABILITY_LABEL: ABILITY_LABEL,
    SAVE_VERSION: SAVE_VERSION,
    makeRng: makeRng,
    makeFixedRng: makeFixedRng,
    parseDice: parseDice,
    rollDice: rollDice,
    abilityMod: abilityMod,
    conditionsPass: conditionsPass,
    resolveFacts: resolveFacts,
    validateAdventure: validateAdventure,
    walkScript: walkScript,
    assertReachable: assertReachable,
    encodeSaveCode: encodeSaveCode,
    decodeSaveCode: decodeSaveCode,
    migrateSave: migrateSave,
    loadGame: loadGame,
    renderMoveGroups: renderMoveGroups,
    PREVIEW_STORAGE_PREFIX: PREVIEW_STORAGE_PREFIX,
    PREVIEW_STORAGE_KEYS: PREVIEW_STORAGE_KEYS,
    previewStorageKeys: previewStorageKeys,
    SaveSlot: SaveSlot,
    layoutEndingCard: layoutEndingCard,
    paintEndingCard: paintEndingCard,
    drawEndingCard: drawEndingCard,
    Engine: Engine
  };
  global.TOWER = global.TOWER || {};
  for (var k in api) if (Object.prototype.hasOwnProperty.call(api, k)) global.TOWER[k] = api[k];
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

