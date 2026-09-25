'use strict';

// Node test runner for the Waste Tower engine. No browser, no network.
//   node test-engine.js

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var data = require('./preview/data/wasted_tower.js');
var T = require('./preview/js/engine.js');
var narrator = require('./preview/js/narrator.js');

var adventure = data.ADVENTURES.wasted_tower;
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok  ' + name);
  } catch (e) {
    failed++;
    console.error('FAIL ' + name);
    console.error(e && e.stack ? e.stack : e);
  }
}

function seqRng(values) {
  var i = 0;
  return {
    die: function (sides) {
      if (i >= values.length) throw new Error('rng exhausted (' + sides + ')');
      return Math.max(1, Math.min(sides, values[i++]));
    },
    rolled: function () { return i; }
  };
}

function arm(engine, targetHp) {
  var parsed = T.parseDice(engine.character.attack.damage);
  var max = parsed.count * parsed.sides + parsed.mod;
  var living = engine.livingEnemies().length;
  var kills = max >= targetHp;
  var vals = [20];
  var d;
  for (d = 0; d < parsed.count; d++) vals.push(99);
  var enemiesLeft = kills ? Math.max(0, living - 1) : living;
  var e;
  for (e = 0; e < enemiesLeft; e++) vals.push(1);
  engine.rng = seqRng(vals);
}

function winCombat(engine) {
  var guard = 0;
  while (engine.status === 'playing' && engine.scene && engine.scene.type === 'combat') {
    var living = engine.livingEnemies();
    if (!living.length) throw new Error('no living enemies in ' + engine.sceneId);
    arm(engine, living[0].hp);
    var res = engine.perform({ type: 'attack', target: living[0].index });
    if (!res.ok) throw new Error(res.error + ' @ ' + engine.sceneId);
    if (++guard > 40) throw new Error('combat did not end @ ' + engine.sceneId);
  }
}

function choose(engine, id) {
  var res = engine.perform({ type: 'choice', id: id });
  if (!res.ok) throw new Error(res.error + ' choosing ' + id + ' @ ' + engine.sceneId);
  return res;
}

function succeedCheck(engine) {
  engine.rng = seqRng([20]);
  var res = engine.perform({ type: 'roll' });
  if (!res.ok) throw new Error(res.error);
  return res;
}

function cont(engine) {
  if (!engine.scene || engine.scene.type !== 'checkpoint') {
    throw new Error('expected checkpoint, at ' + engine.sceneId);
  }
  var res = engine.perform({ type: 'continue' });
  if (!res.ok) throw new Error(res.error);
  return res;
}

function choiceIds(engine) {
  return engine.legalActions().filter(function (a) { return a.type === 'choice'; }).map(function (a) { return a.id; });
}

function failCheck(engine) {
  engine.rng = seqRng([1]);
  var res = engine.perform({ type: 'roll' });
  if (!res.ok) throw new Error(res.error);
  return res;
}

function drinkPotions(engine) {
  var guard = 0;
  while (guard++ < 8) {
    var slot = -1;
    engine.character.inventory.forEach(function (id, i) {
      if (id === 'potion_heal' || id === 'potion_heal_2') slot = i;
    });
    if (slot < 0) return;
    var res = engine.perform({ type: 'use_item', slot: slot });
    if (!res.ok) throw new Error(res.error);
  }
}

// Shared beats inserted by the outline. opts picks the consequential options.
function answerInserted(engine, opts) {
  opts = opts || {};
  var guard = 0;
  while (engine.status === 'playing' && engine.scene && engine.scene.type === 'beat' && guard++ < 12) {
    var id = engine.sceneId;
    var ids = choiceIds(engine);
    if (id === 'f1_rats_after') {
      if (opts.robe) choose(engine, 'robe');
      else if (opts.cloth) choose(engine, 'cloth');
      else choose(engine, 'ignore');
    } else if (id === 'f1_bandit_after') {
      if (opts.spare) choose(engine, 'spare');
      else if (opts.persuade) choose(engine, 'persuade');
      else choose(engine, 'loot');
    } else if (id === 'f2_bones_after') {
      if (ids.indexOf('close') >= 0 || ids.indexOf('loot_bones') >= 0) {
        choose(engine, opts.robBones ? 'loot_bones' : 'close');
      } else if (ids.indexOf('bury') >= 0) {
        choose(engine, opts.bury ? 'bury' : 'crest');
      } else if (ids.indexOf('scrap') >= 0) {
        choose(engine, opts.scrap ? 'scrap' : 'skip_scrap');
      } else break;
    } else if (id === 'f2_ooze_after') {
      if (ids.indexOf('leave_a') >= 0 || ids.indexOf('leave_b') >= 0 || ids.indexOf('down') >= 0) {
        if (opts.leavePotion) {
          if (ids.indexOf('leave_a') >= 0) choose(engine, 'leave_a');
          else choose(engine, 'leave_b');
        } else choose(engine, 'down');
      } else if (ids.indexOf('take_antler') >= 0) {
        choose(engine, 'take_antler');
      } else break;
    } else if (id === 'f3_cult_talk') {
      if (opts.insight) choose(engine, 'insight');
      else if (opts.showCloth) choose(engine, 'show_cloth');
      else choose(engine, 'fight');
    } else if (id === 'f3_cult_after') {
      if (opts.redeem) choose(engine, 'redeem');
      else if (opts.spareCult) choose(engine, 'spare');
      else choose(engine, 'kill');
    } else if (id === 'f3_altar') {
      if (opts.stopAt === 'altar') break;
      if (opts.rest && ids.indexOf('rest') >= 0) choose(engine, 'rest');
      else if (opts.will && ids.indexOf('will') >= 0) choose(engine, 'will');
      else if (opts.cut && ids.indexOf('cut') >= 0) choose(engine, 'cut');
      else if (opts.arrow && ids.indexOf('make_arrow') >= 0) choose(engine, 'make_arrow');
      else if (opts.burn && ids.indexOf('burn') >= 0) choose(engine, 'burn');
      else if (opts.keep && ids.indexOf('keep') >= 0) choose(engine, 'keep');
      else choose(engine, 'onward');
    } else break;
    if (engine.scene && engine.scene.type === 'check') return;
  }
}

function playMain(index) {
  var engine = new T.Engine(adventure, { seed: 1 });
  var started = engine.start(index);
  assert.strictEqual(started.ok, true);
  assert.strictEqual(engine.sceneId, 'f1_gate');
  choose(engine, 'rush');
  winCombat(engine);
  answerInserted(engine);
  choose(engine, 'climb');
  succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine);
  assert.strictEqual(engine.sceneId, 'cp_f1');
  cont(engine);
  assert.strictEqual(engine.sceneId, 'f2_stairs');
  choose(engine, 'up');
  winCombat(engine);
  answerInserted(engine);
  choose(engine, 'watch');
  succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine);
  assert.strictEqual(engine.sceneId, 'cp_f2');
  cont(engine);
  choose(engine, 'smash');
  answerInserted(engine);
  winCombat(engine);
  answerInserted(engine);
  choose(engine, 'rush_boss');
  winCombat(engine);
  assert.strictEqual(engine.sceneId, 'cp_f3');
  cont(engine);
  assert.strictEqual(engine.sceneId, 'post_tower');
  assert.ok(choiceIds(engine).indexOf('face_rival') < 0);
  choose(engine, 'leave');
  assert.strictEqual(engine.status, 'won');
  return engine;
}

function playSecret(index, opts) {
  opts = opts || {};
  var engine = new T.Engine(adventure, { seed: 2 });
  engine.start(index);
  var gateIds = choiceIds(engine);
  if (gateIds.indexOf('search_finn') >= 0) choose(engine, 'search_finn');
  else choose(engine, 'search');
  assert.ok(engine.character.inventory.indexOf('iron_key') >= 0);
  winCombat(engine);
  answerInserted(engine, opts);
  choose(engine, 'creep');
  succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine, opts);
  cont(engine);
  assert.ok(choiceIds(engine).indexOf('side') >= 0);
  choose(engine, 'side');
  winCombat(engine);
  choose(engine, 'take_loot');
  assert.strictEqual(engine.flags.vault_cleared, true);
  assert.ok(engine.character.inventory.indexOf('rust_key') >= 0);
  assert.ok(engine.character.inventory.indexOf('iron_key') < 0);
  winCombat(engine);
  answerInserted(engine, opts);
  choose(engine, 'force');
  succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine, opts);
  cont(engine);
  choose(engine, 'unlock');
  answerInserted(engine, opts);
  winCombat(engine);
  answerInserted(engine, opts);
  assert.strictEqual(engine.sceneId, 'f3_shrine');
  assert.ok(choiceIds(engine).indexOf('niche') >= 0);
  choose(engine, 'niche');
  winCombat(engine);
  choose(engine, 'take_holy');
  winCombat(engine);
  cont(engine);
  assert.strictEqual(engine.flags.secret_ready, true);
  assert.ok(choiceIds(engine).indexOf('face_rival') >= 0);
  choose(engine, 'face_rival');
  var rivals = choiceIds(engine);
  assert.ok(rivals.length >= 1);
  choose(engine, rivals[0]);
  assert.strictEqual(engine.sceneId, 'rival_boss');
  assert.strictEqual(engine.encounter.enemies.length, 1);
  assert.notStrictEqual(engine.encounter.enemies[0].name, engine.character.name);
  winCombat(engine);
  assert.strictEqual(engine.status, 'secret_won');
  assert.strictEqual(engine.sceneId, 'secret_win');
  return engine;
}

function pregen(name, cls) {
  return {
    name: name, 'class': cls, race: '人類',
    str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10,
    ac: 14, hp_max: 12,
    skills: ['athletics'],
    attack: { name: '劍', bonus: 5, damage: '1d8+3' },
    inventory: [],
    features: [{ id: 'hit', name: '重擊', uses: 3, effect: { type: 'damage', amount: 6 } }]
  };
}

function memoryStorage() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }
  };
}

test('shipped script validates and every class reaches both endings', function () {
  var report = T.validateAdventure(adventure);
  assert.strictEqual(report.ok, true, report.errors.join('\n'));
  var walk = T.walkScript(adventure);
  assert.strictEqual(walk.ok, true, walk.errors.join('\n'));
  adventure.pregens.forEach(function (p) {
    assert.strictEqual(walk.reached.win[p['class']], true, p['class']);
    assert.strictEqual(walk.reached.secret_win[p['class']], true, p['class']);
  });
  assert.strictEqual(walk.reachable.length, adventure.scenes.length);
});

test('existing prose, items, classes, and enemy numbers are unchanged', function () {
  var snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'story-snapshot.json'), 'utf8'));
  assert.strictEqual(adventure.title, snap.title);
  assert.deepStrictEqual(adventure.pregens, snap.pregens);
  assert.deepStrictEqual(adventure.items.slice(0, snap.items.length), snap.items);
  assert.deepStrictEqual(adventure.items[adventure.items.length - 1], {
    id: 'antler_arrow', name: '鹿角箭', kind: 'consumable', damage: 8
  });
  var byId = {};
  adventure.scenes.forEach(function (s) { byId[s.id] = s; });
  var winTo = {
    f1_rats: 'f1_rats_after',
    f1_bandit: 'f1_bandit_after',
    f2_bones: 'f2_bones_after',
    f2_ooze: 'f2_ooze_after',
    f3_cult: 'f3_cult_after',
    f3_wight: 'cp_f3'
  };
  var fleeTo = { f3_cult: 'f3_cult_talk', f3_wight: 'f3_shrine' };
  var factReplace = {
    f2_stairs: {
      '正路通往上層通道。': '正路通往下層通道。'
    },
    win: { '你取下牆上的銅徽。': '你握緊銅徽。' }
  };
  var factExact = {
    cp_f1: ['盜墓者的腳步聲遠去。你坐在石階口，塔裡靜得聽見自己的心跳。——第一層完。'],
    cp_f2: ['酸味漸漸散去，再往下就是底層鐵門。今夜最難的一段就在門後。——第二層完。'],
    cp_f3: ['怨靈散成灰，林緣風很大。你今夜做過的事，都在這裡清算。'],
    post_tower: ['怨靈散成灰。', '你從內室牆上取下銅徽。', '你走出廢塔。', '林緣風很大。']
  };
  var labelChange = { 'f2_stairs/up': '沿正路向下' };
  var toChange = { 'f3_door/unlock': 'f3_cult_talk', 'f3_door/smash': 'f3_cult_talk' };
  function textsOf(facts) {
    return (facts || []).map(function (f) { return typeof f === 'string' ? f : f.text; });
  }
  Object.keys(snap.scenes).forEach(function (id) {
    var orig = snap.scenes[id];
    var now = byId[id];
    assert.ok(now, 'missing scene ' + id);
    if (factExact[id]) {
      assert.deepStrictEqual(textsOf(now.facts).filter(function (t) { return typeof t === 'string'; }), factExact[id], id);
    } else {
      var replaced = (orig.facts || []).map(function (f) {
        var text = typeof f === 'string' ? f : f.text;
        var map = factReplace[id] || {};
        return Object.prototype.hasOwnProperty.call(map, text) ? map[text] : text;
      });
      var nowTexts = textsOf(now.facts);
      var at = 0;
      replaced.forEach(function (text) {
        if (text == null) return;
        var found = nowTexts.indexOf(text, at);
        assert.ok(found >= 0, id + ' missing 「' + text + '」');
        at = found + 1;
      });
    }
    if (orig.choices) {
      var byChoice = {};
      (now.choices || []).forEach(function (c) { byChoice[c.id] = c; });
      orig.choices.forEach(function (c) {
        var n = byChoice[c.id];
        assert.ok(n, id + ' ' + c.id);
        assert.strictEqual(n.label, labelChange[id + '/' + c.id] || c.label, id + ' ' + c.id);
        assert.strictEqual(n.to, toChange[id + '/' + c.id] || c.to, id + ' ' + c.id);
        assert.deepStrictEqual(n.require_item || null, c.require_item || null, id + ' ' + c.id);
        assert.deepStrictEqual(n.require_flag || null, c.require_flag || null, id + ' ' + c.id);
        assert.deepStrictEqual(n.give || null, c.give || null, id + ' ' + c.id);
        assert.deepStrictEqual(n.take || null, c.take || null, id + ' ' + c.id);
        assert.strictEqual(n.hp_delta, c.hp_delta, id + ' ' + c.id);
        (c.set_flag || []).forEach(function (f) {
          assert.ok(n.set_flag && n.set_flag.indexOf(f) >= 0, id + ' ' + f);
        });
      });
    }
    if (orig.choices_from) assert.strictEqual(now.choices_from, orig.choices_from);
    if (orig.choice_to) assert.strictEqual(now.choice_to, orig.choice_to);
    if (orig.type === 'combat') {
      assert.deepStrictEqual(now.enemies, orig.enemies, id);
      assert.strictEqual(now.win_to, winTo[id] || orig.win_to, id);
      assert.strictEqual(now.flee_to, Object.prototype.hasOwnProperty.call(fleeTo, id) ? fleeTo[id] : orig.flee_to, id);
    }
    if (orig.type === 'check') {
      ['skill', 'dc', 'success_to', 'fail_to', 'fail_hp_delta'].forEach(function (k) {
        assert.strictEqual(now[k], orig[k], id + ' ' + k);
      });
      assert.ok(now.minHp === undefined && now.min_hp === undefined, id + ' minHp');
    }
    if (orig.type === 'end') assert.strictEqual(now.end, orig.end);
  });
  assert.strictEqual(byId.win.name, '廢塔一夜');
  assert.strictEqual(byId.f3_wight.flee_to, 'f3_shrine');
});

test('floor checkpoints sit between floors and can be continued', function () {
  assert.strictEqual(adventure.scenes.filter(function (s) { return s.type === 'checkpoint'; }).length, 3);
  var engine = new T.Engine(adventure, { seed: 3 });
  engine.start(0);
  choose(engine, 'rush');
  winCombat(engine);
  answerInserted(engine);
  choose(engine, 'scan');
  succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine);
  assert.strictEqual(engine.scene.floor, 1);
  assert.strictEqual(engine.scene.name, '一層歇腳');
  assert.deepStrictEqual(engine.scene.facts, ['盜墓者的腳步聲遠去。你坐在石階口，塔裡靜得聽見自己的心跳。——第一層完。']);
  var acts = engine.legalActions().map(function (a) { return a.type; });
  assert.ok(acts.indexOf('continue') >= 0);
  assert.ok(acts.indexOf('attack') < 0);
  cont(engine);
  assert.strictEqual(engine.sceneId, 'f2_stairs');
  assert.strictEqual(engine.perform({ type: 'continue' }).ok, false);
});

test('each class can clear the tower and the hidden ending', function () {
  adventure.pregens.forEach(function (p, i) {
    var main = playMain(i);
    assert.strictEqual(main.status, 'won', p.name);
    assert.strictEqual(main.character.hp, p.hp_max - 3, p.name + ' hp');
    var card = main.endingCard();
    assert.strictEqual(card.endingName, '廢塔一夜');
    assert.strictEqual(card.endingType, 'main');
    assert.strictEqual(card.className, p['class']);
    assert.strictEqual(card.characterName, p.name);
    assert.strictEqual(card.battlesTotal, 8);
    assert.strictEqual(card.battlesHidden, 2);
    assert.strictEqual(card.battlesCleared, 6);
    assert.ok(/戰鬥 6\/8（含隱藏）/.test(card.battlesLabel));
    assert.strictEqual(card.hp, p.hp_max - 3);
    assert.strictEqual(card.playAgainLabel, '試試第二個職業？');
    assert.ok(card.playTime);
    var labels = card.keyChoices.map(function (k) { return k.label; });
    assert.ok(labels.indexOf('盜墓者：搜身') >= 0, p.name);
    assert.ok(labels.indexOf('骸骨：合眼') >= 0, p.name);
    assert.ok(labels.indexOf('邪徒：了結') >= 0, p.name);
    assert.ok(labels.indexOf('面對跟蹤的冒險者') < 0, p.name);

    var secret = playSecret(i);
    assert.strictEqual(secret.status, 'secret_won', p.name);
    var scard = secret.endingCard();
    assert.strictEqual(scard.endingName, '隱藏結局');
    assert.strictEqual(scard.endingType, 'secret');
    assert.strictEqual(scard.battlesCleared, 8);
    assert.ok(scard.keyChoices.some(function (k) { return k.label.indexOf('對手：') === 0; }), p.name);
  });
});

test('side door and crypt stay gated by the key and the vault flag', function () {
  var engine = new T.Engine(adventure, { seed: 4 });
  engine.start(0);
  choose(engine, 'rush');
  assert.ok(engine.character.inventory.indexOf('iron_key') < 0);
  winCombat(engine);
  answerInserted(engine);
  choose(engine, 'climb');
  succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine);
  cont(engine);
  assert.ok(choiceIds(engine).indexOf('side') < 0);
  assert.strictEqual(engine.perform({ type: 'choice', id: 'side' }).ok, false);
});

test('skill check succeeds on the DC and failure costs the stated HP', function () {
  var exact = new T.Engine(adventure, { seed: 5 });
  exact.start(0);
  choose(exact, 'rush');
  winCombat(exact);
  answerInserted(exact);
  choose(exact, 'climb');
  assert.strictEqual(exact.sceneId, 'f1_ath');
  exact.rng = seqRng([7]);
  var ok = exact.perform({ type: 'roll' });
  assert.strictEqual(ok.ok, true);
  var check = ok.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(check.d20, 7);
  assert.strictEqual(check.total, 12);
  assert.strictEqual(check.success, true);
  assert.strictEqual(exact.sceneId, 'f1_bandit');
  assert.strictEqual(exact.character.hp, 12);

  var fail = new T.Engine(adventure, { seed: 6 });
  fail.start(0);
  choose(fail, 'rush');
  winCombat(fail);
  answerInserted(fail);
  choose(fail, 'climb');
  fail.rng = seqRng([1]);
  var bad = fail.perform({ type: 'roll' });
  var failed = bad.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(failed.success, false);
  assert.strictEqual(fail.character.hp, 10);
  assert.strictEqual(fail.sceneId, 'f1_bandit');
});

test('flee returns without clearing the fight', function () {
  var engine = new T.Engine(adventure, { seed: 7 });
  engine.start(1);
  choose(engine, 'rush');
  assert.strictEqual(engine.sceneId, 'f1_rats');
  var fled = engine.perform({ type: 'flee' });
  assert.strictEqual(fled.ok, true);
  assert.strictEqual(engine.sceneId, 'f1_gate');
  assert.ok(!engine.clearedCombats.f1_rats);
  assert.ok(!engine.flags.secret_ready);
});

test('features and consumables keep their old limits', function () {
  var cleric = new T.Engine(adventure, { seed: 8 });
  cleric.start(3);
  var full = cleric.perform({ type: 'use_feature', featureId: 'lay_on_hands' });
  assert.strictEqual(full.ok, false);
  assert.strictEqual(cleric.character.features[0].uses, 3);
  cleric.character.hp = 4;
  var healed = cleric.perform({ type: 'use_feature', featureId: 'lay_on_hands' });
  assert.strictEqual(healed.ok, true);
  assert.strictEqual(cleric.character.hp, 10);
  assert.strictEqual(cleric.character.features[0].uses, 2);
  assert.strictEqual(cleric.sceneId, 'f1_gate');
  cleric.character.hp = 9;
  var slot = cleric.character.inventory.indexOf('potion_heal');
  cleric.perform({ type: 'use_item', slot: slot });
  assert.strictEqual(cleric.character.hp, 10);
  assert.ok(cleric.character.inventory.indexOf('potion_heal') < 0);

  var mage = new T.Engine(adventure, { seed: 9 });
  mage.start(4);
  var scroll = mage.character.inventory.indexOf('burning_hands');
  var rejected = mage.perform({ type: 'use_item', slot: scroll });
  assert.strictEqual(rejected.ok, false);
  assert.ok(mage.character.inventory.indexOf('burning_hands') >= 0);
  choose(mage, 'rush');
  mage.rng = seqRng([1, 1, 1]);
  var buff = mage.perform({ type: 'use_feature', featureId: 'mage_armor' });
  assert.strictEqual(buff.ok, true);
  assert.strictEqual(mage.effectiveAc(), 15);
  assert.strictEqual(mage.character.features[0].uses, 2);
  var again = mage.perform({ type: 'use_feature', featureId: 'mage_armor' });
  assert.strictEqual(again.ok, false);
  assert.strictEqual(mage.character.features[0].uses, 2);
  mage.perform({ type: 'flee' });
  assert.strictEqual(mage.character.acBonus, 0);
  assert.strictEqual(mage.effectiveAc(), 12);

  var fighter = new T.Engine(adventure, { seed: 10 });
  fighter.start(0);
  choose(fighter, 'rush');
  fighter.rng = seqRng([1, 1]);
  var strike = fighter.perform({ type: 'use_feature', featureId: 'power_strike', target: 0 });
  assert.strictEqual(strike.ok, true);
  assert.strictEqual(fighter.encounter.enemies[0].hp, 0);
  assert.strictEqual(fighter.character.features[0].uses, 2);
  assert.strictEqual(fighter.status, 'playing');
});

test('save round-trip, rng, and mid-fight restore', function () {
  var engine = new T.Engine(adventure, { seed: 99 });
  engine.start(0);
  choose(engine, 'search');
  var code = T.encodeSaveCode(engine.exportSave());
  var face = engine.rng.die(20);
  var loaded = T.loadGame(adventure, code);
  assert.strictEqual(loaded.ok, true, loaded.error);
  assert.strictEqual(loaded.engine.sceneId, 'f1_rats');
  assert.ok(loaded.engine.character.inventory.indexOf('iron_key') >= 0);
  assert.strictEqual(loaded.engine.flags.gate_searched, true);
  assert.strictEqual(loaded.engine.rng.die(20), face);
  var resumed = loaded.engine.resumeView();
  assert.strictEqual(resumed.ok, true);
  assert.ok(resumed.events.some(function (e) { return e.t === 'scene' && e.sceneType === 'combat'; }));

  winCombat(loaded.engine);
  var before = loaded.engine.enemySnapshot ? null : null;
  var fighter = new T.Engine(adventure, { seed: 11 });
  fighter.start(0);
  choose(fighter, 'rush');
  arm(fighter, fighter.livingEnemies()[0].hp);
  fighter.perform({ type: 'attack', target: 0 });
  assert.strictEqual(fighter.sceneId, 'f1_rats');
  var mid = T.encodeSaveCode(fighter.exportSave());
  var back = T.loadGame(adventure, mid);
  assert.strictEqual(back.ok, true, back.error);
  assert.deepStrictEqual(back.engine.enemySnapshot(), fighter.enemySnapshot());
  assert.strictEqual(back.engine.character.hp, fighter.character.hp);
  assert.strictEqual(back.engine.round, fighter.round);
});

test('old save codes migrate and bad codes fail without throwing', function () {
  var engine = new T.Engine(adventure, { seed: 12 });
  engine.start(2);
  choose(engine, 'rush');
  var save = engine.exportSave();
  save.v = 0;
  var kept = save.keyChoices.slice();
  var code = T.encodeSaveCode(save);
  var migrated = T.loadGame(adventure, code);
  assert.strictEqual(migrated.ok, true, migrated.error);
  assert.strictEqual(migrated.engine.sceneId, 'f1_rats');
  assert.deepStrictEqual(migrated.engine.keyChoices, kept);

  var dropped = engine.exportSave();
  dropped.v = 0;
  delete dropped.keyChoices;
  var filled = T.loadGame(adventure, T.encodeSaveCode(dropped));
  assert.strictEqual(filled.ok, true, filled.error);
  assert.deepStrictEqual(filled.engine.keyChoices, []);

  var v1 = engine.exportSave();
  v1.v = 1;
  delete v1.flags.cls_rogue;
  delete v1.lastCheckpoint;
  delete v1.playMs;
  var upgraded = T.loadGame(adventure, T.encodeSaveCode(v1));
  assert.strictEqual(upgraded.ok, true, upgraded.error);
  assert.strictEqual(upgraded.engine.flags.cls_rogue, true);
  assert.strictEqual(upgraded.engine.playTimeKnown, false);

  var newer = engine.exportSave();
  newer.v = 4;
  var tooNew = T.loadGame(adventure, T.encodeSaveCode(newer));
  assert.strictEqual(tooNew.ok, false);
  assert.ok(/較新/.test(tooNew.error));

  ['', '   ', 'hello', 'WT1.@@@', 'WT1.eyJ2Ijo5fQ=='].forEach(function (bad) {
    var res = T.loadGame(adventure, bad);
    assert.strictEqual(res.ok, false, bad);
    assert.strictEqual(typeof res.error, 'string');
    assert.ok(res.error.length > 0);
  });

  var missing = engine.exportSave();
  missing.sceneId = 'no_such_scene';
  var gone = T.loadGame(adventure, T.encodeSaveCode(missing));
  assert.strictEqual(gone.ok, false);
  assert.ok(/場景/.test(gone.error));

  var cloned = JSON.parse(JSON.stringify(adventure));
  cloned.meta.script_version = 2;
  var oldScript = engine.exportSave();
  oldScript.sceneId = 'old_gate';
  oldScript.scriptVersion = 1;
  var renamed = T.loadGame(cloned, T.encodeSaveCode(oldScript), {
    hooks: {
      scriptMigrations: {
        1: function (s) {
          if (s.sceneId === 'old_gate') s.sceneId = 'f1_gate';
          s.scriptVersion = 2;
          return s;
        }
      }
    }
  });
  assert.strictEqual(renamed.ok, true, renamed.error);
  assert.strictEqual(renamed.engine.sceneId, 'f1_gate');

  var stuck = JSON.parse(JSON.stringify(adventure));
  stuck.meta.script_version = 3;
  var cannot = T.loadGame(stuck, T.encodeSaveCode(engine.exportSave()));
  assert.strictEqual(cannot.ok, false);
  assert.ok(/升級/.test(cannot.error));
});

test('the single save slot writes, reads, and survives a failed write', function () {
  var mem = memoryStorage();
  var store = new T.SaveSlot(mem);
  var engine = new T.Engine(adventure, { seed: 13 });
  engine.start(0);
  var code = T.encodeSaveCode(engine.exportSave());
  assert.strictEqual(store.write(code).ok, true);
  assert.strictEqual(store.read(), code);
  store.clear();
  assert.strictEqual(store.read(), null);

  var full = new T.SaveSlot({
    getItem: function () { return null; },
    setItem: function () { throw new Error('quota'); },
    removeItem: function () {}
  });
  var denied = full.write('WT1.x');
  assert.strictEqual(denied.ok, false);
  assert.ok(/匯出存檔碼/.test(denied.error));
});

test('preview localStorage keys all start with wasted-tower-preview-', function () {
  var prefix = 'wasted-tower-preview-';
  assert.strictEqual(T.PREVIEW_STORAGE_PREFIX, prefix);
  var names = T.previewStorageKeys().slice().sort();
  assert.deepStrictEqual(names, ['wasted-tower-preview-probe', 'wasted-tower-preview-save']);
  names.forEach(function (key) {
    assert.strictEqual(key.indexOf(prefix), 0, key);
  });

  var seen = [];
  var rec = {
    getItem: function (key) { seen.push(key); return null; },
    setItem: function (key) { seen.push(key); },
    removeItem: function (key) { seen.push(key); }
  };
  var slot = new T.SaveSlot(rec);
  assert.strictEqual(slot.write('WT3.abc').ok, true);
  slot.read();
  slot.clear();
  rec.setItem(T.PREVIEW_STORAGE_KEYS.probe, '1');
  rec.removeItem(T.PREVIEW_STORAGE_KEYS.probe);
  assert.ok(seen.length > 0);
  seen.forEach(function (key) {
    assert.strictEqual(key.indexOf(prefix), 0, key);
  });

  var publicKey = 'wasted-tower' + '.slot1';
  var genericProbe = '__wt' + '_probe__';
  ['preview/js/engine.js', 'preview/js/ui.js', 'preview/js/narrator.js', 'preview/index.html'].forEach(function (rel) {
    var text = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.ok(text.indexOf(publicKey) < 0, rel);
    assert.ok(text.indexOf(genericProbe) < 0, rel);
    var re = /\.(?:setItem|getItem|removeItem)\(\s*(['"])([^'"]+)\1/g;
    var match;
    while ((match = re.exec(text))) {
      assert.strictEqual(match[2].indexOf(prefix), 0, rel + ' writes ' + match[2]);
    }
  });
  var ui = fs.readFileSync(path.join(__dirname, 'preview/js/ui.js'), 'utf8');
  assert.ok(ui.indexOf('PREVIEW_STORAGE_KEYS.probe') >= 0);
  assert.ok(ui.indexOf('PREVIEW_STORAGE_KEYS.save') >= 0);
});

test('class lines, counters, and flag-gated endings', function () {
  var story = {
    id: 'fixture',
    title: '測試',
    start: 'start',
    items: [],
    flag_defs: { bandit_spared: { key: true, label: '放過他' } },
    pregens: [pregen('甲', '戰士'), pregen('乙', '法師')],
    scenes: [
      {
        id: 'start',
        type: 'beat',
        facts: [
          '起點。',
          { text: '他看著你的長劍，沒有再靠近。', when: { 'class': '戰士' } }
        ],
        choices: [
          {
            id: 'spare',
            label: '放過他',
            to: 'mercy',
            when: { 'class': '戰士' },
            set_flag: ['bandit_spared'],
            inc: { bandit_affinity: 1 }
          },
          { id: 'go', label: '前進', to: 'plain' }
        ]
      },
      {
        id: 'plain',
        type: 'end',
        end: 'win',
        name: '普通結局',
        facts: ['完。']
      },
      {
        id: 'mercy',
        type: 'end',
        end: 'win',
        name: '手下留情',
        when: { all_flags: ['bandit_spared'], flag_min: { bandit_affinity: 1 } },
        facts: ['你沒有殺他。']
      }
    ]
  };
  var report = T.validateAdventure(story);
  assert.strictEqual(report.ok, true, report.errors.join('\n'));

  var warrior = new T.Engine(story, { seed: 1 });
  var began = warrior.start(0);
  var facts = began.events.filter(function (e) { return e.t === 'scene'; })[0].facts;
  assert.ok(facts.indexOf('他看著你的長劍，沒有再靠近。') >= 0);
  assert.ok(choiceIds(warrior).indexOf('spare') >= 0);
  choose(warrior, 'spare');
  assert.strictEqual(warrior.status, 'won');
  assert.strictEqual(warrior.flags.bandit_affinity, 1);
  assert.strictEqual(warrior.endingCard().endingName, '手下留情');
  assert.deepStrictEqual(warrior.endingCard().keyChoices.map(function (k) { return k.label; }), ['放過他']);

  var mage = new T.Engine(story, { seed: 1 });
  var mageStart = mage.start(1);
  var mageFacts = mageStart.events.filter(function (e) { return e.t === 'scene'; })[0].facts;
  assert.ok(mageFacts.indexOf('他看著你的長劍，沒有再靠近。') < 0);
  assert.ok(choiceIds(mage).indexOf('spare') < 0);
  assert.deepStrictEqual(mageFacts, ['起點。']);
  choose(mage, 'go');
  assert.strictEqual(mage.endingCard().endingName, '普通結局');
});

test('a flag-gated ending that can be entered too early is rejected', function () {
  var story = {
    id: 'blocked',
    title: '測試',
    start: 'start',
    items: [],
    pregens: [pregen('甲', '戰士')],
    scenes: [
      {
        id: 'start',
        type: 'beat',
        facts: ['起點。'],
        choices: [
          { id: 'spare', label: '放過', to: 'mercy', set_flag: ['bandit_spared'] },
          { id: 'go', label: '離開', to: 'plain' }
        ]
      },
      { id: 'plain', type: 'end', end: 'win', name: '普通結局', facts: ['完。'] },
      {
        id: 'mercy',
        type: 'end',
        end: 'win',
        name: '手下留情',
        when: { all_flags: ['bandit_spared'], flag_min: { bandit_affinity: 1 } },
        facts: ['未完。']
      }
    ]
  };
  var report = T.validateAdventure(story);
  assert.strictEqual(report.ok, false);
  assert.ok(report.errors.some(function (e) { return /mercy/.test(e); }));
});

test('a scene with no usable exit is a dead end', function () {
  var story = {
    id: 'dead',
    title: '測試',
    start: 'start',
    items: [],
    pregens: [pregen('甲', '戰士')],
    scenes: [
      {
        id: 'start',
        type: 'beat',
        facts: ['起點。'],
        choices: [{ id: 'nope', label: '做不到', to: 'end', require_flag: ['never'] }]
      },
      { id: 'end', type: 'end', end: 'win', name: '完', facts: ['完。'] }
    ]
  };
  var report = T.validateAdventure(story);
  assert.strictEqual(report.ok, false);
  assert.ok(report.errors.some(function (e) { return /死路|走不到/.test(e); }));
});

test('reserved future fields are kept and ignored', function () {
  var cloned = JSON.parse(JSON.stringify(adventure));
  cloned.achievements = [];
  cloned.bestiary = [];
  cloned.scenes.forEach(function (s) {
    if (s.type === 'combat' && s.enemies) {
      s.enemies.forEach(function (e) { if (!e.from_pregen) e.skills = []; });
    }
  });
  var report = T.validateAdventure(cloned);
  assert.strictEqual(report.ok, true, report.errors.join('\n'));
  cloned.achievements = 'nope';
  assert.strictEqual(T.validateAdventure(cloned).ok, false);
  cloned.achievements = [];
  cloned.scenes[1].enemies[0].skills = 'burn';
  assert.strictEqual(T.validateAdventure(cloned, { walk: false }).ok, false);
});

test('ending card text includes class, ending name, and key choices', function () {
  var card = {
    title: '廢塔一夜',
    endingName: '通關',
    characterName: '布倫',
    className: '戰士',
    race: '人類',
    keyChoices: [{ id: 'gate_rushed', label: '直接進塔' }]
  };
  var ctx = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '', strokeStyle: '', lineWidth: 1,
    measureText: function (s) { return { width: String(s).length * 10 }; },
    fillRect: function () {},
    strokeRect: function () {},
    fillText: function () {}
  };
  var painted = T.paintEndingCard(ctx, 720, card);
  var text = painted.blocks.map(function (b) { return b.text; }).join('\n');
  assert.ok(text.indexOf('廢塔一夜') >= 0);
  assert.ok(text.indexOf('通關') >= 0);
  assert.ok(text.indexOf('戰士') >= 0);
  assert.ok(text.indexOf('直接進塔') >= 0);
  assert.ok(text.indexOf('關鍵選擇') >= 0);
});

test('narrator still speaks scene facts and does not invent checkpoint facts', function () {
  var engine = new T.Engine(adventure, { seed: 14 });
  var started = engine.start(0);
  var scene = started.events.filter(function (e) { return e.t === 'scene'; })[0];
  var lines = narrator.OfflineNarrator.narrate(narrator.cueOf(scene), scene.view);
  var texts = lines.map(function (l) { return l.text; });
  assert.ok(texts.indexOf('林緣有一座廢塔。') >= 0);
  assert.ok(texts.indexOf('木門半掩。') >= 0);
  assert.ok(texts.indexOf('天色將晚。') >= 0);
});

test('class flags, counters, text, checks, items, flee, and rest', function () {
  var classFlag = {
    '戰士': 'cls_warrior', '遊俠': 'cls_ranger', '盜賊': 'cls_rogue',
    '牧師': 'cls_cleric', '法師': 'cls_mage'
  };
  adventure.pregens.forEach(function (p, i) {
    var engine = new T.Engine(adventure, { seed: 20 + i });
    engine.start(i);
    assert.strictEqual(engine.flags[classFlag[p['class']]], true, p['class']);
    Object.keys(classFlag).forEach(function (cls) {
      if (cls !== p['class']) assert.ok(!engine.flags[classFlag[cls]], p['class']);
    });
  });

  var story = {
    id: 'hooks',
    title: '鉤子',
    start: 'talk',
    meta: { class_flags: { '戰士': 'cls_warrior', '牧師': 'cls_cleric' } },
    flag_defs: {
      aff_bandit: { min: 0, max: 2, label: '盜墓者親和' },
      branch_done: { key: true, label: '完成分支' },
      climbed: { label: '爬過' },
      slipped: { label: '滑倒' }
    },
    class_branches: [{
      id: 'warrior_branch',
      label: 'X',
      when: { all_flags: ['cls_warrior'] },
      completed_when: { all_flags: ['branch_done'] },
      miss_reason: '沒有完成分支。'
    }],
    items: [
      { id: 'potion', name: '藥水', kind: 'consumable', heal: 4 },
      { id: 'antler_arrow', name: '鹿角箭', kind: 'consumable', damage: 8 }
    ],
    pregens: [
      pregen('甲', '戰士'),
      pregen('乙', '牧師')
    ],
    scenes: [
      {
        id: 'talk',
        type: 'beat',
        facts: [
          '門關著。',
          { text: '門已經開了。', replace: '門關著。', when: { all_flags: ['opened'] } },
          { text: '你聽見腳步。', when: { not: { all_flags: ['quiet'] } } }
        ],
        choices: [
          { id: 'plus', label: '靠近', to: 'talk', inc: { aff_bandit: 1 }, repeatable: true },
          { id: 'minus', label: '後退', to: 'talk', dec: { aff_bandit: 1 }, repeatable: true, when: { flag_min: { aff_bandit: 1 } } },
          {
            id: 'open',
            label: '開門',
            to: 'check',
            set: { opened: true },
            when: {
              all: [{ flag_eq: { aff_bandit: 2 } }],
              any: [{ all_flags: ['cls_warrior'] }, { all_flags: ['cls_cleric'] }]
            }
          },
          { id: 'skip', label: '跳過', to: 'hurt' }
        ]
      },
      {
        id: 'check',
        type: 'check',
        skill: 'athletics',
        dc: 15,
        success_to: 'camp',
        fail_to: 'camp',
        on_success: { set_flag: ['climbed'], give: ['antler_arrow'], take: ['potion'] },
        on_failure: { set_flag: ['slipped'], hp_delta: -20, minHp: 1 }
      },
      {
        id: 'hurt',
        type: 'check',
        skill: 'athletics',
        dc: 30,
        success_to: 'dead_end_win',
        fail_to: 'dead_end_win',
        fail_hp_delta: -20
      },
      {
        id: 'camp',
        type: 'checkpoint',
        floor: 1,
        name: '歇',
        facts: ['歇一下。'],
        continue_to: 'boss',
        rest: { heal: 4, when: { all_flags: ['cls_cleric'] } }
      },
      {
        id: 'boss',
        type: 'combat',
        enemies: [{ name: '頭目', ac: 10, hp: 8, atk: 0, damage: '1d4' }],
        win_to: 'split',
        flee_to: '@checkpoint'
      },
      {
        id: 'split',
        type: 'beat',
        facts: ['分路。'],
        choices: [
          { id: 'main', label: '主線', to: 'main_end' },
          { id: 'variant', label: '變體', to: 'variant_end', set_flag: ['variant_on'] },
          { id: 'klass', label: '職業', to: 'class_end', set_flag: ['branch_done'], when: { all_flags: ['cls_warrior'] } },
          { id: 'secret', label: '隱藏', to: 'secret_end', set_flag: ['secret_on'] }
        ]
      },
      { id: 'main_end', type: 'end', end: 'win', ending_type: 'main', name: '主線', facts: ['主。'], closing: '到此為止。' },
      {
        id: 'variant_end', type: 'end', end: 'win', ending_type: 'variant', name: '變體',
        when: { all_flags: ['variant_on'] }, facts: ['變。']
      },
      {
        id: 'class_end', type: 'end', end: 'win', ending_type: 'class', name: '職業結局',
        when: { all_flags: ['branch_done'] }, facts: ['職。']
      },
      {
        id: 'secret_end', type: 'end', end: 'secret_win', ending_type: 'secret', name: '隱藏結局',
        when: { all_flags: ['secret_on'] }, facts: ['隱。']
      },
      { id: 'dead_end_win', type: 'end', end: 'win', ending_type: 'main', name: '力盡', facts: ['停。'] }
    ]
  };
  story.pregens[0].inventory = ['potion'];
  story.pregens[1].inventory = ['potion'];
  var report = T.validateAdventure(story);
  assert.strictEqual(report.ok, true, report.errors.join('\n'));

  var warrior = new T.Engine(story, { seed: 1 });
  var began = warrior.start(0);
  var facts = began.events.filter(function (e) { return e.t === 'scene'; })[0].facts;
  assert.deepStrictEqual(facts, ['門關著。', '你聽見腳步。']);
  assert.strictEqual(warrior.flags.cls_warrior, true);
  choose(warrior, 'plus');
  choose(warrior, 'plus');
  choose(warrior, 'plus');
  assert.strictEqual(warrior.flags.aff_bandit, 2);
  choose(warrior, 'minus');
  assert.strictEqual(warrior.flags.aff_bandit, 1);
  choose(warrior, 'minus');
  assert.strictEqual(warrior.flags.aff_bandit, 0);
  assert.ok(choiceIds(warrior).indexOf('minus') < 0);
  choose(warrior, 'plus');
  choose(warrior, 'plus');
  assert.ok(choiceIds(warrior).indexOf('open') >= 0);
  choose(warrior, 'open');
  assert.strictEqual(warrior.sceneId, 'check');
  warrior.flags.quiet = true;
  assert.deepStrictEqual(T.resolveFacts(warrior.scenes.talk.facts, warrior.conditionState()), ['門已經開了。']);

  warrior.rng = seqRng([20]);
  assert.strictEqual(warrior.perform({ type: 'roll' }).ok, true);
  assert.strictEqual(warrior.flags.climbed, true);
  assert.ok(warrior.character.inventory.indexOf('antler_arrow') >= 0);
  assert.ok(warrior.character.inventory.indexOf('potion') < 0);
  assert.strictEqual(warrior.sceneId, 'camp');
  assert.strictEqual(warrior.character.hp, 12);

  var cleric = new T.Engine(story, { seed: 2 });
  cleric.start(1);
  cleric.character.hp = 5;
  choose(cleric, 'plus');
  choose(cleric, 'plus');
  choose(cleric, 'open');
  cleric.rng = seqRng([1]);
  var failedRoll = cleric.perform({ type: 'roll' });
  assert.strictEqual(cleric.flags.slipped, true);
  var floored = failedRoll.events.filter(function (e) { return e.t === 'hp'; })[0];
  assert.strictEqual(floored.hp, 1);
  assert.strictEqual(cleric.sceneId, 'camp');
  assert.strictEqual(cleric.character.hp, 5);
  var restEv = cleric.events.filter(function (e) { return e.t === 'rest'; })[0];
  assert.strictEqual(restEv.healed, 4);

  var killer = new T.Engine(story, { seed: 3 });
  killer.start(0);
  choose(killer, 'skip');
  killer.rng = seqRng([1]);
  killer.perform({ type: 'roll' });
  assert.strictEqual(killer.status, 'lost');
  assert.strictEqual(killer.character.hp, 0);
  assert.strictEqual(killer.endingCard().endingType, 'lose');
  assert.strictEqual(killer.endingCard().endingName, '失敗');

  cont(cleric);
  assert.strictEqual(cleric.sceneId, 'boss');
  var slot = cleric.character.inventory.indexOf('antler_arrow');
  assert.ok(slot < 0);
  var arrowUser = new T.Engine(story, { seed: 4 });
  arrowUser.start(0);
  choose(arrowUser, 'plus');
  choose(arrowUser, 'plus');
  choose(arrowUser, 'open');
  arrowUser.rng = seqRng([20]);
  arrowUser.perform({ type: 'roll' });
  cont(arrowUser);
  var arrowSlot = arrowUser.character.inventory.indexOf('antler_arrow');
  var shot = arrowUser.perform({ type: 'use_item', slot: arrowSlot, target: 0 });
  assert.strictEqual(shot.ok, true);
  var arrowHit = shot.events.filter(function (e) { return e.t === 'item_damage'; })[0];
  assert.strictEqual(arrowHit.amount, 8);
  assert.strictEqual(arrowHit.targetHp, 0);
  assert.ok(arrowUser.character.inventory.indexOf('antler_arrow') < 0);

  var fleeing = new T.Engine(story, { seed: 5 });
  fleeing.start(0);
  choose(fleeing, 'plus');
  choose(fleeing, 'plus');
  choose(fleeing, 'open');
  fleeing.rng = seqRng([20]);
  fleeing.perform({ type: 'roll' });
  assert.strictEqual(fleeing.lastCheckpoint, 'camp');
  cont(fleeing);
  assert.strictEqual(fleeing.sceneId, 'boss');
  fleeing.perform({ type: 'flee' });
  assert.strictEqual(fleeing.sceneId, 'camp');
  assert.ok(!fleeing.clearedCombats.boss);

  function finish(engine, id) {
    if (engine.sceneId === 'camp') cont(engine);
    if (engine.sceneId === 'boss') winCombat(engine);
    choose(engine, id);
  }
  var secret = new T.Engine(story, { seed: 6 });
  secret.start(0);
  choose(secret, 'plus');
  choose(secret, 'plus');
  choose(secret, 'open');
  secret.rng = seqRng([20]);
  secret.perform({ type: 'roll' });
  finish(secret, 'secret');
  var secretCard = secret.endingCard();
  assert.strictEqual(secret.status, 'secret_won');
  assert.strictEqual(secretCard.endingType, 'secret');
  assert.strictEqual(secretCard.endingName, '隱藏結局');
  assert.ok(secretCard.branchLines.indexOf('支線：X（錯過）：沒有完成分支。') >= 0);

  var both = new T.Engine(story, { seed: 7 });
  both.start(0);
  choose(both, 'plus');
  choose(both, 'plus');
  choose(both, 'open');
  both.rng = seqRng([20]);
  both.perform({ type: 'roll' });
  finish(both, 'klass');
  assert.strictEqual(both.endingCard().endingType, 'class');
  assert.strictEqual(both.endingCard().endingName, '職業結局');
  assert.ok(both.endingCard().branchLines.indexOf('支線：X（已完成）') >= 0);
  assert.strictEqual(both.endingCard().closing, '');

  both.flags.secret_on = true;
  both.flags.variant_on = true;
  var overlaid = both.endingCard();
  assert.strictEqual(overlaid.endingType, 'secret');
  assert.strictEqual(overlaid.endingName, '隱藏結局');
  assert.ok(overlaid.branchLines.indexOf('支線：X（已完成）') >= 0);

  var plain = new T.Engine(story, { seed: 8 });
  plain.start(1);
  choose(plain, 'plus');
  choose(plain, 'plus');
  choose(plain, 'open');
  plain.rng = seqRng([20]);
  plain.perform({ type: 'roll' });
  finish(plain, 'main');
  assert.strictEqual(plain.endingCard().endingType, 'main');
  assert.strictEqual(plain.endingCard().closing, '到此為止。');
  assert.deepStrictEqual(plain.endingCard().branchLines, []);
  plain.flags.variant_on = true;
  assert.strictEqual(plain.endingCard().endingType, 'variant');
  assert.strictEqual(plain.endingCard().endingName, '變體');

  var painted = T.paintEndingCard({
    font: '', fillStyle: '', textAlign: '', textBaseline: '', strokeStyle: '', lineWidth: 1,
    measureText: function (s) { return { width: String(s).length * 10 }; },
    fillRect: function () {}, strokeRect: function () {}, fillText: function () {}
  }, 720, overlaid);
  var text = painted.blocks.map(function (b) { return b.text; }).join('\n');
  assert.ok(text.indexOf('類型　secret') >= 0);
  assert.ok(text.indexOf('支線：X（已完成）') >= 0);
  assert.ok(text.indexOf('剩餘生命') >= 0);
  assert.ok(text.indexOf('戰鬥') >= 0);
});

test('once-only rewards, checks, prompts, and inventory conditions', function () {
  var gate = new T.Engine(adventure, { seed: 30 });
  gate.start(0);
  choose(gate, 'search');
  assert.strictEqual(gate.character.inventory.filter(function (id) { return id === 'iron_key'; }).length, 1);
  assert.strictEqual(gate.done['choice:f1_gate/search'], true);
  gate.perform({ type: 'flee' });
  assert.strictEqual(gate.sceneId, 'f1_gate');
  assert.ok(choiceIds(gate).indexOf('search') < 0);
  assert.ok(choiceIds(gate).indexOf('rush') >= 0);
  assert.strictEqual(gate.character.inventory.filter(function (id) { return id === 'iron_key'; }).length, 1);
  var locked = narrator.Mechanics.format({ t: 'check_locked', skill: 'athletics' });
  assert.ok(locked[0].text.indexOf('已經擲過') >= 0);

  var saved = T.encodeSaveCode(gate.exportSave());
  var back = T.loadGame(adventure, saved);
  assert.strictEqual(back.ok, true, back.error);
  assert.strictEqual(back.engine.done['choice:f1_gate/search'], true);
  assert.ok(choiceIds(back.engine).indexOf('search') < 0);

  var legacy = gate.exportSave();
  legacy.v = 2;
  delete legacy.done;
  var migrated = T.loadGame(adventure, T.encodeSaveCode(legacy));
  assert.strictEqual(migrated.ok, true, migrated.error);
  assert.deepStrictEqual(migrated.engine.done, {});

  var story = {
    id: 'once',
    title: '一次',
    start: 'start',
    items: [
      { id: 'potion', name: '藥水', kind: 'consumable', heal: 4 },
      { id: 'gem', name: '寶石', kind: 'gear' }
    ],
    pregens: [
      pregen('壯', '戰士'),
      pregen('中', '戰士'),
      pregen('法', '法師')
    ],
    scenes: [
      {
        id: 'start',
        type: 'beat',
        facts: ['房間。'],
        choices: [
          { id: 'again', label: '再拿', to: 'start', give: ['gem'], repeatable: true },
          { id: 'loose', label: '順手', to: 'start', give: ['gem'], once: false },
          { id: 'pick', label: '撿起藥水', to: 'start', give: ['potion'] },
          {
            id: 'leave', label: '留下藥水', to: 'start', take: ['potion'], set_flag: ['potion_left'],
            when: { item_min: { potion: 1 } }
          },
          { id: 'heavy', label: '推開', to: 'ask', when: { stat_min: { str: 18 } } },
          { id: 'light', label: '離開', to: 'ask', when: { stat_max: { str: 17 } } }
        ]
      },
      {
        id: 'ask',
        type: 'beat',
        facts: ['兩件事。'],
        prompts: [
          { id: 'general', choices: [{ id: 'look', label: '張望', set_flag: ['looked'] }] },
          {
            id: 'warrior',
            when: { 'class': '戰士' },
            choices: [{ id: 'oath', label: '立誓', set_flag: ['sworn'] }]
          },
          {
            id: 'mage',
            when: { 'class': '法師' },
            choices: [{ id: 'spell', label: '施法', set_flag: ['spelled'] }]
          }
        ],
        next: 'check'
      },
      {
        id: 'check',
        type: 'check',
        skill: 'athletics',
        dc: 30,
        success_to: 'after',
        fail_to: 'after',
        fail_hp_delta: -2
      },
      {
        id: 'after',
        type: 'beat',
        facts: ['過了。'],
        rest: { heal: 1 },
        choices: [
          { id: 'back', label: '回去', to: 'check' },
          { id: 'onward', label: '向前', to: 'fin' }
        ]
      },
      { id: 'fin', type: 'end', end: 'win', ending_type: 'main', name: '完', facts: ['完。'] }
    ]
  };
  story.pregens[0].str = 18;
  story.pregens[2].str = 8;
  var report = T.validateAdventure(story);
  assert.strictEqual(report.ok, true, report.errors.join('\n'));

  var mid = new T.Engine(story, { seed: 1 });
  mid.start(1);
  assert.ok(choiceIds(mid).indexOf('leave') < 0);
  assert.ok(choiceIds(mid).indexOf('heavy') < 0);
  assert.ok(choiceIds(mid).indexOf('light') >= 0);
  choose(mid, 'again');
  choose(mid, 'again');
  choose(mid, 'loose');
  choose(mid, 'loose');
  assert.strictEqual(mid.character.inventory.filter(function (id) { return id === 'gem'; }).length, 4);
  choose(mid, 'pick');
  assert.ok(choiceIds(mid).indexOf('pick') < 0);
  assert.ok(choiceIds(mid).indexOf('leave') >= 0);
  choose(mid, 'leave');
  assert.strictEqual(mid.flags.potion_left, true);
  assert.ok(mid.character.inventory.indexOf('potion') < 0);
  assert.ok(choiceIds(mid).indexOf('leave') < 0);
  choose(mid, 'light');
  assert.deepStrictEqual(choiceIds(mid), ['look']);
  choose(mid, 'look');
  assert.strictEqual(mid.sceneId, 'ask');
  assert.strictEqual(mid.flags.looked, true);
  assert.deepStrictEqual(choiceIds(mid), ['oath']);
  choose(mid, 'oath');
  assert.strictEqual(mid.sceneId, 'check');
  assert.strictEqual(mid.flags.sworn, true);
  mid.rng = seqRng([1]);
  var failed = mid.perform({ type: 'roll' });
  assert.strictEqual(failed.ok, true);
  var hpEv = failed.events.filter(function (e) { return e.t === 'hp'; })[0];
  assert.strictEqual(hpEv.hp, 10);
  var restEv = failed.events.filter(function (e) { return e.t === 'rest'; })[0];
  assert.strictEqual(restEv.healed, 1);
  assert.strictEqual(mid.character.hp, 11);
  assert.strictEqual(mid.sceneId, 'after');
  var returned = choose(mid, 'back');
  assert.ok(returned.events.some(function (e) { return e.t === 'check_locked' && e.success === false; }));
  assert.ok(!returned.events.some(function (e) { return e.t === 'hp'; }));
  assert.ok(!returned.events.some(function (e) { return e.t === 'rest'; }));
  assert.strictEqual(mid.character.hp, 11);
  assert.strictEqual(mid.sceneId, 'after');
  assert.ok(choiceIds(mid).indexOf('roll') < 0);
  choose(mid, 'onward');
  assert.strictEqual(mid.status, 'won');

  var strong = new T.Engine(story, { seed: 2 });
  strong.start(0);
  assert.ok(choiceIds(strong).indexOf('heavy') >= 0);
  assert.ok(choiceIds(strong).indexOf('light') < 0);

  var mage = new T.Engine(story, { seed: 3 });
  mage.start(2);
  choose(mage, 'light');
  choose(mage, 'look');
  assert.deepStrictEqual(choiceIds(mage), ['spell']);
  assert.ok(!mage.flags.sworn);
});

test('assertReachable matches class, variant, secret, and potion endings', function () {
  var classes = [
    ['戰士', 'end_warrior', 'cls_warrior'],
    ['遊俠', 'end_ranger', 'cls_ranger'],
    ['盜賊', 'end_rogue', 'cls_rogue'],
    ['牧師', 'end_cleric', 'cls_cleric'],
    ['法師', 'end_mage', 'cls_mage']
  ];
  var classFlags = {};
  classes.forEach(function (row) { classFlags[row[0]] = row[2]; });
  var story = {
    id: 'combo',
    title: '組合',
    start: 'hub',
    meta: { class_flags: classFlags },
    class_branches: [{
      id: 'warrior_branch',
      label: 'X',
      when: { all_flags: ['cls_warrior'] },
      completed_when: { all_flags: ['branch_done'] },
      miss_reason: '沒有完成分支。'
    }],
    items: [{ id: 'potion', name: '藥水', kind: 'consumable', heal: 4 }],
    pregens: classes.map(function (row, i) {
      var p = pregen('角色' + i, row[0]);
      p.inventory = ['potion'];
      return p;
    }),
    scenes: [
      {
        id: 'hub',
        type: 'beat',
        facts: ['起點。'],
        choices: [
          {
            id: 'leave',
            label: '留下藥水',
            to: 'secret_end',
            take: ['potion'],
            set_flag: ['potion_left', 'secret_on', 'branch_done'],
            when: { item_min: { potion: 1 } }
          },
          { id: 'variant', label: '變體', to: 'variant_end', set_flag: ['variant_on'] }
        ].concat(classes.map(function (row) {
          return {
            id: 'go_' + row[1],
            label: row[0] + '結局',
            to: row[1],
            when: { 'class': row[0] }
          };
        }))
      },
      {
        id: 'secret_end',
        type: 'end',
        end: 'secret_win',
        ending_type: 'secret',
        name: '隱藏結局',
        when: { all_flags: ['potion_left', 'secret_on'] },
        facts: ['隱。']
      },
      {
        id: 'variant_end',
        type: 'end',
        end: 'win',
        ending_type: 'variant',
        name: '變體',
        when: { all_flags: ['variant_on'] },
        facts: ['變。']
      }
    ].concat(classes.map(function (row) {
      return {
        id: row[1],
        type: 'end',
        end: 'win',
        ending_type: 'class',
        name: row[0] + '結局',
        when: { 'class': row[0] },
        facts: ['職。']
      };
    }))
  };
  classes.forEach(function (row) {
    var hit = T.assertReachable(story, { 'class': row[0], endingId: row[1], endingType: 'class' });
    assert.strictEqual(hit.ok, true, row[0] + ' ' + (hit.errors || []).join('\n'));
  });
  var variant = T.assertReachable(story, { endingType: 'variant', flags: { variant_on: true } });
  assert.strictEqual(variant.ok, true, (variant.errors || []).join('\n'));
  var secret = T.assertReachable(story, {
    'class': '戰士',
    endingType: 'secret',
    allFlags: ['potion_left', 'secret_on'],
    branchCompleted: 'warrior_branch',
    branchLine: '支線：X（已完成）',
    itemMin: { potion: 0 }
  });
  assert.strictEqual(secret.ok, true, (secret.errors || []).join('\n'));
  secret.matches.forEach(function (m) {
    var n = 0;
    m.items.forEach(function (id) { if (id === 'potion') n++; });
    assert.strictEqual(n, 0);
  });
  var missed = T.assertReachable(story, { endingType: 'secret', flags: { potion_left: false } });
  assert.strictEqual(missed.ok, false);

  var played = new T.Engine(story, { seed: 4 });
  played.start(0);
  assert.ok(choiceIds(played).indexOf('leave') >= 0);
  played.character.inventory = played.character.inventory.filter(function (id) { return id !== 'potion'; });
  assert.ok(choiceIds(played).indexOf('go_end_warrior') >= 0);
  assert.ok(choiceIds(played).indexOf('leave') < 0);
  played.character.inventory.push('potion');
  choose(played, 'leave');
  assert.strictEqual(played.status, 'secret_won');
  assert.ok(played.character.inventory.indexOf('potion') < 0);
  assert.ok(played.endingCard().branchLines.indexOf('支線：X（已完成）') >= 0);
  assert.strictEqual(played.endingCard().endingType, 'secret');
});

function reachPost(index, opts) {
  opts = opts || {};
  var engine = new T.Engine(adventure, { seed: opts.seed || 40 });
  engine.start(index);
  var gates = choiceIds(engine);
  if (opts.search) {
    if (gates.indexOf('search_finn') >= 0) choose(engine, 'search_finn');
    else choose(engine, 'search');
  } else choose(engine, 'rush');
  winCombat(engine);
  answerInserted(engine, opts);
  choose(engine, opts.hall || 'climb');
  if (opts.hallFail) failCheck(engine);
  else succeedCheck(engine);
  winCombat(engine);
  answerInserted(engine, opts);
  if (engine.scene && engine.scene.type === 'check') {
    if (opts.persuadeFail) failCheck(engine);
    else succeedCheck(engine);
  }
  assert.strictEqual(engine.sceneId, 'cp_f1');
  cont(engine);
  if (opts.lock) {
    choose(engine, 'pick');
    if (opts.lockFail) failCheck(engine);
    else succeedCheck(engine);
    winCombat(engine);
    choose(engine, 'take_loot');
  } else if (opts.side) {
    choose(engine, 'side');
    winCombat(engine);
    choose(engine, 'take_loot');
  } else choose(engine, 'up');
  winCombat(engine);
  answerInserted(engine, opts);
  if (opts.drinkBeforeOoze) drinkPotions(engine);
  if (opts.rune) {
    choose(engine, 'rune');
    if (opts.runeFail) failCheck(engine);
    else succeedCheck(engine);
  } else {
    choose(engine, 'watch');
    succeedCheck(engine);
  }
  winCombat(engine);
  answerInserted(engine, opts);
  cont(engine);
  if (opts.help) choose(engine, 'bandit_help');
  else if (opts.unlock) choose(engine, 'unlock');
  else choose(engine, 'smash');
  answerInserted(engine, opts);
  if (engine.scene && engine.scene.type === 'check') {
    if (opts.insightFail) failCheck(engine);
    else succeedCheck(engine);
  }
  if (opts.fleeCult) {
    assert.strictEqual(engine.sceneId, 'f3_cult');
    engine.perform({ type: 'flee' });
    return engine;
  }
  winCombat(engine);
  if (opts.stopAt === 'cult_after') return engine;
  answerInserted(engine, opts);
  if (engine.scene && engine.scene.type === 'check') {
    if (opts.checkFail) failCheck(engine);
    else succeedCheck(engine);
  }
  if (engine.sceneId === 'f3_altar') {
    if (opts.stopAt === 'altar') return engine;
    answerInserted(engine, opts);
  }
  if (opts.stopAt === 'shrine') return engine;
  if (opts.crypt) {
    choose(engine, 'niche');
    if (opts.fleeCrypt) {
      engine.perform({ type: 'flee' });
      return engine;
    }
    winCombat(engine);
    choose(engine, 'take_holy');
  } else choose(engine, 'rush_boss');
  if (opts.fleeWight) {
    assert.strictEqual(engine.sceneId, 'f3_wight');
    engine.perform({ type: 'flee' });
    return engine;
  }
  winCombat(engine);
  cont(engine);
  assert.strictEqual(engine.sceneId, 'post_tower');
  return engine;
}

function finishEnding(engine, choiceId) {
  choose(engine, choiceId);
  if (engine.sceneId === 'pick_rival') {
    var rivals = choiceIds(engine);
    choose(engine, rivals[0]);
    winCombat(engine);
  }
  return engine.endingCard();
}

test('outline routes reach every class, variant, and secret ending', function () {
  var classes = ['戰士', '遊俠', '盜賊', '牧師', '法師'];
  var walk = T.walkScript(adventure);
  assert.strictEqual(walk.ok, true, walk.errors.join('\n'));
  [
    ['戰士', 'end_warrior', 'class'],
    ['遊俠', 'end_ranger', 'class'],
    ['盜賊', 'end_rogue', 'class'],
    ['牧師', 'end_cleric', 'class'],
    ['法師', 'end_mage', 'class']
  ].forEach(function (row) {
    assert.strictEqual(walk.reached[row[1]][row[0]], true, row[1]);
    var hit = T.assertReachable(adventure, { class: row[0], endingId: row[1], endingType: row[2] });
    assert.strictEqual(hit.ok, true, row[0] + ' ' + hit.errors.join('\n'));
  });
  assert.ok(T.assertReachable(adventure, { endingId: 'end_friend', endingType: 'variant', flags: { left_potion: true } }).ok);
  assert.ok(T.assertReachable(adventure, {
    class: '戰士', endingId: 'secret_win', endingType: 'secret', branchLine: '支線：歸隊（已完成）'
  }).ok);
  assert.ok(T.assertReachable(adventure, {
    endingId: 'secret_win', endingType: 'secret', flags: { left_potion: true }
  }).ok);
  assert.ok(T.assertReachable(adventure, {
    class: '盜賊', endingId: 'end_sold', endingType: 'variant', flags: { finn_sold: true }
  }).ok);
  classes.forEach(function (cls) {
    assert.strictEqual(walk.reached.win[cls], true, cls);
    assert.strictEqual(walk.reached.secret_win[cls], true, cls);
  });

  var brun = reachPost(0, { bury: true });
  var brunCard = finishEnding(brun, 'monument');
  assert.strictEqual(brunCard.endingName, '歸隊');
  assert.strictEqual(brunCard.endingType, 'class');
  assert.ok(brunCard.branchLines.indexOf('支線：歸隊（已完成）') >= 0);

  var sylvie = reachPost(1, { cut: true, checkFail: true });
  assert.strictEqual(sylvie.flags.sylvie_freed_deer, true);
  assert.ok(sylvie.character.hp >= 1);
  var sylvieCard = finishEnding(sylvie, 'follow_deer');
  assert.strictEqual(sylvieCard.endingName, '林歸寂靜');
  assert.strictEqual(sylvieCard.endingType, 'class');

  var finn = reachPost(2, { search: true, scrap: true });
  assert.strictEqual(finn.flags.finn_contract, true);
  assert.strictEqual(finn.flags.finn_brass_scrap, true);
  var swap = finishEnding(finn, 'swap');
  assert.strictEqual(swap.endingName, '偷天換徽');
  assert.strictEqual(swap.endingType, 'class');
  assert.ok(!finn.flags.finn_sold);
  assert.ok(swap.keyChoices.every(function (k) { return k.id !== 'finn_sold'; }));

  var sold = reachPost(2, { search: true, scrap: true, seed: 41 });
  var soldCard = finishEnding(sold, 'sell');
  assert.strictEqual(soldCard.endingName, '收錢走人');
  assert.strictEqual(soldCard.endingType, 'variant');
  assert.ok(soldCard.keyChoices.some(function (k) { return k.label === '銅徽：賣出'; }));

  var miraFailGate = reachPost(3, { insight: true, insightFail: true, stopAt: 'cult_after', seed: 61 });
  assert.strictEqual(miraFailGate.flags.mira_checked, true);
  assert.ok(!miraFailGate.flags.mira_truth);
  assert.ok(choiceIds(miraFailGate).indexOf('redeem') < 0);

  var miraTruthGate = reachPost(3, { insight: true, stopAt: 'cult_after', seed: 62 });
  assert.strictEqual(miraTruthGate.flags.mira_truth, true);
  assert.ok(choiceIds(miraTruthGate).indexOf('redeem') >= 0);

  var mira = reachPost(3, { robe: true, insight: true, insightFail: true, redeem: true });
  assert.strictEqual(mira.flags.mira_checked, true);
  assert.ok(!mira.flags.mira_truth);
  assert.ok(!mira.flags.mira_saw_truth);
  assert.strictEqual(mira.flags.mira_redeemed, true);
  assert.ok(mira.character.hp >= 1);
  var miraCard = finishEnding(mira, 'escort');
  assert.strictEqual(miraCard.endingName, '迷途者歸');
  assert.strictEqual(miraCard.endingType, 'class');

  var miraByTruth = reachPost(3, { insight: true, redeem: true, seed: 63 });
  assert.strictEqual(miraByTruth.flags.mira_truth, true);
  assert.ok(!miraByTruth.flags.mira_knew_robe);
  var truthCard = finishEnding(miraByTruth, 'escort');
  assert.strictEqual(truthCard.endingName, '迷途者歸');
  assert.strictEqual(truthCard.endingType, 'class');

  var orr = reachPost(4, { rune: true, burn: true });
  assert.strictEqual(orr.flags.orr_notes, true);
  assert.strictEqual(orr.flags.orr_burned, true);
  var orrCard = finishEnding(orr, 'burn_page');
  assert.strictEqual(orrCard.endingName, '師債徒還');
  assert.strictEqual(orrCard.endingType, 'class');

  var friend = reachPost(0, { leavePotion: true, seed: 42 });
  assert.ok(choiceIds(friend).indexOf('friend') >= 0);
  assert.ok(choiceIds(friend).indexOf('leave') >= 0);
  var friendCard = finishEnding(friend, 'friend');
  assert.strictEqual(friendCard.endingName, '化敵為友');
  assert.strictEqual(friendCard.endingType, 'variant');
  assert.ok(friendCard.keyChoices.some(function (k) { return k.label === '濕室藥水：留下'; }));

  var secret = reachPost(0, { search: true, side: true, bury: true, crypt: true, seed: 43 });
  assert.ok(choiceIds(secret).indexOf('face_rival') >= 0);
  var secretCard = finishEnding(secret, 'face_rival');
  assert.strictEqual(secretCard.endingName, '隱藏結局');
  assert.strictEqual(secretCard.endingType, 'secret');
  assert.ok(secretCard.branchLines.indexOf('支線：歸隊（已完成）') >= 0);

  var both = reachPost(1, { search: true, side: true, leavePotion: true, crypt: true, seed: 44 });
  assert.ok(choiceIds(both).indexOf('friend') >= 0);
  assert.ok(choiceIds(both).indexOf('face_rival') >= 0);
  var bothCard = finishEnding(both, 'face_rival');
  assert.strictEqual(bothCard.endingType, 'secret');
  assert.ok(bothCard.keyChoices.some(function (k) { return k.label === '濕室藥水：留下'; }));

  var dry = reachPost(0, { drinkBeforeOoze: true, seed: 45 });
  assert.ok(dry.sceneId === 'post_tower' || dry.status === 'won' || dry.status === 'playing');
  var hidden = reachPost(0, { drinkBeforeOoze: true, seed: 46, stopAt: 'shrine' });
  assert.ok(hidden, 'dry route built');
});

test('altar rest heals half of max HP once and keeps clear_status unused', function () {
  var altarScene = null;
  adventure.scenes.forEach(function (s) { if (s.id === 'f3_altar') altarScene = s; });
  var restChoice = null;
  altarScene.choices.forEach(function (c) { if (c.id === 'rest') restChoice = c; });
  assert.strictEqual(restChoice.rest.heal, 'half');
  assert.strictEqual(restChoice.rest.clear_status, true);
  assert.ok(restChoice.hp_delta === undefined);

  var gated = reachPost(0, { robBones: true, stopAt: 'altar', seed: 80 });
  assert.ok(!gated.flags.respected_dead);
  assert.ok(choiceIds(gated).indexOf('rest') < 0);

  var altar = reachPost(0, { stopAt: 'altar', seed: 81 });
  assert.ok(altar.flags.respected_dead);
  assert.ok(choiceIds(altar).indexOf('rest') >= 0);
  altar.character.hp = 1;
  var max = altar.character.hp_max;
  var half = Math.floor(max / 2);
  var res = choose(altar, 'rest');
  assert.strictEqual(altar.sceneId, 'f3_altar');
  assert.strictEqual(altar.character.hp, 1 + half);
  assert.ok(altar.character.hp < max);
  var restEv = res.events.filter(function (e) { return e.t === 'rest'; })[0];
  assert.strictEqual(restEv.healed, half);
  assert.strictEqual(altar.flags.rested, true);
  assert.ok(choiceIds(altar).indexOf('rest') < 0);
  altar.character.hp = 1;
  assert.strictEqual(altar.character.hp, 1);
  assert.ok(!altar.character.statuses);

  var capped = reachPost(3, { stopAt: 'altar', seed: 82 });
  capped.character.hp = capped.character.hp_max - 1;
  var capRes = choose(capped, 'rest');
  assert.strictEqual(capped.character.hp, capped.character.hp_max);
  var capEv = capRes.events.filter(function (e) { return e.t === 'rest'; })[0];
  assert.strictEqual(capEv.healed, 1);
  assert.ok(choiceIds(capped).indexOf('rest') < 0);
});

test('potion offer, Mira reroll, and wight flee do not trap the player', function () {
  var dry = new T.Engine(adventure, { seed: 47 });
  dry.start(0);
  choose(dry, 'rush');
  winCombat(dry);
  answerInserted(dry);
  choose(dry, 'climb');
  succeedCheck(dry);
  winCombat(dry);
  answerInserted(dry);
  cont(dry);
  choose(dry, 'up');
  winCombat(dry);
  answerInserted(dry);
  drinkPotions(dry);
  choose(dry, 'watch');
  succeedCheck(dry);
  winCombat(dry);
  assert.strictEqual(dry.sceneId, 'f2_ooze_after');
  assert.ok(choiceIds(dry).indexOf('leave_a') < 0);
  assert.ok(choiceIds(dry).indexOf('leave_b') < 0);
  assert.ok(choiceIds(dry).indexOf('down') >= 0);

  var mira = reachPost(3, { insight: true, insightFail: true, fleeCult: true, seed: 48 });
  assert.strictEqual(mira.sceneId, 'f3_cult_talk');
  assert.ok(choiceIds(mira).indexOf('insight') < 0);
  assert.ok(choiceIds(mira).indexOf('fight') >= 0);
  assert.ok(mira.character.hp >= 1);

  var fled = reachPost(0, { fleeWight: true, seed: 49 });
  assert.strictEqual(fled.sceneId, 'f3_shrine');
  assert.ok(fled.clearedCombats.f3_cult);
  assert.ok(!fled.clearedCombats.f3_wight);
  assert.ok(!fled.flags.rested);
  assert.ok(choiceIds(fled).indexOf('rush_boss') >= 0);
  var fleeAt = -1;
  fled.events.forEach(function (e, i) { if (e.t === 'flee') fleeAt = i; });
  var afterFlee = fled.events.slice(fleeAt + 1).filter(function (e) { return e.t === 'scene'; });
  assert.strictEqual(afterFlee.length, 1);
  assert.ok(afterFlee[0].facts.indexOf('祭壇前可以稍作喘息。') >= 0);
  assert.ok(afterFlee[0].facts.indexOf('邪徒倒地，仲有氣。') < 0);

  var crypt = reachPost(0, { search: true, side: true, crypt: true, fleeWight: true, seed: 50 });
  assert.strictEqual(crypt.sceneId, 'f3_shrine');
  assert.ok(crypt.clearedCombats.hide_crypt);
  assert.ok(choiceIds(crypt).indexOf('niche') < 0);
  assert.ok(choiceIds(crypt).indexOf('to_wight') >= 0);
  choose(crypt, 'to_wight');
  assert.strictEqual(crypt.sceneId, 'f3_wight');
  assert.ok(!crypt.scene.hidden);

  var lost = new T.Engine(adventure, { seed: 51 });
  lost.start(0);
  choose(lost, 'rush');
  winCombat(lost);
  answerInserted(lost);
  choose(lost, 'climb');
  lost.character.hp = 2;
  failCheck(lost);
  assert.strictEqual(lost.status, 'lost');
  assert.strictEqual(lost.endingCard().endingName, '倒在塔中');
  assert.strictEqual(lost.endingCard().endingType, 'lose');
});

test('root index.html matches main and the engine lives under preview', function () {
  var mainHtml = require('child_process').execSync('git show main:index.html', { encoding: 'utf8' });
  var rootHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.strictEqual(rootHtml, mainHtml);
  assert.ok(fs.existsSync(path.join(__dirname, 'preview', 'js', 'engine.js')));
  assert.ok(fs.existsSync(path.join(__dirname, 'preview', 'data', 'wasted_tower.js')));
  assert.ok(!fs.existsSync(path.join(__dirname, 'js', 'engine.js')));
  assert.ok(!fs.existsSync(path.join(__dirname, 'data', 'wasted_tower.js')));
});

test('preview player-facing text has no Cantonese colloquial spellings', function () {
  var needles = ['嘅', '啲', '咗', '喔', '佢', '哋', '唔', '係', '冇', '嘿', '咩', '點樣', '嘩', '喺', '嘢', '睇', '攞', '番', '落到', '仔'];
  var skipKey = {
    id: 1, to: 1, start: 1, win_to: 1, flee_to: 1, success_to: 1, fail_to: 1,
    continue_to: 1, next: 1, give: 1, take: 1, require_item: 1, require_flag: 1,
    set_flag: 1, set: 1, inc: 1, dec: 1, type: 1, end: 1, ending_type: 1,
    skill: 1, kind: 1, all_flags: 1, none_flags: 1, flag_eq: 1, flag_min: 1,
    flag_max: 1, has_item: 1, missing_item: 1, item_min: 1, item_max: 1,
    item_eq: 1, stat_min: 1, stat_max: 1, stat_eq: 1, cleared: 1, not: 1,
    class_flags: 1, required_for_secret: 1, choices_from: 1, choice_to: 1,
    from_pregen: 1, replace: 1, damage: 1
  };
  var texts = [];
  function walk(node, key) {
    if (skipKey[key]) return;
    if (typeof node === 'string') { texts.push(node); return; }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(function (item) { walk(item, key); });
      return;
    }
    Object.keys(node).forEach(function (k) { walk(node[k], k); });
  }
  walk(adventure, '');
  function stripComments(src) {
    var out = '';
    var i = 0;
    while (i < src.length) {
      var c = src.charAt(i);
      var n = src.charAt(i + 1);
      if (c === '/' && n === '/') {
        while (i < src.length && src.charAt(i) !== '\n') i++;
        continue;
      }
      if (c === '/' && n === '*') {
        i += 2;
        while (i < src.length && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) i++;
        i += 2;
        continue;
      }
      if (c === "'" || c === '"') {
        var q = c;
        out += c;
        i++;
        while (i < src.length) {
          var ch = src.charAt(i);
          out += ch;
          if (ch === '\\') {
            i++;
            if (i < src.length) out += src.charAt(i);
            i++;
            continue;
          }
          i++;
          if (ch === q) break;
        }
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }
  function takeStrings(src) {
    var i = 0;
    while (i < src.length) {
      var c = src.charAt(i);
      if (c === "'" || c === '"') {
        var q = c;
        var body = '';
        i++;
        while (i < src.length) {
          var ch = src.charAt(i);
          if (ch === '\\') {
            i++;
            if (i < src.length) body += src.charAt(i);
            i++;
            continue;
          }
          if (ch === q) { i++; break; }
          body += ch;
          i++;
        }
        if (/[\u4e00-\u9fff]/.test(body)) texts.push(body);
        continue;
      }
      i++;
    }
  }
  ['preview/js/engine.js', 'preview/js/ui.js', 'preview/js/narrator.js', 'preview/index.html'].forEach(function (rel) {
    takeStrings(stripComments(fs.readFileSync(path.join(__dirname, rel), 'utf8')));
  });
  var problems = [];
  texts.forEach(function (text) {
    needles.forEach(function (needle) {
      var from = 0;
      while (from <= text.length) {
        var at = text.indexOf(needle, from);
        if (at < 0) break;
        if (needle === '係' && text.charAt(at - 1) === '關') { from = at + needle.length; continue; }
        if (needle === '仔' && text.charAt(at + 1) === '細') { from = at + needle.length; continue; }
        problems.push('「' + needle + '」 in 「' + text + '」');
        break;
      }
    });
  });
  assert.deepStrictEqual(problems, []);
});

test('player-facing sources do not name a tabletop trademark', function () {
  var mark = 'D' + '&' + 'D';
  var phrase = ('Dungeons' + ' & ' + 'Dragons').toLowerCase();
  ['index.html', 'README.md', 'preview/index.html', 'preview/data/wasted_tower.js', 'preview/js/engine.js', 'preview/js/narrator.js', 'preview/js/ui.js'].forEach(function (file) {
    var text = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.ok(text.indexOf(mark) < 0, file);
    assert.ok(text.toLowerCase().indexOf(phrase) < 0, file);
  });
});

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
