
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

  // Frozen combat-log sentences. The words are the rolls already stored on the
  // event; this does not draw dice.
  function modeLine(ev) {
    if (ev.mode !== 'advantage' && ev.mode !== 'disadvantage') return null;
    var label = ev.mode === 'advantage' ? '優勢' : '劣勢';
    return label + '：擲出 ' + (ev.dice || []).join(' 和 ') + '，取 ' + ev.d20;
  }
  function checkRollLines(ev) {
    if (ev.d20 == null) return [];
    var lines = [];
    var mode = modeLine(ev);
    if (mode) lines.push(mode);
    var result = ev.success ? '成功' : '失敗';
    if (ev.nat === 20 || ev.d20 === 20) result = '自然 20，' + result;
    else if (ev.nat === 1 || ev.d20 === 1) result = '自然 1，' + result;
    var ability = (T.ABILITY_LABEL && T.ABILITY_LABEL[ev.ability]) || '屬性';
    var text = 'd20 擲出 ' + ev.d20 + '，' + ability + ' ' + sign(ev.mod || 0);
    if (ev.prof) text += '，熟練 ' + sign(ev.prof);
    text += '，總數 ' + ev.total + '，難度 ' + ev.dc + '，' + result;
    lines.push(text);
    return lines;
  }
  function attackRollLines(ev) {
    if (ev.d20 == null) return [];
    var lines = [];
    var mode = modeLine(ev);
    if (mode) lines.push(mode);
    var result;
    if (ev.nat === 20 || ev.d20 === 20) result = '自然 20，暴擊';
    else if (ev.nat === 1 || ev.d20 === 1) result = '自然 1，失手';
    else if (ev.crit) result = '暴擊';
    else result = ev.hit ? '命中' : '落空';
    var dc = ev.dc != null ? ev.dc : ev.ac;
    lines.push('d20 擲出 ' + ev.d20 + '，攻擊 ' + sign(ev.bonus || 0) + '，總數 ' + ev.total + '，難度 ' + dc + '，' + result);
    return lines;
  }
  function initiativeRollLines(ev) {
    return (ev.order || []).map(function (row) {
      return '先攻。d20 擲出 ' + row.roll + '，加值 ' + sign(row.bonus || 0) + '，總數 ' + row.total;
    });
  }
  function saveRollLines(ev) {
    if (ev.d20 == null) return [];
    var ability = (T.ABILITY_LABEL && T.ABILITY_LABEL[ev.save]) || '屬性';
    var result = ev.success ? '成功' : '失敗';
    if (ev.nat === 20 || ev.d20 === 20) result = '自然 20，' + result;
    else if (ev.nat === 1 || ev.d20 === 1) result = '自然 1，' + result;
    return ['d20 擲出 ' + ev.d20 + '，' + ability + '豁免 ' + sign(ev.bonus || 0) + '，總數 ' + ev.total + '，難度 ' + ev.dc + '，' + result];
  }
  function rollLines(ev) {
    if (!ev) return [];
    if (ev.t === 'check') return checkRollLines(ev);
    if (ev.t === 'attack' || ev.t === 'enemy_attack') return attackRollLines(ev);
    if (ev.t === 'save') return saveRollLines(ev);
    if (ev.t === 'initiative') return initiativeRollLines(ev);
    return [];
  }
  function pushRolls(out, ev) {
    rollLines(ev).forEach(function (text) { out.push({ tone: 'roll', text: text }); });
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
          if (ev.narr) out.push({ tone: 'narr', text: ev.narr });
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
        case 'rest':
          out.push({ tone: 'good', text: '〔歇息〕回復 ' + ev.healed + '　→　生命 ' + ev.hp + '/' + ev.hp_max });
          break;
        case 'check_locked':
          out.push({ tone: 'sys', text: '〔擲骰〕這項檢定已經擲過了。' });
          break;
        case 'check':
          pushRolls(out, ev);
          if (ev.narr) out.push({ tone: 'narr', text: ev.narr });
          break;
        case 'attack':
          pushRolls(out, ev);
          if (ev.d20 == null) {
            out.push({ tone: 'roll', text: ev.attackName + '：自動命中。' });
          }
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
        case 'save':
          pushRolls(out, ev);
          if (ev.amount > 0 && ev.damage) {
            var saveHurt = '〔傷害〕' + ev.damage.spec + '：' + diceText(ev.damage) + ' ＝ ' + ev.damage.total;
            if (ev.success && ev.onSuccess === 'half') saveHurt += '，豁免成功減半為 ' + ev.amount;
            saveHurt += '　→　' + ev.targetName + ' ' + ev.targetHpBefore + ' → ' + ev.targetHp + '/' + ev.targetHpMax;
            out.push({ tone: 'roll', text: saveHurt });
          }
          break;
        case 'feature_temp':
          out.push({
            tone: 'good',
            text: '〔特性〕' + ev.featureName + '：臨時生命 ' + ev.tempHp +
                  (ev.gained < ev.amount ? '（取較高，沒有疊加）' : '') +
                  '　（剩餘 ' + (ev.uses == null ? '—' : ev.uses + '/' + ev.usesMax) + '）'
          });
          break;
        case 'feature_recover':
          out.push({
            tone: 'good',
            text: '〔特性〕' + ev.featureName + '：' + ev.poolName + '回復 ' + ev.amount +
                  '　→　剩餘 ' + ev.uses + '/' + ev.usesMax + '。今晚已用過一次。'
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
          pushRolls(out, ev);
          if (ev.hit) {
            out.push({
              tone: 'bad',
              text: '〔傷害〕' + ev.damage.spec + '：' + diceText(ev.damage) + ' ＝ ' + ev.damage.total +
                    (ev.tempAbsorbed ? '（臨時生命承受 ' + ev.tempAbsorbed + '）' : '') +
                    '　→　生命 ' + ev.hp + '/' + ev.hp_max
            });
          }
          break;
        case 'combat_win':
          out.push({ tone: 'good', text: ev.reason === 'yield' ? '〔戰鬥〕敵人棄戰，這一場算贏。' : '〔戰鬥〕敵人全部倒下。' });
          if (ev.narr) out.push({ tone: 'narr', text: ev.narr });
          break;
        case 'defend':
          out.push({ tone: 'act', text: '〔行動〕防守。到下次行動前，敵方攻擊有劣勢。' });
          break;
        case 'initiative':
          pushRolls(out, ev);
          break;
        case 'reaction':
          out.push({
            tone: 'good',
            text: '〔反應〕' + ev.featureName + '：傷害 ' + ev.original + ' 減為 ' + ev.amount +
                  '（剩餘 ' + ev.uses + '/' + ev.usesMax + '）'
          });
          break;
        case 'move_refresh':
          out.push({ tone: 'sys', text: '〔歇腳〕招式次數恢復。生命沒有回復。' });
          break;
        case 'retry':
          out.push({ tone: 'sys', text: '〔重試〕從上一處歇腳再走，骰子換過一組。' });
          break;
        case 'clear_status':
          out.push({ tone: 'good', text: '〔狀態〕異常狀態解除。' });
          break;
        case 'ambush':
          out.push({
            tone: 'sys',
            text: ev.outcome === 'success'
              ? '〔埋伏〕成功。敵方第一回合無法行動。'
              : '〔埋伏〕失敗。你第一回合無法行動。'
          });
          break;
        case 'flee':
          out.push({ tone: 'act', text: ev.escaped ? '〔行動〕逃走' : '〔行動〕逃走　—　這裡沒有退路' });
          if (ev.narr) out.push({ tone: 'narr', text: ev.narr });
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
          if (d && d.scripted) break;
          if (d) {
            out.push({ tone: 'narr', text: '難度 ' + d.dc + '。' });
            var eq = d.d20 + ' ＋ ' + (d.mod || 0) + (d.prof ? ' ＋ ' + d.prof : '') + ' ＝ ' + d.total;
            if (d.d20 === 20) out.push({ tone: 'narr', text: '天時地利。' + eq + '。' });
            else if (d.d20 === 1) out.push({ tone: 'narr', text: '腳下一滑，這一手沒有抓好。' + eq + '。' });
            else out.push({ tone: 'narr', text: eq + (d.outcome === 'success' ? '，成功。' : '，沒有達到難度。') });
          }
          break;

        case 'attack':
          if (d) {
            if (d.dc != null) out.push({ tone: 'narr', text: '難度 ' + d.dc + '。' });
            if (d.mode === 'advantage' || d.mode === 'disadvantage') {
              out.push({ tone: 'narr', text: (d.mode === 'advantage' ? '優勢' : '劣勢') + '：擲出 ' +
                (d.dice || []).join(' 和 ') + '，取 ' + d.d20 + '。' });
            }
            if (d.nat === 20) out.push({ tone: 'narr', text: '天時地利，這一擊正中要害。暴擊。傷害骰再擲一次。' });
            else if (d.nat === 1) out.push({ tone: 'narr', text: '腳下一滑，武器擦過石壁。這一擊沒有打中。' });
            else if (d.d20 != null) {
              out.push({ tone: 'narr', text: d.d20 + ' ＋ ' + (d.bonus || 0) + ' ＝ ' + d.total +
                (d.outcome === 'hit' ? '，打中了。' : '，沒有打中。') });
            }
          }
          if (d && d.outcome === 'hit' && view.enemies.some(function (e) { return e.hp <= 0; })) {
            out.push({ tone: 'good', text: '一個敵人垮了下去，不再動。' });
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
        case 'save':
          if (d) {
            out.push({ tone: 'narr', text: '難度 ' + d.dc + '。' });
            out.push({ tone: 'narr', text: d.d20 + ' ＋ ' + (d.bonus || 0) + ' ＝ ' + d.total +
              (d.outcome === 'success' ? '，豁免成功。' : '，豁免失敗。') });
          }
          break;
        case 'feature_ac':
          out.push({ tone: 'narr', text: view.name + '運起職業能力，防禦暫時堅固起來。' });
          break;
        case 'enemy_attack':
          if (d && d.dc != null) out.push({ tone: 'narr', text: '難度 ' + d.dc + '。' });
          if (d && (d.mode === 'advantage' || d.mode === 'disadvantage')) {
            out.push({ tone: 'narr', text: (d.mode === 'advantage' ? '優勢' : '劣勢') + '：擲出 ' +
              (d.dice || []).join(' 和 ') + '，取 ' + d.d20 + '。' });
          }
          if (d && d.nat === 20) out.push({ tone: 'narr', text: '敵人這一擊勢不可擋。暴擊。' });
          else if (d && d.nat === 1) out.push({ tone: 'narr', text: '敵人腳下一滑，這一擊沒有打中。' });
          else if (d && d.outcome === 'hit') {
            out.push({ tone: 'narr', text: d.d20 + ' ＋ ' + (d.bonus || 0) + ' ＝ ' + d.total + '，打中了' + view.name + '。' });
          } else if (d) {
            out.push({ tone: 'narr', text: d.d20 + ' ＋ ' + (d.bonus || 0) + ' ＝ ' + d.total + '，沒有打中。' });
          }
          break;
        case 'defend':
          out.push({ tone: 'narr', text: view.name + '守住架勢，等對方先出手。' });
          break;
        case 'initiative':
          out.push({ tone: 'narr', text: '雙方同時拔出武器，看誰先動手。' });
          break;
        case 'reaction':
          out.push({ tone: 'narr', text: view.name + '側身讓過一半力道。' });
          break;
        case 'move_refresh':
          out.push({ tone: 'narr', text: view.name + '歇了一歇，招式又能用了。傷口還在。' });
          break;
        case 'retry':
          out.push({ tone: 'narr', text: view.name + '從歇腳的地方重新站起來。' });
          break;
        case 'clear_status':
          out.push({ tone: 'narr', text: '身上的異常散去。' });
          break;
        case 'ambush':
          out.push({ tone: 'narr', text: '有人想搶先一步。' });
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
        return { kind: 'check', d20: event.d20, total: event.total, dc: event.dc, mod: event.mod, prof: event.prof,
                 dice: event.dice || null, mode: event.mode || 'normal', scripted: !!event.narr,
                 nat: event.d20, outcome: event.success ? 'success' : 'fail' };
      case 'attack':
        return { kind: 'attack', d20: event.d20, total: event.total, dc: event.dc, bonus: event.bonus,
                 dice: event.dice || null, mode: event.mode || 'normal', nat: event.nat, crit: !!event.crit,
                 outcome: event.hit ? 'hit' : 'miss', amount: event.hit && event.damage ? event.damage.total : 0 };
      case 'enemy_attack':
        return { kind: 'enemy_attack', d20: event.d20, total: event.total, dc: event.dc, bonus: event.bonus,
                 dice: event.dice || null, mode: event.mode || 'normal', nat: event.nat,
                 outcome: event.hit ? 'hit' : 'miss', amount: event.hit && event.damage ? event.damage.total : 0 };
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
      case 'save':
        return { kind: 'save', d20: event.d20, total: event.total, dc: event.dc, bonus: event.bonus || 0,
                 dice: event.dice || null, mode: event.mode || 'normal', nat: event.d20,
                 outcome: event.success ? 'success' : 'fail', amount: event.amount || 0 };
      default:
        return null;
    }
  }

  global.TOWER = global.TOWER || {};
  Mechanics.rollLines = rollLines;
  global.TOWER.Mechanics = Mechanics;
  global.TOWER.OfflineNarrator = OfflineNarrator;
  global.TOWER.narrator = OfflineNarrator; // the shipped narrator
  global.TOWER.diceOf = diceOf;
  global.TOWER.cueOf = cueOf;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Mechanics: Mechanics, OfflineNarrator: OfflineNarrator, diceOf: diceOf, cueOf: cueOf };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
