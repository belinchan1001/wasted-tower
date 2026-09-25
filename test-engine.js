'use strict';

// Node test runner for the Waste Tower engine. No browser, no network.
//   node test-engine.js

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var data = require('./data/wasted_tower.js');
var T = require('./js/engine.js');
var narrator = require('./js/narrator.js');

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

function playMain(index) {
  var engine = new T.Engine(adventure, { seed: 1 });
  var started = engine.start(index);
  assert.strictEqual(started.ok, true);
  assert.strictEqual(engine.sceneId, 'f1_gate');
  choose(engine, 'rush');
  winCombat(engine);
  choose(engine, 'climb');
  succeedCheck(engine);
  winCombat(engine);
  assert.strictEqual(engine.sceneId, 'cp_f1');
  cont(engine);
  assert.strictEqual(engine.sceneId, 'f2_stairs');
  choose(engine, 'up');
  winCombat(engine);
  choose(engine, 'watch');
  succeedCheck(engine);
  winCombat(engine);
  assert.strictEqual(engine.sceneId, 'cp_f2');
  cont(engine);
  choose(engine, 'smash');
  winCombat(engine);
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

function playSecret(index) {
  var engine = new T.Engine(adventure, { seed: 2 });
  engine.start(index);
  choose(engine, 'search');
  assert.ok(engine.character.inventory.indexOf('iron_key') >= 0);
  winCombat(engine);
  choose(engine, 'creep');
  succeedCheck(engine);
  winCombat(engine);
  cont(engine);
  assert.ok(choiceIds(engine).indexOf('side') >= 0);
  choose(engine, 'side');
  winCombat(engine);
  choose(engine, 'take_loot');
  assert.strictEqual(engine.flags.vault_cleared, true);
  assert.ok(engine.character.inventory.indexOf('rust_key') >= 0);
  assert.ok(engine.character.inventory.indexOf('iron_key') < 0);
  winCombat(engine);
  choose(engine, 'force');
  succeedCheck(engine);
  winCombat(engine);
  cont(engine);
  choose(engine, 'unlock');
  winCombat(engine);
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
  assert.deepStrictEqual(adventure.items, snap.items);
  assert.deepStrictEqual(adventure.pregens, snap.pregens);
  var byId = {};
  adventure.scenes.forEach(function (s) { byId[s.id] = s; });
  var redirect = { f1_bandit: 'cp_f1', f2_ooze: 'cp_f2', f3_wight: 'cp_f3' };
  Object.keys(snap.scenes).forEach(function (id) {
    var orig = snap.scenes[id];
    var now = byId[id];
    assert.ok(now, 'missing scene ' + id);
    assert.deepStrictEqual(now.facts, orig.facts, id + ' facts');
    if (orig.choices) {
      assert.strictEqual(now.choices.length, orig.choices.length, id);
      orig.choices.forEach(function (c, i) {
        var n = now.choices[i];
        assert.strictEqual(n.id, c.id);
        assert.strictEqual(n.label, c.label);
        assert.strictEqual(n.to, c.to);
        assert.deepStrictEqual(n.require_item || null, c.require_item || null);
        assert.deepStrictEqual(n.require_flag || null, c.require_flag || null);
        assert.deepStrictEqual(n.give || null, c.give || null);
        assert.deepStrictEqual(n.take || null, c.take || null);
        assert.strictEqual(n.hp_delta, c.hp_delta);
        (c.set_flag || []).forEach(function (f) {
          assert.ok(n.set_flag.indexOf(f) >= 0, id + ' ' + f);
        });
      });
    }
    if (orig.choices_from) assert.strictEqual(now.choices_from, orig.choices_from);
    if (orig.choice_to) assert.strictEqual(now.choice_to, orig.choice_to);
    if (orig.type === 'combat') {
      assert.deepStrictEqual(now.enemies, orig.enemies, id);
      assert.strictEqual(now.win_to, redirect[id] || orig.win_to, id);
      assert.strictEqual(now.flee_to, orig.flee_to);
    }
    if (orig.type === 'check') {
      ['skill', 'dc', 'success_to', 'fail_to', 'fail_hp_delta'].forEach(function (k) {
        assert.strictEqual(now[k], orig[k], id + ' ' + k);
      });
    }
    if (orig.type === 'end') assert.strictEqual(now.end, orig.end);
  });
});

test('floor checkpoints sit between floors and can be continued', function () {
  assert.strictEqual(adventure.scenes.filter(function (s) { return s.type === 'checkpoint'; }).length, 3);
  var engine = new T.Engine(adventure, { seed: 3 });
  engine.start(0);
  choose(engine, 'rush');
  winCombat(engine);
  choose(engine, 'scan');
  succeedCheck(engine);
  winCombat(engine);
  assert.strictEqual(engine.scene.floor, 1);
  assert.strictEqual(engine.scene.name, '一層歇腳');
  assert.deepStrictEqual(engine.scene.facts, ['一層的路已經走完。', '你可以在這裡歇息。']);
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
    assert.strictEqual(card.endingName, '通關');
    assert.strictEqual(card.className, p['class']);
    assert.strictEqual(card.characterName, p.name);
    var labels = card.keyChoices.map(function (k) { return k.label; });
    assert.ok(labels.indexOf('直接進塔') >= 0, p.name);
    assert.ok(labels.indexOf('帶著銅徽離開') >= 0, p.name);
    assert.ok(labels.indexOf('面對跟蹤的冒險者') < 0, p.name);

    var secret = playSecret(i);
    assert.strictEqual(secret.status, 'secret_won', p.name);
    var scard = secret.endingCard();
    assert.strictEqual(scard.endingName, '隱藏結局');
    assert.ok(scard.keyChoices.some(function (k) { return k.label.indexOf('對手：') === 0; }), p.name);
  });
});

test('side door and crypt stay gated by the key and the vault flag', function () {
  var engine = new T.Engine(adventure, { seed: 4 });
  engine.start(0);
  choose(engine, 'rush');
  assert.ok(engine.character.inventory.indexOf('iron_key') < 0);
  winCombat(engine);
  choose(engine, 'climb');
  succeedCheck(engine);
  winCombat(engine);
  cont(engine);
  assert.ok(choiceIds(engine).indexOf('side') < 0);
  assert.strictEqual(engine.perform({ type: 'choice', id: 'side' }).ok, false);
});

test('skill check succeeds on the DC and failure costs the stated HP', function () {
  var exact = new T.Engine(adventure, { seed: 5 });
  exact.start(0);
  choose(exact, 'rush');
  winCombat(exact);
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

  var newer = engine.exportSave();
  newer.v = 2;
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
  var store = new T.SaveSlot(mem, 'wasted-tower.slot1');
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

test('player-facing sources do not name a tabletop trademark', function () {
  var mark = 'D' + '&' + 'D';
  var phrase = ('Dungeons' + ' & ' + 'Dragons').toLowerCase();
  ['index.html', 'README.md', 'data/wasted_tower.js', 'js/engine.js', 'js/narrator.js', 'js/ui.js'].forEach(function (file) {
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
