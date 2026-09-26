'use strict';

// Node test runner for the Waste Tower engine. No browser, no network.
//   node test-engine.js

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var data = require('./preview/data/wasted_tower.js');
var T = require('./preview/js/engine.js');
var narrator = require('./preview/js/narrator.js');
var Dice = require('./preview/js/dice.js');

var adventure = data.ADVENTURES.wasted_tower;
var passed = 0;
var failed = 0;

function test(name, fn) {
  if (process.env.SKIP_TESTS === '1') return;
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
  var critDice = parsed.count * 2;
  var before = engine.enemyAttacksBeforeHero ? engine.enemyAttacksBeforeHero() : 0;
  var after = engine.enemyAttacksAfterHero ? engine.enemyAttacksAfterHero() : 0;
  var vals = [];
  var i;
  for (i = 0; i < before; i++) vals.push(1);
  vals.push(20);
  var holy = (engine.character.passives || []).some(function (p) { return p && p.id === 'divine_strike'; });
  if (holy) critDice += 2;
  for (i = 0; i < critDice; i++) vals.push(99);
  for (i = 0; i < after; i++) vals.push(1);
  engine.rng = seqRng(vals);
}

function winCombat(engine) {
  var guard = 0;
  while (engine.status === 'playing' && engine.scene && guard < 48) {
    if (engine.scene.type === 'beat' && (engine.sceneId === 'f1_foyer' || engine.sceneId === 'f1_bandit_front') &&
        choiceIds(engine).indexOf('fight') >= 0) {
      choose(engine, 'fight');
      guard++;
      continue;
    }
    if (engine.scene.type !== 'combat') break;
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
  engine.rng = seqRng([20, 20]);
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
  engine.rng = seqRng([1, 1]);
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
  function stablePregen(p) {
    return {
      name: p.name, 'class': p['class'], race: p.race,
      str: p.str, dex: p.dex, con: p.con, int: p.int, wis: p.wis, cha: p.cha,
      ac: p.ac, hp_max: p.hp_max, skills: p.skills, attack: p.attack, inventory: p.inventory
    };
  }
  assert.deepStrictEqual(adventure.pregens.map(stablePregen), snap.pregens.map(stablePregen));
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
    cp_f3: [],
    post_tower: ['怨靈散成灰。', '你從內室牆上取下銅徽。', '你走出廢塔。', '林緣風很大。']
  };
  var labelChange = {
    'f2_stairs/up': '沿正路向下',
    'hide_crypt_loot/take_holy': '前往內室'
  };
  var toChange = { 'f3_door/unlock': 'f3_cult_talk', 'f3_door/smash': 'f3_cult_talk' };
  function textsOf(facts) {
    return (facts || []).map(function (f) { return typeof f === 'string' ? f : f.text; });
  }
  Object.keys(snap.scenes).forEach(function (id) {
    var orig = snap.scenes[id];
    var now = byId[id];
    assert.ok(now, 'missing scene ' + id);
    if (Object.prototype.hasOwnProperty.call(factExact, id)) {
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
      function coreEnemy(e) {
        if (!e) return e;
        var copy = JSON.parse(JSON.stringify(e));
        delete copy.per_extra;
        delete copy.yield;
        return copy;
      }
      assert.deepStrictEqual((now.enemies || []).map(coreEnemy), (orig.enemies || []).map(coreEnemy), id);
      assert.strictEqual(now.win_to, winTo[id] || orig.win_to, id);
      assert.strictEqual(now.flee_to, Object.prototype.hasOwnProperty.call(fleeTo, id) ? fleeTo[id] : orig.flee_to, id);
    }
    if (orig.type === 'check') {
      ['skill', 'dc', 'success_to', 'fail_to', 'fail_hp_delta'].forEach(function (k) {
        assert.strictEqual(now[k], orig[k], id + ' ' + k);
      });
      if (Object.prototype.hasOwnProperty.call(orig, 'minHp')) {
        assert.strictEqual(now.minHp, orig.minHp, id + ' minHp');
      } else {
        assert.ok(now.minHp === undefined && now.min_hp === undefined, id + ' minHp');
      }
    }
    if (orig.type === 'end') assert.strictEqual(now.end, orig.end);
  });
  assert.strictEqual(byId.win.name, '廢塔一夜');
  assert.strictEqual(byId.f3_wight.flee_to, 'f3_shrine');
  assert.deepStrictEqual(byId.cp_f3.facts, []);
  var namedWin = T.resolveFacts(byId.win.facts, { flags: { knows_wight_name: true } });
  var nameAt = namedWin.indexOf('你喊出賽勒斯的名字，他終於消散。');
  var endAt = namedWin.indexOf('這一夜結束了。');
  assert.ok(nameAt >= 0 && nameAt < endAt);
  assert.strictEqual(adventure.flag_defs.orr_kept.label, '禁忌筆記：收起');
  var holy = byId.hide_crypt_loot.choices.filter(function (c) { return c.id === 'take_holy'; })[0];
  assert.strictEqual(holy.label, '前往內室');
  assert.strictEqual(holy.to, 'f3_wight');
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
  assert.strictEqual(exact.sceneId, 'f1_bandit_front');
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
  assert.strictEqual(fail.sceneId, 'f1_bandit_front');
});

test('flee returns without clearing the fight', function () {
  var engine = new T.Engine(adventure, { seed: 7 });
  engine.start(1);
  choose(engine, 'rush');
  assert.strictEqual(engine.sceneId, 'f1_foyer');
  choose(engine, 'fight');
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
  var full = cleric.perform({ actor: 0, action: 'move', moveId: 'cure_wounds' });
  assert.strictEqual(full.ok, false);
  assert.strictEqual(cleric.character.pools.channel.uses, 3);
  cleric.character.hp = 4;
  cleric.rng = seqRng([8]);
  var healed = cleric.perform({ type: 'use_feature', featureId: 'cure_wounds' });
  assert.strictEqual(healed.ok, true, healed.error);
  assert.strictEqual(cleric.character.hp, 10);
  assert.strictEqual(cleric.character.pools.channel.uses, 2);
  assert.strictEqual(cleric.sceneId, 'f1_gate');
  cleric.character.hp = 9;
  var slot = cleric.character.inventory.indexOf('potion_heal');
  cleric.perform({ type: 'use_item', slot: slot });
  assert.strictEqual(cleric.character.hp, 10);
  assert.ok(cleric.character.inventory.indexOf('potion_heal') < 0);

  var mage = new T.Engine(adventure, { seed: 9 });
  mage.start(4);
  assert.strictEqual(mage.effectiveAc(), 15);
  var scroll = mage.character.inventory.indexOf('burning_hands');
  var rejected = mage.perform({ type: 'use_item', slot: scroll });
  assert.strictEqual(rejected.ok, false);
  assert.ok(mage.character.inventory.indexOf('burning_hands') >= 0);
  choose(mage, 'rush');
  choose(mage, 'fight');
  mage.encounter.order = [{ kind: 'hero', index: 0, roll: 20, bonus: 0, total: 20 }].concat(
    mage.encounter.enemies.map(function (e, i) { return { kind: 'enemy', index: i, roll: 1, bonus: 0, total: 1 }; })
  );
  mage.encounter.acted = {};
  mage.encounter.round = 1;
  mage.rng = seqRng([1, 1, 1]);
  var buff = mage.perform({ type: 'use_feature', featureId: 'shield' });
  assert.strictEqual(buff.ok, false);
  assert.ok(buff.error.indexOf('護盾術') >= 0);
  assert.strictEqual(mage.effectiveAc(), 15);
  assert.strictEqual(mage.character.pools.slots.uses, 3);
  mage.perform({ type: 'flee' });
  assert.strictEqual(mage.character.acBonus, 0);
  assert.strictEqual(mage.effectiveAc(), 15);

  var fighter = new T.Engine(adventure, { seed: 10 });
  fighter.start(0);
  choose(fighter, 'rush');
  choose(fighter, 'fight');
  fighter.encounter.order = [{ kind: 'hero', index: 0, roll: 20, bonus: 0, total: 20 }].concat(
    fighter.encounter.enemies.map(function (e, i) { return { kind: 'enemy', index: i, roll: 1, bonus: 0, total: 1 }; })
  );
  fighter.encounter.acted = {};
  fighter.encounter.round = 1;
  fighter.rng = seqRng([20, 8, 8, 8, 8, 1, 1]);
  var strike = fighter.perform({ actor: 0, action: 'move', moveId: 'power_strike', target: 0 });
  assert.strictEqual(strike.ok, true, strike.error);
  assert.strictEqual(fighter.encounter.enemies[0].hp, 0);
  var strikeMove = fighter.character.features.filter(function (f) { return f.id === 'power_strike'; })[0];
  assert.strictEqual(strikeMove.uses, 1);
  assert.strictEqual(fighter.status, 'playing');
});

test('save round-trip, rng, and mid-fight restore', function () {
  var engine = new T.Engine(adventure, { seed: 99 });
  engine.start(0);
  choose(engine, 'search');
  assert.strictEqual(engine.sceneId, 'f1_foyer');
  choose(engine, 'fight');
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
  choose(fighter, 'fight');
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
  assert.strictEqual(migrated.engine.sceneId, 'f1_foyer');
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
  newer.v = 9;
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
  ['preview/js/engine.js', 'preview/js/ui.js', 'preview/js/dice.js', 'preview/js/narrator.js', 'preview/index.html'].forEach(function (rel) {
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

test('WT4 saves use the preview key, and WT3 or corrupt codes do not crash', function () {
  var bag = {};
  var storage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem: function (k, v) { bag[k] = String(v); },
    removeItem: function (k) { delete bag[k]; }
  };
  var engine = new T.Engine(adventure, { seed: 90 });
  engine.start(0);
  var code = T.encodeSaveCode(engine.exportSave());
  assert.strictEqual(code.indexOf('WT8.'), 0);
  assert.deepStrictEqual(engine.exportSave().character.statuses, []);
  assert.strictEqual(engine.exportSave().character.hpMaxReduction, 0);
  var slot = new T.SaveSlot(storage);
  assert.strictEqual(slot.key, 'wasted-tower-preview-save');
  assert.strictEqual(slot.write(code).ok, true);
  assert.deepStrictEqual(Object.keys(bag), ['wasted-tower-preview-save']);
  assert.strictEqual(bag['wasted-tower-preview-save'].indexOf('WT8.'), 0);
  var back;
  assert.doesNotThrow(function () { back = T.loadGame(adventure, slot.read()); });
  assert.strictEqual(back.ok, true, back.error);
  assert.deepStrictEqual(back.engine.character.statuses, []);

  var wt3 = {
    v: 3,
    adventureId: 'wasted_tower',
    scriptVersion: 1,
    pregenIndex: 0,
    character: {
      name: '布倫', cls: '戰士', race: '人類',
      str: 16, dex: 12, con: 15, int: 8, wis: 10, cha: 10,
      ac: 16, hp: 9, hp_max: 12, acBonus: 0,
      skills: ['athletics'],
      inventory: ['potion_heal', 'lantern'],
      attack: { name: '長劍', bonus: 5, damage: '1d8+3' },
      features: [{ id: 'power_strike', name: '破甲重擊', uses: 2, usesMax: 3, effect: { type: 'damage', amount: 4 } }]
    },
    sceneId: 'f1_rats',
    flags: { cls_warrior: true, gate_rushed: true },
    done: {},
    clearedCombats: {},
    keyChoices: [],
    rivalPregenIndex: null,
    encounter: {
      enemies: [
        { name: '腐鼠', ac: 11, hp: 4, hp_max: 4, atk: 2, damage: '1d4' },
        { name: '腐鼠', ac: 11, hp: 2, hp_max: 4, atk: 2, damage: '1d4' },
        { name: '腐鼠', ac: 11, hp: 3, hp_max: 3, atk: 2, damage: '1d4' }
      ]
    },
    round: 1,
    status: 'playing',
    lastCheckpoint: null,
    playMs: 10,
    rng: { kind: 'seeded', seed: 7, s: 7, count: 3 }
  };
  var migrated;
  assert.doesNotThrow(function () {
    migrated = T.loadGame(adventure, T.encodeSaveCode(wt3));
  });
  assert.strictEqual(migrated.ok, true, migrated && migrated.error);
  assert.deepStrictEqual(migrated.engine.character.statuses, []);
  assert.strictEqual(migrated.engine.character.hpMaxReduction, 0);
  assert.strictEqual(migrated.engine.character.features.length, 3);
  var resumed;
  assert.doesNotThrow(function () { resumed = migrated.engine.resumeView(); });
  assert.strictEqual(resumed.ok, true, resumed && resumed.error);
  assert.strictEqual(migrated.engine.sceneId, 'f1_rats');

  var junk = Buffer.from('{"v":4}', 'utf8').toString('base64');
  var newer = Buffer.from('{"v":9,"scriptVersion":1}', 'utf8').toString('base64');
  [null, undefined, '', '   ', 'hello', 'WT4.', 'WT4.@@@', 'WT3.not-base64', 'WT4.' + junk, 'WT9.' + newer].forEach(function (bad) {
    var res;
    assert.doesNotThrow(function () { res = T.loadGame(adventure, bad); }, 'crash on ' + String(bad));
    assert.strictEqual(res.ok, false, String(bad));
    assert.strictEqual(typeof res.error, 'string');
    assert.ok(res.error.length > 0);
  });
});

test('step 1 keeps statuses empty and simulator rates out of the player text', function () {
  var snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'story-snapshot.json'), 'utf8'));
  assert.strictEqual(adventure.items.length, snap.items.length + 1);
  assert.strictEqual(adventure.items[adventure.items.length - 1].id, 'antler_arrow');
  var engine = new T.Engine(adventure, { seed: 91 });
  engine.start(0);
  choose(engine, 'rush');
  choose(engine, 'fight');
  heroFirst(engine);
  engine.rng = seqRng([15, 1, 1, 1]);
  var hit = engine.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(hit.ok, true, hit.error);
  assert.deepStrictEqual(engine.character.statuses, []);
  engine.encounter.enemies.forEach(function (e) {
    assert.deepStrictEqual(e.statuses || [], []);
  });
  var phrases = ['通關率', '平均回合', '內部參考'];
  ['README.md', 'preview/index.html', 'preview/js/ui.js', 'preview/js/dice.js', 'preview/js/narrator.js', 'preview/js/engine.js'].forEach(function (rel) {
    var text = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    phrases.forEach(function (phrase) {
      assert.ok(text.indexOf(phrase) < 0, rel + ' shows ' + phrase);
    });
  });
  var play = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8').split('## 腳本資料格式')[0];
  assert.ok(play.indexOf('模擬') < 0);
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
  cloned.scenes.filter(function (s) { return s.id === 'f1_rats'; })[0].enemies[0].skills = 'burn';
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
  assert.strictEqual(gate.sceneId, 'f1_foyer');
  assert.strictEqual(gate.character.inventory.filter(function (id) { return id === 'iron_key'; }).length, 1);
  assert.strictEqual(gate.done['choice:f1_gate/search'], true);
  choose(gate, 'fight');
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
  altar.character.statuses = [{ id: 'poisoned', name: '中毒' }];
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
  assert.deepStrictEqual(altar.character.statuses, []);
  assert.ok(res.events.some(function (e) { return e.t === 'clear_status'; }));
  altar.character.hp = 1;
  assert.strictEqual(altar.character.hp, 1);

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
  assert.strictEqual(lost.status, 'playing');
  assert.strictEqual(lost.character.hp, 1);
  assert.strictEqual(lost.sceneId, 'f1_bandit_front');
  choose(lost, 'fight');
  heroFirst(lost);
  lost.encounter.enemies[0].damage = '1d6+20';
  lost.rng = seqRng([1, 15, 6]);
  lost.perform({ type: 'attack', target: 0 });
  assert.strictEqual(lost.status, 'lost');
  assert.strictEqual(lost.endingCard().endingName, '倒在塔中');
  assert.strictEqual(lost.endingCard().endingType, 'lose');
});

function playFloor1(index, opts) {
  opts = opts || {};
  var engine = new T.Engine(adventure, { seed: opts.seed || (120 + index) });
  engine.start(index);
  if (opts.look) {
    var look = choiceIds(engine).filter(function (id) { return id.indexOf('look') === 0; })[0];
    choose(engine, look);
    if (opts.lookFail) failCheck(engine);
    else succeedCheck(engine);
    assert.strictEqual(engine.sceneId, 'f1_gate');
  }
  if (opts.rush) choose(engine, 'rush');
  else if (choiceIds(engine).indexOf('search_finn') >= 0) choose(engine, 'search_finn');
  else choose(engine, 'search');
  assert.strictEqual(engine.sceneId, 'f1_foyer', engine.character.name);
  if (opts.rats && opts.rats !== 'fight') {
    choose(engine, opts.rats);
    if (opts.ratsFail) {
      var before = engine.character.hp;
      failCheck(engine);
      assert.strictEqual(engine.sceneId, 'f1_rats');
      assert.ok(engine.character.hp >= 1);
      assert.ok(engine.character.hp >= Math.max(1, before - 2));
      winCombat(engine);
      assert.ok(engine.clearedCombats.f1_rats);
    } else {
      succeedCheck(engine);
      assert.strictEqual(engine.sceneId, 'f1_rats_after');
      assert.ok(!engine.clearedCombats.f1_rats);
    }
  } else {
    choose(engine, 'fight');
    winCombat(engine);
    assert.ok(engine.clearedCombats.f1_rats);
  }
  answerInserted(engine, opts);
  assert.strictEqual(engine.sceneId, 'f1_hall', engine.character.name);
  choose(engine, opts.hall || 'climb');
  if (opts.hallFail) failCheck(engine);
  else succeedCheck(engine);
  assert.strictEqual(engine.sceneId, 'f1_bandit_front');
  assert.strictEqual(engine.status, 'playing');
  assert.ok(engine.character.hp >= 1);
  if (opts.bandit && opts.bandit !== 'fight') {
    choose(engine, opts.bandit);
    if (opts.banditFail) {
      failCheck(engine);
      assert.strictEqual(engine.sceneId, 'f1_bandit');
      winCombat(engine);
      assert.ok(engine.clearedCombats.f1_bandit);
    } else {
      succeedCheck(engine);
      assert.strictEqual(engine.sceneId, 'f1_bandit_after');
      assert.ok(!engine.clearedCombats.f1_bandit);
    }
  } else {
    choose(engine, 'fight');
    winCombat(engine);
    assert.ok(engine.clearedCombats.f1_bandit);
  }
  answerInserted(engine, opts);
  assert.strictEqual(engine.sceneId, 'cp_f1', engine.character.name);
  return engine;
}

test('floor 1 depth: every class can fight or bypass, and checks cannot empty the screen', function () {
  var byId = {};
  adventure.scenes.forEach(function (s) { byId[s.id] = s; });
  assert.deepStrictEqual(adventure.meta.required_for_secret, [
    'f1_rats', 'f1_bandit', 'f2_bones', 'f2_ooze', 'f3_cult', 'f3_wight', 'hide_vault', 'hide_crypt'
  ]);
  var secretEnd = byId.secret_win;
  assert.deepStrictEqual(secretEnd.when, { all_flags: ['secret_ready'] });
  adventure.meta.required_for_secret.forEach(function (id) {
    assert.strictEqual(byId[id].type, 'combat', id);
    assert.ok(byId[id].omit_from_tally !== true, id);
  });
  assert.strictEqual(byId.rival_boss.omit_from_tally, true);
  ['f1_foyer', 'f1_bandit_front', 'f1_look', 'f1_look_crest', 'f1_look_tracks', 'f1_foyer_sneak',
    'f1_foyer_scare', 'f1_foyer_spark', 'f1_hall_arcana', 'f1_bandit_talk', 'f1_bandit_threat',
    'f1_bandit_sneak', 'f1_bandit_lift'].forEach(function (id) {
    assert.notStrictEqual(byId[id].type, 'combat', id);
  });
  ['f1_gate', 'f1_foyer', 'f1_hall', 'f1_bandit_front'].forEach(function (id) {
    var open = (byId[id].choices || []).some(function (c) {
      var when = c.when || {};
      if (when['class'] || when.stat_min || when.stat_max || when.stat_eq) return false;
      if (when.not && when.not['class']) return false;
      return true;
    });
    assert.ok(open, id + ' needs an ungated option');
  });
  adventure.scenes.forEach(function (sc) {
    if (!sc || sc.type !== 'check' || sc.id.indexOf('f1_') !== 0) return;
    assert.notStrictEqual(byId[sc.success_to].type, 'end', sc.id);
    assert.notStrictEqual(byId[sc.fail_to].type, 'end', sc.id);
    if (typeof sc.fail_hp_delta === 'number' && sc.fail_hp_delta < 0) assert.strictEqual(sc.minHp, 1, sc.id);
    var low = new T.Engine(adventure, { seed: 1 });
    low.start(0);
    low.character.hp = 1;
    low.enterScene(sc.id);
    failCheck(low);
    assert.strictEqual(low.status, 'playing', sc.id);
    assert.ok(low.character.hp >= 1, sc.id);
    assert.strictEqual(low.sceneId, sc.fail_to, sc.id);
  });

  var routes = [
    { look: true, rats: 'scare', hall: 'climb', bandit: 'threat' },
    { look: true, rats: 'sneak', hall: 'creep', bandit: 'sneak' },
    { rats: 'sneak', hall: 'creep', bandit: 'lift' },
    { look: true, rats: 'scare', hall: 'scan', bandit: 'talk', robe: true },
    { look: true, rats: 'spark', hall: 'circle', bandit: 'talk' }
  ];
  routes.forEach(function (opts, i) {
    var bypass = playFloor1(i, opts);
    assert.strictEqual(Object.keys(bypass.clearedCombats).length, 0, bypass.character.name);
    assert.ok(!bypass.flags.secret_ready);
    var fought = playFloor1(i, { rush: true, seed: 400 + i });
    assert.strictEqual(fought.clearedCombats.f1_rats, true);
    assert.strictEqual(fought.clearedCombats.f1_bandit, true);
    assert.ok(!fought.flags.secret_ready);
  });

  var finn = playFloor1(2, { rats: 'sneak', hall: 'creep', bandit: 'lift' });
  assert.strictEqual(finn.flags.finn_contract, true);
  var mira = playFloor1(3, { look: true, rats: 'scare', hall: 'scan', bandit: 'talk', robe: true });
  assert.strictEqual(mira.flags.mira_knew_robe, true);
  assert.ok(!mira.flags.aff_bandit);

  var talk = new T.Engine(adventure, { seed: 21 });
  talk.start(3);
  choose(talk, 'rush');
  choose(talk, 'fight');
  winCombat(talk);
  answerInserted(talk);
  choose(talk, 'scan');
  succeedCheck(talk);
  choose(talk, 'talk');
  succeedCheck(talk);
  assert.strictEqual(talk.sceneId, 'f1_bandit_after');
  assert.ok(!talk.clearedCombats.f1_bandit);
  assert.ok(!talk.flags.aff_bandit);
  assert.ok(!talk.flags.spared_bandit);
  assert.ok(!talk.flags.bandit_persuaded);
  assert.ok(!talk.flags.looted_bandit);
  var talked = talk.events.filter(function (e) { return e.t === 'scene'; }).pop().facts.join('\n');
  assert.ok(talked.indexOf('盜墓者放下短斧') >= 0, talked);
  assert.ok(talked.indexOf('盜墓者跪地求饒。') < 0);

  var threat = new T.Engine(adventure, { seed: 22 });
  threat.start(0);
  choose(threat, 'rush');
  choose(threat, 'fight');
  winCombat(threat);
  answerInserted(threat);
  choose(threat, 'climb');
  succeedCheck(threat);
  choose(threat, 'threat');
  succeedCheck(threat);
  var knelt = threat.events.filter(function (e) { return e.t === 'scene'; }).pop().facts.join('\n');
  assert.ok(knelt.indexOf('盜墓者跪地求饒。') >= 0, knelt);
  assert.ok(!threat.flags.bandit_parley);
  assert.ok(!threat.clearedCombats.f1_bandit);

  var orr = new T.Engine(adventure, { seed: 23 });
  orr.start(4);
  choose(orr, 'rush');
  choose(orr, 'fight');
  winCombat(orr);
  answerInserted(orr);
  assert.ok(choiceIds(orr).indexOf('circle') >= 0);
  choose(orr, 'circle');
  succeedCheck(orr);
  assert.strictEqual(orr.flags.hall_unseen, true);
  assert.ok(!orr.flags.orr_notes);
  assert.strictEqual(orr.sceneId, 'f1_bandit_front');

  var snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'story-snapshot.json'), 'utf8'));
  var scout = new T.Engine(adventure, { seed: 7 });
  scout.start(0);
  choose(scout, 'look_crest');
  succeedCheck(scout);
  assert.strictEqual(scout.flags.f1_scouted, true);
  choose(scout, 'rush');
  var prepared = scout.events.filter(function (e) { return e.t === 'scene'; }).pop().facts;
  assert.ok(prepared.indexOf('你早有準備。腐鼠還在啃咬布條，沒有發現你。') >= 0);
  choose(scout, 'sneak');
  scout.rng = seqRng(snap.check_dice[0].faces);
  var adv = scout.perform({ type: 'roll' });
  var advCheck = adv.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.deepStrictEqual(advCheck.dice, [7, 16]);
  assert.strictEqual(advCheck.d20, 16);
  assert.strictEqual(advCheck.mode, 'advantage');
  assert.strictEqual(advCheck.dc, 12);
  assert.strictEqual(advCheck.total, 17);
  var advLine = narrator.Mechanics.rollLines(advCheck).join('\n');
  assert.ok(advLine.indexOf(snap.check_dice[0].line) >= 0, advLine);
  assert.ok(advLine.indexOf('難度 12') >= 0, advLine);
  assert.ok(advLine.indexOf('成功') >= 0, advLine);
  var stored = scout.rollLog.filter(function (row) { return row.t === 'check'; }).pop();
  assert.deepStrictEqual(stored.lines, narrator.Mechanics.rollLines(advCheck));
  var code = T.encodeSaveCode(scout.exportSave());
  assert.strictEqual(code.indexOf('WT8.'), 0);
  var back = T.loadGame(adventure, code);
  assert.strictEqual(back.ok, true, back.error);
  assert.deepStrictEqual(back.engine.done['check:f1_foyer_sneak'].dice, [7, 16]);
  assert.strictEqual(back.engine.rollLog.map(function (row) { return row.lines.join('\n'); }).join('\n'),
    scout.rollLog.map(function (row) { return row.lines.join('\n'); }).join('\n'));
  assert.strictEqual(back.engine.perform({ type: 'roll' }).ok, false);

  var plain = new T.Engine(adventure, { seed: 8 });
  plain.start(1);
  choose(plain, 'rush');
  choose(plain, 'sneak');
  plain.rng = seqRng([7]);
  var one = plain.perform({ type: 'roll' });
  var oneCheck = one.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(oneCheck.mode, 'normal');
  assert.deepStrictEqual(oneCheck.dice, [7]);
  assert.ok(narrator.Mechanics.rollLines(oneCheck).join('\n').indexOf('優勢') < 0);

  var before = new T.Engine(adventure, { seed: 9 });
  before.start(0);
  choose(before, 'rush');
  choose(before, 'scare');
  var scareCode = T.encodeSaveCode(before.exportSave());
  before.rng = seqRng([4, 18]);
  var first = before.perform({ type: 'roll' });
  var second = T.loadGame(adventure, scareCode).engine;
  second.rng = seqRng([4, 18]);
  var secondRoll = second.perform({ type: 'roll' });
  var firstCheck = first.events.filter(function (e) { return e.t === 'check'; })[0];
  var secondCheck = secondRoll.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.deepStrictEqual(secondCheck.dice, firstCheck.dice);
  assert.strictEqual(secondCheck.d20, firstCheck.d20);
  assert.strictEqual(secondCheck.total, firstCheck.total);
  assert.ok(firstCheck.narr.indexOf('高舉提燈') >= 0, firstCheck.narr);

  var noLamp = new T.Engine(adventure, { seed: 9 });
  noLamp.start(3);
  noLamp.character.inventory = noLamp.character.inventory.filter(function (id) { return id !== 'lantern'; });
  choose(noLamp, 'rush');
  choose(noLamp, 'scare');
  noLamp.rng = seqRng([20]);
  var miraScare = noLamp.perform({ type: 'roll' }).events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(miraScare.mode, 'normal');
  assert.ok(miraScare.narr.indexOf('喝聲在門廳裡迴盪') >= 0, miraScare.narr);

  var weak = new T.Engine(adventure, { seed: 11 });
  weak.start(1);
  choose(weak, 'rush');
  choose(weak, 'fight');
  winCombat(weak);
  answerInserted(weak);
  choose(weak, 'climb');
  succeedCheck(weak);
  choose(weak, 'threat');
  weak.rng = seqRng(snap.check_dice[1].faces);
  var weakCheck = weak.perform({ type: 'roll' }).events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(weakCheck.mode, 'normal');
  assert.strictEqual(weakCheck.dc, 13);
  assert.deepStrictEqual(weakCheck.dice, [8]);

  var strong = new T.Engine(adventure, { seed: 12 });
  strong.start(0);
  choose(strong, 'rush');
  choose(strong, 'fight');
  winCombat(strong);
  answerInserted(strong);
  choose(strong, 'climb');
  succeedCheck(strong);
  choose(strong, 'threat');
  strong.rng = seqRng([3, 18]);
  var strongCheck = strong.perform({ type: 'roll' }).events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(strongCheck.mode, 'advantage');
  assert.strictEqual(strongCheck.d20, 18);
  assert.strictEqual(strongCheck.dc, 13);
  assert.ok(narrator.Mechanics.rollLines(strongCheck).join('\n').indexOf('優勢：擲出 3 和 18，取 18') >= 0);

  var crossed = new T.Engine(adventure, { seed: 13 });
  crossed.start(0);
  choose(crossed, 'rush');
  choose(crossed, 'fight');
  winCombat(crossed);
  answerInserted(crossed);
  choose(crossed, 'climb');
  succeedCheck(crossed);
  choose(crossed, 'fight');
  crossed.perform({ type: 'flee' });
  assert.strictEqual(crossed.sceneId, 'f1_hall');
  assert.ok(choiceIds(crossed).indexOf('climb') < 0);
  assert.ok(choiceIds(crossed).indexOf('fight') < 0 || crossed.sceneId === 'f1_hall');
  var again = choose(crossed, choiceIds(crossed)[0]);
  assert.ok(!again.events.some(function (e) { return e.t === 'check'; }));
  assert.strictEqual(crossed.sceneId, 'f1_bandit_front');
  assert.ok(choiceIds(crossed).indexOf('fight') >= 0);

  var returned = new T.Engine(adventure, { seed: 14 });
  returned.start(0);
  choose(returned, 'look_crest');
  failCheck(returned);
  choose(returned, 'rush');
  choose(returned, 'sneak');
  failCheck(returned);
  returned.perform({ type: 'flee' });
  choose(returned, 'rush');
  assert.ok(choiceIds(returned).indexOf('sneak') < 0);
  assert.ok(choiceIds(returned).indexOf('scare') < 0);
  assert.ok(choiceIds(returned).indexOf('fight') >= 0);

  var rats = new T.Engine(adventure, { seed: 15 });
  rats.start(0);
  rats.enterScene('f1_rats');
  var ratsLoaded = T.loadGame(adventure, T.encodeSaveCode(rats.exportSave()));
  assert.strictEqual(ratsLoaded.ok, true, ratsLoaded.error);
  assert.strictEqual(ratsLoaded.engine.sceneId, 'f1_rats');
  assert.strictEqual(ratsLoaded.engine.status, 'playing');
  var hallSave = rats.exportSave();
  hallSave.sceneId = 'f1_hall';
  hallSave.encounter = null;
  hallSave.flags.hall_climb = true;
  hallSave.done['choice:f1_hall/climb'] = true;
  hallSave.done['check:f1_ath'] = { success: true };
  var hallLoaded = T.loadGame(adventure, T.encodeSaveCode(hallSave));
  assert.strictEqual(hallLoaded.ok, true, hallLoaded.error);
  assert.strictEqual(hallLoaded.engine.sceneId, 'f1_hall');
  assert.ok(hallLoaded.engine.done['check:f1_ath']);
  assert.ok(choiceIds(hallLoaded.engine).indexOf('climb') < 0);
  assert.ok(choiceIds(hallLoaded.engine).indexOf('creep') < 0);
  assert.ok(choiceIds(hallLoaded.engine).length >= 1);
  var hallGo = hallLoaded.engine.perform({ type: 'choice', id: choiceIds(hallLoaded.engine)[0] });
  assert.strictEqual(hallGo.ok, true, hallGo.error);
  assert.ok(!hallGo.events.some(function (e) { return e.t === 'check'; }));

  var mini = {
    id: 'adv', title: '優勢', start: 'go', items: [],
    pregens: [pregen('甲', '戰士')],
    scenes: [
      { id: 'go', type: 'beat', facts: ['起點。'], choices: [{ id: 'on', label: '上', to: 'roll' }] },
      {
        id: 'roll', type: 'check', facts: ['擲。'], skill: 'athletics', dc: 15,
        advantage: { stat_min: { str: 10 } },
        disadvantage: { stat_min: { str: 30 } },
        success_to: 'end', fail_to: 'end'
      },
      { id: 'end', type: 'end', end: 'win', name: '完', facts: ['完。'] }
    ]
  };
  assert.strictEqual(T.validateAdventure(mini, { walk: false }).ok, true, T.validateAdventure(mini, { walk: false }).errors.join('\n'));
  var low = JSON.parse(JSON.stringify(mini));
  delete low.scenes[1].disadvantage;
  var lowEng = new T.Engine(low, { seed: 1 });
  lowEng.start(0);
  choose(lowEng, 'on');
  lowEng.rng = seqRng([1, 2]);
  var lowCheck = lowEng.perform({ type: 'roll' }).events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(lowCheck.mode, 'advantage');
  assert.deepStrictEqual(lowCheck.dice, [1, 2]);
  assert.strictEqual(lowCheck.d20, 2);
  assert.strictEqual(lowCheck.dc, 15);
  assert.strictEqual(lowCheck.total, 7);
  assert.strictEqual(lowCheck.success, false);
  var stacked = JSON.parse(JSON.stringify(mini));
  stacked.scenes[1].disadvantage = { stat_min: { str: 10 } };
  var stackEng = new T.Engine(stacked, { seed: 1 });
  stackEng.start(0);
  choose(stackEng, 'on');
  stackEng.rng = seqRng([9]);
  var cancelled = stackEng.perform({ type: 'roll' }).events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(cancelled.mode, 'normal');
  assert.strictEqual(cancelled.dice.length, 1);
  var bad = JSON.parse(JSON.stringify(mini));
  bad.scenes[1].advantage = 5;
  var badReport = T.validateAdventure(bad, { walk: false });
  assert.strictEqual(badReport.ok, false);
  assert.ok(badReport.errors.some(function (e) { return /降低難度|數字/.test(e); }));
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
  ['preview/js/engine.js', 'preview/js/ui.js', 'preview/js/dice.js', 'preview/js/narrator.js', 'preview/index.html'].forEach(function (rel) {
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
    if (text.indexOf(' 同 ') >= 0 || /擲出[^。\n]*同/.test(text)) {
      problems.push('「同」 joins a roll line in 「' + text + '」');
    }
  });
  assert.deepStrictEqual(problems, []);
});

test('player-facing sources do not name a tabletop trademark', function () {
  var mark = 'D' + '&' + 'D';
  var phrase = ('Dungeons' + ' & ' + 'Dragons').toLowerCase();
  var publisher = 'Wizards of the Coast';
  var files = ['index.html', 'README.md', 'preview/index.html', 'preview/data/wasted_tower.js', 'preview/js/engine.js', 'preview/js/narrator.js', 'preview/js/ui.js', 'preview/js/dice.js'];
  var allowed = { 'README.md': 1, 'preview/index.html': 1, 'preview/data/wasted_tower.js': 1 };
  files.forEach(function (file) {
    var text = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.ok(text.indexOf(mark) < 0, file);
    assert.ok(text.toLowerCase().indexOf(phrase) < 0, file);
    if (allowed[file]) assert.ok(text.indexOf(publisher) >= 0, file + ' should carry the attribution');
    else assert.ok(text.indexOf(publisher) < 0, file);
  });
  var sentence = 'This work includes material taken from the System Reference Document 5.1 (\u201cSRD 5.1\u201d) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';
  ['README.md', 'preview/index.html', 'preview/data/wasted_tower.js'].forEach(function (file) {
    assert.ok(fs.readFileSync(path.join(__dirname, file), 'utf8').indexOf(sentence) >= 0, file);
  });
  var originalAbilities = '故事、角色、地點與敵人名稱屬本作原創，並加入原創能力。';
  var previewHtml = fs.readFileSync(path.join(__dirname, 'preview/index.html'), 'utf8');
  assert.ok(previewHtml.indexOf(originalAbilities) >= 0);
});

function heroFirst(engine) {
  engine.encounter.order = [{ kind: 'hero', index: 0, roll: 20, bonus: 0, total: 99 }].concat(
    engine.encounter.enemies.map(function (e, i) {
      return { kind: 'enemy', index: i, roll: 1, bonus: 0, total: 1 };
    })
  );
  engine.encounter.acted = {};
  engine.encounter.round = 1;
  engine.encounter.heroReady = false;
  engine.round = 1;
}

test('each class has exactly the two step-1 moves', function () {
  var expect = {
    '戰士': ['longsword', 'power_strike', 'second_wind'],
    '遊俠': ['longbow', 'net', 'aimed_shot', 'hunters_mark', 'cure_wounds'],
    '盜賊': ['shortsword', 'two_weapon', 'shadow_attack', 'uncanny_dodge'],
    '牧師': ['mace', 'sacred_flame', 'guiding_bolt', 'command', 'cure_wounds', 'healing_word'],
    '法師': ['fire_bolt', 'magic_missile', 'burning_hands', 'arcane_recovery', 'shield', 'false_life']
  };
  adventure.pregens.forEach(function (p) {
    var ids = p.features.map(function (f) { return f.id; });
    assert.deepStrictEqual(ids, expect[p['class']], p['class']);
    p.features.forEach(function (f) {
      assert.ok(f.roll, f.id);
      assert.ok(f.target, f.id);
      assert.strictEqual(typeof f.costs_turn, 'boolean', f.id);
      assert.ok(f.at_will || f.per === 'night' || Number.isInteger(f.uses) || (f.pool && Number.isInteger(f.cost)), f.id);
      assert.ok(f.summary && Array.from(f.summary).length <= 14, f.id);
    });
  });
  var legacy = {
    id: 'legacy_ok', title: '舊招', start: 'a', items: [],
    pregens: [pregen('甲', '戰士')],
    scenes: [
      { id: 'a', type: 'beat', facts: ['到了。'], choices: [{ id: 'go', label: '走', to: 'z' }] },
      { id: 'z', type: 'end', end: 'win', name: '完', facts: ['完。'] }
    ]
  };
  var report = T.validateAdventure(legacy);
  assert.strictEqual(report.ok, true, report.errors.join('\n'));
});

test('advantage keeps the high die and disadvantage keeps the low die', function () {
  var ranger = new T.Engine(adventure, { seed: 41 });
  ranger.start(1);
  ranger.enterScene('f1_rats');
  heroFirst(ranger);
  ranger.rng = seqRng([7, 16, 4, 3, 1, 1]);
  var shot = ranger.perform({ actor: 0, action: 'move', moveId: 'aimed_shot', target: 0 });
  assert.strictEqual(shot.ok, true, shot.error);
  var atk = shot.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(atk.mode, 'advantage');
  assert.deepStrictEqual(atk.dice, [7, 16]);
  assert.strictEqual(atk.d20, 16);
  assert.strictEqual(atk.hit, true);
  var mech = narrator.Mechanics.format(atk).map(function (l) { return l.text; }).join('\n');
  assert.ok(mech.indexOf('優勢：擲出 7 和 16，取 16') >= 0);
  assert.ok(mech.indexOf('d20 擲出 16') >= 0);
  assert.ok(mech.indexOf('難度 ' + atk.ac) >= 0);

  var guard = new T.Engine(adventure, { seed: 42 });
  guard.start(0);
  guard.enterScene('f1_rats');
  heroFirst(guard);
  guard.rng = seqRng([2, 18, 3, 17, 4, 16]);
  var held = guard.perform({ actor: 0, action: 'defend' });
  assert.strictEqual(held.ok, true, held.error);
  var swings = held.events.filter(function (e) { return e.t === 'enemy_attack'; });
  assert.strictEqual(swings.length, 3);
  assert.strictEqual(swings[0].mode, 'disadvantage');
  assert.strictEqual(swings[0].d20, 2);
  assert.strictEqual(swings[0].hit, false);
  var low = narrator.Mechanics.rollLines(swings[0]).join('\n');
  assert.ok(low.indexOf('劣勢：擲出 2 和 18，取 2') >= 0);
  assert.ok(low.indexOf('d20 擲出 2') >= 0);
  assert.ok(low.indexOf('難度 ' + swings[0].ac) >= 0);
  assert.deepStrictEqual(swings[1].dice, [3, 17]);
  assert.strictEqual(swings[1].d20, 3);
});

test('natural 20 crits, natural 1 misses, and a 19 crits only when it hits', function () {
  var fighter = new T.Engine(adventure, { seed: 43 });
  fighter.start(0);
  fighter.enterScene('f1_bandit');
  heroFirst(fighter);
  fighter.encounter.enemies[0].ac = 40;
  fighter.rng = seqRng([19, 1]);
  var miss = fighter.perform({ actor: 0, action: 'attack', target: 0 });
  var missed = miss.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(missed.d20, 19);
  assert.strictEqual(missed.hit, false);
  assert.strictEqual(missed.crit, false);
  assert.strictEqual(fighter.encounter.enemies[0].hp, 11);

  heroFirst(fighter);
  fighter.encounter.enemies[0].ac = 40;
  fighter.rng = seqRng([20, 8, 8, 1]);
  var crit = fighter.perform({ actor: 0, action: 'attack', target: 0 });
  var hit = crit.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(hit.nat, 20);
  assert.strictEqual(hit.hit, true);
  assert.strictEqual(hit.crit, true);
  assert.strictEqual(hit.damage.rolls.length, 2);
  assert.strictEqual(hit.damage.total, 19);
  var lines = narrator.Mechanics.format(hit).map(function (l) { return l.text; }).join('\n');
  assert.ok(lines.indexOf('難度 40') >= 0);
  assert.ok(lines.indexOf('自然 20') >= 0);
  var view = fighter.narrationView(narrator.diceOf(hit));
  var prose = narrator.OfflineNarrator.narrate('attack', view).map(function (l) { return l.text; }).join('\n');
  assert.ok(prose.indexOf('難度 40') >= 0);
  assert.ok(prose.indexOf('天時地利，這一擊正中要害。暴擊。傷害骰再擲一次。') >= 0);

  var slip = new T.Engine(adventure, { seed: 44 });
  slip.start(0);
  slip.enterScene('f1_bandit');
  heroFirst(slip);
  slip.encounter.enemies[0].ac = 1;
  slip.rng = seqRng([1, 1]);
  var whiff = slip.perform({ actor: 0, action: 'attack', target: 0 });
  var nat1 = whiff.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(nat1.nat, 1);
  assert.strictEqual(nat1.hit, false);
  assert.strictEqual(slip.encounter.enemies[0].hp, 11);
  var missLines = narrator.Mechanics.format(nat1).map(function (l) { return l.text; }).join('\n');
  assert.ok(missLines.indexOf('自然 1') >= 0);
  var missView = slip.narrationView(narrator.diceOf(nat1));
  var missProse = narrator.OfflineNarrator.narrate('attack', missView).map(function (l) { return l.text; }).join('\n');
  assert.ok(missProse.indexOf('腳下一滑，武器擦過石壁。這一擊沒有打中。') >= 0);
});

test('massive damage stops at 1 only from full HP, and is separate from enemy yield', function () {
  var hero = new T.Engine(adventure, { seed: 45 });
  hero.start(0);
  hero.enterScene('f1_bandit');
  hero.encounter.enemies[0].damage = '1d6+20';
  hero.rng = seqRng([15, 1]);
  hero.runEnemyTurn(0);
  assert.strictEqual(hero.character.hp, 1);
  assert.strictEqual(hero.status, 'playing');
  var massive = hero.events.filter(function (e) { return e.t === 'enemy_attack'; })[0];
  assert.strictEqual(massive.massive, true);
  assert.strictEqual(hero.encounter.enemies[0].hp, 11);
  assert.ok(!hero.encounter.enemies[0].yielded);

  hero.character.hp = 6;
  hero.rng = seqRng([15, 1]);
  hero.runEnemyTurn(0);
  assert.strictEqual(hero.character.hp, 0);
  assert.strictEqual(hero.status, 'lost');
});

test('temporary HP does not stand in for full HP, and a full heal restores massive-damage protection', function () {
  var low = new T.Engine(adventure, { seed: 451 });
  low.start(0);
  low.character.hp = 6;
  low.character.tempHp = 4;
  assert.ok(low.character.tempHp > 0);
  assert.ok(low.character.hp < low.character.hp_max);
  low.enterScene('f1_bandit');
  low.encounter.enemies[0].damage = '1d6+20';
  low.rng = seqRng([15, 1]);
  low.runEnemyTurn(0);
  var blow = low.events.filter(function (e) { return e.t === 'enemy_attack'; })[0];
  assert.strictEqual(blow.tempAbsorbed, 4);
  assert.strictEqual(blow.massive, false);
  assert.strictEqual(low.character.hp, 0);
  assert.strictEqual(low.status, 'lost');

  var healed = new T.Engine(adventure, { seed: 452 });
  healed.start(0);
  healed.character.hp = 6;
  healed.character.tempHp = 4;
  healed.rng = seqRng([10]);
  var wind = healed.perform({ type: 'move', moveId: 'second_wind' });
  assert.strictEqual(wind.ok, true, wind.error);
  assert.strictEqual(healed.character.hp, healed.character.hp_max);
  assert.strictEqual(healed.character.tempHp, 4);
  healed.enterScene('f1_bandit');
  healed.encounter.enemies[0].damage = '1d6+20';
  healed.rng = seqRng([15, 1]);
  healed.runEnemyTurn(0);
  var again = healed.events.filter(function (e) { return e.t === 'enemy_attack'; })[0];
  assert.strictEqual(again.massive, true);
  assert.strictEqual(again.tempAbsorbed, 4);
  assert.strictEqual(healed.character.hp, 1);
  assert.strictEqual(healed.character.tempHp, 0);
  assert.strictEqual(healed.status, 'playing');
});

test('rats flee when one remains, and a killing blow on the last one stops at 1', function () {
  var rats = new T.Engine(adventure, { seed: 46 });
  rats.start(0);
  rats.enterScene('f1_rats');
  assert.strictEqual(rats.encounter.enemies.length, 3);
  heroFirst(rats);
  rats.rng = seqRng([15, 1, 1, 1, 15, 1]);
  var first = rats.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(first.ok, true, first.error);
  assert.strictEqual(rats.sceneId, 'f1_rats');
  assert.strictEqual(rats.encounter.enemies[0].hp, 0);
  var second = rats.perform({ actor: 0, action: 'attack', target: 1 });
  assert.strictEqual(second.ok, true, second.error);
  assert.strictEqual(rats.sceneId, 'f1_rats_after');
  assert.strictEqual(rats.status, 'playing');
  assert.strictEqual(rats.clearedCombats.f1_rats, true);
  assert.strictEqual(rats.battleCounts().cleared, 1);
  var win = second.events.filter(function (e) { return e.t === 'combat_win'; })[0];
  assert.strictEqual(win.reason, 'yield');

  var last = new T.Engine(adventure, { seed: 47 });
  last.start(0);
  last.enterScene('f1_rats');
  last.encounter.enemies[0].hp = 0;
  last.encounter.enemies[1].hp = 0;
  last.encounter.enemies[2].hp = 3;
  last.hurtEnemy(last.encounter.enemies[2], 10);
  assert.strictEqual(last.encounter.enemies[2].hp, 0);
  assert.strictEqual(last.checkGroupYield(), true);
  assert.strictEqual(last.encounter.enemies[2].hp, 1);
  assert.strictEqual(last.encounter.enemies[2].yielded, true);
  assert.strictEqual(last.combatResult(), 'yield');
});

test('bandit and cultist yield at a fraction of scaled max HP', function () {
  var bandit = new T.Engine(adventure, { seed: 48 });
  bandit.start(0);
  bandit.enterScene('f1_bandit');
  assert.strictEqual(bandit.encounter.enemies[0].hp_max, 11);
  assert.strictEqual(bandit.encounter.enemies[0].per_extra.hp, 6);
  heroFirst(bandit);
  bandit.rng = seqRng([10, 1, 1, 20, 8, 8]);
  var nick = bandit.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(nick.ok, true, nick.error);
  assert.strictEqual(bandit.encounter.enemies[0].hp, 7);
  assert.ok(!bandit.encounter.enemies[0].yielded);
  var down = bandit.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(down.ok, true, down.error);
  var dropped = down.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(dropped.targetHp, 3);
  assert.strictEqual(dropped.yielded, true);
  assert.strictEqual(bandit.sceneId, 'f1_bandit_after');
  assert.strictEqual(bandit.clearedCombats.f1_bandit, true);
  assert.strictEqual(bandit.battleCounts().cleared, 1);

  var duo = new T.Engine(adventure, { seed: 49, partySize: 2 });
  duo.start(0);
  assert.strictEqual(duo.party.length, 2);
  duo.enterScene('f1_bandit');
  assert.strictEqual(duo.encounter.enemies[0].hp_max, 17);
  heroFirst(duo);
  duo.rng = seqRng([20, 8, 8]);
  var scaled = duo.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(scaled.ok, true, scaled.error);
  assert.strictEqual(scaled.events.filter(function (e) { return e.t === 'attack'; })[0].targetHp, 5);
  assert.strictEqual(duo.sceneId, 'f1_bandit_after');

  var rats = new T.Engine(adventure, { seed: 50, partySize: 2 });
  rats.start(0);
  rats.enterScene('f1_rats');
  assert.strictEqual(rats.encounter.enemies.length, 4);
  assert.strictEqual(rats.encounter.enemies[0].hp_max, 4);

  var cult = new T.Engine(adventure, { seed: 51 });
  cult.start(0);
  cult.enterScene('f3_cult');
  assert.strictEqual(cult.encounter.enemies[0].hp_max, 12);
  heroFirst(cult);
  cult.rng = seqRng([20, 8, 8]);
  var broke = cult.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(broke.ok, true, broke.error);
  var cultHit = broke.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(cultHit.targetHp, 3);
  assert.strictEqual(cultHit.yielded, true);
  assert.strictEqual(cult.sceneId, 'f3_cult_after');
  assert.strictEqual(cult.clearedCombats.f3_cult, true);
});

test('yield wins count toward the secret ending and a player flee does not', function () {
  var secret = playSecret(0);
  assert.strictEqual(secret.flags.secret_ready, true);
  assert.strictEqual(secret.clearedCombats.f1_rats, true);
  assert.strictEqual(secret.clearedCombats.f1_bandit, true);
  assert.strictEqual(secret.clearedCombats.f3_cult, true);

  var fled = new T.Engine(adventure, { seed: 52 });
  fled.start(0);
  ['f1_rats', 'f1_bandit', 'f2_bones', 'f2_ooze', 'f3_wight', 'hide_vault', 'hide_crypt'].forEach(function (id) {
    fled.markCombatCleared(id);
  });
  assert.strictEqual(fled.flags.secret_ready, undefined);
  fled.enterScene('f3_cult');
  var left = fled.perform({ actor: 0, action: 'flee' });
  assert.strictEqual(left.ok, true, left.error);
  assert.ok(!fled.clearedCombats.f3_cult);
  assert.ok(!fled.flags.secret_ready);
});

test('initiative is rolled, saved, and ambush overrides the first round', function () {
  var a = new T.Engine(adventure, { seed: 77 });
  a.start(0);
  a.enterScene('f1_rats');
  var b = new T.Engine(adventure, { seed: 77 });
  b.start(0);
  b.enterScene('f1_rats');
  assert.deepStrictEqual(a.encounter.order, b.encounter.order);
  assert.ok(a.encounter.order.length >= 4);
  assert.ok(a.events.some(function (e) { return e.t === 'initiative'; }));
  var code = T.encodeSaveCode(a.exportSave());
  var face = a.rng.die(20);
  var loaded = T.loadGame(adventure, code);
  assert.strictEqual(loaded.ok, true, loaded.error);
  assert.deepStrictEqual(loaded.engine.encounter.order, a.encounter.order);
  assert.strictEqual(loaded.engine.rng.die(20), face);

  var quiet = new T.Engine(adventure, { seed: 78 });
  quiet.start(0);
  quiet.enterScene('f1_rats');
  heroFirst(quiet);
  var armed = quiet.perform({ actor: 0, action: 'ambush', outcome: 'success' });
  assert.strictEqual(armed.ok, true, armed.error);
  quiet.rng = seqRng([15, 1]);
  var poke = quiet.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(poke.ok, true, poke.error);
  assert.ok(!poke.events.some(function (e) { return e.t === 'enemy_attack'; }));
  assert.strictEqual(quiet.sceneId, 'f1_rats');

  var caught = new T.Engine(adventure, { seed: 79 });
  caught.start(0);
  caught.enterScene('f1_rats');
  heroFirst(caught);
  caught.perform({ actor: 0, action: 'ambush', outcome: 'failure' });
  caught.rng = seqRng([1, 1, 1, 15, 1, 1, 1]);
  var answer = caught.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(answer.ok, true, answer.error);
  var before = 0;
  var seenPlayer = false;
  answer.events.forEach(function (e) {
    if (e.t === 'attack') seenPlayer = true;
    if (!seenPlayer && e.t === 'enemy_attack') before++;
  });
  var player = answer.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(before, 3);
  assert.strictEqual(player.d20, 15);
});

test('WT3 migrates, checkpoints restore uses only, and retry takes a new seed', function () {
  var fighter = new T.Engine(adventure, { seed: 80 });
  fighter.start(0);
  var old = fighter.exportSave();
  old.v = 3;
  old.character.features = [{ id: 'old', name: '舊招', uses: 3, usesMax: 3, effect: { type: 'damage', amount: 4 } }];
  delete old.character.statuses;
  delete old.character.pools;
  delete old.character.passives;
  delete old.character.hpMaxReduction;
  delete old.allies;
  var migrated = T.loadGame(adventure, T.encodeSaveCode(old));
  assert.strictEqual(migrated.ok, true, migrated.error);
  var ids = migrated.engine.character.features.map(function (f) { return f.id; });
  assert.deepStrictEqual(ids, ['longsword', 'power_strike', 'second_wind']);
  assert.deepStrictEqual(migrated.engine.character.statuses, []);
  assert.strictEqual(migrated.engine.character.hpMaxReduction, 0);
  var code = T.decodeSaveCode(T.encodeSaveCode(fighter.exportSave()));
  assert.strictEqual(code.save.v, 8);
  assert.strictEqual(code.save.rng.kind, 'seeded');
  assert.ok(Number.isInteger(code.save.rng.count));

  var rest = new T.Engine(adventure, { seed: 81 });
  rest.start(0);
  rest.character.hp = 6;
  rest.character.features.forEach(function (f) { if (f.id === 'power_strike') f.uses = 0; });
  rest.enterScene('cp_f1');
  assert.strictEqual(rest.character.hp, 6);
  assert.strictEqual(rest.character.features.filter(function (f) { return f.id === 'power_strike'; })[0].uses, 2);
  assert.ok(rest.events.some(function (e) { return e.t === 'move_refresh' && e.healed === 0; }));
  assert.ok(rest.checkpointSnap);
  var seedAtRest = rest.rng.seed;

  rest.enterScene('f1_bandit');
  rest.encounter.order = [
    { kind: 'enemy', index: 0, roll: 20, bonus: 0, total: 20 },
    { kind: 'hero', index: 0, roll: 1, bonus: 0, total: 1 }
  ];
  rest.encounter.acted = {};
  rest.encounter.round = 1;
  rest.encounter.heroReady = false;
  rest.encounter.enemies[0].damage = '1d6+20';
  rest.character.hp = 4;
  rest.rng = seqRng([15, 6]);
  var dead = rest.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(dead.ok, true, dead.error);
  assert.strictEqual(rest.status, 'lost');
  var diedSeed = rest.rng.seed;
  var again = rest.perform({ actor: 0, action: 'retry' });
  assert.strictEqual(again.ok, true, again.error);
  assert.strictEqual(rest.sceneId, 'cp_f1');
  assert.strictEqual(rest.status, 'playing');
  assert.strictEqual(rest.character.hp, 6);
  assert.strictEqual(rest.character.features.filter(function (f) { return f.id === 'power_strike'; })[0].uses, 2);
  assert.ok(Number.isInteger(rest.rng.seed) && rest.rng.seed > 0);
  assert.notStrictEqual(rest.rng.seed, seedAtRest);
  assert.notStrictEqual(rest.rng.seed, diedSeed || 0);
  assert.ok(again.events.some(function (e) { return e.t === 'retry'; }));
});

test('visible combat rolls match the RNG and survive a reload', function () {
  var mark = 'D' + '&' + 'D';
  var phrase = ('Dungeons' + ' & ' + 'Dragons').toLowerCase();
  var check = new T.Engine(adventure, { seed: 92 });
  check.start(0);
  choose(check, 'rush');
  winCombat(check);
  answerInserted(check);
  choose(check, 'climb');
  check.rng = seqRng([12]);
  var rolled = check.perform({ type: 'roll' });
  assert.strictEqual(rolled.ok, true, rolled.error);
  var chk = rolled.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.strictEqual(chk.d20, 12);
  assert.strictEqual(chk.total, 17);
  var checkText = narrator.Mechanics.rollLines(chk).join('\n');
  assert.ok(checkText.indexOf('d20 擲出 12，力量 +3，熟練 +2，總數 17，難度 12，成功') >= 0);
  var storedCheck = check.rollLog.filter(function (row) { return row.t === 'check'; }).pop();
  assert.deepStrictEqual(storedCheck.lines, narrator.Mechanics.rollLines(chk));

  var fighter = new T.Engine(adventure, { seed: 93 });
  fighter.start(0);
  fighter.enterScene('f1_bandit');
  heroFirst(fighter);
  fighter.rng = seqRng([12, 4, 1]);
  var swing = fighter.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(swing.ok, true, swing.error);
  var atk = swing.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(atk.d20, 12);
  var attackText = narrator.Mechanics.rollLines(atk).join('\n');
  assert.ok(attackText.indexOf('d20 擲出 12') >= 0);
  assert.ok(attackText.indexOf('總數 ' + atk.total) >= 0);
  assert.ok(attackText.indexOf('難度 ' + atk.ac) >= 0);
  assert.strictEqual(atk.ac, fighter.encounter ? 13 : atk.ac);
  assert.ok(attackText.indexOf('難度 13') >= 0);
  var stored = fighter.rollLog.filter(function (row) { return row.t === 'attack'; }).pop();
  assert.deepStrictEqual(stored.lines, narrator.Mechanics.rollLines(atk));
  assert.ok(attackText.indexOf(mark) < 0);
  assert.ok(attackText.toLowerCase().indexOf(phrase) < 0);

  heroFirst(fighter);
  fighter.encounter.enemies[0].ac = 11;
  fighter.encounter.enemies[0].hp = 11;
  fighter.encounter.enemies[0].yielded = false;
  fighter.rng = seqRng([20, 8, 8, 1]);
  var crit = fighter.perform({ actor: 0, action: 'attack', target: 0 });
  var critEv = crit.events.filter(function (e) { return e.t === 'attack'; })[0];
  var critText = narrator.Mechanics.rollLines(critEv).join('\n');
  assert.ok(critText.indexOf('自然 20，暴擊') >= 0);
  assert.ok(critText.indexOf('d20 擲出 20') >= 0);

  var live = new T.Engine(adventure, { seed: 94 });
  live.start(0);
  live.enterScene('f1_bandit');
  heroFirst(live);
  var before = live.rng.rolled();
  var hit = live.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(hit.ok, true, hit.error);
  var seen = live.rollLog.map(function (row) { return row.lines.join('\n'); }).join('\n');
  var count = live.rng.rolled();
  assert.ok(count > before);
  var code = T.encodeSaveCode(live.exportSave());
  var nextFace = live.rng.die(20);
  var loaded = T.loadGame(adventure, code);
  assert.strictEqual(loaded.ok, true, loaded.error);
  assert.strictEqual(loaded.engine.rng.rolled(), count);
  assert.strictEqual(loaded.engine.rollLog.map(function (row) { return row.lines.join('\n'); }).join('\n'), seen);
  var resumed = loaded.engine.resumeView();
  assert.strictEqual(resumed.ok, true, resumed.error);
  assert.strictEqual(loaded.engine.rng.rolled(), count);
  assert.strictEqual(loaded.engine.rng.die(20), nextFace);
});

test('visible roll text does not name a tabletop trademark', function () {
  var mark = 'D' + '&' + 'D';
  var phrase = ('Dungeons' + ' & ' + 'Dragons').toLowerCase();
  var sample = narrator.Mechanics.rollLines({
    t: 'attack', d20: 20, dice: [7, 20], mode: 'advantage', bonus: 5, total: 25,
    ac: 13, dc: 13, hit: true, crit: true, nat: 20
  }).concat(narrator.Mechanics.rollLines({
    t: 'check', d20: 1, mod: 3, prof: 2, total: 6, dc: 12, success: false, ability: 'str', nat: 1
  })).concat(narrator.Mechanics.rollLines({
    t: 'enemy_attack', d20: 7, dice: [7, 16], mode: 'disadvantage', bonus: 2, total: 9,
    ac: 16, dc: 16, hit: false, nat: 7
  })).join('\n');
  assert.ok(sample.indexOf('優勢：擲出 7 和 20，取 20') >= 0);
  assert.ok(sample.indexOf('劣勢：擲出 7 和 16，取 7') >= 0);
  assert.ok(sample.indexOf(' 同 ') < 0);
  assert.ok(sample.indexOf('d20') >= 0);
  assert.ok(sample.indexOf('難度') >= 0);
  assert.ok(sample.indexOf('暴擊') >= 0);
  assert.ok(sample.indexOf(mark) < 0);
  assert.ok(sample.toLowerCase().indexOf(phrase) < 0);
  ['preview/index.html', 'preview/js/ui.js', 'preview/js/dice.js', 'preview/js/narrator.js', 'preview/js/engine.js', 'preview/data/wasted_tower.js', 'index.html'].forEach(function (rel) {
    var text = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.ok(text.indexOf(mark) < 0, rel);
    assert.ok(text.toLowerCase().indexOf(phrase) < 0, rel);
  });
});

test('the same command shape resolves whether it comes from the menu or a later client', function () {
  function strike(cmd) {
    var engine = new T.Engine(adventure, { seed: 82 });
    engine.start(0);
    engine.enterScene('f1_bandit');
    heroFirst(engine);
    engine.rng = seqRng([12, 4, 1]);
    var res = engine.perform(cmd);
    assert.strictEqual(res.ok, true, res.error);
    return engine.encounter.enemies[0].hp;
  }
  var fromMenu = strike({ type: 'attack', target: 0 });
  var fromNet = strike({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(fromMenu, fromNet);
  assert.ok(fromMenu < 11);
  var rejected = new T.Engine(adventure, { seed: 83 });
  rejected.start(0);
  rejected.enterScene('f1_bandit');
  var other = rejected.perform({ actor: 1, action: 'attack', target: 0 });
  assert.strictEqual(other.ok, false);
});

test('fleeing the floor-1 bandit does not reroll resolved hall checks', function () {
  var engine = new T.Engine(adventure, { seed: 95 });
  engine.start(0);
  choose(engine, 'rush');
  var storyRng = engine.rng;
  winCombat(engine);
  engine.rng = storyRng;
  answerInserted(engine);
  choose(engine, 'climb');
  assert.strictEqual(engine.sceneId, 'f1_ath');
  var before = engine.rng.rolled();
  var rolled = engine.perform({ type: 'roll' });
  assert.strictEqual(rolled.ok, true, rolled.error);
  assert.strictEqual(engine.sceneId, 'f1_bandit_front');
  assert.ok(engine.done['check:f1_ath'] && typeof engine.done['check:f1_ath'] === 'object');
  assert.strictEqual(engine.rng.rolled(), before + 1);
  choose(engine, 'fight');
  assert.strictEqual(engine.sceneId, 'f1_bandit');
  var atFight = engine.rng.exportState();
  var fled = engine.perform({ type: 'flee' });
  assert.strictEqual(fled.ok, true, fled.error);
  assert.strictEqual(engine.sceneId, 'f1_hall');
  assert.deepStrictEqual(engine.rng.exportState(), atFight);
  var choices = choiceIds(engine);
  assert.ok(choices.length >= 1);
  assert.ok(choices.indexOf('climb') < 0);
  assert.ok(choices.indexOf('creep') < 0);
  assert.ok(choices.indexOf('scan') < 0);
  assert.ok(!engine.legalActions().some(function (a) { return a.type === 'roll'; }));

  var saved = engine.exportSave();
  assert.strictEqual(saved.rng.count, atFight.count);
  assert.strictEqual(saved.rng.s, atFight.s);
  assert.ok(saved.done['check:f1_ath']);
  var code = T.encodeSaveCode(saved);
  var loaded = T.loadGame(adventure, code);
  assert.strictEqual(loaded.ok, true, loaded.error);
  assert.strictEqual(loaded.engine.sceneId, 'f1_hall');
  assert.strictEqual(loaded.engine.rng.rolled(), atFight.count);
  assert.strictEqual(loaded.engine.rng.exportState().s, atFight.s);
  assert.deepStrictEqual(choiceIds(loaded.engine), choices);
  assert.ok(loaded.engine.done['check:f1_ath']);
  assert.ok(choiceIds(loaded.engine).indexOf('climb') < 0);
  assert.strictEqual(engine.rng.die(20), loaded.engine.rng.die(20));

  var forward = T.loadGame(adventure, code);
  var pos = forward.engine.rng.exportState();
  var go = forward.engine.perform({ type: 'choice', id: choiceIds(forward.engine)[0] });
  assert.strictEqual(go.ok, true, go.error);
  assert.strictEqual(forward.engine.sceneId, 'f1_bandit_front');
  assert.deepStrictEqual(forward.engine.rng.exportState(), pos);
  assert.ok(!go.events.some(function (e) { return e.t === 'check'; }));

  function shell(sceneId, flags, done, encounter) {
    return {
      v: 3,
      adventureId: 'wasted_tower',
      scriptVersion: 1,
      pregenIndex: 0,
      character: {
        name: '布倫', cls: '戰士', race: '人類',
        str: 16, dex: 12, con: 15, int: 8, wis: 10, cha: 10,
        ac: 16, hp: 12, hp_max: 12, acBonus: 0,
        skills: ['athletics'],
        inventory: ['potion_heal', 'lantern'],
        attack: { name: '長劍', bonus: 5, damage: '1d8+3' },
        features: []
      },
      sceneId: sceneId,
      flags: flags,
      done: done || {},
      clearedCombats: {},
      keyChoices: [],
      rivalPregenIndex: null,
      encounter: encounter || null,
      round: encounter ? 1 : 0,
      status: 'playing',
      lastCheckpoint: null,
      playMs: 1,
      rng: { kind: 'seeded', seed: 95, s: 95, count: 4 }
    };
  }
  var hall = T.loadGame(adventure, T.encodeSaveCode(shell('f1_hall', { cls_warrior: true, hall_climb: true })));
  assert.strictEqual(hall.ok, true, hall.error);
  assert.ok(hall.engine.done['check:f1_ath']);
  assert.ok(hall.engine.done['choice:f1_hall/climb']);
  assert.ok(!hall.engine.done['check:f1_stl']);
  assert.ok(choiceIds(hall.engine).indexOf('climb') < 0);
  assert.ok(choiceIds(hall.engine).indexOf('creep') < 0);
  assert.ok(choiceIds(hall.engine).indexOf('scan') < 0);
  assert.ok(choiceIds(hall.engine).length >= 1);
  assert.strictEqual(hall.engine.rng.rolled(), 4);

  var waiting = T.loadGame(adventure, T.encodeSaveCode(shell('f1_ath', { cls_warrior: true, hall_climb: true })));
  assert.strictEqual(waiting.ok, true, waiting.error);
  assert.ok(!waiting.engine.done['check:f1_ath']);
  assert.ok(waiting.engine.legalActions().some(function (a) { return a.type === 'roll'; }));

  var early = T.loadGame(adventure, T.encodeSaveCode(shell('f1_gate', { cls_warrior: true, gate_rushed: true })));
  assert.strictEqual(early.ok, true, early.error);
  assert.ok(!early.engine.done['check:f1_ath']);
  assert.ok(!early.engine.done['check:f1_stl']);
  assert.ok(!early.engine.done['check:f1_per']);

  var bandit = T.loadGame(adventure, T.encodeSaveCode(shell('f1_bandit', { cls_warrior: true }, {}, {
    enemies: [{ name: '盜墓者', ac: 13, hp: 11, hp_max: 11, atk: 3, damage: '1d6+1' }],
    order: [],
    acted: {},
    round: 1
  })));
  assert.strictEqual(bandit.ok, true, bandit.error);
  assert.ok(bandit.engine.done['check:f1_ath']);
  assert.ok(bandit.engine.done['check:f1_stl']);
  assert.ok(bandit.engine.done['check:f1_per']);
  var back = bandit.engine.perform({ type: 'flee' });
  assert.strictEqual(back.ok, true, back.error);
  assert.strictEqual(bandit.engine.sceneId, 'f1_hall');
  assert.strictEqual(bandit.engine.rng.rolled(), 4);
  assert.ok(choiceIds(bandit.engine).length >= 1);
  assert.ok(choiceIds(bandit.engine).indexOf('climb') < 0);
});

function outsideHealWorthPotion(heal, hp, hpMax) {
  if (!Number.isInteger(heal) || heal < 1) return false;
  if (!Number.isInteger(hp) || !Number.isInteger(hpMax)) return false;
  var missing = hpMax - hp;
  if (missing <= 0) return false;
  var restored = missing < heal ? missing : heal;
  // 1 or 2 points is a scratch. A larger gap is worth the potion.
  return restored >= 3;
}
function hitChance(bonus, ac) {
  var face, hits = 0;
  for (face = 1; face <= 20; face++) {
    if (face !== 1 && (face === 20 || face + bonus >= ac)) hits++;
  }
  return hits / 20;
}
function simulateClass(index, runs, options) {
  options = options || {};
  var wins = 0;
  var roundSum = 0;
  var finished = 0;
  var netCasts = 0;
  var commandCasts = 0;
  var r, engine, guard, rounds;
  function forceCheck(eng) {
    var saved = eng.rng;
    eng.rng = seqRng([20, 20]);
    var res = eng.perform({ type: 'roll' });
    eng.rng = saved;
    return res;
  }
  function lowest(eng) {
    var living = eng.livingEnemies();
    var best = living[0];
    living.forEach(function (e) { if (e.hp < best.hp) best = e; });
    return best;
  }
  function usesOf(eng, id) {
    var found = null;
    (eng.character.features || []).forEach(function (f) { if (f.id === id) found = f; });
    if (!found) return 0;
    return eng.moveUsesLeft(eng.character, found);
  }
  function applyVariant(eng) {
    var c = eng.character;
    if (options.slots === 'A') {
      ['channel', 'slots'].forEach(function (id) {
        var pool = c.pools && c.pools[id];
        if (!pool) return;
        pool.usesMax = 2;
        pool.uses = Math.min(pool.uses, 2);
      });
      (c.features || []).forEach(function (f) {
        if (f.pool && c.pools[f.pool]) {
          f.uses = c.pools[f.pool].uses;
          f.usesMax = c.pools[f.pool].usesMax;
        }
      });
    }
    if (options.burning === '2d6') {
      (c.features || []).forEach(function (f) {
        if (f.id === 'burning_hands') f.damage_dice = '2d6';
      });
    }
    if (options.sneak === '1d6') {
      (c.passives || []).forEach(function (p) {
        if (p && p.id === 'sneak_attack') p.dice = '1d6';
      });
    }
  }
  function topUp(eng) {
    if (options.policy !== 'full') return;
    if (!eng.scene || eng.scene.type === 'combat' || eng.status !== 'playing') return;
    var guard = 0;
    while (eng.character.hp < eng.character.hp_max && guard++ < 12) {
      var action = null;
      var ids = ['healing_word', 'cure_wounds', 'second_wind'];
      var m;
      for (m = 0; m < ids.length; m++) {
        if (usesOf(eng, ids[m]) > 0) {
          action = { actor: 0, action: 'move', moveId: ids[m] };
          break;
        }
      }
      if (!action) {
        var slot = -1;
        eng.character.inventory.forEach(function (id, i) {
          if (slot < 0 && (id === 'potion_heal' || id === 'potion_heal_2' || id === 'cure_wounds')) slot = i;
        });
        if (slot >= 0) {
          var item = eng.items[eng.character.inventory[slot]];
          var heal = item && item.heal;
          // Restoring 1 or 2 points spends the potion before an emergency needs it.
          if (heal && (options.potionOutside === 'any' || outsideHealWorthPotion(heal, eng.character.hp, eng.character.hp_max))) {
            action = { actor: 0, action: 'item', slot: slot };
          }
        }
      }
      if (!action) return;
      var before = eng.character.hp;
      var res = eng.perform(action);
      if (!res.ok || eng.character.hp <= before) return;
    }
  }
  function recover(eng) {
    if (!eng.scene || eng.scene.type === 'combat') return;
    if (usesOf(eng, 'arcane_recovery') <= 0) return;
    var pool = eng.character.pools && eng.character.pools.slots;
    if (!pool || pool.uses >= pool.usesMax) return;
    eng.perform({ actor: 0, action: 'move', moveId: 'arcane_recovery' });
  }
  function policy(eng) {
    var c = eng.character;
    var living = eng.livingEnemies();
    var foe = lowest(eng);
    if (c.hp <= Math.max(4, Math.floor(c.hp_max / 2)) && usesOf(eng, 'healing_word') > 0) {
      return { actor: 0, action: 'move', moveId: 'healing_word' };
    }
    if (c.hp * 2 <= c.hp_max && usesOf(eng, 'second_wind') > 0) {
      return { actor: 0, action: 'move', moveId: 'second_wind' };
    }
    if (c.hp <= 4) {
      var slot = -1;
      c.inventory.forEach(function (id, i) {
        if (slot < 0 && (id === 'potion_heal' || id === 'potion_heal_2' || id === 'cure_wounds')) slot = i;
      });
      if (slot >= 0) return { actor: 0, action: 'item', slot: slot };
      if (usesOf(eng, 'cure_wounds') > 0) return { actor: 0, action: 'move', moveId: 'cure_wounds' };
      if (!(c.tempHp > 0) && usesOf(eng, 'false_life') > 0) {
        return { actor: 0, action: 'move', moveId: 'false_life' };
      }
    }
    if (foe && foeHas(foe, 'prone') && !foeHas(foe, 'restrained')) {
      if (usesOf(eng, 'two_weapon') > 0) {
        return { actor: 0, action: 'move', moveId: 'two_weapon', target: foe.index };
      }
      return { actor: 0, action: 'attack', target: foe.index };
    }
    if (options.statusUse === 'smart' && foe && controlWorth(eng, foe)) {
      if (usesOf(eng, 'net') > 0 && !moveImmune(eng, 'net', foe) && !foeHas(foe, 'restrained')) {
        return { actor: 0, action: 'move', moveId: 'net', target: foe.index };
      }
      if (usesOf(eng, 'command') > 0 && !moveImmune(eng, 'command', foe) && !foeHas(foe, 'prone')) {
        return { actor: 0, action: 'move', moveId: 'command', target: foe.index };
      }
    }
    if (living.length >= 2 && usesOf(eng, 'burning_hands') > 0) {
      return { actor: 0, action: 'move', moveId: 'burning_hands' };
    }
    var moves = ['shadow_attack', 'power_strike', 'hunters_mark', 'aimed_shot', 'guiding_bolt', 'magic_missile'];
    var m;
    for (m = 0; m < moves.length; m++) {
      if (usesOf(eng, moves[m]) > 0) return { actor: 0, action: 'move', moveId: moves[m], target: foe.index };
    }
    if (usesOf(eng, 'sacred_flame') > 0) {
      var flame = 0.6 * 4.5;
      var weapon = 5.5;
      var holyReady = (c.passives || []).some(function (p) {
        return p && p.id === 'divine_strike' && !c.divineStrikeUsed;
      });
      if (holyReady) weapon += 2.5;
      var mace = hitChance(c.attack.bonus, foe.ref ? foe.ref.ac : foe.hp) * weapon;
      if (flame > mace) return { actor: 0, action: 'move', moveId: 'sacred_flame', target: foe.index };
    }
    if (usesOf(eng, 'two_weapon') > 0) {
      return { actor: 0, action: 'move', moveId: 'two_weapon', target: foe.index };
    }
    return { actor: 0, action: 'attack', target: foe.index };
  }
  function fight(eng) {
    var seen = 0;
    var steps = 0;
    while (eng.status === 'playing' && eng.scene && eng.scene.type === 'combat') {
      if (eng.round > seen) seen = eng.round;
      if (eng.round > 30 || steps++ > 80) {
        eng.lose('stall');
        break;
      }
      var living = eng.livingEnemies();
      if (!living.length) break;
      var res = eng.perform(policy(eng));
      (res.events || []).forEach(function (ev) {
        if (ev.t !== 'status_cast') return;
        if (ev.featureId === 'net') netCasts++;
        if (ev.featureId === 'command') commandCasts++;
      });
      if (!res.ok) {
        res = eng.perform({ actor: 0, action: 'attack', target: living[0].index });
        if (!res.ok) { eng.lose('policy'); break; }
      }
    }
    return seen;
  }
  function runSecret(eng) {
    var seen = 0;
    var steps = 0;
    var prefer = ['search_finn', 'search', 'fight', 'creep', 'side', 'take_loot', 'force', 'unlock', 'niche', 'take_holy', 'face_rival'];
    while (eng.status === 'playing' && steps++ < 80) {
      var sc = eng.scene;
      if (!sc) break;
      if (sc.type === 'combat') {
        seen += fight(eng);
        continue;
      }
      if (sc.type === 'check') {
        forceCheck(eng);
        continue;
      }
      if (sc.type === 'checkpoint') {
        topUp(eng);
        recover(eng);
        cont(eng);
        continue;
      }
      if (sc.type === 'end') break;
      if (sc.type !== 'beat') break;
      topUp(eng);
      recover(eng);
      var beforeId = eng.sceneId;
      var beforeType = eng.scene.type;
      answerInserted(eng);
      if (eng.status !== 'playing') break;
      if (!eng.scene || eng.scene.type !== 'beat' || eng.sceneId !== beforeId || eng.scene.type !== beforeType) continue;
      var ids = choiceIds(eng);
      var pick = null;
      var pi;
      for (pi = 0; pi < prefer.length; pi++) {
        if (ids.indexOf(prefer[pi]) >= 0) { pick = prefer[pi]; break; }
      }
      if (!pick && eng.sceneId === 'pick_rival' && ids.length) pick = ids[0];
      if (!pick && ids.length) pick = ids[0];
      if (!pick) break;
      choose(eng, pick);
    }
    return seen;
  }
  for (r = 0; r < runs; r++) {
    engine = new T.Engine(adventure, { seed: 1000 + index * 100000 + r });
    engine.start(index);
    applyVariant(engine);
    rounds = 0;
    guard = 0;
    try {
      if (options.route === 'secret') {
        rounds = runSecret(engine);
        if (engine.status === 'secret_won') {
          wins++;
          roundSum += rounds;
          finished++;
        }
      } else {
      choose(engine, 'rush');
      if (engine.sceneId === 'f1_foyer') {
        topUp(engine);
        choose(engine, 'fight');
      }
      recover(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      choose(engine, 'climb');
      forceCheck(engine);
      if (engine.sceneId === 'f1_bandit_front') {
        topUp(engine);
        choose(engine, 'fight');
      }
      recover(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      cont(engine);
      topUp(engine);
      choose(engine, 'up');
      recover(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      choose(engine, 'watch');
      topUp(engine);
      forceCheck(engine);
      recover(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      cont(engine);
      choose(engine, 'smash');
      topUp(engine);
      answerInserted(engine);
      recover(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      topUp(engine);
      choose(engine, 'rush_boss');
      recover(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      cont(engine);
      choose(engine, 'leave');
      if (engine.status === 'won') {
        wins++;
        roundSum += rounds;
        finished++;
      }
      }
    } catch (e) {
      guard++;
    }
  }
  return {
    wins: wins, runs: runs, avg: finished ? (roundSum / finished) : 0,
    netCasts: netCasts, commandCasts: commandCasts
  };
}

function foeBody(foe) { return (foe && foe.ref) || foe || {}; }
function foeHas(foe, id) {
  var list = foeBody(foe).statuses || [];
  var i;
  for (i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return true;
  return false;
}
function moveImmune(eng, id, foe) {
  var feat = null;
  (eng.character.features || []).forEach(function (f) { if (f && f.id === id) feat = f; });
  if (!feat || !Array.isArray(feat.no_effect)) return true;
  return feat.no_effect.indexOf(foeBody(foe).id) >= 0;
}
function avgDiceSpec(spec) {
  var p = T.parseDice(spec);
  if (!p) return 0;
  return p.count * (p.sides + 1) / 2 + p.mod;
}
function hitP(bonus, ac, mode) {
  var p = hitChance(bonus, ac);
  if (mode === 'advantage') return 1 - (1 - p) * (1 - p);
  if (mode === 'disadvantage') return p * p;
  return p;
}
function damageToFinish(foe) {
  var ref = foeBody(foe);
  var hp = ref.hp;
  if (ref.yield && ref.yield.kind === 'hp_fraction') {
    var threshold = Math.floor(ref.hp_max * ref.yield.num / ref.yield.den);
    if (threshold > 0 && hp > threshold) return hp - threshold;
  }
  return hp;
}
function bestSwing(eng, foe) {
  var ac = foeBody(foe).ac;
  var c = eng.character;
  var weapon = avgDiceSpec(c.attack.damage);
  var bonus = c.attack.bonus;
  var best = hitP(bonus, ac, 'normal') * weapon;
  var holy = (c.passives || []).some(function (p) {
    return p && p.id === 'divine_strike' && !c.divineStrikeUsed;
  });
  if (holy) best = Math.max(best, hitP(bonus, ac, 'normal') * (weapon + 2.5));
  if (usesLeft(eng, 'aimed_shot') > 0) best = Math.max(best, hitP(bonus, ac, 'advantage') * (weapon + 4.5));
  if (usesLeft(eng, 'hunters_mark') > 0) best = Math.max(best, hitP(bonus, ac, 'normal') * (weapon + 3.5));
  if (usesLeft(eng, 'power_strike') > 0) best = Math.max(best, hitP(bonus, ac, 'normal') * (weapon + 4.5));
  if (usesLeft(eng, 'guiding_bolt') > 0) best = Math.max(best, hitP(5, ac, 'normal') * 14);
  if (usesLeft(eng, 'magic_missile') > 0) best = Math.max(best, 10.5);
  if (usesLeft(eng, 'two_weapon') > 0) {
    best = Math.max(best, hitP(bonus, ac, 'normal') * (weapon + 2.5));
  }
  return best;
}
function usesLeft(eng, id) {
  var found = null;
  (eng.character.features || []).forEach(function (f) { if (f && f.id === id) found = f; });
  if (!found) return 0;
  return eng.moveUsesLeft(eng.character, found);
}
function controlWorth(eng, foe) {
  var need = damageToFinish(foe);
  if (need < 12) return false;
  if (bestSwing(eng, foe) >= need * 0.85) return false;
  return true;
}

function printSimulator() {
  var runs = parseInt(process.env.SIM_RUNS || '400', 10);
  var names = adventure.pregens.map(function (p) { return p['class']; });
  var variants = [
    { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', title: '直打，法術位 3，偷襲 2d6，燃燒之手 3d6（本版）' },
    { policy: 'straight', slots: 'A', sneak: '2d6', burning: '3d6', title: '直打，法術位 2，偷襲 2d6，燃燒之手 3d6' },
    { policy: 'straight', slots: 'B', sneak: '1d6', burning: '3d6', title: '直打，法術位 3，偷襲 1d6，燃燒之手 3d6' },
    { policy: 'straight', slots: 'A', sneak: '1d6', burning: '3d6', title: '直打，法術位 2，偷襲 1d6，燃燒之手 3d6' },
    { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', title: '戰前補滿，法術位 3，偷襲 2d6，燃燒之手 3d6' },
    { policy: 'full', slots: 'A', sneak: '2d6', burning: '3d6', title: '戰前補滿，法術位 2，偷襲 2d6，燃燒之手 3d6' },
    { policy: 'full', slots: 'B', sneak: '1d6', burning: '3d6', title: '戰前補滿，法術位 3，偷襲 1d6，燃燒之手 3d6' },
    { policy: 'full', slots: 'A', sneak: '1d6', burning: '3d6', title: '戰前補滿，法術位 2，偷襲 1d6，燃燒之手 3d6' },
    { policy: 'straight', slots: 'B', sneak: '2d6', burning: '2d6', title: '直打，法術位 3，偷襲 2d6，燃燒之手 2d6' },
    { policy: 'straight', slots: 'A', sneak: '2d6', burning: '2d6', title: '直打，法術位 2，偷襲 2d6，燃燒之手 2d6' },
    { policy: 'full', slots: 'B', sneak: '2d6', burning: '2d6', title: '戰前補滿，法術位 3，偷襲 2d6，燃燒之手 2d6' },
    { policy: 'full', slots: 'A', sneak: '2d6', burning: '2d6', title: '戰前補滿，法術位 2，偷襲 2d6，燃燒之手 2d6' }
  ];
  if (process.env.SIM_FOCUS === 'shipped') {
    variants = [
      { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', title: '直打，法術位 3，偷襲 2d6，燃燒之手 3d6，護盾術自動（本版）' },
      { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', title: '戰前補滿（一兩點不喝藥水），法術位 3，偷襲 2d6，燃燒之手 3d6，護盾術自動（本版）' }
    ];
  }
  if (process.env.SIM_FOCUS === 'status') {
    variants = [
      { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'never', title: '直打，從不用束縛或倒地（基準）' },
      { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'smart', title: '直打，高生命才用束縛或倒地' },
      { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'never', title: '戰前補滿（一兩點不喝藥水），從不用束縛或倒地' },
      { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'smart', title: '戰前補滿（一兩點不喝藥水），高生命才用束縛或倒地' }
    ];
  }
  console.log('');
  console.log('模擬（每職業 ' + runs + ' 場，內部參考，不入遊戲）');
  function printRow(variant) {
    console.log(variant.title);
    console.log('職業    通關率     平均回合');
    names.forEach(function (name, i) {
      var row = simulateClass(i, runs, variant);
      var pct = ((row.wins / row.runs) * 100).toFixed(1) + '%';
      while (pct.length < 8) pct = pct + ' ';
      var extra = '';
      if (variant.statusUse) extra = '   網 ' + row.netCasts + '  命令 ' + row.commandCasts;
      console.log(name + '    ' + pct + '   ' + row.avg.toFixed(1) + extra);
    });
  }
  variants.forEach(printRow);
  if (process.env.SIM_FOCUS === 'shipped') {
    [
      { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', route: 'secret', title: '隱藏路線，直打，法術位 3，偷襲 2d6，燃燒之手 3d6，護盾術自動' },
      { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', route: 'secret', title: '隱藏路線，戰前補滿（一兩點不喝藥水），法術位 3，偷襲 2d6，燃燒之手 3d6，護盾術自動' }
    ].forEach(printRow);
  }
  if (process.env.SIM_FOCUS === 'status') {
    [
      { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'never', route: 'secret', title: '隱藏路線，直打，從不用束縛或倒地' },
      { policy: 'straight', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'smart', route: 'secret', title: '隱藏路線，直打，高生命才用束縛或倒地' },
      { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'never', route: 'secret', title: '隱藏路線，戰前補滿（一兩點不喝藥水），從不用束縛或倒地' },
      { policy: 'full', slots: 'B', sneak: '2d6', burning: '3d6', statusUse: 'smart', route: 'secret', title: '隱藏路線，戰前補滿（一兩點不喝藥水），高生命才用束縛或倒地' }
    ].forEach(printRow);
  }
}

function playerLog(events) {
  var lines = [];
  (events || []).forEach(function (ev) {
    narrator.Mechanics.format(ev).forEach(function (line) { lines.push(line.text); });
    if (!ev.view) return;
    narrator.OfflineNarrator.narrate(narrator.cueOf(ev), ev.view).forEach(function (line) {
      lines.push(line.text);
    });
  });
  return lines;
}

function countLine(lines, text) {
  return lines.filter(function (line) { return line === text; }).length;
}

var RATS_WIN = '最後一隻腐鼠尖叫著鑽進牆縫。門廳安靜下來，只剩你的喘息。';
var RATS_FLEE = '你退回門外，腐鼠沒有追出來。';
var BANDIT_WIN = '盜墓者的短斧脫手飛出，他跪倒在石階上。';
var BANDIT_FLEE = '你退回走廊，盜墓者沒有追來，只在石階口啐了一口。';

function reachBanditFront() {
  var engine = new T.Engine(adventure, { seed: 11 });
  engine.start(0);
  choose(engine, 'rush');
  choose(engine, 'sneak');
  succeedCheck(engine);
  choose(engine, 'ignore');
  choose(engine, 'climb');
  succeedCheck(engine);
  assert.strictEqual(engine.sceneId, 'f1_bandit_front');
  return engine;
}

test('combat win and flee narration uses the four authored lines', function () {
  var byId = {};
  adventure.scenes.forEach(function (sc) { byId[sc.id] = sc; });
  var ratsFight = byId.f1_foyer.choices.filter(function (c) { return c.id === 'fight'; })[0];
  var banditFight = byId.f1_bandit_front.choices.filter(function (c) { return c.id === 'fight'; })[0];
  assert.strictEqual(ratsFight.to, 'f1_rats');
  assert.strictEqual(ratsFight.winText, RATS_WIN);
  assert.strictEqual(ratsFight.fleeText, RATS_FLEE);
  assert.strictEqual(banditFight.to, 'f1_bandit');
  assert.strictEqual(banditFight.winText, BANDIT_WIN);
  assert.strictEqual(banditFight.fleeText, BANDIT_FLEE);

  var ratsWin = new T.Engine(adventure, { seed: 21 });
  ratsWin.start(0);
  choose(ratsWin, 'rush');
  choose(ratsWin, 'fight');
  assert.strictEqual(ratsWin.sceneId, 'f1_rats');
  assert.strictEqual(ratsWin.encounter.outcomeNarr.winText, RATS_WIN);
  winCombat(ratsWin);
  assert.strictEqual(ratsWin.sceneId, 'f1_rats_after');
  assert.strictEqual(ratsWin.clearedCombats.f1_rats, true);
  var ratsWinEv = ratsWin.events.filter(function (e) { return e.t === 'combat_win'; })[0];
  assert.strictEqual(ratsWinEv.narr, RATS_WIN);
  var ratsWinLog = playerLog(ratsWin.events);
  assert.strictEqual(countLine(ratsWinLog, RATS_WIN), 1);
  assert.strictEqual(countLine(ratsWinLog, RATS_FLEE), 0);
  assert.ok(ratsWin.scene.facts.indexOf(RATS_WIN) < 0);

  var ratsFlee = new T.Engine(adventure, { seed: 22 });
  ratsFlee.start(0);
  choose(ratsFlee, 'rush');
  choose(ratsFlee, 'fight');
  var ratsFled = ratsFlee.perform({ type: 'flee' });
  assert.strictEqual(ratsFled.ok, true);
  assert.strictEqual(ratsFlee.sceneId, 'f1_gate');
  assert.ok(!ratsFlee.clearedCombats.f1_rats);
  var ratsFleeEv = ratsFled.events.filter(function (e) { return e.t === 'flee'; })[0];
  assert.strictEqual(ratsFleeEv.escaped, true);
  assert.strictEqual(ratsFleeEv.narr, RATS_FLEE);
  var ratsFleeLog = playerLog(ratsFled.events);
  assert.strictEqual(countLine(ratsFleeLog, RATS_FLEE), 1);
  assert.strictEqual(countLine(ratsFleeLog, RATS_WIN), 0);

  var banditWin = reachBanditFront();
  choose(banditWin, 'fight');
  assert.strictEqual(banditWin.sceneId, 'f1_bandit');
  winCombat(banditWin);
  assert.strictEqual(banditWin.sceneId, 'f1_bandit_after');
  assert.strictEqual(banditWin.clearedCombats.f1_bandit, true);
  var banditWinEv = banditWin.events.filter(function (e) { return e.t === 'combat_win'; })[0];
  assert.strictEqual(banditWinEv.narr, BANDIT_WIN);
  var banditWinLog = playerLog(banditWin.events);
  assert.strictEqual(countLine(banditWinLog, BANDIT_WIN), 1);
  assert.strictEqual(countLine(banditWinLog, BANDIT_FLEE), 0);

  var banditFlee = reachBanditFront();
  choose(banditFlee, 'fight');
  var banditFled = banditFlee.perform({ type: 'flee' });
  assert.strictEqual(banditFled.ok, true);
  assert.strictEqual(banditFlee.sceneId, 'f1_hall');
  assert.ok(!banditFlee.clearedCombats.f1_bandit);
  var banditFleeEv = banditFled.events.filter(function (e) { return e.t === 'flee'; })[0];
  assert.strictEqual(banditFleeEv.narr, BANDIT_FLEE);
  var banditFleeLog = playerLog(banditFled.events);
  assert.strictEqual(countLine(banditFleeLog, BANDIT_FLEE), 1);
  assert.strictEqual(countLine(banditFleeLog, BANDIT_WIN), 0);

  var saved = new T.Engine(adventure, { seed: 23 });
  saved.start(0);
  choose(saved, 'rush');
  choose(saved, 'fight');
  var slot = saved.exportSave();
  assert.strictEqual(slot.encounter.outcomeNarr.winText, RATS_WIN);
  assert.strictEqual(slot.encounter.outcomeNarr.fleeText, RATS_FLEE);
  var loaded = new T.Engine(adventure, { seed: 23 });
  var applied = loaded.applySave(slot);
  assert.strictEqual(applied.ok, true, applied.error);
  var loadedFlee = loaded.perform({ type: 'flee' });
  assert.strictEqual(loadedFlee.events.filter(function (e) { return e.t === 'flee'; })[0].narr, RATS_FLEE);
  assert.strictEqual(countLine(playerLog(loadedFlee.events), RATS_FLEE), 1);
});

test('combat narration is absent unless the opening choice wrote it', function () {
  assert.deepStrictEqual(
    narrator.Mechanics.format({ t: 'combat_win', reason: 'defeat' }).map(function (l) { return l.text; }),
    ['〔戰鬥〕敵人全部倒下。']
  );
  assert.deepStrictEqual(
    narrator.Mechanics.format({ t: 'combat_win', reason: 'yield' }).map(function (l) { return l.text; }),
    ['〔戰鬥〕敵人棄戰，這一場算贏。']
  );
  assert.deepStrictEqual(
    narrator.Mechanics.format({ t: 'flee', escaped: true }).map(function (l) { return l.text; }),
    ['〔行動〕逃走']
  );
  assert.deepStrictEqual(
    narrator.Mechanics.format({ t: 'flee', escaped: false }).map(function (l) { return l.text; }),
    ['〔行動〕逃走　—　這裡沒有退路']
  );

  var direct = new T.Engine(adventure, { seed: 24 });
  direct.start(0);
  direct.enterScene('f1_rats');
  assert.ok(!direct.encounter.outcomeNarr);
  var directFlee = direct.perform({ type: 'flee' });
  var directFleeEv = directFlee.events.filter(function (e) { return e.t === 'flee'; })[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(directFleeEv, 'narr'));
  assert.strictEqual(countLine(playerLog(directFlee.events), RATS_FLEE), 0);
  assert.strictEqual(countLine(playerLog(directFlee.events), RATS_WIN), 0);

  var slipped = new T.Engine(adventure, { seed: 25 });
  slipped.start(0);
  choose(slipped, 'rush');
  choose(slipped, 'sneak');
  failCheck(slipped);
  assert.strictEqual(slipped.sceneId, 'f1_rats');
  assert.ok(!slipped.encounter.outcomeNarr);
  winCombat(slipped);
  assert.strictEqual(slipped.sceneId, 'f1_rats_after');
  var slippedWin = slipped.events.filter(function (e) { return e.t === 'combat_win'; })[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(slippedWin, 'narr'));
  assert.strictEqual(countLine(playerLog(slipped.events), RATS_WIN), 0);

  var bones = new T.Engine(adventure, { seed: 26 });
  bones.start(0);
  bones.enterScene('f2_bones');
  assert.ok(!bones.encounter.outcomeNarr);
  var bonesFlee = bones.perform({ type: 'flee' });
  assert.ok(!Object.prototype.hasOwnProperty.call(
    bonesFlee.events.filter(function (e) { return e.t === 'flee'; })[0], 'narr'
  ));
  [RATS_WIN, RATS_FLEE, BANDIT_WIN, BANDIT_FLEE].forEach(function (line) {
    assert.strictEqual(countLine(playerLog(bonesFlee.events), line), 0);
  });

  var story = {
    id: 'narr-fixture',
    title: '測試',
    start: 'camp',
    items: [],
    pregens: [pregen('甲', '戰士')],
    scenes: [
      {
        id: 'camp',
        type: 'beat',
        facts: ['營地。'],
        choices: [
          { id: 'fight', label: '迎戰', to: 'brawl' },
          { id: 'noted', label: '記下', to: 'noted' }
        ]
      },
      {
        id: 'brawl',
        type: 'combat',
        facts: ['有人擋路。'],
        enemies: [{ name: '靶', ac: 10, hp: 4, atk: 0, damage: '1d4' }],
        win_to: 'after',
        flee_to: 'camp'
      },
      { id: 'after', type: 'beat', facts: ['結束。'], choices: [{ id: 'stay', label: '留下', to: 'after' }] },
      {
        id: 'noted',
        type: 'combat',
        facts: ['另一場。'],
        enemies: [{ name: '靶', ac: 10, hp: 4, atk: 0, damage: '1d4' }],
        win_to: 'after',
        flee_to: 'camp'
      }
    ]
  };
  var plain = new T.Engine(story, { seed: 1 });
  plain.start(0);
  choose(plain, 'fight');
  assert.ok(!plain.encounter.outcomeNarr);
  heroFirst(plain);
  plain.rng = seqRng([15, 6]);
  var plainWin = plain.perform({ type: 'attack', target: 0 });
  assert.strictEqual(plainWin.ok, true, plainWin.error);
  assert.strictEqual(plain.sceneId, 'after');
  var plainEv = plainWin.events.filter(function (e) { return e.t === 'combat_win'; })[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(plainEv, 'narr'));
  assert.deepStrictEqual(
    narrator.Mechanics.format(plainEv).map(function (l) { return l.text; }),
    ['〔戰鬥〕敵人全部倒下。']
  );

  var again = new T.Engine(story, { seed: 1 });
  again.start(0);
  choose(again, 'fight');
  var againFlee = again.perform({ type: 'flee' });
  var againEv = againFlee.events.filter(function (e) { return e.t === 'flee'; })[0];
  assert.ok(!Object.prototype.hasOwnProperty.call(againEv, 'narr'));
  assert.deepStrictEqual(
    narrator.Mechanics.format(againEv).map(function (l) { return l.text; }),
    ['〔行動〕逃走']
  );

  story.scenes[0].choices[0].winText = '靶倒下了。';
  story.scenes[0].choices[0].fleeText = '你退回營地。';
  var authored = new T.Engine(story, { seed: 2 });
  authored.start(0);
  choose(authored, 'fight');
  var authoredFlee = authored.perform({ type: 'flee' });
  assert.strictEqual(authoredFlee.events.filter(function (e) { return e.t === 'flee'; })[0].narr, '你退回營地。');
  assert.strictEqual(countLine(playerLog(authoredFlee.events), '你退回營地。'), 1);
  assert.strictEqual(countLine(playerLog(authoredFlee.events), '靶倒下了。'), 0);
  choose(authored, 'fight');
  heroFirst(authored);
  authored.rng = seqRng([15, 6]);
  var authoredWin = authored.perform({ type: 'attack', target: 0 });
  assert.strictEqual(authoredWin.events.filter(function (e) { return e.t === 'combat_win'; })[0].narr, '靶倒下了。');
  assert.strictEqual(countLine(playerLog(authoredWin.events), '靶倒下了。'), 1);

  var misplaced = JSON.parse(JSON.stringify(story));
  misplaced.scenes[2].choices[0].winText = '不該寫在這裡。';
  var bad = T.validateAdventure(misplaced);
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.errors.some(function (e) { return e.indexOf('winText') >= 0 && e.indexOf('戰鬥') >= 0; }));
  var empty = JSON.parse(JSON.stringify(story));
  empty.scenes[0].choices[0].fleeText = '';
  var emptyReport = T.validateAdventure(empty);
  assert.strictEqual(emptyReport.ok, false);
  assert.ok(emptyReport.errors.some(function (e) { return e.indexOf('fleeText') >= 0; }));
});

test('root index.html is untouched and the hidden ending still needs eight fights', function () {
  var mainHtml = require('child_process').execSync('git show main:index.html', { encoding: 'utf8' });
  var rootHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.strictEqual(rootHtml, mainHtml);
  assert.deepStrictEqual(adventure.meta.required_for_secret, [
    'f1_rats', 'f1_bandit', 'f2_bones', 'f2_ooze', 'f3_cult', 'f3_wight', 'hide_vault', 'hide_crypt'
  ]);
  assert.strictEqual(adventure.meta.required_for_secret.length, 8);
  var secret = adventure.scenes.filter(function (sc) { return sc.id === 'secret_win'; })[0];
  assert.deepStrictEqual(secret.when, { all_flags: ['secret_ready'] });
  assert.deepStrictEqual(T.previewStorageKeys().slice().sort(), [
    'wasted-tower-preview-probe',
    'wasted-tower-preview-save'
  ]);
});

function diceStory(mode) {
  var check = {
    id: 'roll', type: 'check', facts: ['擲。'], skill: 'athletics', dc: 10,
    success_to: 'end', fail_to: 'end'
  };
  if (mode === 'advantage') check.advantage = { stat_min: { str: 1 } };
  if (mode === 'disadvantage') check.disadvantage = { stat_min: { str: 1 } };
  return {
    id: 'dice_box', title: '骰', start: 'go', items: [],
    pregens: [pregen('甲', '戰士')],
    scenes: [
      { id: 'go', type: 'beat', facts: ['起。'], choices: [{ id: 'on', label: '上', to: 'roll' }] },
      check,
      { id: 'end', type: 'end', end: 'win', name: '完', facts: ['完。'] }
    ]
  };
}

function rollFaces(save) {
  return (save.rollLog || []).filter(function (row) { return row && row.roll; }).map(function (row) { return row.roll; });
}

test('dice animation reads a roll already stored in the save', function () {
  var story = diceStory('advantage');
  var report = T.validateAdventure(story, { walk: false });
  assert.strictEqual(report.ok, true, report.errors.join('\n'));
  var eng = new T.Engine(story, { seed: 1 });
  eng.start(0);
  choose(eng, 'on');
  eng.rng = seqRng([7, 16]);
  var beforeHook = 0;
  var result = eng.perform({ type: 'roll' });
  assert.strictEqual(result.ok, true, result.error);
  assert.strictEqual(beforeHook, 0);
  var ev = result.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.deepStrictEqual(ev.dice, [7, 16]);
  assert.strictEqual(ev.d20, 16);
  assert.strictEqual(ev.mode, 'advantage');
  var line = narrator.Mechanics.rollLines(ev).join('\n');
  assert.ok(line.indexOf('優勢：擲出 7 和 16，取 16') >= 0, line);
  assert.ok(line.indexOf('總數 ' + ev.total) >= 0, line);
  assert.ok(line.indexOf(ev.success ? '成功' : '失敗') >= 0, line);

  var slot = new T.SaveSlot(memoryStorage());
  var hooked = false;
  var rolledAt = eng.rng.rolled();
  Dice.present(eng, result.events, {
    writeSave: function (save) {
      assert.ok(save && rollFaces(save).length >= 1);
      var stored = rollFaces(save).pop();
      assert.deepStrictEqual(stored.dice, [7, 16]);
      assert.strictEqual(stored.d20, 16);
      assert.strictEqual(stored.mode, 'advantage');
      assert.strictEqual(stored.side, 'player');
      assert.strictEqual(slot.write(T.encodeSaveCode(save)).ok, true);
    },
    animate: function (records, save) {
      hooked = true;
      beforeHook += 1;
      assert.strictEqual(beforeHook, 1);
      assert.deepStrictEqual(records[0].dice, [7, 16]);
      assert.strictEqual(records[0].d20, 16);
      var loaded = T.loadGame(story, slot.read());
      assert.strictEqual(loaded.ok, true, loaded.error);
      var again = rollFaces(loaded.engine.exportSave()).pop();
      assert.deepStrictEqual(again, rollFaces(save).pop());
      assert.deepStrictEqual(again.dice, [7, 16]);
      assert.strictEqual(again.d20, 16);
      assert.strictEqual(again.mode, 'advantage');
      assert.strictEqual(eng.rng.rolled(), rolledAt);
      var shown = Dice.createAnimation(records[0]).skip();
      assert.deepStrictEqual(shown.faces, records[0].dice);
      assert.strictEqual(shown.kept, records[0].d20);
    }
  });
  assert.strictEqual(hooked, true);
  assert.strictEqual(eng.rng.rolled(), rolledAt);

  var plainStory = diceStory('normal');
  var plain = new T.Engine(plainStory, { seed: 2 });
  plain.start(0);
  choose(plain, 'on');
  plain.rng = seqRng([11]);
  var plainRes = plain.perform({ type: 'roll' });
  var plainEv = plainRes.events.filter(function (e) { return e.t === 'check'; })[0];
  assert.deepStrictEqual(plainEv.dice, [11]);
  assert.strictEqual(plainEv.d20, 11);
  assert.strictEqual(plainEv.mode, 'normal');
  var plainShown = null;
  Dice.present(plain, plainRes.events, {
    animate: function (records, save) {
      plainShown = records[0];
      var loaded = T.loadGame(plainStory, T.encodeSaveCode(save));
      assert.strictEqual(loaded.ok, true, loaded.error);
      assert.deepStrictEqual(rollFaces(loaded.engine.exportSave()).pop().dice, [11]);
      assert.strictEqual(rollFaces(loaded.engine.exportSave()).pop().d20, 11);
    }
  });
  var single = Dice.createAnimation(plainShown);
  assert.strictEqual(single.duration, 1000);
  var singleMid = single.tick(400);
  assert.strictEqual(singleMid.phase, 'spinning');
  assert.notDeepStrictEqual(singleMid.faces, [11]);
  assert.strictEqual(singleMid.kept, null);
  var singleEnd = single.tick(600);
  assert.strictEqual(singleEnd.phase, 'result');
  assert.deepStrictEqual(singleEnd.faces, [11]);
  assert.deepStrictEqual(singleEnd.text, ['11']);
  assert.strictEqual(singleEnd.kept, 11);
  assert.strictEqual(singleEnd.enlarged, true);
  assert.strictEqual(singleEnd.highlightKept, false);

  var adv = Dice.createAnimation({ kind: 'check', side: 'player', d20: 16, dice: [7, 16], mode: 'advantage' });
  assert.strictEqual(adv.duration, Dice.PLAYER_MS);
  assert.strictEqual(Dice.PLAYER_MS, 1000);
  var mid = adv.tick(999);
  assert.strictEqual(mid.phase, 'spinning');
  assert.notDeepStrictEqual(mid.faces, [7, 16]);
  var advEnd = adv.tick(1);
  assert.strictEqual(advEnd.phase, 'result');
  assert.deepStrictEqual(advEnd.faces, [7, 16]);
  assert.deepStrictEqual(advEnd.text, ['7', '16']);
  assert.strictEqual(advEnd.kept, 16);
  assert.strictEqual(advEnd.highlightKept, true);
  assert.deepStrictEqual(advEnd.keptFlags, [false, true]);

  var foe = Dice.createAnimation({ kind: 'enemy_attack', side: 'enemy', d20: 4, dice: [9, 4], mode: 'disadvantage' });
  assert.strictEqual(foe.duration, Dice.ENEMY_MS);
  assert.strictEqual(Dice.ENEMY_MS, 500);
  assert.strictEqual(foe.tick(499).phase, 'spinning');
  var foeEnd = foe.tick(1);
  assert.deepStrictEqual(foeEnd.faces, [9, 4]);
  assert.strictEqual(foeEnd.kept, 4);
  assert.deepStrictEqual(foeEnd.keptFlags, [false, true]);
  assert.strictEqual(foeEnd.highlightKept, true);

  var reduced = Dice.createAnimation(
    { kind: 'check', side: 'player', d20: 16, dice: [7, 16], mode: 'advantage' },
    { reducedMotion: true }
  );
  assert.strictEqual(reduced.duration, 0);
  var reducedView = reduced.view();
  assert.strictEqual(reducedView.phase, 'result');
  assert.strictEqual(reducedView.elapsed, 0);
  assert.strictEqual(reducedView.duration, 0);
  assert.deepStrictEqual(reducedView.faces, [7, 16]);
  assert.strictEqual(reducedView.kept, 16);
  assert.strictEqual(Dice.prefersReducedMotion(function () { return true; }), true);
  var reducedCalls = 0;
  var reducedPlay = Dice.play(null, [plainShown], {
    reducedMotion: true,
    onDone: function () { reducedCalls += 1; }
  });
  assert.strictEqual(reducedCalls, 1);
  assert.strictEqual(reducedPlay.duration, 0);

  var skipAnim = Dice.createAnimation({ kind: 'check', side: 'player', d20: 16, dice: [7, 16], mode: 'advantage' });
  var skipped = skipAnim.skip();
  assert.strictEqual(skipped.skipped, true);
  assert.strictEqual(skipped.phase, 'result');
  assert.strictEqual(skipped.elapsed, 0);
  assert.deepStrictEqual(skipped.faces, [7, 16]);
  assert.strictEqual(skipped.kept, 16);
  assert.deepStrictEqual(skipped.text, ['7', '16']);

  var fighter = new T.Engine(adventure, { seed: 44 });
  fighter.start(0);
  fighter.enterScene('f1_bandit');
  heroFirst(fighter);
  fighter.encounter.enemies[0].hp = 80;
  fighter.encounter.enemies[0].ac = 30;
  fighter.character.ac = 25;
  var countBefore = fighter.rng.rolled();
  var swing = fighter.perform({ type: 'attack', target: 0 });
  assert.strictEqual(swing.ok, true, swing.error);
  assert.ok(fighter.rng.rolled() > countBefore);
  var evAttack = swing.events.filter(function (e) { return e.t === 'attack' && e.d20 != null; })[0];
  var evEnemy = swing.events.filter(function (e) { return e.t === 'enemy_attack'; })[0];
  assert.ok(evAttack, 'player attack roll');
  assert.ok(evEnemy, 'enemy attack roll');
  var sawCombat = false;
  Dice.present(fighter, swing.events, {
    animate: function (records, save) {
      sawCombat = true;
      assert.strictEqual(records[0].side, 'player');
      assert.strictEqual(records[0].d20, evAttack.d20);
      assert.deepStrictEqual(records[0].dice, evAttack.dice.slice());
      var enemyRec = records.filter(function (r) { return r.side === 'enemy'; })[0];
      assert.ok(enemyRec);
      assert.strictEqual(enemyRec.d20, evEnemy.d20);
      assert.deepStrictEqual(enemyRec.dice, evEnemy.dice.slice());
      assert.strictEqual(Dice.createAnimation(records[0]).duration, 1000);
      assert.strictEqual(Dice.createAnimation(enemyRec).duration, 500);
      var playerShow = Dice.createAnimation(records[0]);
      playerShow.tick(playerShow.duration);
      assert.deepStrictEqual(playerShow.view().faces, records[0].dice);
      assert.strictEqual(playerShow.view().kept, records[0].d20);
      var enemyShow = Dice.createAnimation(enemyRec).skip();
      assert.deepStrictEqual(enemyShow.faces, enemyRec.dice);
      assert.strictEqual(enemyShow.kept, enemyRec.d20);
      var loaded = T.loadGame(adventure, T.encodeSaveCode(save));
      assert.strictEqual(loaded.ok, true, loaded.error);
      var back = rollFaces(loaded.engine.exportSave());
      var backEnemy = back.filter(function (r) { return r.side === 'enemy'; }).pop();
      assert.strictEqual(backEnemy.d20, evEnemy.d20);
      assert.deepStrictEqual(backEnemy.dice, evEnemy.dice.slice());
    }
  });
  assert.strictEqual(sawCombat, true);

  var engineSrc = fs.readFileSync(path.join(__dirname, 'preview/js/engine.js'), 'utf8');
  assert.ok(engineSrc.indexOf('DiceAnim') < 0);
  assert.ok(engineSrc.indexOf('requestAnimationFrame') < 0);
  var diceSrc = fs.readFileSync(path.join(__dirname, 'preview/js/dice.js'), 'utf8');
  assert.ok(diceSrc.indexOf('rollD20') < 0);
});

test('dice playback adds no audio, leaves root index.html, and still needs eight fights', function () {
  var files = [
    'index.html', 'preview/index.html', 'preview/js/engine.js', 'preview/js/narrator.js',
    'preview/js/ui.js', 'preview/js/dice.js'
  ];
  files.forEach(function (rel) {
    var text = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.ok(!/<audio\b/i.test(text), rel);
    assert.ok(!/\bnew\s+Audio\b/.test(text), rel);
    assert.ok(!/\bAudioContext\b/.test(text), rel);
    assert.ok(!/\bwebkitAudioContext\b/.test(text), rel);
    assert.ok(!/\bHTMLAudioElement\b/.test(text), rel);
    assert.ok(!/\bspeechSynthesis\b/.test(text), rel);
  });
  var mainHtml = require('child_process').execSync('git show main:index.html', { encoding: 'utf8' });
  var rootHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.strictEqual(rootHtml, mainHtml);
  assert.ok(rootHtml.indexOf('dice.js') < 0);
  assert.ok(rootHtml.indexOf('dice-overlay') < 0);
  var previewHtml = fs.readFileSync(path.join(__dirname, 'preview/index.html'), 'utf8');
  assert.ok(previewHtml.indexOf('js/dice.js') >= 0);
  assert.strictEqual(adventure.meta.required_for_secret.length, 8);
  var byId = {};
  adventure.scenes.forEach(function (sc) { byId[sc.id] = sc; });
  adventure.meta.required_for_secret.forEach(function (id) {
    assert.strictEqual(byId[id].type, 'combat', id);
    assert.ok(byId[id].omit_from_tally !== true, id);
  });
  assert.deepStrictEqual(byId.secret_win.when, { all_flags: ['secret_ready'] });
});

function sheetMoves(eng) {
  var out = {};
  eng.moveSheet().groups.forEach(function (g) {
    out[g.id] = g.moves.map(function (m) { return m.id; });
  });
  return out;
}
function findSheetMove(eng, id) {
  var found = null;
  eng.moveSheet().groups.forEach(function (g) {
    g.moves.forEach(function (m) { if (m.id === id) found = m; });
  });
  return found;
}
function fakeDocument() {
  function node(tag) {
    return {
      tag: tag, className: '', textContent: '', children: [], attrs: {}, listeners: {},
      appendChild: function (child) { this.children.push(child); return child; },
      setAttribute: function (key, value) { this.attrs[key] = String(value); },
      addEventListener: function (name, fn) { this.listeners[name] = fn; }
    };
  }
  return {
    createElement: function (tag) { var n = node(tag); n.tag = tag; return n; },
    createTextNode: function (text) { return { text: String(text), children: [] }; }
  };
}
function collectText(node, out) {
  out = out || [];
  if (node.text) out.push(node.text);
  if (node.textContent) out.push(node.textContent);
  (node.children || []).forEach(function (child) { collectText(child, out); });
  return out;
}
function collectButtons(node, out) {
  out = out || [];
  if (node.tag === 'button' && node.attrs && node.attrs['data-move']) out.push(node);
  (node.children || []).forEach(function (child) { collectButtons(child, out); });
  return out;
}

test('move groups render the right moves, uses, saves, temp HP, and extra attacks', function () {
  var expect = {
    '戰士': { everyday: ['longsword'], big: ['power_strike'], rescue: ['second_wind', 'defend'] },
    '遊俠': { everyday: ['longbow'], big: ['net', 'aimed_shot', 'hunters_mark'], rescue: ['cure_wounds', 'defend'] },
    '盜賊': { everyday: ['shortsword', 'two_weapon'], big: ['shadow_attack'], rescue: ['uncanny_dodge', 'defend'] },
    '牧師': {
      everyday: ['mace', 'sacred_flame'],
      big: ['guiding_bolt', 'command'],
      rescue: ['cure_wounds', 'healing_word', 'defend'],
      passive: ['divine_strike']
    },
    '法師': {
      everyday: ['fire_bolt'],
      big: ['magic_missile', 'burning_hands', 'arcane_recovery'],
      rescue: ['shield', 'false_life', 'defend']
    }
  };
  adventure.pregens.forEach(function (p, i) {
    var eng = new T.Engine(adventure, { seed: 3 });
    eng.start(i);
    eng.enterScene('f1_rats');
    heroFirst(eng);
    var groups = sheetMoves(eng);
    assert.deepStrictEqual(groups, expect[p['class']], p['class']);
    eng.moveSheet().groups.forEach(function (g) {
      assert.ok(g.moves.length >= 1, p['class'] + ' ' + g.id);
      g.moves.forEach(function (m) {
        assert.ok(Array.from(m.summary).length <= 14, m.id + ' ' + m.summary);
        assert.ok(m.detail, m.id);
      });
    });
    var sheet = eng.moveSheet();
    sheet.groups.forEach(function (g) { g.open = true; });
    var parent = { children: [], appendChild: function (c) { this.children.push(c); return c; } };
    T.renderMoveGroups(fakeDocument(), parent, sheet, {});
    var labels = collectText(parent);
    p.features.forEach(function (f) {
      assert.ok(labels.indexOf(f.name) >= 0, f.name);
      assert.ok(labels.indexOf(f.summary) >= 0, f.summary);
    });
    assert.ok(labels.indexOf('防守') >= 0);
    assert.ok(labels.indexOf('敵人攻擊你有劣勢') >= 0);
  });

  var fighter = new T.Engine(adventure, { seed: 4 });
  fighter.start(0);
  fighter.enterScene('f1_bandit');
  heroFirst(fighter);
  var power = fighter.character.features.filter(function (f) { return f.id === 'power_strike'; })[0];
  power.uses = 0;
  var spent = findSheetMove(fighter, 'power_strike');
  assert.strictEqual(spent.grey, true);
  assert.strictEqual(spent.usesLabel, '需休息');
  assert.strictEqual(spent.enabled, false);
  var open = fighter.moveSheet();
  open.groups.forEach(function (g) { g.open = g.id === 'big'; });
  var box = { children: [], appendChild: function (c) { this.children.push(c); return c; } };
  T.renderMoveGroups(fakeDocument(), box, open, {});
  var spentBtn = collectButtons(box).filter(function (b) { return b.attrs['data-move'] === 'power_strike'; })[0];
  assert.ok(spentBtn);
  assert.strictEqual(spentBtn.attrs['data-spent'], '1');
  assert.ok(spentBtn.className.indexOf('spent') >= 0);
  assert.ok(collectText(spentBtn).indexOf('需休息') >= 0);
  assert.ok(collectText(spentBtn).indexOf('破甲重擊') >= 0);

  ['cp_f1', 'cp_f2', 'cp_f3'].forEach(function (id) {
    var rest = new T.Engine(adventure, { seed: 5 });
    rest.start(0);
    rest.character.features.forEach(function (f) { if (f.id === 'power_strike') f.uses = 0; });
    rest.character.tempHp = 6;
    rest.enterScene(id);
    assert.strictEqual(rest.character.features.filter(function (f) { return f.id === 'power_strike'; })[0].uses, 2, id);
    assert.strictEqual(rest.character.tempHp, 0, id);
  });

  var mage = new T.Engine(adventure, { seed: 6 });
  mage.start(4);
  var slots = mage.character.pools.slots;
  slots.uses = 0;
  mage.character.features.forEach(function (f) { if (f.pool === 'slots') f.uses = 0; });
  var night = mage.character.features.filter(function (f) { return f.id === 'arcane_recovery'; })[0];
  night.uses = 0;
  mage.character.tempHp = 4;
  mage.enterScene('cp_f2');
  assert.strictEqual(mage.character.pools.slots.uses, 3);
  assert.strictEqual(mage.character.features.filter(function (f) { return f.id === 'arcane_recovery'; })[0].uses, 0);
  assert.strictEqual(mage.character.tempHp, 0);
  mage.character.pools.slots.uses = 1;
  mage.character.features.forEach(function (f) { if (f.pool === 'slots') f.uses = 1; });
  mage.character.tempHp = 5;
  mage.flags.respected_dead = true;
  mage.enterScene('f3_altar');
  var prayed = mage.perform({ type: 'choice', id: 'rest' });
  assert.strictEqual(prayed.ok, true, prayed.error);
  assert.strictEqual(mage.character.pools.slots.uses, 1);
  assert.strictEqual(mage.character.features.filter(function (f) { return f.id === 'arcane_recovery'; })[0].uses, 0);
  assert.strictEqual(mage.character.tempHp, 5);

  var cleric = new T.Engine(adventure, { seed: 7 });
  cleric.start(3);
  cleric.enterScene('f1_bandit');
  heroFirst(cleric);
  cleric.perform({ actor: 0, action: 'ambush', outcome: 'success' });
  cleric.encounter.enemies[0].yield = null;
  cleric.encounter.enemies[0].hp = 20;
  cleric.encounter.enemies[0].hp_max = 20;
  cleric.rng = seqRng([5, 8]);
  var flame = cleric.perform({ actor: 0, action: 'move', moveId: 'sacred_flame', target: 0 });
  assert.strictEqual(flame.ok, true, flame.error);
  var saved = flame.events.filter(function (e) { return e.t === 'save'; })[0];
  assert.strictEqual(saved.success, false);
  assert.strictEqual(saved.d20, 5);
  assert.strictEqual(saved.bonus, 0);
  assert.strictEqual(saved.dc, 13);
  assert.strictEqual(saved.amount, 8);
  assert.strictEqual(cleric.encounter.enemies[0].hp, 12);
  var line = narrator.Mechanics.rollLines(saved).join('\n');
  assert.ok(line.indexOf('d20 擲出 5') >= 0, line);
  assert.ok(line.indexOf('難度 13') >= 0, line);
  heroFirst(cleric);
  cleric.rng = seqRng([15]);
  var resisted = cleric.perform({ actor: 0, action: 'move', moveId: 'sacred_flame', target: 0 });
  assert.strictEqual(resisted.ok, true, resisted.error);
  var held = resisted.events.filter(function (e) { return e.t === 'save'; })[0];
  assert.strictEqual(held.success, true);
  assert.strictEqual(held.amount, 0);
  assert.strictEqual(cleric.encounter.enemies[0].hp, 12);
  assert.ok(!Object.prototype.hasOwnProperty.call(cleric.encounter.enemies[0], 'saves'));

  var burn = new T.Engine(adventure, { seed: 8 });
  burn.start(4);
  burn.enterScene('f1_rats');
  heroFirst(burn);
  burn.perform({ actor: 0, action: 'ambush', outcome: 'success' });
  burn.rng = seqRng([2, 2, 2, 10, 18, 4]);
  var hands = burn.perform({ actor: 0, action: 'move', moveId: 'burning_hands' });
  assert.strictEqual(hands.ok, true, hands.error);
  var saves = hands.events.filter(function (e) { return e.t === 'save'; });
  assert.strictEqual(saves.length, 3);
  assert.strictEqual(saves[0].success, false);
  assert.strictEqual(saves[0].amount, 6);
  assert.strictEqual(saves[1].success, true);
  assert.strictEqual(saves[1].amount, 3);
  assert.strictEqual(saves[1].damage.total, 6);
  assert.strictEqual(burn.character.pools.slots.uses, 2);
  var beforeDice = burn.rng.rolled();
  var animated = false;
  Dice.present(burn, hands.events, {
    animate: function (records) {
      animated = true;
      assert.strictEqual(records.length, 3);
      assert.strictEqual(records[0].d20, 10);
      assert.deepStrictEqual(records[0].dice, [10]);
      assert.strictEqual(records[1].d20, 18);
      var shown = Dice.createAnimation(records[1]).skip();
      assert.deepStrictEqual(shown.faces, [18]);
      assert.strictEqual(shown.kept, 18);
      assert.strictEqual(burn.rng.rolled(), beforeDice);
    }
  });
  assert.strictEqual(animated, true);
  assert.strictEqual(burn.rng.rolled(), beforeDice);

  var wiz = new T.Engine(adventure, { seed: 9 });
  wiz.start(4);
  wiz.character.hp = 8;
  wiz.rng = seqRng([4]);
  var life = wiz.perform({ type: 'move', moveId: 'false_life' });
  assert.strictEqual(life.ok, true, life.error);
  assert.strictEqual(wiz.character.tempHp, 8);
  assert.strictEqual(wiz.character.hp, 8);
  assert.strictEqual(wiz.character.pools.slots.uses, 2);
  wiz.rng = seqRng([1]);
  var again = wiz.perform({ type: 'move', moveId: 'false_life' });
  assert.strictEqual(again.ok, true, again.error);
  assert.strictEqual(wiz.character.tempHp, 8);
  wiz.enterScene('f1_bandit');
  wiz.character.tempHp = 3;
  wiz.character.hp = 8;
  wiz.rng = seqRng([17, 6]);
  wiz.runEnemyTurn(0);
  var swing = wiz.events.filter(function (e) { return e.t === 'enemy_attack'; })[0];
  assert.strictEqual(swing.tempAbsorbed, 3);
  assert.ok(wiz.character.hp < 8);
  assert.strictEqual(wiz.character.tempHp, 0);
  var hpAfter = wiz.character.hp;
  wiz.enterScene('cp_f1');
  assert.strictEqual(wiz.character.tempHp, 0);
  assert.strictEqual(wiz.character.hp, hpAfter);

  var rogue = new T.Engine(adventure, { seed: 10 });
  rogue.start(2);
  rogue.enterScene('f1_bandit');
  heroFirst(rogue);
  rogue.perform({ actor: 0, action: 'ambush', outcome: 'success' });
  rogue.encounter.enemies[0].yield = null;
  rogue.encounter.enemies[0].hp = 40;
  rogue.encounter.enemies[0].hp_max = 40;
  rogue.encounter.enemies[0].grantAdvantage = true;
  rogue.rng = seqRng([15, 4, 3, 2, 1, 12, 1]);
  var duo = rogue.perform({ actor: 0, action: 'move', moveId: 'two_weapon', target: 0 });
  assert.strictEqual(duo.ok, true, duo.error);
  var swings = duo.events.filter(function (e) { return e.t === 'attack'; });
  assert.strictEqual(swings.length, 2);
  assert.strictEqual(swings[0].attackName, '短劍');
  assert.strictEqual(swings[0].hit, true);
  assert.strictEqual(swings[0].mode, 'advantage');
  assert.ok(swings[0].damage.rolls.length >= 3);
  assert.strictEqual(swings[1].attackName, '匕首');
  assert.strictEqual(swings[1].hit, true);
  assert.strictEqual(swings[1].mode, 'normal');
  assert.deepStrictEqual(swings[1].damage.rolls, [1]);
  assert.strictEqual(swings[1].damage.total, 1);
  assert.strictEqual(rogue.character.sneakUsed, true);
  var pair = [];
  Dice.present(rogue, duo.events, {
    animate: function (records) {
      records.forEach(function (rec) { if (rec.side === 'player') pair.push(rec); });
    }
  });
  assert.strictEqual(pair.length, 2);
  assert.strictEqual(pair[0].d20, swings[0].d20);
  assert.strictEqual(Dice.createAnimation(pair[1]).skip().kept, swings[1].d20);

  var keep = new T.Engine(adventure, { seed: 11 });
  keep.start(4);
  keep.character.tempHp = 6;
  keep.character.pools.slots.uses = 1;
  keep.character.features.forEach(function (f) {
    if (f.pool === 'slots') f.uses = 1;
    if (f.id === 'arcane_recovery') f.uses = 0;
  });
  var loaded = T.loadGame(adventure, T.encodeSaveCode(keep.exportSave()));
  assert.strictEqual(loaded.ok, true, loaded.error);
  assert.strictEqual(loaded.engine.character.tempHp, 6);
  assert.strictEqual(loaded.engine.character.pools.slots.uses, 1);
  assert.strictEqual(loaded.engine.character.features.filter(function (f) { return f.id === 'arcane_recovery'; })[0].uses, 0);
  assert.strictEqual(loaded.engine.exportSave().v, 8);

  var old = keep.exportSave();
  old.v = 4;
  delete old.character.tempHp;
  old.character.features = old.character.features.filter(function (f) { return f.id !== 'false_life' && f.id !== 'fire_bolt'; });
  var strikeLeft = old.character.features.filter(function (f) { return f.id === 'magic_missile'; })[0];
  strikeLeft.uses = 1;
  var migrated = T.loadGame(adventure, T.encodeSaveCode(old));
  assert.strictEqual(migrated.ok, true, migrated.error);
  assert.strictEqual(migrated.engine.exportSave().v, 8);
  assert.strictEqual(migrated.engine.character.tempHp, 0);
  assert.ok(migrated.engine.character.features.some(function (f) { return f.id === 'false_life'; }));
  assert.ok(migrated.engine.character.features.some(function (f) { return f.id === 'fire_bolt'; }));
  assert.strictEqual(migrated.engine.character.pools.slots.uses, 1);
  assert.strictEqual(migrated.engine.character.features.filter(function (f) { return f.id === 'arcane_recovery'; })[0].uses, 0);

  var shield = adventure.pregens[4].features.filter(function (f) { return f.id === 'shield'; })[0];
  assert.strictEqual(shield.timing, 'reaction');
  assert.strictEqual(shield.costs_turn, false);
  adventure.pregens.forEach(function (p) {
    p.features.forEach(function (f) {
      if (f.id === 'net') assert.strictEqual(f.status, 'restrained');
      else if (f.id === 'command') assert.strictEqual(f.status, 'prone');
      else assert.ok(!f.status && !f.condition, f.id);
      var blob = JSON.stringify(f);
      ['poisoned', 'charmed', 'frightened', 'unconscious', 'sleep', 'blinded', '中毒', '魅惑', '昏睡', '目盲'].forEach(function (word) {
        assert.ok(blob.indexOf(word) < 0, f.id + ' ' + word);
      });
      if (f.id !== 'net' && f.id !== 'command') {
        ['prone', 'restrained', '倒地', '束縛'].forEach(function (word) {
          assert.ok(blob.indexOf(word) < 0, f.id + ' ' + word);
        });
      }
    });
    assert.ok(!p.features.some(function (f) { return f.id === 'action_surge' || f.id === 'defense'; }));
  });
  adventure.scenes.forEach(function (sc) {
    (sc.enemies || []).forEach(function (e) {
      assert.ok(!Object.prototype.hasOwnProperty.call(e, 'saves'), sc.id);
    });
  });
  assert.strictEqual(adventure.meta.required_for_secret.length, 8);
});

test('outside-combat potions are skipped when they would restore only 1 or 2 points', function () {
  assert.strictEqual(outsideHealWorthPotion(8, 8, 9), false);
  assert.strictEqual(outsideHealWorthPotion(8, 7, 9), false);
  assert.strictEqual(outsideHealWorthPotion(8, 6, 9), true);
  assert.strictEqual(outsideHealWorthPotion(8, 5, 9), true);
  assert.strictEqual(outsideHealWorthPotion(8, 1, 9), true);
  assert.strictEqual(outsideHealWorthPotion(8, 9, 9), false);
  assert.strictEqual(outsideHealWorthPotion(10, 7, 9), false);
  assert.strictEqual(outsideHealWorthPotion(10, 6, 9), true);
});

test('shield reacts only when +5 turns a hit into a miss', function () {
  var SHIELD_LINE = '護盾術擋下攻擊（用去一個法術位）';
  function wizard() {
    var eng = new T.Engine(adventure, { seed: 31 });
    eng.start(4);
    eng.enterScene('f1_rats');
    return eng;
  }
  function reactions(events) {
    return (events || []).filter(function (e) { return e.t === 'reaction' && e.featureId === 'shield'; });
  }
  function swing(eng, face, damage) {
    eng.events = [];
    eng.rng = seqRng([face].concat(damage || []));
    eng.runEnemyTurn(0);
    return eng.events;
  }
  function attackOf(events) {
    return events.filter(function (e) { return e.t === 'enemy_attack'; })[0];
  }

  var miss = wizard();
  var ev = swing(miss, 12);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, false);
  assert.strictEqual(attackOf(ev).ac, 15);
  assert.strictEqual(miss.character.pools.slots.uses, 3);
  assert.strictEqual(miss.effectiveAc(), 15);
  ev = swing(miss, 1);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, false);
  assert.strictEqual(miss.character.pools.slots.uses, 3);

  var fire = wizard();
  ev = swing(fire, 13);
  assert.strictEqual(reactions(ev).length, 1);
  assert.strictEqual(reactions(ev)[0].narr, SHIELD_LINE);
  assert.strictEqual(attackOf(ev).hit, false);
  assert.strictEqual(attackOf(ev).ac, 20);
  assert.strictEqual(fire.effectiveAc(), 20);
  assert.strictEqual(fire.character.acBonus, 5);
  assert.strictEqual(fire.character.reactionUsed, true);
  assert.strictEqual(fire.character.pools.slots.uses, 2);
  assert.strictEqual(fire.character.features.filter(function (f) { return f.id === 'magic_missile'; })[0].uses, 2);
  assert.strictEqual(countLine(playerLog(ev), SHIELD_LINE), 1);
  assert.ok(playerLog(ev).join('\n').indexOf('側身') < 0);
  var high = wizard();
  ev = swing(high, 17);
  assert.strictEqual(reactions(ev).length, 1);
  assert.strictEqual(attackOf(ev).hit, false);
  assert.strictEqual(attackOf(ev).total, 19);
  assert.strictEqual(high.effectiveAc(), 20);

  var through = wizard();
  ev = swing(through, 18, [3]);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, true);
  assert.strictEqual(attackOf(ev).ac, 15);
  assert.strictEqual(through.character.pools.slots.uses, 3);
  assert.strictEqual(through.character.hp, 5);

  var crit = wizard();
  crit.character.ac = 18;
  ev = swing(crit, 20, [1, 1]);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, true);
  assert.strictEqual(attackOf(ev).crit, true);
  assert.strictEqual(attackOf(ev).total, 22);
  assert.ok(attackOf(ev).total < 18 + 3 + 5);
  assert.strictEqual(crit.character.pools.slots.uses, 3);
  assert.strictEqual(crit.effectiveAc(), 21);

  var empty = wizard();
  empty.character.pools.slots.uses = 0;
  empty.character.features.forEach(function (f) { if (f.pool === 'slots') f.uses = 0; });
  ev = swing(empty, 13, [2]);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, true);
  assert.strictEqual(empty.character.pools.slots.uses, 0);
  assert.strictEqual(empty.character.hp, 6);

  var spent = wizard();
  spent.character.reactionUsed = true;
  ev = swing(spent, 13, [2]);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, true);
  assert.strictEqual(spent.character.pools.slots.uses, 3);
  assert.strictEqual(spent.character.acBonus, 0);

  var later = wizard();
  ev = swing(later, 13);
  assert.strictEqual(later.character.pools.slots.uses, 2);
  ev = swing(later, 16);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, false);
  assert.strictEqual(attackOf(ev).ac, 20);
  assert.strictEqual(later.character.pools.slots.uses, 2);
  ev = swing(later, 18, [1]);
  assert.strictEqual(reactions(ev).length, 0);
  assert.strictEqual(attackOf(ev).hit, true);
  assert.strictEqual(attackOf(ev).ac, 20);
  assert.strictEqual(later.character.pools.slots.uses, 2);
  later.beginHeroTurn();
  assert.strictEqual(later.character.acBonus, 0);
  assert.strictEqual(later.character.reactionUsed, false);
  assert.strictEqual(later.effectiveAc(), 15);
  ev = swing(later, 13);
  assert.strictEqual(reactions(ev).length, 1);
  assert.strictEqual(later.character.pools.slots.uses, 1);
  assert.strictEqual(later.effectiveAc(), 20);

  var flow = wizard();
  heroFirst(flow);
  flow.encounter.enemies.forEach(function (e) {
    e.hp = 30;
    e.hp_max = 30;
    e.yield = null;
  });
  flow.rng = seqRng([1, 14, 16, 10]);
  var turned = flow.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(turned.ok, true, turned.error);
  var swings = turned.events.filter(function (e) { return e.t === 'enemy_attack'; });
  assert.strictEqual(swings.length, 3);
  assert.strictEqual(reactions(turned.events).length, 1);
  assert.strictEqual(swings[0].hit, false);
  assert.strictEqual(swings[0].ac, 20);
  assert.strictEqual(swings[1].hit, false);
  assert.strictEqual(swings[1].ac, 20);
  assert.strictEqual(swings[2].hit, false);
  assert.strictEqual(flow.effectiveAc(), 20);
  assert.strictEqual(flow.character.pools.slots.uses, 2);
  assert.strictEqual(flow.openTurn(), true);
  assert.strictEqual(flow.character.acBonus, 0);
  assert.strictEqual(flow.character.reactionUsed, false);
  assert.strictEqual(flow.effectiveAc(), 15);

  var menu = wizard();
  assert.ok(!menu.legalActions().some(function (a) { return a.featureId === 'shield'; }));
  var listed = findSheetMove(menu, 'shield');
  assert.strictEqual(listed.enabled, false);
  assert.strictEqual(listed.grey, true);
  assert.strictEqual(listed.reason, '攻擊將失時自動施放');
  assert.ok(listed.usesLabel.indexOf('●') >= 0);
  var manual = menu.perform({ type: 'use_feature', featureId: 'shield' });
  assert.strictEqual(manual.ok, false);
  assert.strictEqual(menu.character.pools.slots.uses, 3);

  function fromOld(version) {
    var src = wizard();
    src.character.pools.slots.uses = 2;
    src.character.features.forEach(function (f) { if (f.pool === 'slots') f.uses = 2; });
    var old = src.exportSave();
    old.v = version;
    delete old.character.reactionUsed;
    if (version < 5) delete old.character.tempHp;
    var row = old.character.features.filter(function (f) { return f.id === 'shield'; })[0];
    row.timing = 'ready';
    row.costs_turn = true;
    var loaded = T.loadGame(adventure, T.encodeSaveCode(old));
    assert.strictEqual(loaded.ok, true, loaded.error);
    assert.strictEqual(loaded.engine.exportSave().v, 8);
    assert.strictEqual(loaded.engine.character.pools.slots.uses, 2);
    assert.strictEqual(loaded.engine.character.reactionUsed, false);
    var feat = loaded.engine.character.features.filter(function (f) { return f.id === 'shield'; })[0];
    assert.strictEqual(feat.timing, 'reaction');
    assert.strictEqual(feat.costs_turn, false);
    loaded.engine.enterScene('f1_rats');
    var got = swing(loaded.engine, 13);
    assert.strictEqual(reactions(got).length, 1);
    assert.strictEqual(attackOf(got).hit, false);
    assert.strictEqual(attackOf(got).ac, 20);
    assert.strictEqual(loaded.engine.character.pools.slots.uses, 1);
    assert.strictEqual(countLine(playerLog(got), SHIELD_LINE), 1);
  }
  fromOld(5);
  fromOld(4);
});

test('mira divine strike adds 1d4 once per turn and old saves keep the passive', function () {
  var LINE = '錘上迸出聖光。';
  assert.ok(Array.from(LINE).length <= 14, LINE);
  var bolt = adventure.pregens[3].features.filter(function (f) { return f.id === 'guiding_bolt'; })[0];
  assert.strictEqual(bolt.damage_dice, '4d6');
  assert.strictEqual(bolt.damage_type, 'radiant');
  assert.ok(Array.from(bolt.summary).length <= 14, bolt.summary);

  function fresh() {
    var eng = new T.Engine(adventure, { seed: 21 });
    eng.start(3);
    eng.enterScene('f1_bandit');
    heroFirst(eng);
    eng.perform({ actor: 0, action: 'ambush', outcome: 'success' });
    var foe = eng.encounter.enemies[0];
    foe.yield = null;
    foe.hp = 80;
    foe.hp_max = 80;
    foe.ac = 13;
    return eng;
  }
  function attacks(events) {
    return (events || []).filter(function (e) { return e.t === 'attack'; });
  }

  var flameEng = fresh();
  flameEng.rng = seqRng([5, 6]);
  var flame = flameEng.perform({ actor: 0, action: 'move', moveId: 'sacred_flame', target: 0 });
  assert.strictEqual(flame.ok, true, flame.error);
  var saved = flame.events.filter(function (e) { return e.t === 'save'; })[0];
  assert.strictEqual(saved.amount, 6);
  assert.strictEqual(saved.damage.rolls.length, 1);
  assert.strictEqual(flameEng.character.divineStrikeUsed, false);
  assert.ok(!flame.events.some(function (e) { return e.t === 'passive'; }));
  assert.strictEqual(countLine(playerLog(flame.events), LINE), 0);

  var eng = fresh();
  var boltMove = eng.findMove(eng.character, 'guiding_bolt');
  var mace = eng.findMove(eng.character, 'mace');
  boltMove.costs_turn = false;
  mace.costs_turn = false;
  eng.rng = seqRng([12, 4, 3, 2, 1]);
  var guided = eng.perform({ actor: 0, action: 'move', moveId: 'guiding_bolt', target: 0 });
  assert.strictEqual(guided.ok, true, guided.error);
  var boltHit = attacks(guided.events)[0];
  assert.strictEqual(boltHit.hit, true);
  assert.strictEqual(boltHit.damage.spec, '4d6');
  assert.deepStrictEqual(boltHit.damage.rolls, [4, 3, 2, 1]);
  assert.strictEqual(boltHit.damage.total, 10);
  assert.strictEqual(eng.character.divineStrikeUsed, false);
  assert.strictEqual(countLine(playerLog(guided.events), LINE), 0);
  assert.strictEqual(eng.character.pools.channel.uses, 2);

  eng.rng = seqRng([8, 14, 4, 2]);
  var first = eng.perform({ actor: 0, action: 'move', moveId: 'mace', target: 0 });
  assert.strictEqual(first.ok, true, first.error);
  var firstHit = attacks(first.events)[0];
  assert.strictEqual(firstHit.hit, true);
  assert.strictEqual(firstHit.mode, 'advantage');
  assert.strictEqual(firstHit.damage.spec, '1d6+2 + 1d4');
  assert.deepStrictEqual(firstHit.damage.rolls, [4, 2]);
  assert.strictEqual(firstHit.damage.total, 8);
  assert.strictEqual(eng.character.divineStrikeUsed, true);
  assert.strictEqual(countLine(playerLog(first.events), LINE), 1);
  var passive = first.events.filter(function (e) { return e.t === 'passive'; })[0];
  assert.strictEqual(passive.passiveId, 'divine_strike');
  assert.ok(Array.from(passive.narr).length <= 14);

  eng.rng = seqRng([11, 2]);
  var second = eng.perform({ actor: 0, action: 'move', moveId: 'mace', target: 0 });
  assert.strictEqual(second.ok, true, second.error);
  var secondHit = attacks(second.events)[0];
  assert.strictEqual(secondHit.hit, true);
  assert.strictEqual(secondHit.mode, 'normal');
  assert.strictEqual(secondHit.damage.spec, '1d6+2');
  assert.deepStrictEqual(secondHit.damage.rolls, [2]);
  assert.strictEqual(secondHit.damage.total, 4);
  assert.strictEqual(eng.character.divineStrikeUsed, true);
  assert.strictEqual(countLine(playerLog(second.events), LINE), 0);

  var turn = fresh();
  var turnMace = turn.findMove(turn.character, 'mace');
  turnMace.costs_turn = false;
  turn.rng = seqRng([1]);
  var missed = turn.perform({ actor: 0, action: 'move', moveId: 'mace', target: 0 });
  assert.strictEqual(missed.ok, true, missed.error);
  assert.strictEqual(attacks(missed.events)[0].hit, false);
  assert.strictEqual(turn.character.divineStrikeUsed, false);
  assert.strictEqual(countLine(playerLog(missed.events), LINE), 0);
  turn.rng = seqRng([10, 4, 3]);
  var afterMiss = turn.perform({ actor: 0, action: 'move', moveId: 'mace', target: 0 });
  assert.strictEqual(afterMiss.ok, true, afterMiss.error);
  assert.strictEqual(attacks(afterMiss.events)[0].damage.spec, '1d6+2 + 1d4');
  assert.strictEqual(attacks(afterMiss.events)[0].damage.total, 9);
  turn.rng = seqRng([11, 2]);
  var sameTurn = turn.perform({ actor: 0, action: 'move', moveId: 'mace', target: 0 });
  assert.strictEqual(sameTurn.ok, true, sameTurn.error);
  assert.strictEqual(attacks(sameTurn.events)[0].damage.spec, '1d6+2');
  assert.strictEqual(attacks(sameTurn.events)[0].damage.total, 4);
  turnMace.costs_turn = true;
  var ended = turn.spendTurn();
  assert.strictEqual(ended.ok, true, ended.error);
  assert.strictEqual(turn.character.divineStrikeUsed, true);
  turnMace.costs_turn = false;
  turn.rng = seqRng([12, 5, 1]);
  var again = turn.perform({ actor: 0, action: 'move', moveId: 'mace', target: 0 });
  assert.strictEqual(again.ok, true, again.error);
  var againHit = attacks(again.events)[0];
  assert.strictEqual(againHit.hit, true);
  assert.strictEqual(againHit.damage.spec, '1d6+2 + 1d4');
  assert.deepStrictEqual(againHit.damage.rolls, [5, 1]);
  assert.strictEqual(againHit.damage.total, 8);
  assert.strictEqual(countLine(playerLog(again.events), LINE), 1);

  var basic = fresh();
  basic.rng = seqRng([15, 3, 2]);
  var swing = basic.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(swing.ok, true, swing.error);
  var basicHit = attacks(swing.events)[0];
  assert.strictEqual(basicHit.attackName, '釘頭錘');
  assert.strictEqual(basicHit.damage.spec, '1d6+2 + 1d4');
  assert.strictEqual(basicHit.damage.total, 7);
  assert.strictEqual(countLine(playerLog(swing.events), LINE), 1);

  var sheet = findSheetMove(eng, 'divine_strike');
  assert.ok(sheet);
  assert.strictEqual(sheet.name, '神聖打擊');
  assert.strictEqual(sheet.summary, '每回合武器首擊');
  assert.ok(sheet.detail);
  assert.strictEqual(sheet.kind, 'passive');
  assert.strictEqual(sheet.enabled, false);
  assert.ok(Array.from(sheet.summary).length <= 14);
  var groups = sheetMoves(eng);
  assert.deepStrictEqual(groups.passive, ['divine_strike']);
  assert.ok(groups.everyday.indexOf('divine_strike') < 0);
  var open = eng.moveSheet();
  open.groups.forEach(function (g) { g.open = true; });
  var parent = { children: [], appendChild: function (c) { this.children.push(c); return c; } };
  T.renderMoveGroups(fakeDocument(), parent, open, {});
  var labels = collectText(parent);
  assert.ok(labels.indexOf('神聖打擊') >= 0);
  assert.ok(labels.indexOf('每回合武器首擊') >= 0);
  assert.ok(labels.indexOf('被動') >= 0);
  var state = eng.uiState();
  assert.strictEqual(state.character.passives.length, 1);
  assert.strictEqual(state.character.passives[0].name, '神聖打擊');
  assert.strictEqual(state.character.attack.name, '釘頭錘');

  function oldMira(version) {
    var save = {
      v: version,
      adventureId: 'wasted_tower',
      scriptVersion: 1,
      pregenIndex: 3,
      character: {
        name: '米拉', cls: '牧師', race: '人類',
        str: 14, dex: 10, con: 14, int: 8, wis: 16, cha: 12,
        ac: 16, hp: 8, hp_max: 10, acBonus: 0,
        skills: ['insight', 'religion', 'persuasion'],
        inventory: ['cure_wounds', 'potion_heal'],
        attack: { name: '神聖打擊', bonus: 4, damage: '1d6+2' },
        features: [
          { id: 'divine_strike', name: '神聖打擊', uses: 1, usesMax: 1, roll: 'attack', uses_weapon: true, damage_dice: '1d6+2' },
          { id: 'old_strike', name: '神聖打擊', uses: 3, usesMax: 3, effect: { type: 'damage', amount: 4 } },
          { id: 'guiding_bolt', name: '引導之矢', pool: 'channel', cost: 1, uses: 1, usesMax: 3, damage_dice: '2d6' },
          { id: 'cure_wounds', name: '治療術', pool: 'channel', cost: 1, uses: 1, usesMax: 3 }
        ],
        pools: { channel: { id: 'channel', name: '神恩', uses: 1, usesMax: 3 } },
        passives: [{ id: 'divine_strike', name: '神聖打擊', dice: '9d9' }]
      },
      sceneId: 'f1_gate',
      flags: { cls_cleric: true },
      done: {},
      clearedCombats: {},
      keyChoices: [],
      status: 'playing',
      lastCheckpoint: null,
      playMs: 4,
      rng: { kind: 'seeded', seed: 3, s: 3, count: 1 }
    };
    if (version < 6) delete save.character.reactionUsed;
    if (version < 5) {
      delete save.character.tempHp;
      delete save.character.passives;
    }
    var loaded = T.loadGame(adventure, T.encodeSaveCode(save));
    assert.strictEqual(loaded.ok, true, version + ' ' + (loaded.error || ''));
    var c = loaded.engine.character;
    assert.strictEqual(loaded.engine.exportSave().v, 8, String(version));
    assert.strictEqual(c.attack.name, '釘頭錘', String(version));
    assert.strictEqual(c.divineStrikeUsed, false, String(version));
    var passiveRows = (c.passives || []).filter(function (p) { return p && (p.id === 'divine_strike' || p.name === '神聖打擊'); });
    assert.strictEqual(passiveRows.length, 1, String(version));
    assert.strictEqual(passiveRows[0].id, 'divine_strike');
    assert.strictEqual(passiveRows[0].name, '神聖打擊');
    assert.strictEqual(passiveRows[0].dice, '1d4');
    assert.strictEqual(passiveRows[0].summary, '每回合武器首擊');
    var named = (c.features || []).filter(function (f) { return f && (f.name === '神聖打擊' || f.id === 'divine_strike'); });
    assert.strictEqual(named.length, 0, String(version));
    var maces = (c.features || []).filter(function (f) { return f && f.name === '釘頭錘'; });
    assert.strictEqual(maces.length, 1, String(version));
    assert.ok(loaded.engine.findMove(c, 'mace'), String(version));
    assert.strictEqual(loaded.engine.findMove(c, 'divine_strike'), null, String(version));
    var guidedFeat = loaded.engine.findMove(c, 'guiding_bolt');
    assert.strictEqual(guidedFeat.damage_dice, '4d6', String(version));
    assert.strictEqual(c.pools.channel.uses, 1, String(version));
    loaded.engine.enterScene('f1_bandit');
    heroFirst(loaded.engine);
    loaded.engine.perform({ actor: 0, action: 'ambush', outcome: 'success' });
    loaded.engine.encounter.enemies[0].yield = null;
    loaded.engine.encounter.enemies[0].hp = 40;
    loaded.engine.encounter.enemies[0].hp_max = 40;
    loaded.engine.rng = seqRng([14, 2, 2]);
    var hit = loaded.engine.perform({ actor: 0, action: 'attack', target: 0 });
    assert.strictEqual(hit.ok, true, version + ' ' + hit.error);
    var row = hit.events.filter(function (e) { return e.t === 'attack'; })[0];
    assert.strictEqual(row.attackName, '釘頭錘');
    assert.strictEqual(row.damage.spec, '1d6+2 + 1d4');
    assert.strictEqual(countLine(playerLog(hit.events), LINE), 1);
    var broken = loaded.engine.perform({ actor: 0, action: 'move', moveId: 'divine_strike', target: 0 });
    assert.strictEqual(broken.ok, false);
  }
  oldMira(4);
  oldMira(5);
  oldMira(6);
  oldMira(7);
});

function pinEnemies(eng) {
  heroFirst(eng);
  eng.encounter.enemies.forEach(function (e, i) {
    eng.encounter.acted['enemy:' + i] = true;
  });
}
function usesOfId(eng, id) {
  var found = null;
  (eng.character.features || []).forEach(function (f) { if (f.id === id) found = f; });
  return found ? eng.moveUsesLeft(eng.character, found) : 0;
}

test('net and command hints say when to use them', function () {
  var expect = {
    net: '敵人血多、想爭取時間時用。',
    command: '對通人語且未受傷的敵人最有效。'
  };
  var summaries = {
    net: '命中則束縛，不造成傷害',
    command: '感知豁免，失敗則趨下'
  };
  Object.keys(expect).forEach(function (id) {
    var feat = null;
    adventure.pregens.forEach(function (p) {
      (p.features || []).forEach(function (f) { if (f.id === id) feat = f; });
    });
    assert.ok(feat, id);
    assert.strictEqual(feat.hint, expect[id], id);
    assert.strictEqual(feat.summary, summaries[id], id);
  });
  [{ index: 1, id: 'net' }, { index: 3, id: 'command' }].forEach(function (row) {
    var eng = new T.Engine(adventure, { seed: 3 });
    eng.start(row.index);
    eng.enterScene('f1_bandit');
    var move = findSheetMove(eng, row.id);
    assert.strictEqual(move.hint, expect[row.id], row.id);
    assert.strictEqual(move.summary, summaries[row.id], row.id);
    var sheet = eng.moveSheet();
    sheet.groups.forEach(function (g) { g.open = true; });
    var parent = { children: [], appendChild: function (c) { this.children.push(c); return c; } };
    T.renderMoveGroups(fakeDocument(), parent, sheet, {});
    var labels = collectText(parent);
    assert.ok(labels.indexOf(expect[row.id]) >= 0, row.id);
    assert.ok(labels.indexOf(summaries[row.id]) >= 0, row.id);
    eng.character.features.forEach(function (f) { if (f.id === row.id) delete f.hint; });
    assert.strictEqual(findSheetMove(eng, row.id).hint, expect[row.id], row.id + ' pregen');
  });
});

test('restrained and prone do not stack, and saves from WT4 through WT7 still load', function () {
  var ranger = new T.Engine(adventure, { seed: 11 });
  ranger.start(1);
  ranger.enterScene('f1_bandit');
  var foe = ranger.encounter.enemies[0];
  foe.hp = 40;
  foe.hp_max = 40;
  foe.yield = null;
  pinEnemies(ranger);
  ranger.rng = seqRng([18, 16, 15, 5]);
  var netted = ranger.perform({ actor: 0, action: 'move', moveId: 'net', target: 0 });
  assert.strictEqual(netted.ok, true, netted.error);
  assert.strictEqual(foe.statuses.length, 1);
  assert.strictEqual(foe.statuses[0].id, 'restrained');
  assert.strictEqual(foe.statuses[0].escape_dc, 10);
  assert.strictEqual(usesOfId(ranger, 'net'), 0);
  assert.ok(playerLog(netted.events).indexOf('盜墓者被網纏住。') >= 0);
  var netFeat = null;
  ranger.character.features.forEach(function (f) { if (f.id === 'net') netFeat = f; });
  netFeat.uses = 1;
  var again = ranger.perform({ actor: 0, action: 'move', moveId: 'net', target: 0 });
  assert.strictEqual(again.ok, true, again.error);
  assert.strictEqual(foe.statuses.filter(function (s) { return s.id === 'restrained'; }).length, 1);

  ranger.addStatus(foe, { id: 'prone', src: 'command', hold: 1 });
  ranger.addStatus(foe, { id: 'prone', src: 'command', hold: 1 });
  assert.strictEqual(foe.statuses.filter(function (s) { return s.id === 'prone'; }).length, 1);
  assert.strictEqual(foe.statuses.filter(function (s) { return s.id === 'prone'; })[0].hold, 1);
  ranger.events = [];
  ranger.runEnemyTurn(0);
  assert.strictEqual(ranger.events.filter(function (e) { return e.t === 'enemy_attack'; }).length, 0);
  assert.strictEqual(ranger.findStatus(foe, 'prone').hold, 0);
  assert.ok(ranger.findStatus(foe, 'restrained'));
  ranger.events = [];
  ranger.rng = seqRng([12, 3]);
  ranger.runEnemyTurn(0);
  assert.ok(!ranger.findStatus(foe, 'prone'));
  assert.ok(ranger.events.some(function (e) { return e.t === 'status_end'; }));
  assert.strictEqual(ranger.events.filter(function (e) { return e.t === 'status_escape'; }).length, 1);
  assert.strictEqual(ranger.events.filter(function (e) { return e.t === 'enemy_attack'; }).length, 0);

  var fresh = new T.Engine(adventure, { seed: 12 });
  fresh.start(1);
  fresh.enterScene('f1_bandit');
  var bandit = fresh.encounter.enemies[0];
  bandit.yield = null;
  fresh.addStatus(bandit, { id: 'restrained', src: 'net', escape_dc: 10 });
  fresh.rng = seqRng([9]);
  fresh.events = [];
  fresh.runEnemyTurn(0);
  assert.strictEqual(fresh.events.filter(function (e) { return e.t === 'enemy_attack'; }).length, 0);
  assert.ok(fresh.findStatus(bandit, 'restrained'));
  assert.strictEqual(fresh.events.filter(function (e) { return e.t === 'status_escape'; })[0].dc, 10);
  assert.strictEqual(fresh.events.filter(function (e) { return e.t === 'status_escape'; })[0].success, false);
  fresh.rng = seqRng([10]);
  fresh.events = [];
  fresh.runEnemyTurn(0);
  assert.ok(!fresh.findStatus(bandit, 'restrained'));
  assert.strictEqual(fresh.events.filter(function (e) { return e.t === 'enemy_attack'; }).length, 0);
  assert.strictEqual(fresh.events.filter(function (e) { return e.t === 'status_escape'; })[0].success, true);

  var cleric = new T.Engine(adventure, { seed: 13 });
  cleric.start(3);
  cleric.enterScene('f1_bandit');
  var target = cleric.encounter.enemies[0];
  target.hp = 40;
  target.hp_max = 40;
  target.yield = null;
  target.statuses = [{ id: 'prone', src: 'command', hold: 0 }];
  pinEnemies(cleric);
  var slots = cleric.character.pools.channel.uses;
  cleric.rng = seqRng([8, 18, 4, 2]);
  var mace = cleric.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(mace.ok, true, mace.error);
  var melee = mace.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(melee.mode, 'advantage');
  assert.deepStrictEqual(melee.dice, [8, 18]);
  assert.ok(playerLog(mace.events).join('\n').indexOf('8 和 18') >= 0);

  target.statuses = [{ id: 'prone', src: 'command', hold: 0 }];
  var bow = new T.Engine(adventure, { seed: 14 });
  bow.start(1);
  bow.enterScene('f1_bandit');
  var marked = bow.encounter.enemies[0];
  marked.hp = 40;
  marked.hp_max = 40;
  marked.yield = null;
  marked.statuses = [{ id: 'prone', src: 'command', hold: 0 }];
  pinEnemies(bow);
  bow.rng = seqRng([16, 15, 4]);
  var shot = bow.perform({ actor: 0, action: 'attack', target: 0 });
  var ranged = shot.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(ranged.mode, 'disadvantage');
  assert.deepStrictEqual(ranged.dice, [16, 15]);
  assert.strictEqual(ranged.d20, 15);

  pinEnemies(cleric);
  target.statuses = [{ id: 'prone', src: 'command', hold: 0 }];
  target.hp = 40;
  cleric.character.divineStrikeUsed = true;
  cleric.rng = seqRng([19, 3]);
  var bolt = cleric.perform({ actor: 0, action: 'move', moveId: 'guiding_bolt', target: 0 });
  assert.strictEqual(bolt.ok, true, bolt.error);
  var spell = bolt.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(spell.mode, 'disadvantage');
  assert.strictEqual(spell.d20, 3);

  var rogue = new T.Engine(adventure, { seed: 15 });
  rogue.start(2);
  rogue.enterScene('f1_bandit');
  var dummy = rogue.encounter.enemies[0];
  dummy.hp = 40;
  dummy.hp_max = 40;
  dummy.yield = null;
  dummy.statuses = [{ id: 'marked' }];
  pinEnemies(rogue);
  rogue.rng = seqRng([15, 4]);
  var plain = rogue.perform({ actor: 0, action: 'attack', target: 0 });
  var plainHit = plain.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(plainHit.mode, 'normal');
  assert.deepStrictEqual(plainHit.damage.rolls, [4]);
  assert.strictEqual(rogue.character.sneakUsed, false);

  dummy.statuses = [{ id: 'restrained', src: 'net', escape_dc: 10 }];
  dummy.hp = 40;
  pinEnemies(rogue);
  rogue.character.sneakUsed = false;
  rogue.rng = seqRng([8, 17, 3, 4, 5]);
  var sneaky = rogue.perform({ actor: 0, action: 'attack', target: 0 });
  var sneakHit = sneaky.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(sneakHit.mode, 'advantage');
  assert.ok(sneakHit.damage.rolls.length >= 3);
  assert.strictEqual(rogue.character.sneakUsed, true);

  rogue.character.features.push({
    id: 'test_bow', name: '試弓', group: 'everyday', at_will: true,
    summary: '試', detail: '試射。', costs_turn: true, target: 'enemy',
    roll: 'attack', uses_weapon: true, ranged: true
  });
  dummy.statuses = [{ id: 'prone', src: 'command', hold: 0 }];
  dummy.hp = 40;
  rogue.character.sneakUsed = false;
  pinEnemies(rogue);
  rogue.rng = seqRng([18, 16, 3]);
  var far = rogue.perform({ actor: 0, action: 'move', moveId: 'test_bow', target: 0 });
  var farHit = far.events.filter(function (e) { return e.t === 'attack'; })[0];
  assert.strictEqual(farHit.mode, 'disadvantage');
  assert.deepStrictEqual(farHit.damage.rolls, [3]);
  assert.strictEqual(rogue.character.sneakUsed, false);

  var ooze = new T.Engine(adventure, { seed: 16 });
  ooze.start(1);
  ooze.enterScene('f2_ooze');
  pinEnemies(ooze);
  var beforeUses = usesOfId(ooze, 'net');
  var immune = ooze.perform({ actor: 0, action: 'move', moveId: 'net', target: 0 });
  assert.strictEqual(immune.ok, true, immune.error);
  assert.strictEqual(usesOfId(ooze, 'net'), beforeUses);
  assert.deepStrictEqual(ooze.encounter.enemies[0].statuses, []);
  assert.ok(playerLog(immune.events).indexOf('對它無效') >= 0);
  assert.strictEqual(immune.events.filter(function (e) { return e.t === 'enemy_attack'; }).length, 0);
  var grey = findSheetMove(ooze, 'net');
  assert.strictEqual(grey.enabled, false);
  assert.strictEqual(grey.reason, '對它無效');

  var shade = new T.Engine(adventure, { seed: 17 });
  shade.start(1);
  shade.enterScene('hide_crypt');
  pinEnemies(shade);
  var shadeUses = usesOfId(shade, 'net');
  var shadeRes = shade.perform({ actor: 0, action: 'move', moveId: 'net', target: 0 });
  assert.strictEqual(shadeRes.ok, true, shadeRes.error);
  assert.strictEqual(usesOfId(shade, 'net'), shadeUses);
  assert.ok(playerLog(shadeRes.events).indexOf('對它無效') >= 0);

  function rejectCommand(sceneId) {
    var eng = new T.Engine(adventure, { seed: 18 });
    eng.start(3);
    eng.enterScene(sceneId);
    pinEnemies(eng);
    var left = usesOfId(eng, 'command');
    var pool = eng.character.pools.channel.uses;
    var res = eng.perform({ actor: 0, action: 'move', moveId: 'command', target: 0 });
    assert.strictEqual(res.ok, true, sceneId + ' ' + res.error);
    assert.strictEqual(usesOfId(eng, 'command'), left, sceneId);
    assert.strictEqual(eng.character.pools.channel.uses, pool, sceneId);
    assert.deepStrictEqual(eng.encounter.enemies[0].statuses, [], sceneId);
    assert.ok(playerLog(res.events).indexOf('對它無效') >= 0, sceneId);
  }
  rejectCommand('f1_rats');
  rejectCommand('f2_bones');
  rejectCommand('f3_wight');
  rejectCommand('hide_vault');

  var mira = new T.Engine(adventure, { seed: 19 });
  mira.start(3);
  mira.enterScene('f1_bandit');
  var cult = mira.encounter.enemies[0];
  cult.hp = 30;
  cult.hp_max = 30;
  cult.yield = null;
  pinEnemies(mira);
  var poolBefore = mira.character.pools.channel.uses;
  mira.rng = seqRng([4, 2]);
  var cmd = mira.perform({ actor: 0, action: 'move', moveId: 'command', target: 0 });
  assert.strictEqual(cmd.ok, true, cmd.error);
  assert.strictEqual(mira.character.pools.channel.uses, poolBefore);
  assert.strictEqual(usesOfId(mira, 'command'), 0);
  assert.strictEqual(mira.findStatus(cult, 'prone').hold, 1);
  assert.ok(playerLog(cmd.events).indexOf('盜墓者趨下倒地，無法行動。') >= 0);
  var spent = mira.perform({ actor: 0, action: 'move', moveId: 'command', target: 0 });
  assert.strictEqual(spent.ok, false);
  mira.character.features.forEach(function (f) { if (f.id === 'command') f.uses = 1; });
  pinEnemies(mira);
  mira.rng = seqRng([3]);
  mira.perform({ actor: 0, action: 'move', moveId: 'command', target: 0 });
  assert.strictEqual(cult.statuses.filter(function (s) { return s.id === 'prone'; }).length, 1);
  assert.strictEqual(mira.findStatus(cult, 'prone').hold, 1);
  mira.enterScene('cp_f1');
  assert.strictEqual(usesOfId(mira, 'command'), 1);

  mira.rivalPregenIndex = 0;
  mira.enterScene('rival_boss');
  pinEnemies(mira);
  var rivalPool = mira.character.pools.channel.uses;
  mira.rng = seqRng([6]);
  var onRival = mira.perform({ actor: 0, action: 'move', moveId: 'command', target: 0 });
  assert.strictEqual(onRival.ok, true, onRival.error);
  assert.strictEqual(mira.character.pools.channel.uses, rivalPool);
  assert.strictEqual(mira.encounter.enemies[0].id, 'rival');
  assert.strictEqual(mira.findStatus(mira.encounter.enemies[0], 'prone').hold, 1);

  ranger.addStatus(foe, { id: 'restrained', src: 'net', escape_dc: 10 });
  ranger.addStatus(foe, { id: 'prone', src: 'command', hold: 1 });
  var view = ranger.enemySnapshot();
  assert.strictEqual(view[0].statuses.length, 2);
  view[0].statuses.forEach(function (s) {
    assert.ok(Array.from(s.label).length <= 14, s.label);
    assert.ok(Array.from(s.line).length <= 14 && Array.from(s.line).length >= 1, s.line);
    assert.ok(Array.from(s.ends).length <= 14 && Array.from(s.ends).length >= 1, s.ends);
  });

  var mid = new T.Engine(adventure, { seed: 20 });
  mid.start(1);
  mid.enterScene('f1_bandit');
  mid.addStatus(mid.encounter.enemies[0], { id: 'restrained', src: 'net', escape_dc: 10 });
  mid.addStatus(mid.encounter.enemies[0], { id: 'prone', src: 'command', hold: 1 });
  var code = T.encodeSaveCode(mid.exportSave());
  assert.strictEqual(code.indexOf('WT8.'), 0);
  var back = T.loadGame(adventure, code);
  assert.strictEqual(back.ok, true, back.error);
  var kept = back.engine.encounter.enemies[0].statuses;
  assert.strictEqual(kept.length, 2);
  assert.strictEqual(kept.filter(function (s) { return s.id === 'restrained'; })[0].escape_dc, 10);
  assert.strictEqual(kept.filter(function (s) { return s.id === 'prone'; })[0].hold, 1);

  [4, 5, 6, 7].forEach(function (version) {
    var old = mid.exportSave();
    old.v = version;
    old.encounter.enemies[0].statuses = [
      { id: 'blinded', turns_left: 2 },
      { id: 'restrained', escape_dc: 10 },
      { id: 'prone', hold: 3 }
    ];
    var loaded = T.loadGame(adventure, T.encodeSaveCode(old));
    assert.strictEqual(loaded.ok, true, version + ' ' + (loaded.error || ''));
    assert.strictEqual(loaded.engine.exportSave().v, 8);
    assert.deepStrictEqual(loaded.engine.encounter.enemies[0].statuses, []);
    assert.deepStrictEqual(loaded.engine.character.statuses, []);
  });

  var dirty = mid.exportSave();
  dirty.encounter.enemies[0].statuses = [
    { id: 'restrained', escape_dc: 10 },
    { id: 'restrained', escape_dc: 99 },
    { id: 'blinded' },
    { id: 'prone', hold: 4 }
  ];
  var cleaned = T.loadGame(adventure, T.encodeSaveCode(dirty));
  assert.strictEqual(cleaned.ok, true, cleaned.error);
  var rows = cleaned.engine.encounter.enemies[0].statuses;
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.filter(function (s) { return s.id === 'restrained'; }).length, 1);
  assert.strictEqual(rows.filter(function (s) { return s.id === 'prone'; })[0].hold, 1);
});

if (process.env.SKIP_TESTS !== '1') {
  if (failed) {
    console.error(failed + ' failed, ' + passed + ' passed');
    process.exit(1);
  }
}
printSimulator();
if (process.env.SKIP_TESTS !== '1') console.log(passed + ' passed');
