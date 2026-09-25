/* Waste Tower script data.
   Writers: edit the wasted_tower object below. Do not edit js/engine.js for story work.
   Syntax is JSON (quoted keys, no trailing commas). See README「腳本資料格式」.
   寫故事只改下面的 wasted_tower 物件。說明見 README。
*/
(function (root) {
  var ADVENTURES = {
    wasted_tower: {
  "id": "wasted_tower",
  "title": "廢塔一夜",
  "start": "f1_gate",
  "meta": {
    "required_for_secret": [
      "f1_rats",
      "f1_bandit",
      "f2_bones",
      "f2_ooze",
      "f3_cult",
      "f3_wight",
      "hide_vault",
      "hide_crypt"
    ],
    "schema_version": 2,
    "script_version": 1,
    "class_flags": {
      "戰士": "cls_warrior",
      "遊俠": "cls_ranger",
      "盜賊": "cls_rogue",
      "牧師": "cls_cleric",
      "法師": "cls_mage"
    }
  },
  "flag_defs": {
    "cls_warrior": { "label": "戰士" },
    "cls_ranger": { "label": "遊俠" },
    "cls_rogue": { "label": "盜賊" },
    "cls_cleric": { "label": "牧師" },
    "cls_mage": { "label": "法師" },
    "gate_searched": {
      "key": true,
      "label": "搜查門廊"
    },
    "gate_rushed": {
      "key": true,
      "label": "直接進塔"
    },
    "hall_climb": {
      "key": true,
      "label": "攀爬過塌陷處"
    },
    "hall_creep": {
      "key": true,
      "label": "貼牆潛行繞過"
    },
    "hall_scan": {
      "key": true,
      "label": "細看地板找落腳點"
    },
    "opened_vault_door": {
      "key": true,
      "label": "用鏽鐵鑰匙開側門"
    },
    "skipped_vault": {
      "key": true,
      "label": "直上正路"
    },
    "vault_cleared": {
      "key": true,
      "label": "拿走鑰匙與藥水，回到正路"
    },
    "trap_forced": {
      "key": true,
      "label": "硬踩過去"
    },
    "trap_watched": {
      "key": true,
      "label": "觀察陷阱縫隙"
    },
    "door_unlocked": {
      "key": true,
      "label": "用銅鏽鑰匙開門"
    },
    "door_smashed": {
      "key": true,
      "label": "撞開鐵門"
    },
    "opened_crypt": {
      "key": true,
      "label": "打開密龕"
    },
    "skipped_crypt": {
      "key": true,
      "label": "直闖內室"
    },
    "took_holy_water": {
      "key": true,
      "label": "帶回祭壇走廊"
    },
    "left_with_badge": {
      "key": true,
      "label": "帶著銅徽離開"
    },
    "faced_rival": {
      "key": true,
      "label": "面對跟蹤的冒險者"
    },
    "rival": {
      "key": true,
      "label": "對手"
    }
  },
  "items": [
    {
      "id": "lantern",
      "name": "提燈",
      "kind": "gear"
    },
    {
      "id": "iron_key",
      "name": "鏽鐵鑰匙",
      "kind": "key"
    },
    {
      "id": "rust_key",
      "name": "銅鏽鑰匙",
      "kind": "key"
    },
    {
      "id": "potion_heal",
      "name": "治療藥水",
      "kind": "consumable",
      "heal": 8
    },
    {
      "id": "potion_heal_2",
      "name": "治療藥水",
      "kind": "consumable",
      "heal": 8
    },
    {
      "id": "cure_wounds",
      "name": "治療術卷軸",
      "kind": "consumable",
      "heal": 10
    },
    {
      "id": "burning_hands",
      "name": "燃燒之手卷軸",
      "kind": "consumable",
      "damage": 8
    },
    {
      "id": "alchemist_fire",
      "name": "煉金火",
      "kind": "consumable",
      "damage": 6
    },
    {
      "id": "holy_water",
      "name": "聖水",
      "kind": "consumable",
      "damage": 7
    }
  ],
  "pregens": [
    {
      "name": "布倫",
      "class": "戰士",
      "race": "人類",
      "str": 16,
      "dex": 12,
      "con": 15,
      "int": 8,
      "wis": 10,
      "cha": 10,
      "ac": 16,
      "hp_max": 12,
      "skills": [
        "athletics"
      ],
      "attack": {
        "name": "長劍",
        "bonus": 5,
        "damage": "1d8+3"
      },
      "inventory": [
        "potion_heal",
        "lantern"
      ],
      "features": [
        {
          "id": "power_strike",
          "name": "破甲重擊",
          "uses": 3,
          "effect": {
            "type": "damage",
            "amount": 10
          }
        }
      ]
    },
    {
      "name": "希薇",
      "class": "遊俠",
      "race": "精靈",
      "str": 12,
      "dex": 16,
      "con": 13,
      "int": 10,
      "wis": 14,
      "cha": 8,
      "ac": 14,
      "hp_max": 11,
      "skills": [
        "stealth",
        "perception"
      ],
      "attack": {
        "name": "短弓",
        "bonus": 5,
        "damage": "1d8+3"
      },
      "inventory": [
        "potion_heal",
        "alchemist_fire"
      ],
      "features": [
        {
          "id": "aimed_shot",
          "name": "穿心一箭",
          "uses": 3,
          "effect": {
            "type": "damage",
            "amount": 8
          }
        }
      ]
    },
    {
      "name": "芬恩",
      "class": "盜賊",
      "race": "半身人",
      "str": 8,
      "dex": 16,
      "con": 12,
      "int": 13,
      "wis": 12,
      "cha": 10,
      "ac": 14,
      "hp_max": 9,
      "skills": [
        "stealth"
      ],
      "attack": {
        "name": "短劍",
        "bonus": 5,
        "damage": "1d6+3"
      },
      "inventory": [
        "potion_heal",
        "lantern"
      ],
      "features": [
        {
          "id": "sneak_stab",
          "name": "暗影偷襲",
          "uses": 3,
          "effect": {
            "type": "damage",
            "amount": 9
          }
        }
      ]
    },
    {
      "name": "米拉",
      "class": "牧師",
      "race": "人類",
      "str": 14,
      "dex": 10,
      "con": 14,
      "int": 8,
      "wis": 16,
      "cha": 12,
      "ac": 16,
      "hp_max": 10,
      "skills": [
        "insight"
      ],
      "attack": {
        "name": "神聖打擊",
        "bonus": 4,
        "damage": "1d6+2"
      },
      "inventory": [
        "cure_wounds",
        "potion_heal"
      ],
      "features": [
        {
          "id": "lay_on_hands",
          "name": "聖療",
          "uses": 3,
          "effect": {
            "type": "heal",
            "amount": 8
          }
        }
      ]
    },
    {
      "name": "奧爾",
      "class": "法師",
      "race": "精靈",
      "str": 8,
      "dex": 14,
      "con": 12,
      "int": 16,
      "wis": 12,
      "cha": 10,
      "ac": 12,
      "hp_max": 8,
      "skills": [
        "perception"
      ],
      "attack": {
        "name": "火焰箭",
        "bonus": 4,
        "damage": "1d8+2"
      },
      "inventory": [
        "burning_hands",
        "potion_heal"
      ],
      "features": [
        {
          "id": "mage_armor",
          "name": "法師護甲",
          "uses": 3,
          "effect": {
            "type": "ac_bonus",
            "amount": 3,
            "duration": "combat"
          }
        }
      ]
    }
  ],
  "scenes": [
    {
      "id": "f1_gate",
      "type": "beat",
      "facts": [
        "林緣有一座廢塔。",
        "木門半掩。",
        "天色將晚。"
      ],
      "choices": [
        {
          "id": "search",
          "label": "搜查門廊",
          "to": "f1_rats",
          "give": [
            "iron_key"
          ],
          "set_flag": [
            "gate_searched"
          ]
        },
        {
          "id": "rush",
          "label": "直接進塔",
          "to": "f1_rats",
          "set_flag": [
            "gate_rushed"
          ]
        }
      ]
    },
    {
      "id": "f1_rats",
      "type": "combat",
      "facts": [
        "門廳竄出腐鼠。",
        "地上有齧過的布條。",
        "對面有走廊。"
      ],
      "enemies": [
        {
          "id": "rat_1",
          "name": "腐鼠",
          "ac": 11,
          "hp": 4,
          "atk": 2,
          "damage": "1d4"
        },
        {
          "id": "rat_2",
          "name": "腐鼠",
          "ac": 11,
          "hp": 4,
          "atk": 2,
          "damage": "1d4"
        },
        {
          "id": "rat_3",
          "name": "腐鼠",
          "ac": 11,
          "hp": 3,
          "atk": 2,
          "damage": "1d4"
        }
      ],
      "win_to": "f1_hall",
      "flee_to": "f1_gate"
    },
    {
      "id": "f1_hall",
      "type": "beat",
      "facts": [
        "走廊地板塌了一角。",
        "塵土裡露出朽木梁。",
        "盡頭有向下的石階。"
      ],
      "choices": [
        {
          "id": "climb",
          "label": "攀爬過塌陷處",
          "to": "f1_ath",
          "set_flag": [
            "hall_climb"
          ]
        },
        {
          "id": "creep",
          "label": "貼牆潛行繞過",
          "to": "f1_stl",
          "set_flag": [
            "hall_creep"
          ]
        },
        {
          "id": "scan",
          "label": "細看地板找落腳點",
          "to": "f1_per",
          "set_flag": [
            "hall_scan"
          ]
        }
      ]
    },
    {
      "id": "f1_ath",
      "type": "check",
      "facts": [
        "你打算硬闖過去。"
      ],
      "skill": "athletics",
      "dc": 12,
      "success_to": "f1_bandit",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2
    },
    {
      "id": "f1_stl",
      "type": "check",
      "facts": [
        "你貼著牆邊找縫隙繞過去。"
      ],
      "skill": "stealth",
      "dc": 12,
      "success_to": "f1_bandit",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2
    },
    {
      "id": "f1_per",
      "type": "check",
      "facts": [
        "你仔細觀察哪塊地板還撐得住。"
      ],
      "skill": "perception",
      "dc": 12,
      "success_to": "f1_bandit",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2
    },
    {
      "id": "f1_bandit",
      "type": "combat",
      "facts": [
        "石階口有一個盜墓者擋住去路。",
        "他握著生鏽短斧。",
        "只有這一個人。"
      ],
      "enemies": [
        {
          "id": "bandit",
          "name": "盜墓者",
          "ac": 13,
          "hp": 11,
          "atk": 3,
          "damage": "1d6+1"
        }
      ],
      "win_to": "cp_f1",
      "flee_to": "f1_hall"
    },
    {
      "id": "cp_f1",
      "type": "checkpoint",
      "floor": 1,
      "name": "一層歇腳",
      "facts": [
        "一層的路已經走完。",
        "你可以在這裡歇息。"
      ],
      "continue_to": "f2_stairs"
    },
    {
      "id": "f2_stairs",
      "type": "beat",
      "facts": [
        "你來到二層轉角。",
        "正路通往上層通道。",
        "側牆有一扇上鎖小門。"
      ],
      "choices": [
        {
          "id": "side",
          "label": "用鏽鐵鑰匙開側門",
          "to": "hide_vault",
          "require_item": [
            "iron_key"
          ],
          "set_flag": [
            "opened_vault_door"
          ]
        },
        {
          "id": "up",
          "label": "直上正路",
          "to": "f2_bones",
          "set_flag": [
            "skipped_vault"
          ]
        }
      ]
    },
    {
      "id": "hide_vault",
      "type": "combat",
      "hidden": true,
      "facts": [
        "側門後是一間狹窄寶庫。",
        "石像守衛擋在箱子前。",
        "沒有其他出口。"
      ],
      "enemies": [
        {
          "id": "statue",
          "name": "石像守衛",
          "ac": 14,
          "hp": 14,
          "atk": 4,
          "damage": "1d6+1"
        }
      ],
      "win_to": "hide_vault_loot",
      "flee_to": "f2_stairs"
    },
    {
      "id": "hide_vault_loot",
      "type": "beat",
      "facts": [
        "石像倒下。",
        "箱內有一把銅鏽鑰匙和一瓶藥水。"
      ],
      "choices": [
        {
          "id": "take_loot",
          "label": "拿走鑰匙與藥水，回到正路",
          "to": "f2_bones",
          "give": [
            "rust_key",
            "potion_heal_2"
          ],
          "set_flag": [
            "vault_cleared"
          ],
          "take": [
            "iron_key"
          ]
        }
      ]
    },
    {
      "id": "f2_bones",
      "type": "combat",
      "facts": [
        "通道裡有一具朽骨站起來。",
        "通道很窄。",
        "再往裡是陷阱標記的石板。"
      ],
      "enemies": [
        {
          "id": "bone_guard",
          "name": "朽骨守衛",
          "ac": 12,
          "hp": 9,
          "atk": 3,
          "damage": "1d4+1"
        }
      ],
      "win_to": "f2_trap",
      "flee_to": "f2_stairs"
    },
    {
      "id": "f2_trap",
      "type": "beat",
      "facts": [
        "石板上有細縫。",
        "空氣裡有灰塵味。",
        "對面是濕潤的下層入口。"
      ],
      "choices": [
        {
          "id": "force",
          "label": "硬踩過去",
          "to": "f2_trap_ath",
          "set_flag": [
            "trap_forced"
          ]
        },
        {
          "id": "watch",
          "label": "觀察陷阱縫隙",
          "to": "f2_trap_per",
          "set_flag": [
            "trap_watched"
          ]
        }
      ]
    },
    {
      "id": "f2_trap_ath",
      "type": "check",
      "facts": [
        "你打算用腳步硬闖。"
      ],
      "skill": "athletics",
      "dc": 13,
      "success_to": "f2_ooze",
      "fail_to": "f2_ooze",
      "fail_hp_delta": -3
    },
    {
      "id": "f2_trap_per",
      "type": "check",
      "facts": [
        "你盯著縫隙找安全落點。"
      ],
      "skill": "perception",
      "dc": 12,
      "success_to": "f2_ooze",
      "fail_to": "f2_ooze",
      "fail_hp_delta": -2
    },
    {
      "id": "f2_ooze",
      "type": "combat",
      "facts": [
        "濕室裡有一團酸蝕軟泥。",
        "地面被腐蝕出凹坑。",
        "只有這一團。"
      ],
      "enemies": [
        {
          "id": "ooze",
          "name": "酸蝕軟泥",
          "ac": 11,
          "hp": 14,
          "atk": 3,
          "damage": "1d4+1"
        }
      ],
      "win_to": "cp_f2",
      "flee_to": "f2_trap"
    },
    {
      "id": "cp_f2",
      "type": "checkpoint",
      "floor": 2,
      "name": "二層歇腳",
      "facts": [
        "二層的路已經走完。",
        "你可以在這裡歇息。"
      ],
      "continue_to": "f3_door"
    },
    {
      "id": "f3_door",
      "type": "beat",
      "facts": [
        "底層鐵門擋住內室。",
        "門上有銅鏽鎖孔。",
        "門後傳出冷風。"
      ],
      "choices": [
        {
          "id": "unlock",
          "label": "用銅鏽鑰匙開門",
          "to": "f3_cult",
          "require_item": [
            "rust_key"
          ],
          "set_flag": [
            "door_unlocked"
          ]
        },
        {
          "id": "smash",
          "label": "撞開鐵門",
          "to": "f3_cult",
          "hp_delta": -3,
          "set_flag": [
            "door_smashed"
          ]
        }
      ]
    },
    {
      "id": "f3_cult",
      "type": "combat",
      "facts": [
        "內室站著一個塔影邪徒。",
        "他手持短杖。",
        "再往裡是祭壇走廊。"
      ],
      "enemies": [
        {
          "id": "cultist",
          "name": "塔影邪徒",
          "ac": 12,
          "hp": 12,
          "atk": 3,
          "damage": "1d6+1"
        }
      ],
      "win_to": "f3_shrine",
      "flee_to": "f3_door"
    },
    {
      "id": "f3_shrine",
      "type": "beat",
      "facts": [
        "祭壇前可以稍作喘息。",
        "牆邊有一個密龕。",
        "正門通往怨靈內室。"
      ],
      "choices": [
        {
          "id": "niche",
          "label": "打開密龕",
          "to": "hide_crypt",
          "require_flag": [
            "vault_cleared"
          ],
          "set_flag": [
            "opened_crypt"
          ]
        },
        {
          "id": "rush_boss",
          "label": "直闖內室",
          "to": "f3_wight",
          "set_flag": [
            "skipped_crypt"
          ]
        }
      ]
    },
    {
      "id": "hide_crypt",
      "type": "combat",
      "hidden": true,
      "facts": [
        "密龕後是一間小墓室。",
        "墓影從棺中升起。",
        "角落有一瓶聖水。"
      ],
      "enemies": [
        {
          "id": "crypt_shade",
          "name": "墓影",
          "ac": 12,
          "hp": 10,
          "atk": 3,
          "damage": "1d4+2"
        }
      ],
      "win_to": "hide_crypt_loot",
      "flee_to": "f3_shrine"
    },
    {
      "id": "hide_crypt_loot",
      "type": "beat",
      "facts": [
        "墓影散去。",
        "你取得聖水。"
      ],
      "choices": [
        {
          "id": "take_holy",
          "label": "帶回祭壇走廊",
          "to": "f3_wight",
          "give": [
            "holy_water"
          ],
          "set_flag": [
            "took_holy_water"
          ]
        }
      ]
    },
    {
      "id": "f3_wight",
      "type": "combat",
      "facts": [
        "內室中央立著塔影怨靈。",
        "沒有其他出口。"
      ],
      "enemies": [
        {
          "id": "tower_wight",
          "name": "塔影怨靈",
          "ac": 13,
          "hp": 16,
          "atk": 4,
          "damage": "1d6+1"
        }
      ],
      "win_to": "cp_f3"
    },
    {
      "id": "cp_f3",
      "type": "checkpoint",
      "floor": 3,
      "name": "三層歇腳",
      "facts": [
        "塔裡的三層都走完了。",
        "出塔之前，你可以在這裡歇息。"
      ],
      "continue_to": "post_tower"
    },
    {
      "id": "post_tower",
      "type": "beat",
      "facts": [
        "怨靈散成灰。",
        "你走出廢塔。",
        "林緣風很大。"
      ],
      "choices": [
        {
          "id": "leave",
          "label": "帶著銅徽離開",
          "to": "win",
          "set_flag": [
            "left_with_badge"
          ]
        },
        {
          "id": "face_rival",
          "label": "面對跟蹤的冒險者",
          "to": "pick_rival",
          "require_flag": [
            "secret_ready"
          ],
          "set_flag": [
            "faced_rival"
          ]
        }
      ]
    },
    {
      "id": "pick_rival",
      "type": "beat",
      "facts": [
        "林緣站著另一名冒險者。",
        "對方擋住去路。"
      ],
      "choices_from": "other_pregens",
      "choice_to": "rival_boss"
    },
    {
      "id": "rival_boss",
      "type": "combat",
      "omit_from_tally": true,
      "facts": [
        "對手拔出武器。",
        "這是一場冒險者對決。"
      ],
      "enemies": [
        {
          "from_pregen": "selected_rival"
        }
      ],
      "win_to": "secret_win",
      "flee_to": "post_tower"
    },
    {
      "id": "win",
      "type": "end",
      "end": "win",
      "ending_type": "main",
      "facts": [
        "你取下牆上的銅徽。",
        "廢塔恢復寂靜。",
        "這一夜結束了。"
      ],
      "name": "通關"
    },
    {
      "id": "secret_win",
      "type": "end",
      "end": "secret_win",
      "ending_type": "secret",
      "facts": [
        "跟蹤者倒下。",
        "你清掃了整座廢塔。",
        "銅徽在夜色中發亮。",
        "隱藏結局。"
      ],
      "name": "隱藏結局",
      "when": {
        "all_flags": [
          "secret_ready"
        ]
      }
    }
  ]
}
  };
  var DEFAULT_ADVENTURE_ID = 'wasted_tower';
  root.ADVENTURES = ADVENTURES;
  root.DEFAULT_ADVENTURE_ID = DEFAULT_ADVENTURE_ID;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ADVENTURES: ADVENTURES, DEFAULT_ADVENTURE_ID: DEFAULT_ADVENTURE_ID };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
