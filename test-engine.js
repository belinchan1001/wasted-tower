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
  var critDice = parsed.count * 2;
  var before = engine.enemyAttacksBeforeHero ? engine.enemyAttacksBeforeHero() : 0;
  var after = engine.enemyAttacksAfterHero ? engine.enemyAttacksAfterHero() : 0;
  var vals = [];
  var i;
  for (i = 0; i < before; i++) vals.push(1);
  vals.push(20);
  for (i = 0; i < critDice; i++) vals.push(99);
  for (i = 0; i < after; i++) vals.push(1);
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
      assert.ok(now.minHp === undefined && now.min_hp === undefined, id + ' minHp');
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
  mage.encounter.order = [{ kind: 'hero', index: 0, roll: 20, bonus: 0, total: 20 }].concat(
    mage.encounter.enemies.map(function (e, i) { return { kind: 'enemy', index: i, roll: 1, bonus: 0, total: 1 }; })
  );
  mage.encounter.acted = {};
  mage.encounter.round = 1;
  mage.rng = seqRng([1, 1, 1]);
  var buff = mage.perform({ type: 'use_feature', featureId: 'shield' });
  assert.strictEqual(buff.ok, true, buff.error);
  assert.strictEqual(mage.effectiveAc(), 20);
  assert.strictEqual(mage.character.pools.slots.uses, 2);
  mage.perform({ type: 'flee' });
  assert.strictEqual(mage.character.acBonus, 0);
  assert.strictEqual(mage.effectiveAc(), 15);

  var fighter = new T.Engine(adventure, { seed: 10 });
  fighter.start(0);
  choose(fighter, 'rush');
  fighter.encounter.order = [{ kind: 'hero', index: 0, roll: 20, bonus: 0, total: 20 }].concat(
    fighter.encounter.enemies.map(function (e, i) { return { kind: 'enemy', index: i, roll: 1, bonus: 0, total: 1 }; })
  );
  fighter.encounter.acted = {};
  fighter.encounter.round = 1;
  fighter.rng = seqRng([20, 8, 8, 8, 8, 1, 1]);
  var strike = fighter.perform({ actor: 0, action: 'move', moveId: 'power_strike', target: 0 });
  assert.strictEqual(strike.ok, true, strike.error);
  assert.strictEqual(fighter.encounter.enemies[0].hp, 0);
  assert.strictEqual(fighter.character.features[0].uses, 1);
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
  newer.v = 5;
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
  assert.strictEqual(code.indexOf('WT4.'), 0);
  assert.deepStrictEqual(engine.exportSave().character.statuses, []);
  assert.strictEqual(engine.exportSave().character.hpMaxReduction, 0);
  var slot = new T.SaveSlot(storage);
  assert.strictEqual(slot.key, 'wasted-tower-preview-save');
  assert.strictEqual(slot.write(code).ok, true);
  assert.deepStrictEqual(Object.keys(bag), ['wasted-tower-preview-save']);
  assert.strictEqual(bag['wasted-tower-preview-save'].indexOf('WT4.'), 0);
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
  assert.strictEqual(migrated.engine.character.features.length, 2);
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
  heroFirst(engine);
  engine.rng = seqRng([15, 1, 1, 1]);
  var hit = engine.perform({ actor: 0, action: 'attack', target: 0 });
  assert.strictEqual(hit.ok, true, hit.error);
  assert.deepStrictEqual(engine.character.statuses, []);
  engine.encounter.enemies.forEach(function (e) {
    assert.deepStrictEqual(e.statuses || [], []);
  });
  var phrases = ['通關率', '平均回合', '內部參考'];
  ['README.md', 'preview/index.html', 'preview/js/ui.js', 'preview/js/narrator.js', 'preview/js/engine.js'].forEach(function (rel) {
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
  var publisher = 'Wizards of the Coast';
  var files = ['index.html', 'README.md', 'preview/index.html', 'preview/data/wasted_tower.js', 'preview/js/engine.js', 'preview/js/narrator.js', 'preview/js/ui.js'];
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
    '戰士': ['power_strike', 'second_wind'],
    '遊俠': ['aimed_shot', 'hunters_mark'],
    '盜賊': ['shadow_attack', 'uncanny_dodge'],
    '牧師': ['cure_wounds', 'guiding_bolt'],
    '法師': ['magic_missile', 'shield']
  };
  adventure.pregens.forEach(function (p) {
    var ids = p.features.map(function (f) { return f.id; });
    assert.deepStrictEqual(ids, expect[p['class']], p['class']);
    assert.strictEqual(p.features.length, 2);
    p.features.forEach(function (f) {
      assert.ok(f.roll, f.id);
      assert.ok(f.target, f.id);
      assert.strictEqual(typeof f.costs_turn, 'boolean', f.id);
      assert.ok(Number.isInteger(f.uses) || (f.pool && Number.isInteger(f.cost)), f.id);
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
  assert.ok(mech.indexOf('優勢：擲出 7 同 16，取 16') >= 0);
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
  assert.ok(low.indexOf('劣勢：擲出 2 同 18，取 2') >= 0);
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
  assert.deepStrictEqual(ids, ['power_strike', 'second_wind']);
  assert.deepStrictEqual(migrated.engine.character.statuses, []);
  assert.strictEqual(migrated.engine.character.hpMaxReduction, 0);
  var code = T.decodeSaveCode(T.encodeSaveCode(fighter.exportSave()));
  assert.strictEqual(code.save.v, 4);
  assert.strictEqual(code.save.rng.kind, 'seeded');
  assert.ok(Number.isInteger(code.save.rng.count));

  var rest = new T.Engine(adventure, { seed: 81 });
  rest.start(0);
  rest.character.hp = 6;
  rest.character.features[0].uses = 0;
  rest.enterScene('cp_f1');
  assert.strictEqual(rest.character.hp, 6);
  assert.strictEqual(rest.character.features[0].uses, 2);
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
  assert.strictEqual(rest.character.features[0].uses, 2);
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
  assert.ok(sample.indexOf('優勢：擲出 7 同 20，取 20') >= 0);
  assert.ok(sample.indexOf('劣勢：擲出 7 同 16，取 7') >= 0);
  assert.ok(sample.indexOf('d20') >= 0);
  assert.ok(sample.indexOf('難度') >= 0);
  assert.ok(sample.indexOf('暴擊') >= 0);
  assert.ok(sample.indexOf(mark) < 0);
  assert.ok(sample.toLowerCase().indexOf(phrase) < 0);
  ['preview/index.html', 'preview/js/ui.js', 'preview/js/narrator.js', 'preview/js/engine.js', 'preview/data/wasted_tower.js', 'index.html'].forEach(function (rel) {
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

function simulateClass(index, runs) {
  var wins = 0;
  var roundSum = 0;
  var finished = 0;
  var r, engine, guard, rounds;
  function forceCheck(eng) {
    var saved = eng.rng;
    eng.rng = seqRng([20]);
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
  function policy(eng) {
    var c = eng.character;
    var foe = lowest(eng);
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
    }
    if (c.hp <= 4 && usesOf(eng, 'shield') > 0 && !(c.acBonus > 0)) {
      return { actor: 0, action: 'move', moveId: 'shield' };
    }
    var moves = ['power_strike', 'aimed_shot', 'hunters_mark', 'shadow_attack', 'guiding_bolt', 'magic_missile'];
    var m;
    for (m = 0; m < moves.length; m++) {
      if (usesOf(eng, moves[m]) > 0) return { actor: 0, action: 'move', moveId: moves[m], target: foe.index };
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
      if (!res.ok) {
        res = eng.perform({ actor: 0, action: 'attack', target: living[0].index });
        if (!res.ok) { eng.lose('policy'); break; }
      }
    }
    return seen;
  }
  for (r = 0; r < runs; r++) {
    engine = new T.Engine(adventure, { seed: 1000 + index * 100000 + r });
    engine.start(index);
    rounds = 0;
    guard = 0;
    try {
      choose(engine, 'rush');
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      choose(engine, 'climb');
      forceCheck(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      cont(engine);
      choose(engine, 'up');
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      choose(engine, 'watch');
      forceCheck(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      cont(engine);
      choose(engine, 'smash');
      answerInserted(engine);
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      answerInserted(engine);
      choose(engine, 'rush_boss');
      rounds += fight(engine);
      if (engine.status !== 'playing') throw new Error('lost');
      cont(engine);
      choose(engine, 'leave');
      if (engine.status === 'won') {
        wins++;
        roundSum += rounds;
        finished++;
      }
    } catch (e) {
      guard++;
    }
  }
  return { wins: wins, runs: runs, avg: finished ? (roundSum / finished) : 0 };
}

function printSimulator() {
  var runs = 2000;
  var names = adventure.pregens.map(function (p) { return p['class']; });
  var rows = [];
  var flags = [];
  names.forEach(function (name, i) {
    var row = simulateClass(i, runs);
    var rate = row.wins / row.runs;
    var flag = '';
    if (rate < 0.30) { flag = '低於 30%'; flags.push(name + ' ' + flag); }
    else if (rate > 0.90) { flag = '高於 90%'; flags.push(name + ' ' + flag); }
    rows.push({ name: name, rate: rate, avg: row.avg, flag: flag });
  });
  console.log('');
  console.log('模擬（每職業 ' + runs + ' 場，內部參考）');
  console.log('職業    通關率     平均回合    標記');
  rows.forEach(function (row) {
    var pct = (row.rate * 100).toFixed(1) + '%';
    while (pct.length < 8) pct = pct + ' ';
    var avg = row.avg.toFixed(1);
    console.log(row.name + '    ' + pct + '   ' + avg + (row.flag ? '       ' + row.flag : ''));
  });
  if (flags.length) console.log('標記：' + flags.join('；'));
  else console.log('標記：沒有職業低於 30% 或高於 90%。');
}

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
printSimulator();
console.log(passed + ' passed');
