
(function (global) {
  'use strict';

  var T = global.TOWER;

  function sign(n) { return (n >= 0 ? '+' : '−') + Math.abs(n); }
  function diceText(d) {
    // "[5,3] +2" style breakdown of a rolled dice string
    var s = '[' + d.rolls.join('、') + ']';
    if (d.mod) s += ' ' + sign(d.mod);
    return s;
  }

  // ------------------------------------------------------------- Mechanics
  // Turns a settled engine event into the mechanical log lines.
  var Mechanics = {
    format: function (ev) {
      var out = [];
      switch (ev.t) {
        case 'run_start':
          out.push({ tone: 'sys', text: '〔開始〕' + ev.name + '（' + ev.cls + '／' + ev.race + '）　生命 ' + ev.hp + '/' + ev.hp_max });
          break;
        case 'choice':
          out.push({ tone: 'act', text: '〔行動〕' + ev.label });
          break;
        case 'give':
          out.push({ tone: 'sys', text: '〔物品〕獲得　' + ev.itemName });
          break;
        case 'take':
          out.push({ tone: 'sys', text: '〔物品〕失去　' + ev.itemName });
          break;
        case 'hp':
          out.push({ tone: ev.delta < 0 ? 'bad' : 'good', text: '〔狀態〕生命 ' + sign(ev.delta) + ' → ' + ev.hp + '/' + ev.hp_max });
          break;
        case 'check':
          out.push({
            tone: 'roll',
            text: '〔擲骰〕' + (T.SKILL_LABEL[ev.skill] || ev.skill) + '檢定：d20(' + ev.d20 + ') ' +
                  sign(ev.mod) + '（' + (T.ABILITY_LABEL[ev.ability] || ev.ability) + '）' +
                  (ev.prof ? ' ' + sign(ev.prof) + '（熟練）' : '') +
                  ' ＝ ' + ev.total + '　／　DC ' + ev.dc + ' → ' + (ev.success ? '成功' : '失敗')
          });
          break;
        case 'attack':
          out.push({
            tone: 'roll',
            text: '〔擲骰〕' + ev.attackName + '：d20(' + ev.d20 + ') ' + sign(ev.bonus) +
                  ' ＝ ' + ev.total + '　／　' + ev.targetName + ' AC ' + ev.ac +
                  ' → ' + (ev.hit ? '命中' : '落空')
          });
          if (ev.hit) {
            out.push({
              tone: 'roll',
              text: '〔傷害〕' + ev.damage.spec + '：' + diceText(ev.damage) + ' ＝ ' + ev.damage.total +
                    '　→　' + ev.targetName + ' ' + ev.targetHpBefore + ' → ' + ev.targetHp + '/' + ev.targetHpMax
            });
          }
          break;
        case 'item_damage':
          out.push({
            tone: 'roll',
            text: '〔物品〕' + ev.itemName + '：自動命中，傷害 ' + ev.amount +
                  '　→　' + ev.targetName + ' ' + ev.targetHpBefore + ' → ' + ev.targetHp + '/' + ev.targetHpMax
          });
          break;
        case 'item_heal':
          out.push({
            tone: 'good',
            text: '〔物品〕' + ev.itemName + '：回復 ' + ev.amount +
                  (ev.healed !== ev.amount ? '（上限只回 ' + ev.healed + '）' : '') +
                  '　→　生命 ' + ev.hp + '/' + ev.hp_max
          });
          break;
        case 'feature_damage':
          out.push({
            tone: 'roll',
            text: '〔特性〕' + ev.featureName + '：自動命中，傷害 ' + ev.amount +
                  '　→　' + ev.targetName + ' ' + ev.targetHpBefore + ' → ' + ev.targetHp + '/' + ev.targetHpMax +
                  '　（剩餘 ' + ev.uses + '/' + ev.usesMax + '）'
          });
          break;
        case 'feature_heal':
          out.push({
            tone: 'good',
            text: '〔特性〕' + ev.featureName + '：回復 ' + ev.amount +
                  (ev.healed !== ev.amount ? '（上限只回 ' + ev.healed + '）' : '') +
                  '　→　生命 ' + ev.hp + '/' + ev.hp_max +
                  '　（剩餘 ' + ev.uses + '/' + ev.usesMax + '）'
          });
          break;
        case 'feature_ac':
          out.push({
            tone: 'good',
            text: '〔特性〕' + ev.featureName + '：本場戰鬥 AC +' + ev.amount +
                  '　→　AC ' + ev.ac +
                  '　（剩餘 ' + ev.uses + '/' + ev.usesMax + '）'
          });
          break;
        case 'enemy_phase':
          out.push({ tone: 'sys', text: '〔第 ' + ev.round + ' 回合〕敵方行動' });
          break;
        case 'enemy_attack':
          out.push({
            tone: 'roll',
            text: '〔擲骰〕' + ev.enemyName + '攻擊：d20(' + ev.d20 + ') ' + sign(ev.bonus) +
                  ' ＝ ' + ev.total + '　／　你的 AC ' + ev.ac + ' → ' + (ev.hit ? '命中' : '落空')
          });
          if (ev.hit) {
            out.push({
              tone: 'bad',
              text: '〔傷害〕' + ev.damage.spec + '：' + diceText(ev.damage) + ' ＝ ' + ev.damage.total +
                    '　→　生命 ' + ev.hp + '/' + ev.hp_max
            });
          }
          break;
        case 'combat_win':
          out.push({ tone: 'good', text: '〔戰鬥〕敵人全部倒下。' });
          break;
        case 'flee':
          out.push({ tone: 'act', text: ev.escaped ? '〔行動〕逃走' : '〔行動〕逃走　—　這裡沒有退路' });
          break;
        case 'run_restart':
          out.push({ tone: 'sys', text: '〔重來〕整場冒險從頭開始。' });
          break;
        case 'checkpoint':
          out.push({ tone: 'sys', text: '〔歇腳〕繼續上路。' });
          break;
        case 'resume':
          out.push({ tone: 'sys', text: '〔讀檔〕回到 ' + ev.name + '（' + ev.cls + '）的進度。' });
          break;
        case 'end_blocked':
          out.push({ tone: 'sys', text: '〔結局〕條件還沒滿足，這一個結局沒有成立。' });
          break;
        default:
          break;
      }
      return out;
    }
  };

  // ------------------------------------------------- offline narrator (ships)
  // Deterministic templating over the allowlist. Same inputs -> same prose.
  function pick(list, n) { return list[((n % list.length) + list.length) % list.length]; }

  function tick(view, event) {
    // Deterministic variation index built only from allowlisted numbers.
    var d = view.dice;
    var n = view.hp + view.hp_max + (view.facts.length * 3) + (view.inventory.length * 5);
    if (d) n += (d.d20 || 0) + (d.total || 0) + (d.amount || 0);
    n += (event.t || '').length;
    return n;
  }

  var OfflineNarrator = {
    id: 'offline',
    name: '離線敘事器',

    // `cue` selects a template but carries no authored text or game values.
    // Every word/value inserted into prose comes only from the frozen view.
    narrate: function (cue, view) {
      var out = [];
      var n = tick(view, { t: cue });
      var names = view.enemies.map(function (e) { return e.name; }).join('、');
      var d = view.dice;

      switch (cue) {
        case 'scene_beat':
          view.facts.forEach(function (f) { out.push({ tone: 'fact', text: f }); });
          out.push({ tone: 'narr', text: pick([
            view.name + '停下來，把眼前的東西看清楚。',
            view.name + '按住呼吸，先看清楚再決定。',
            view.name + '站著沒動，先把地方看一遍。'
          ], n) });
          break;
        case 'scene_check':
          view.facts.forEach(function (f) { out.push({ tone: 'fact', text: f }); });
          out.push({ tone: 'narr', text: pick([
            view.name + '深吸一口氣，準備動手。',
            '成不成，就看這一下了。',
            view.name + '把重心放低，準備出手。'
          ], n) });
          break;
        case 'scene_combat':
          view.facts.forEach(function (f) { out.push({ tone: 'fact', text: f }); });
          out.push({ tone: 'narr', text: names + '擋在' + view.name + '面前，退不得了。' });
          break;
        case 'scene_end':
          view.facts.forEach(function (f) { out.push({ tone: 'fact', text: f }); });
          break;
        case 'scene_checkpoint':
          view.facts.forEach(function (f) { out.push({ tone: 'fact', text: f }); });
          break;

        case 'give':
          if (view.inventory.length) {
            out.push({ tone: 'narr', text: view.inventory[view.inventory.length - 1] + '進了' + view.name + '的行囊。' });
          }
          break;
        case 'take':
          out.push({ tone: 'narr', text: view.name + '手上的東西用完了。' });
          break;
        case 'hp_loss':
          out.push({ tone: 'narr', text: pick([
            view.name + '悶哼一聲，撐住了。',
            '一陣鈍痛，' + view.name + '咬牙站穩。'
          ], n) + '（' + view.hp + '/' + view.hp_max + '）' });
          break;
        case 'hp_gain':
          out.push({ tone: 'narr', text: view.name + '緩過一口氣。（' + view.hp + '/' + view.hp_max + '）' });
          break;

        case 'check':
          if (d && d.outcome === 'success') {
            out.push({ tone: 'narr', text: pick([
              '骰面 ' + d.d20 + '，' + view.name + '辦到了。',
              '骰面 ' + d.d20 + '，動作剛好夠穩，過去了。',
              '骰面 ' + d.d20 + '，' + view.name + '一次過關。'
            ], n) });
          } else if (d) {
            out.push({ tone: 'narr', text: pick([
              '骰面 ' + d.d20 + '，差了一點。',
              '骰面 ' + d.d20 + '，' + view.name + '沒有抓穩。',
              '骰面 ' + d.d20 + '，這一下沒能成事。'
            ], n) });
          }
          break;

        case 'attack':
          if (d && d.outcome === 'hit') {
            out.push({ tone: 'narr', text: pick([
              view.name + '的一擊實打實地落在敵人身上。',
              view.name + '看準空隙出手，打中了。'
            ], n) });
            if (view.enemies.some(function (e) { return e.hp <= 0; })) out.push({ tone: 'good', text: '一個敵人垮了下去，不再動。' });
          } else {
            out.push({ tone: 'narr', text: pick([
              view.name + '揮空了，敵人閃開半步。',
              '這一下擦邊而過，敵人沒有受影響。'
            ], n) });
          }
          break;
        case 'item_damage':
          out.push({ tone: 'narr', text: '攻擊用的消耗品在敵人身上炸開。' });
          if (view.enemies.some(function (e) { return e.hp <= 0; })) out.push({ tone: 'good', text: '一個敵人垮了下去，不再動。' });
          break;
        case 'item_heal':
          out.push({ tone: 'narr', text: view.name + '用掉一件消耗品，傷口收住了。（' + view.hp + '/' + view.hp_max + '）' });
          break;
        case 'feature_damage':
          out.push({ tone: 'narr', text: view.name + '使出職業招式，攻擊結結實實地打中了。' });
          if (view.enemies.some(function (e) { return e.hp <= 0; })) out.push({ tone: 'good', text: '一個敵人垮了下去，不再動。' });
          break;
        case 'feature_heal':
          out.push({ tone: 'narr', text: view.name + '運起職業能力，傷口收斂了。（' + view.hp + '/' + view.hp_max + '）' });
          break;
        case 'feature_ac':
          out.push({ tone: 'narr', text: view.name + '運起職業能力，防禦暫時堅固起來。' });
          break;
        case 'enemy_attack':
          if (d && d.outcome === 'hit') {
            out.push({ tone: 'narr', text: '敵人打中了' + view.name + '。（' + view.hp + '/' + view.hp_max + '）' });
          } else {
            out.push({ tone: 'narr', text: pick([
              '敵人撲了個空。',
              view.name + '側身避開了敵人。'
            ], n) });
          }
          break;
        case 'flee':
          out.push({ tone: 'narr', text: view.name + '退回原路，心跳還沒平。' });
          break;
        case 'flee_restart':
          out.push({ tone: 'narr', text: view.name + '轉身想走，四面卻沒有出口。' });
          break;
        case 'run_restart':
          out.push({ tone: 'sys', text: '——這一夜重新開始——' });
          break;
        case 'end_won':
          out.push({ tone: 'good', text: view.name + '活著走出廢塔。' });
          break;
        case 'end_secret':
          out.push({ tone: 'good', text: view.name + '清掃了整座廢塔，隱藏結局達成。' });
          break;
        case 'end_lost':
          out.push({ tone: 'bad', text: view.name + '倒在原地，這一夜到此為止。' });
          break;
        default:
          break;
      }
      return out;
    }
  };

  // Convert a settled event to a value-free template cue. This adapter lives
  // outside the narrator; the narrator itself receives no engine event object.
  function cueOf(event) {
    if (event.t === 'scene') return 'scene_' + event.sceneType;
    if (event.t === 'hp') return event.delta < 0 ? 'hp_loss' : 'hp_gain';
    if (event.t === 'flee') return event.escaped ? 'flee' : 'flee_restart';
    if (event.t === 'end') {
      if (event.outcome === 'won') return 'end_won';
      if (event.outcome === 'secret_won') return 'end_secret';
      return 'end_lost';
    }
    return event.t;
  }

  // The dice result of THIS action, in the shape the narrator is allowed to see.
  function diceOf(event) {
    switch (event.t) {
      case 'check':
        return { kind: 'check', d20: event.d20, total: event.total, outcome: event.success ? 'success' : 'fail' };
      case 'attack':
        return { kind: 'attack', d20: event.d20, total: event.total, outcome: event.hit ? 'hit' : 'miss',
                 amount: event.hit ? event.damage.total : 0 };
      case 'enemy_attack':
        return { kind: 'enemy_attack', d20: event.d20, total: event.total, outcome: event.hit ? 'hit' : 'miss',
                 amount: event.hit ? event.damage.total : 0 };
      case 'item_damage':
        return { kind: 'item_damage', d20: 0, total: event.amount, outcome: 'hit', amount: event.amount };
      case 'item_heal':
        return { kind: 'item_heal', d20: 0, total: event.healed, outcome: 'heal', amount: event.healed };
      case 'feature_damage':
        return { kind: 'feature_damage', d20: 0, total: event.amount, outcome: 'hit', amount: event.amount };
      case 'feature_heal':
        return { kind: 'feature_heal', d20: 0, total: event.healed, outcome: 'heal', amount: event.healed };
      case 'feature_ac':
        return { kind: 'feature_ac', d20: 0, total: event.amount, outcome: 'buff', amount: event.amount };
      default:
        return null;
    }
  }

  global.TOWER = global.TOWER || {};
  global.TOWER.Mechanics = Mechanics;
  global.TOWER.OfflineNarrator = OfflineNarrator;
  global.TOWER.narrator = OfflineNarrator; // the shipped narrator
  global.TOWER.diceOf = diceOf;
  global.TOWER.cueOf = cueOf;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Mechanics: Mechanics, OfflineNarrator: OfflineNarrator, diceOf: diceOf, cueOf: cueOf };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
