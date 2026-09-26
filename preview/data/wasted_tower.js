/* Waste Tower script data.
   Writers: edit the wasted_tower object below. Do not edit js/engine.js for story work.
   Syntax is JSON (quoted keys, no trailing commas). See README「腳本資料格式」.
   寫故事只改下面的 wasted_tower 物件。說明見 README。

   授權與鳴謝
   《廢塔一夜》部分戰鬥規則（例如優勢、劣勢、狀態、豁免、傷害類型，以及部分招式、道具與敵人能力）改編自下列規則文件，並經刪減、調整數值與翻譯為中文。

   This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

   故事、角色、地點與敵人名稱屬本作原創。
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
    },
    "lose_ending": {
      "name": "倒在塔中",
      "closing": "你倒在塔裡，這一夜沒有走完。"
    }
  },
  "class_branches": [
    {
      "id": "branch_warrior",
      "label": "歸隊",
      "when": {
        "all_flags": [
          "cls_warrior"
        ]
      },
      "completed_when": {
        "all_flags": [
          "brun_buried_captain"
        ]
      },
      "miss_reason": "沒有收殮隊長"
    },
    {
      "id": "branch_ranger",
      "label": "林歸寂靜",
      "when": {
        "all_flags": [
          "cls_ranger"
        ]
      },
      "completed_when": {
        "all_flags": [
          "sylvie_freed_deer"
        ]
      },
      "miss_reason": "將鹿角製成了箭"
    },
    {
      "id": "branch_rogue",
      "label": "偷天換徽",
      "when": {
        "all_flags": [
          "cls_rogue"
        ]
      },
      "completed_when": {
        "all_flags": [
          "finn_contract",
          "finn_brass_scrap",
          "finn_swapped"
        ]
      },
      "miss_reason": "將真銅徽交給了黑手"
    },
    {
      "id": "branch_cleric",
      "label": "迷途者歸",
      "when": {
        "all_flags": [
          "cls_cleric"
        ]
      },
      "completed_when": {
        "all_flags": [
          "mira_redeemed"
        ]
      },
      "miss_reason": "沒有為艾文驅走塔影"
    },
    {
      "id": "branch_mage",
      "label": "師債徒還",
      "when": {
        "all_flags": [
          "cls_mage"
        ]
      },
      "completed_when": {
        "all_flags": [
          "orr_burned"
        ]
      },
      "miss_reason": "收起了禁忌筆記"
    }
  ],
  "flag_defs": {
    "cls_warrior": {
      "label": "戰士"
    },
    "cls_ranger": {
      "label": "遊俠"
    },
    "cls_rogue": {
      "label": "盜賊"
    },
    "cls_cleric": {
      "label": "牧師"
    },
    "cls_mage": {
      "label": "法師"
    },
    "aff_bandit": {
      "min": 0,
      "max": 2,
      "label": "盜墓者好感"
    },
    "spared_bandit": {
      "key": true,
      "label": "盜墓者：放過"
    },
    "bandit_persuaded": {
      "key": true,
      "label": "盜墓者：勸服"
    },
    "looted_bandit": {
      "key": true,
      "label": "盜墓者：搜身"
    },
    "respected_dead": {
      "key": true,
      "label": "骸骨：合眼"
    },
    "took_from_dead": {
      "key": true,
      "label": "骸骨：摸屍"
    },
    "took_cloth": {
      "key": true,
      "label": "布條：有"
    },
    "left_potion": {
      "key": true,
      "label": "濕室藥水：留下"
    },
    "spared_cultist": {
      "key": true,
      "label": "邪徒：放過"
    },
    "killed_cultist": {
      "key": true,
      "label": "邪徒：了結"
    },
    "mira_redeemed": {
      "key": true,
      "label": "邪徒：驅走塔影"
    },
    "finn_sold": {
      "key": true,
      "label": "銅徽：賣出"
    },
    "finn_swapped": {
      "key": true,
      "label": "銅徽：掉包"
    },
    "orr_kept": {
      "key": true,
      "label": "禁忌筆記：收起"
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
    },
    {
      "id": "antler_arrow",
      "name": "鹿角箭",
      "kind": "consumable",
      "damage": 8
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
        "athletics",
        "intimidation",
        "history"
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
      "passives": [
        {
          "id": "champion",
          "name": "冠軍",
          "crit_on": 19
        }
      ],
      "features": [
        {
          "id": "longsword",
          "name": "長劍攻擊",
          "group": "everyday",
          "at_will": true,
          "summary": "需命中，1d8+3 斬擊",
          "detail": "d20＋5 對目標 AC，命中造成 1d8+3 斬擊傷害。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true
        },
        {
          "id": "power_strike",
          "name": "破甲重擊",
          "group": "big",
          "summary": "需命中，+1d8，AC−2",
          "detail": "d20＋5 對目標 AC，命中造成 1d8+3＋1d8 斬擊傷害，目標本場 AC −2。",
          "uses": 2,
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true,
          "damage_dice": "1d8",
          "damage_type": "slashing",
          "on_hit": {
            "ac_delta": -2
          }
        },
        {
          "id": "second_wind",
          "name": "喘息",
          "group": "rescue",
          "summary": "回復 1d10+2，不佔回合",
          "detail": "回復 1d10+2 點生命，不佔用本回合行動。",
          "uses": 1,
          "costs_turn": false,
          "target": "self",
          "roll": "auto",
          "heal_dice": "1d10+2"
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
        "perception",
        "survival"
      ],
      "attack": {
        "name": "長弓",
        "bonus": 5,
        "damage": "1d8+3"
      },
      "inventory": [
        "potion_heal",
        "alchemist_fire"
      ],
      "pools": [
        {
          "id": "ranger_spells",
          "name": "遊俠法術",
          "uses": 2
        }
      ],
      "features": [
        {
          "id": "longbow",
          "name": "長弓射擊",
          "group": "everyday",
          "at_will": true,
          "summary": "需命中，1d8+3 穿刺",
          "detail": "d20＋5 對目標 AC，命中造成 1d8+3 穿刺傷害。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true,
          "ranged": true
        },
        {
          "id": "net",
          "name": "擲網",
          "group": "big",
          "summary": "命中則束縛，不造成傷害",
          "hint": "敵人血多、想爭取時間時用。",
          "detail": "d20＋5 對目標 AC 擲出網。命中則目標被束縛，直到它用一整個回合通過力量檢定（難度 10）掙脫。不造成傷害。對沒有固定形體的敵人無效。每次休息一次。【原創簡化】",
          "uses": 1,
          "costs_turn": true,
          "target": "enemy",
          "roll": "apply_status",
          "via": "attack",
          "attack_bonus": 5,
          "ranged": true,
          "status": "restrained",
          "no_effect": ["ooze", "crypt_shade"]
        },
        {
          "id": "aimed_shot",
          "name": "穿心一箭",
          "group": "big",
          "summary": "優勢，+1d8 穿刺",
          "detail": "以優勢擲 d20 命中，命中後傷害額外加 1d8。",
          "uses": 2,
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "advantage": true,
          "uses_weapon": true,
          "damage_dice": "1d8",
          "damage_type": "piercing"
        },
        {
          "id": "hunters_mark",
          "name": "獵人印記",
          "group": "big",
          "summary": "標記：本場命中 +1d6",
          "detail": "標記一名敵人並同時射出一箭；本場你每次命中該敵人，傷害額外加 1d6。",
          "pool": "ranger_spells",
          "cost": 1,
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true,
          "mark": {
            "bonus_dice": "1d6",
            "damage_type": "piercing"
          }
        },
        {
          "id": "cure_wounds",
          "name": "治療術",
          "group": "rescue",
          "summary": "回復 1d8+2",
          "detail": "回復 1d8+2 點生命。",
          "pool": "ranger_spells",
          "cost": 1,
          "costs_turn": true,
          "target": "self",
          "roll": "auto",
          "heal_dice": "1d8+2"
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
        "stealth",
        "sleight_of_hand",
        "investigation",
        "deception"
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
      "passives": [
        {
          "id": "sneak_attack",
          "name": "偷襲",
          "dice": "2d6",
          "damage_type": "piercing",
          "once_per_turn": true
        }
      ],
      "features": [
        {
          "id": "shortsword",
          "name": "短劍攻擊",
          "group": "everyday",
          "at_will": true,
          "summary": "需命中，1d6+3 穿刺",
          "detail": "d20＋5 對目標 AC，命中造成 1d6+3 穿刺傷害；有優勢時觸發偷襲。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true
        },
        {
          "id": "two_weapon",
          "name": "雙持攻擊",
          "group": "everyday",
          "at_will": true,
          "summary": "兩擊：1d6+3 及 1d4",
          "detail": "先以短劍攻擊，再以副手匕首攻擊一次（1d4 穿刺，不加屬性）。兩擊各自擲 d20。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "strikes": [
            {
              "name": "短劍",
              "uses_weapon": true
            },
            {
              "name": "匕首",
              "damage_dice": "1d4",
              "damage_type": "piercing"
            }
          ]
        },
        {
          "id": "shadow_attack",
          "name": "暗影偷襲",
          "group": "big",
          "summary": "潛行成功則有優勢",
          "detail": "先進行潛行檢定（難度等於 10 加敵人感知加值）；成功則本次攻擊有優勢，而且敵人下一次攻擊你有劣勢。",
          "uses": 3,
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true,
          "stealth_dc": "10+wis"
        },
        {
          "id": "uncanny_dodge",
          "name": "閃身",
          "group": "rescue",
          "summary": "受 4 點以上傷害減半",
          "detail": "受到一次 4 點或以上的傷害時，自動把該次傷害減半。",
          "uses": 2,
          "costs_turn": false,
          "timing": "reaction",
          "target": "self",
          "roll": "auto",
          "trigger": {
            "damage_at_least": 4
          },
          "effect": {
            "type": "halve_damage"
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
        "insight",
        "religion",
        "persuasion"
      ],
      "attack": {
        "name": "釘頭錘",
        "bonus": 4,
        "damage": "1d6+2"
      },
      "inventory": [
        "cure_wounds",
        "potion_heal"
      ],
      "passives": [
        // 原創改動。SRD 5.1 Divine Strike 是 8 級、1d8（p.17）。此處改為每回合第一次武器命中附加 1d4 光耀，法術不觸發。
        {
          "id": "divine_strike",
          "name": "神聖打擊",
          "dice": "1d4",
          "damage_type": "radiant",
          "once_per_turn": true,
          "summary": "每回合武器首擊",
          "detail": "每回合第一次以武器命中時，額外造成 1d4 光耀傷害。法術不會觸發。",
          "narr": "錘上迸出聖光。"
        }
      ],
      "pools": [
        {
          "id": "channel",
          "name": "法術位",
          "uses": 3
        }
      ],
      "features": [
        {
          "id": "mace",
          "name": "釘頭錘",
          "group": "everyday",
          "at_will": true,
          "summary": "需命中，1d6+2 鈍擊",
          "detail": "d20＋4 對目標 AC，命中造成 1d6+2 鈍擊傷害。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "attack",
          "uses_weapon": true
        },
        {
          "id": "sacred_flame",
          "name": "聖焰",
          "group": "everyday",
          "at_will": true,
          "summary": "敏捷豁免，1d8 光耀",
          "detail": "目標進行敏捷豁免（難度 13），失敗受到 1d8 光耀傷害。不需擲命中。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "save",
          "save": "dex",
          "dc": 13,
          "on_success": "none",
          "damage_dice": "1d8",
          "damage_type": "radiant"
        },
        {
          "id": "guiding_bolt",
          "name": "引導之矢",
          "group": "big",
          "summary": "需命中，4d6，下擊優勢",
          "detail": "d20＋5 法術命中，命中造成 4d6 光耀傷害；下一次攻擊該目標有優勢。",
          "pool": "channel",
          "cost": 1,
          "costs_turn": true,
          "target": "enemy",
          "roll": "spell_attack",
          "attack_bonus": 5,
          "damage_dice": "4d6",
          "damage_type": "radiant",
          "on_hit": {
            "next_attack_advantage": true
          }
        },
        {
          "id": "command",
          "name": "命令術",
          "group": "big",
          "summary": "感知豁免，失敗則趴下",
          "hint": "對通人語、血多的敵人用。",
          "detail": "目標進行感知豁免（難度 13）。失敗則趴下倒地，並失去下一次行動。近戰攻擊它有優勢，遠程攻擊有劣勢。它在再下一次行動開始時站起。對不死生物及聽不懂你語言的敵人無效。每次休息一次，不消耗法術位。【原創簡化】",
          "uses": 1,
          "costs_turn": true,
          "target": "enemy",
          "roll": "apply_status",
          "via": "save",
          "save": "wis",
          "dc": 13,
          "status": "prone",
          "no_effect": ["rat_1", "rat_2", "rat_3", "statue", "bone_guard", "ooze", "crypt_shade", "tower_wight"]
        },
        {
          "id": "cure_wounds",
          "name": "治療術",
          "group": "rescue",
          "summary": "回復 1d8+6",
          "detail": "回復 1d8+6 點生命（已計生命門徒）。",
          "pool": "channel",
          "cost": 1,
          "costs_turn": true,
          "target": "ally",
          "roll": "auto",
          "heal_dice": "1d8+6"
        },
        {
          "id": "healing_word",
          "name": "治癒真言",
          "group": "rescue",
          "summary": "回復 1d4+6，不佔回合",
          "detail": "回復 1d4+6 點生命（已計生命門徒），不佔用本回合行動。",
          "pool": "channel",
          "cost": 1,
          "costs_turn": false,
          "target": "self",
          "roll": "auto",
          "heal_dice": "1d4+6"
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
        "perception",
        "arcana",
        "investigation"
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
      "passives": [
        {
          "id": "mage_armor",
          "name": "法師護甲",
          "ac_bonus": 3
        }
      ],
      "pools": [
        {
          "id": "slots",
          "name": "法術位",
          "uses": 3
        }
      ],
      "features": [
        {
          "id": "fire_bolt",
          "name": "火焰箭",
          "group": "everyday",
          "at_will": true,
          "summary": "需命中，1d8+2 火焰",
          "detail": "d20＋4 法術命中，命中造成 1d8+2 火焰傷害。",
          "costs_turn": true,
          "target": "enemy",
          "roll": "spell_attack",
          "attack_bonus": 4,
          "damage_dice": "1d8+2",
          "damage_type": "fire",
          "ranged": true
        },
        {
          "id": "magic_missile",
          "name": "魔法飛彈",
          "group": "big",
          "summary": "三發必中，各 1d4+1",
          "detail": "射出三發飛彈，每發必定命中，造成 1d4+1 力場傷害，可分配給不同敵人。",
          "pool": "slots",
          "cost": 1,
          "costs_turn": true,
          "target": "enemies",
          "roll": "auto",
          "missiles": 3,
          "damage_dice": "1d4+1",
          "damage_type": "force"
        },
        {
          "id": "burning_hands",
          "name": "燃燒之手",
          "group": "big",
          "summary": "全體豁免，3d6 火焰",
          "detail": "所有敵人進行敏捷豁免（難度 13），失敗受到 3d6 火焰傷害，成功減半。",
          "pool": "slots",
          "cost": 1,
          "costs_turn": true,
          "target": "enemies",
          "roll": "save",
          "save": "dex",
          "dc": 13,
          "on_success": "half",
          "damage_dice": "3d6",
          "damage_type": "fire"
        },
        {
          "id": "arcane_recovery",
          "name": "奧術回復",
          "group": "big",
          "summary": "戰鬥外回復 1 個法術位",
          "detail": "只能在戰鬥以外使用：回復 1 個已用的法術位。整晚只可使用一次。",
          "per": "night",
          "combat": false,
          "costs_turn": false,
          "target": "self",
          "roll": "auto",
          "restore_pool": "slots",
          "restore_amount": 1
        },
        {
          "id": "shield",
          "name": "護盾術",
          "group": "rescue",
          "summary": "將失時自動，AC +5",
          "detail": "敵人攻擊即將命中，而 AC +5 會使該擊失手時，自動施放。消耗一個法術位，並用掉這一次反應。AC +5 計入這一擊，持續到你的下一回合開始。沒有法術位、反應已用，或自然二十的重擊，都不會施放。",
          "pool": "slots",
          "cost": 1,
          "costs_turn": false,
          "timing": "reaction",
          "target": "self",
          "roll": "auto",
          "effect": {
            "type": "ac_bonus",
            "amount": 5,
            "until": "next_turn"
          }
        },
        {
          "id": "false_life",
          "name": "虛假生命",
          "group": "rescue",
          "summary": "臨時生命 1d4+4",
          "detail": "獲得 1d4+4 點臨時生命，受傷時先扣除；到下一個休息點消失。",
          "pool": "slots",
          "cost": 1,
          "costs_turn": true,
          "target": "self",
          "roll": "auto",
          "temp_hp_dice": "1d4+4"
        }
      ]
    }
  ],
  "scenes": [
    {
      "id": "f1_gate",
      "type": "beat",
      "place": "林緣廢塔",
      "facts": [
        "林緣有一座廢塔。",
        "木門半掩。",
        "天色將晚。",
        {
          "text": "門框刻著第七盾隊的隊徽。",
          "when": {
            "class": "戰士"
          }
        },
        {
          "text": "樹從塔腳開始枯死，白鹿蹄印一路通入塔中。",
          "when": {
            "class": "遊俠"
          }
        },
        {
          "text": "信上寫著：帶出銅徽，賞一百金。——黑手",
          "when": {
            "all_flags": [
              "finn_contract"
            ]
          }
        }
      ],
      "choices": [
        {
          "id": "search",
          "label": "搜查門廊",
          "to": "f1_foyer",
          "narr": "門檻下壓著一把鏽鐵鑰匙，齒縫裡還沾著泥。有人比你先來過，又匆匆走了。",
          "give": [
            "iron_key"
          ],
          "set_flag": [
            "gate_searched",
            "searched_porch"
          ],
          "when": {
            "not": {
              "class": "盜賊"
            },
            "none_flags": [
              "searched_porch"
            ]
          }
        },
        {
          "id": "search_finn",
          "label": "搜查門廊（門縫夾著一封信）",
          "to": "f1_foyer",
          "narr": "門縫裡夾著一封信，封口的蠟印是一隻黑色手掌。門檻下還壓著一把鏽鐵鑰匙。",
          "give": [
            "iron_key"
          ],
          "set_flag": [
            "gate_searched",
            "searched_porch",
            "finn_contract"
          ],
          "when": {
            "class": "盜賊",
            "none_flags": [
              "searched_porch"
            ]
          }
        },
        {
          "id": "look",
          "label": "察看門前",
          "to": "f1_look",
          "when": {
            "not": {
              "class": [
                "戰士",
                "遊俠"
              ]
            },
            "none_flags": [
              "gate_looked"
            ]
          }
        },
        {
          "id": "look_crest",
          "label": "辨認門框隊徽",
          "to": "f1_look_crest",
          "when": {
            "class": "戰士",
            "none_flags": [
              "gate_looked"
            ]
          }
        },
        {
          "id": "look_tracks",
          "label": "追看白鹿蹄印",
          "to": "f1_look_tracks",
          "when": {
            "class": "遊俠",
            "none_flags": [
              "gate_looked"
            ]
          }
        },
        {
          "id": "rush",
          "label": "直接進塔",
          "to": "f1_foyer",
          "repeatable": true,
          "narr": "你推開半掩的木門。門軸發出一聲長長的呻吟，黑暗撲面而來。",
          "set_flag": [
            "gate_rushed"
          ]
        }
      ]
    },
    {
      "id": "f1_look",
      "type": "check",
      "facts": [
        "你在門前停步，想先看清楚。"
      ],
      "skill": "perception",
      "dc": 12,
      "success_to": "f1_gate",
      "fail_to": "f1_gate",
      "success_narr": "你把耳朵貼近門縫。裡面傳來細碎的抓撓聲，不只一隻。",
      "fail_narr": "門後只有風聲。天色又暗了一分，你看不出更多東西。",
      "on_success": {
        "set_flag": [
          "f1_scouted",
          "gate_looked"
        ]
      },
      "on_failure": {
        "set_flag": [
          "gate_looked"
        ]
      }
    },
    {
      "id": "f1_look_crest",
      "type": "check",
      "facts": [
        "你湊近門框上的隊徽。"
      ],
      "skill": "history",
      "dc": 10,
      "success_to": "f1_gate",
      "fail_to": "f1_gate",
      "success_narr": "隊徽下方刻著一道短箭頭，指向門廳深處。那是盾隊的暗號：前有伏敵。你握緊了劍柄。",
      "fail_narr": "門後只有風聲。天色又暗了一分，你看不出更多東西。",
      "on_success": {
        "set_flag": [
          "f1_scouted",
          "gate_looked"
        ]
      },
      "on_failure": {
        "set_flag": [
          "gate_looked"
        ]
      }
    },
    {
      "id": "f1_look_tracks",
      "type": "check",
      "facts": [
        "你蹲下來，看門檻前的蹄印。"
      ],
      "skill": "survival",
      "dc": 10,
      "success_to": "f1_gate",
      "fail_to": "f1_gate",
      "success_narr": "蹄印在門檻前亂了一下，旁邊滿是細小的爪痕。白鹿在這裡受過驚，門廳裡有鼠群。",
      "fail_narr": "門後只有風聲。天色又暗了一分，你看不出更多東西。",
      "on_success": {
        "set_flag": [
          "f1_scouted",
          "gate_looked"
        ]
      },
      "on_failure": {
        "set_flag": [
          "gate_looked"
        ]
      }
    },
    {
      "id": "f1_foyer",
      "type": "beat",
      "place": "門廳",
      "facts": [
        "門廳裡很暗，牆腳傳來吱吱聲。",
        "三隻腐鼠從碎石堆後探出頭，紅眼盯著你。",
        "地上有齧過的布條。",
        "對面有走廊。",
        {
          "text": "你早有準備。腐鼠還在啃咬布條，沒有發現你。",
          "replace": "三隻腐鼠從碎石堆後探出頭，紅眼盯著你。",
          "when": {
            "all_flags": [
              "f1_scouted"
            ]
          }
        },
        {
          "text": "信上寫著：帶出銅徽，賞一百金。——黑手",
          "when": {
            "all_flags": [
              "finn_contract"
            ]
          }
        }
      ],
      "choices": [
        {
          "id": "fight",
          "label": "拔出武器迎戰",
          "to": "f1_rats",
          "winText": "最後一隻腐鼠尖叫著鑽進牆縫。門廳安靜下來，只剩你的喘息。",
          "fleeText": "你退回門外，腐鼠沒有追出來。"
        },
        {
          "id": "sneak",
          "label": "貼著牆根溜過去",
          "to": "f1_foyer_sneak",
          "when": {
            "none_flags": [
              "foyer_tried"
            ]
          }
        },
        {
          "id": "scare",
          "label": "大聲喝斥，把鼠群嚇退",
          "to": "f1_foyer_scare",
          "when": {
            "none_flags": [
              "foyer_tried"
            ]
          }
        },
        {
          "id": "spark",
          "label": "彈出一簇火花驚走鼠群",
          "to": "f1_foyer_spark",
          "when": {
            "class": "法師",
            "none_flags": [
              "foyer_tried"
            ]
          }
        }
      ]
    },
    {
      "id": "f1_foyer_sneak",
      "type": "check",
      "facts": [
        "你壓低身子，貼著牆根移動。"
      ],
      "skill": "stealth",
      "dc": 12,
      "advantage": {
        "all_flags": [
          "f1_scouted"
        ]
      },
      "success_to": "f1_rats_after",
      "fail_to": "f1_rats",
      "fail_hp_delta": -1,
      "minHp": 1,
      "success_narr": "你踩著碎石間的空隙前進，腐鼠只顧著啃咬。直到你走遠，牠們才一哄而散，鑽回牆縫。",
      "fail_narr": "一塊碎石在你腳下滾開。三雙紅眼同時轉了過來。",
      "on_success": {
        "set_flag": [
          "foyer_tried"
        ]
      },
      "on_failure": {
        "set_flag": [
          "foyer_tried"
        ]
      }
    },
    {
      "id": "f1_foyer_scare",
      "type": "check",
      "facts": [
        "你吸一口氣，準備把鼠群喝退。"
      ],
      "skill": "intimidation",
      "dc": 13,
      "advantage": {
        "has_item": [
          "lantern"
        ]
      },
      "success_to": "f1_rats_after",
      "fail_to": "f1_rats",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你猛地踏前一步，喝聲在門廳裡迴盪。腐鼠尖叫著四散，一隻不剩地鑽進了牆縫。",
      "success_narr_variants": [
        {
          "text": "你高舉提燈，猛地踏前一步。火光一晃，腐鼠尖叫著四散，一隻不剩地鑽進了牆縫。",
          "when": {
            "has_item": [
              "lantern"
            ]
          }
        }
      ],
      "fail_narr": "領頭的腐鼠弓起背，不退反撲，一口咬在你的小腿上。",
      "on_success": {
        "set_flag": [
          "foyer_tried"
        ]
      },
      "on_failure": {
        "set_flag": [
          "foyer_tried"
        ]
      }
    },
    {
      "id": "f1_foyer_spark",
      "type": "check",
      "facts": [
        "你抬起手指，準備彈出火花。"
      ],
      "skill": "arcana",
      "dc": 12,
      "success_to": "f1_rats_after",
      "fail_to": "f1_rats",
      "fail_hp_delta": -1,
      "minHp": 1,
      "success_narr": "你指尖一彈，一簇藍白火花在鼠群中炸開。焦毛味散開，腐鼠逃得一隻不剩。",
      "fail_narr": "火花只閃了一下就熄滅了。腐鼠愣了愣，隨即撲了上來。",
      "on_success": {
        "set_flag": [
          "foyer_tried"
        ]
      },
      "on_failure": {
        "set_flag": [
          "foyer_tried"
        ]
      }
    },
    {
      "id": "f1_rats",
      "type": "combat",
      "facts": [
        "門廳竄出腐鼠。",
        "地上有齧過的布條。",
        "對面有走廊。",
        {
          "text": "信上寫著：帶出銅徽，賞一百金。——黑手",
          "when": {
            "all_flags": [
              "finn_contract"
            ]
          }
        }
      ],
      "enemies": [
        {
          "id": "rat_1",
          "name": "腐鼠",
          "ac": 11,
          "hp": 4,
          "atk": 2,
          "damage": "1d4",
          "per_extra": {
            "hp": 0,
            "copies": 1
          },
          "yield": {
            "kind": "last_standing",
            "group": "rats"
          }
        },
        {
          "id": "rat_2",
          "name": "腐鼠",
          "ac": 11,
          "hp": 4,
          "atk": 2,
          "damage": "1d4",
          "per_extra": {
            "hp": 0,
            "copies": 0
          },
          "yield": {
            "kind": "last_standing",
            "group": "rats"
          }
        },
        {
          "id": "rat_3",
          "name": "腐鼠",
          "ac": 11,
          "hp": 3,
          "atk": 2,
          "damage": "1d4",
          "per_extra": {
            "hp": 0,
            "copies": 0
          },
          "yield": {
            "kind": "last_standing",
            "group": "rats"
          }
        }
      ],
      "win_to": "f1_rats_after",
      "flee_to": "f1_gate"
    },
    {
      "id": "f1_rats_after",
      "type": "beat",
      "facts": [
        "腐鼠散了。",
        "地上還有那條齧過的布。"
      ],
      "choices": [
        {
          "id": "cloth",
          "label": "拾起齧過的布條",
          "to": "f1_hall",
          "set_flag": [
            "took_cloth"
          ]
        },
        {
          "id": "ignore",
          "label": "不理會",
          "to": "f1_hall"
        },
        {
          "id": "robe",
          "label": "認出是聖堂修袍，收好它",
          "to": "f1_hall",
          "set_flag": [
            "took_cloth",
            "mira_knew_robe"
          ],
          "when": {
            "class": "牧師"
          }
        }
      ]
    },
    {
      "id": "f1_hall",
      "type": "beat",
      "facts": [
        "走廊地板塌了一角。",
        "塵土裡露出朽木梁。",
        "盡頭有向下的石階。",
        {
          "text": "塌陷處下有燒焦的法陣，是師父賽勒斯的筆跡。",
          "when": {
            "class": "法師"
          }
        }
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
        },
        {
          "id": "circle",
          "label": "辨認師父的法陣",
          "to": "f1_hall_arcana",
          "when": {
            "class": "法師"
          }
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
      "success_to": "f1_bandit_front",
      "fail_to": "f1_bandit_front",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你抓住朽木梁一蕩，穩穩落在對面。塵土簌簌落進黑洞裡。",
      "fail_narr": "朽木梁在你手中斷裂，你重重摔在碎石上，才掙扎著爬過去。"
    },
    {
      "id": "f1_stl",
      "type": "check",
      "facts": [
        "你貼著牆邊找縫隙繞過去。"
      ],
      "skill": "stealth",
      "dc": 12,
      "success_to": "f1_bandit_front",
      "fail_to": "f1_bandit_front",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你貼著牆邊一步步挪過去，連灰塵都沒有驚起。石階口站著一個人影，他還沒有發現你。",
      "fail_narr": "牆邊的地板突然下陷，你扭傷了腳踝，拖著腳挪到對面。",
      "on_success": {
        "set_flag": [
          "hall_unseen"
        ]
      }
    },
    {
      "id": "f1_per",
      "type": "check",
      "facts": [
        "你仔細觀察哪塊地板還撐得住。"
      ],
      "skill": "perception",
      "dc": 12,
      "success_to": "f1_bandit_front",
      "fail_to": "f1_bandit_front",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你認出哪些木板底下還有梁。踏過最後一塊時，你先看見了石階口那個握斧的人影。",
      "fail_narr": "你挑中的木板發出一聲脆響，整片塌了下去。你攀著斷梁才爬上來。",
      "on_success": {
        "set_flag": [
          "hall_unseen"
        ]
      }
    },
    {
      "id": "f1_hall_arcana",
      "type": "check",
      "facts": [
        "你辨認塌陷處下燒焦的陣紋。"
      ],
      "skill": "arcana",
      "dc": 12,
      "success_to": "f1_bandit_front",
      "fail_to": "f1_bandit_front",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "焦黑的陣紋還留著一絲餘溫。你認得這個陣式，是師父賽勒斯用來加固落腳處的。你踩著陣紋走過去，腳下穩如平地。師父為何來過這裡？",
      "fail_narr": "你伸手觸碰陣紋，殘存的法力反咬一口，指尖一陣灼痛。你咬著牙跨了過去。",
      "on_success": {
        "set_flag": [
          "hall_unseen"
        ]
      }
    },
    {
      "id": "f1_bandit_front",
      "type": "beat",
      "place": "石階口",
      "facts": [
        "石階口有一個盜墓者擋住去路。",
        "他握著生鏽短斧。",
        "只有這一個人。",
        {
          "text": "盜墓者喝道：「誰在那裡？這塔裡的東西是我先找到的！」",
          "when": {
            "none_flags": [
              "hall_unseen"
            ]
          }
        },
        {
          "text": "他背對著你，正盯著石階下方，嘴裡念著數目。",
          "when": {
            "all_flags": [
              "hall_unseen"
            ]
          }
        }
      ],
      "choices": [
        {
          "id": "fight",
          "label": "動手",
          "to": "f1_bandit",
          "winText": "盜墓者的短斧脫手飛出，他跪倒在石階上。",
          "fleeText": "你退回走廊，盜墓者沒有追來，只在石階口啐了一口。"
        },
        {
          "id": "talk",
          "label": "開口和他談",
          "to": "f1_bandit_talk",
          "when": {
            "none_flags": [
              "bandit_front_tried"
            ]
          }
        },
        {
          "id": "threat",
          "label": "厲聲喝退他",
          "to": "f1_bandit_threat",
          "when": {
            "none_flags": [
              "bandit_front_tried"
            ]
          }
        },
        {
          "id": "sneak",
          "label": "繞到背後制住他",
          "to": "f1_bandit_sneak",
          "when": {
            "not": {
              "class": "盜賊"
            },
            "none_flags": [
              "bandit_front_tried"
            ]
          }
        },
        {
          "id": "lift",
          "label": "摸走他的短斧",
          "to": "f1_bandit_lift",
          "when": {
            "class": "盜賊",
            "none_flags": [
              "bandit_front_tried"
            ]
          }
        }
      ]
    },
    {
      "id": "f1_bandit_talk",
      "type": "check",
      "facts": [
        "你放下架勢，準備開口。"
      ],
      "skill": "persuasion",
      "dc": 13,
      "advantage": {
        "class": "牧師"
      },
      "success_to": "f1_bandit_after",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "盜墓者握斧的手鬆了鬆：「……你不是來搶我的？」他退到牆邊，把短斧放在腳下。",
      "fail_narr": "「少廢話！」他掄起短斧劈來，你閃得慢了半步。",
      "on_success": {
        "set_flag": [
          "bandit_front_tried",
          "bandit_parley"
        ]
      },
      "on_failure": {
        "set_flag": [
          "bandit_front_tried"
        ]
      }
    },
    {
      "id": "f1_bandit_threat",
      "type": "check",
      "facts": [
        "你往前踏了一步。"
      ],
      "skill": "intimidation",
      "dc": 13,
      "advantage": {
        "stat_min": {
          "str": 14
        }
      },
      "success_to": "f1_bandit_after",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你往前一站，影子壓住整個石階口。短斧噹啷落地：「別、別殺我！」",
      "fail_narr": "他乾笑一聲：「嚇唬誰？」斧柄狠狠撞在你胸口。",
      "on_success": {
        "set_flag": [
          "bandit_front_tried"
        ]
      },
      "on_failure": {
        "set_flag": [
          "bandit_front_tried"
        ]
      }
    },
    {
      "id": "f1_bandit_sneak",
      "type": "check",
      "facts": [
        "你繞向他的背後。"
      ],
      "skill": "stealth",
      "dc": 13,
      "advantage": {
        "all_flags": [
          "hall_unseen"
        ]
      },
      "success_to": "f1_bandit_after",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你的手搭上他的後頸，他才驚覺。「好、好，我不動！」",
      "fail_narr": "碎石在你腳下一響，他猛然回身，斧刃擦過你的手臂。",
      "on_success": {
        "set_flag": [
          "bandit_front_tried",
          "bandit_pinned"
        ]
      },
      "on_failure": {
        "set_flag": [
          "bandit_front_tried"
        ]
      }
    },
    {
      "id": "f1_bandit_lift",
      "type": "check",
      "facts": [
        "你的目光停在他腰間的短斧上。"
      ],
      "skill": "sleight_of_hand",
      "dc": 12,
      "advantage": {
        "all_flags": [
          "hall_unseen"
        ]
      },
      "success_to": "f1_bandit_after",
      "fail_to": "f1_bandit",
      "fail_hp_delta": -2,
      "minHp": 1,
      "success_narr": "你從他腰間抽走短斧，在他耳邊輕聲說：「找這個嗎？」他僵在原地，不敢回頭。",
      "fail_narr": "碎石在你腳下一響，他猛然回身，斧刃擦過你的手臂。",
      "on_success": {
        "set_flag": [
          "bandit_front_tried",
          "bandit_pinned"
        ]
      },
      "on_failure": {
        "set_flag": [
          "bandit_front_tried"
        ]
      }
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
          "damage": "1d6+1",
          "per_extra": {
            "hp": 6,
            "copies": 0
          },
          "yield": {
            "kind": "hp_fraction",
            "num": 1,
            "den": 3
          }
        }
      ],
      "win_to": "f1_bandit_after",
      "flee_to": "f1_hall"
    },
    {
      "id": "f1_bandit_after",
      "type": "beat",
      "facts": [
        "盜墓者跪地求饒。",
        {
          "text": "盜墓者放下短斧，退到牆邊，沒有再上前。",
          "replace": "盜墓者跪地求饒。",
          "when": {
            "all_flags": [
              "bandit_parley"
            ]
          }
        },
        {
          "text": "盜墓者被你制住，不敢再動。",
          "replace": "盜墓者跪地求饒。",
          "when": {
            "all_flags": [
              "bandit_pinned"
            ]
          }
        }
      ],
      "choices": [
        {
          "id": "spare",
          "label": "放他走",
          "to": "cp_f1",
          "set_flag": [
            "spared_bandit"
          ],
          "inc": {
            "aff_bandit": 1
          }
        },
        {
          "id": "persuade",
          "label": "勸他改過",
          "to": "f1_persuade"
        },
        {
          "id": "loot",
          "label": "搜身趕走",
          "to": "cp_f1",
          "set_flag": [
            "looted_bandit"
          ],
          "give": [
            "alchemist_fire"
          ]
        }
      ]
    },
    {
      "id": "f1_persuade",
      "type": "check",
      "facts": [
        "你勸盜墓者放下斧頭。"
      ],
      "skill": "persuasion",
      "dc": 12,
      "success_to": "cp_f1",
      "fail_to": "cp_f1",
      "on_success": {
        "set_flag": [
          "bandit_persuaded"
        ],
        "inc": {
          "aff_bandit": 2
        }
      },
      "on_failure": {
        "set_flag": [
          "bandit_persuaded"
        ],
        "inc": {
          "aff_bandit": 1
        }
      }
    },
    {
      "id": "cp_f1",
      "type": "checkpoint",
      "floor": 1,
      "name": "一層歇腳",
      "place": "石階口",
      "continue_label": "繼續",
      "facts": [
        "盜墓者的腳步聲遠去。你坐在石階口，塔裡靜得聽見自己的心跳。——第一層完。"
      ],
      "continue_to": "f2_stairs"
    },
    {
      "id": "f2_stairs",
      "type": "beat",
      "place": "第二層轉角",
      "facts": [
        "你來到二層轉角。",
        "正路通往下層通道。",
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
          ],
          "repeatable": true,
          "when": {
            "none_flags": [
              "vault_cleared"
            ]
          }
        },
        {
          "id": "pick",
          "label": "撬開側門",
          "to": "f2_finn_lock",
          "when": {
            "class": "盜賊",
            "none_flags": [
              "finn_picked_lock",
              "vault_cleared"
            ]
          }
        },
        {
          "id": "up",
          "label": "沿正路向下",
          "to": "f2_bones",
          "set_flag": [
            "skipped_vault"
          ],
          "repeatable": true
        }
      ]
    },
    {
      "id": "f2_finn_lock",
      "type": "check",
      "facts": [
        "側門的鎖很小。"
      ],
      "skill": "stealth",
      "dc": 13,
      "success_to": "hide_vault",
      "fail_to": "hide_vault",
      "on_success": {
        "set_flag": [
          "finn_picked_lock"
        ]
      },
      "on_failure": {
        "set_flag": [
          "finn_picked_lock"
        ],
        "hp_delta": -2,
        "minHp": 1
      }
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
          "damage": "1d6+1",
          "per_extra": {
            "hp": 8,
            "copies": 0
          }
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
          "damage": "1d4+1",
          "per_extra": {
            "hp": 6,
            "copies": 0
          }
        }
      ],
      "win_to": "f2_bones_after",
      "flee_to": "f2_stairs"
    },
    {
      "id": "f2_bones_after",
      "type": "beat",
      "next": "f2_trap",
      "facts": [
        "朽骨守衛倒下。",
        {
          "text": "你認出這具朽骨是隊長葛蘭。",
          "when": {
            "class": "戰士"
          }
        }
      ],
      "prompts": [
        {
          "id": "eyes",
          "choices": [
            {
              "id": "close",
              "label": "為骸骨合眼",
              "set_flag": [
                "respected_dead"
              ]
            },
            {
              "id": "loot_bones",
              "label": "搜走他身上的藥水",
              "set_flag": [
                "took_from_dead"
              ],
              "give": [
                "potion_heal"
              ]
            }
          ]
        },
        {
          "id": "captain",
          "when": {
            "class": "戰士"
          },
          "choices": [
            {
              "id": "bury",
              "label": "收殮隊長",
              "set_flag": [
                "brun_buried_captain"
              ]
            },
            {
              "id": "crest",
              "label": "取走盾徽",
              "set_flag": [
                "brun_took_crest"
              ]
            }
          ]
        },
        {
          "id": "brass",
          "when": {
            "class": "盜賊"
          },
          "choices": [
            {
              "id": "scrap",
              "label": "拾起銅片",
              "set_flag": [
                "finn_brass_scrap"
              ]
            },
            {
              "id": "skip_scrap",
              "label": "不理會"
            }
          ]
        }
      ]
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
        },
        {
          "id": "rune",
          "label": "解讀石板符文",
          "to": "f2_orr_rune",
          "when": {
            "class": "法師",
            "none_flags": [
              "orr_notes"
            ]
          }
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
      "id": "f2_orr_rune",
      "type": "check",
      "facts": [
        "石板上的符文是師父的筆跡。"
      ],
      "skill": "perception",
      "dc": 12,
      "success_to": "f2_ooze",
      "fail_to": "f2_ooze",
      "on_success": {
        "set_flag": [
          "orr_notes"
        ]
      },
      "on_failure": {
        "set_flag": [
          "orr_notes"
        ],
        "hp_delta": -2,
        "minHp": 1
      }
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
          "damage": "1d4+1",
          "per_extra": {
            "hp": 8,
            "copies": 0
          }
        }
      ],
      "win_to": "f2_ooze_after",
      "flee_to": "f2_trap"
    },
    {
      "id": "f2_ooze_after",
      "type": "beat",
      "next": "cp_f2",
      "facts": [
        "酸蝕軟泥化開了。",
        {
          "text": "軟泥中只溶剩半截鹿角。",
          "when": {
            "class": "遊俠"
          }
        }
      ],
      "prompts": [
        {
          "id": "share",
          "choices": [
            {
              "id": "leave_a",
              "label": "留下一瓶藥水",
              "set_flag": [
                "left_potion"
              ],
              "take": [
                "potion_heal"
              ],
              "when": {
                "item_min": {
                  "potion_heal": 1
                },
                "none_flags": [
                  "left_potion"
                ]
              }
            },
            {
              "id": "leave_b",
              "label": "留下一瓶藥水",
              "set_flag": [
                "left_potion"
              ],
              "take": [
                "potion_heal_2"
              ],
              "when": {
                "item_min": {
                  "potion_heal_2": 1
                },
                "item_max": {
                  "potion_heal": 0
                },
                "none_flags": [
                  "left_potion"
                ]
              }
            },
            {
              "id": "down",
              "label": "直接往下走"
            }
          ]
        },
        {
          "id": "antler",
          "when": {
            "class": "遊俠"
          },
          "choices": [
            {
              "id": "take_antler",
              "label": "拾起鹿角",
              "set_flag": [
                "sylvie_antler"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "cp_f2",
      "type": "checkpoint",
      "floor": 2,
      "name": "二層歇腳",
      "place": "底層鐵門前",
      "continue_label": "繼續",
      "facts": [
        "酸味漸漸散去，再往下就是底層鐵門。今夜最難的一段就在門後。——第二層完。"
      ],
      "continue_to": "f3_door"
    },
    {
      "id": "f3_door",
      "type": "beat",
      "facts": [
        "底層鐵門擋住內室。",
        "門上有銅鏽鎖孔。",
        "門後傳出冷風。",
        {
          "text": "盜墓者在暗處低聲說：門後有人。",
          "when": {
            "flag_min": {
              "aff_bandit": 1
            }
          }
        }
      ],
      "choices": [
        {
          "id": "enter",
          "label": "走進去",
          "to": "f3_cult_talk",
          "when": {
            "all_flags": [
              "f3_door_open"
            ]
          }
        },
        {
          "id": "unlock",
          "label": "用銅鏽鑰匙開門",
          "to": "f3_cult_talk",
          "require_item": [
            "rust_key"
          ],
          "set_flag": [
            "door_unlocked",
            "f3_door_open"
          ],
          "when": {
            "none_flags": [
              "f3_door_open"
            ]
          }
        },
        {
          "id": "smash",
          "label": "撞開鐵門",
          "to": "f3_cult_talk",
          "hp_delta": -3,
          "set_flag": [
            "door_smashed",
            "f3_door_open"
          ],
          "when": {
            "none_flags": [
              "f3_door_open"
            ]
          }
        },
        {
          "id": "bandit_help",
          "label": "讓盜墓者替你撬門",
          "to": "f3_cult_talk",
          "set_flag": [
            "bandit_helped",
            "f3_door_open"
          ],
          "when": {
            "flag_min": {
              "aff_bandit": 2
            },
            "none_flags": [
              "bandit_helped",
              "f3_door_open"
            ]
          }
        }
      ]
    },
    {
      "id": "f3_cult_talk",
      "type": "beat",
      "facts": [
        "塔影邪徒還沒有動手。",
        "他看了你一眼。"
      ],
      "choices": [
        {
          "id": "insight",
          "label": "看他的眼神",
          "to": "f3_mira_insight",
          "when": {
            "class": "牧師",
            "none_flags": [
              "mira_checked"
            ]
          }
        },
        {
          "id": "show_cloth",
          "label": "拿出布條問他",
          "to": "f3_cult",
          "set_flag": [
            "knows_wight_name"
          ],
          "when": {
            "all_flags": [
              "took_cloth"
            ],
            "none_flags": [
              "knows_wight_name"
            ]
          }
        },
        {
          "id": "fight",
          "label": "動手",
          "to": "f3_cult"
        }
      ]
    },
    {
      "id": "f3_mira_insight",
      "type": "check",
      "facts": [
        "你看進邪徒的眼睛。"
      ],
      "skill": "insight",
      "dc": 12,
      "success_to": "f3_cult",
      "fail_to": "f3_cult",
      "on_success": {
        "set_flag": [
          "mira_truth",
          "mira_checked"
        ]
      },
      "on_failure": {
        "set_flag": [
          "mira_checked"
        ],
        "hp_delta": -2,
        "minHp": 1
      }
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
          "damage": "1d6+1",
          "per_extra": {
            "hp": 6,
            "copies": 0
          },
          "yield": {
            "kind": "hp_fraction",
            "num": 1,
            "den": 4
          }
        }
      ],
      "win_to": "f3_cult_after",
      "flee_to": "f3_cult_talk"
    },
    {
      "id": "f3_cult_after",
      "type": "beat",
      "facts": [
        "邪徒倒地，還有一口氣。"
      ],
      "choices": [
        {
          "id": "spare",
          "label": "放過",
          "to": "f3_altar",
          "set_flag": [
            "spared_cultist",
            "cultist_dealt"
          ],
          "when": {
            "none_flags": [
              "cultist_dealt"
            ]
          }
        },
        {
          "id": "kill",
          "label": "了結",
          "to": "f3_altar",
          "set_flag": [
            "killed_cultist",
            "cultist_dealt"
          ],
          "when": {
            "none_flags": [
              "cultist_dealt"
            ]
          }
        },
        {
          "id": "redeem",
          "label": "為艾文驅走塔影",
          "to": "f3_altar",
          "set_flag": [
            "mira_redeemed",
            "cultist_dealt"
          ],
          "when": {
            "all_flags": [
              "cls_cleric"
            ],
            "any": [
              {
                "all_flags": [
                  "mira_knew_robe"
                ]
              },
              {
                "all_flags": [
                  "mira_truth"
                ]
              }
            ],
            "none_flags": [
              "cultist_dealt"
            ]
          }
        }
      ]
    },
    {
      "id": "f3_altar",
      "type": "beat",
      "place": "祭壇",
      "facts": [
        "祭壇前的石棺蓋著。",
        {
          "text": "白鹿魂被鎖鏈鎖住。",
          "when": {
            "all_flags": [
              "sylvie_antler"
            ]
          }
        },
        {
          "text": "筆記最後一頁寫著：怨靈就是師父本人。",
          "when": {
            "all_flags": [
              "orr_notes"
            ]
          }
        }
      ],
      "choices": [
        {
          "id": "rest",
          "label": "為骸骨祈禱後休息",
          "to": "f3_altar",
          "set_flag": [
            "rested"
          ],
          "rest": {
            "heal": "half",
            "clear_status": true
          },
          "when": {
            "all_flags": [
              "respected_dead"
            ],
            "none_flags": [
              "rested"
            ]
          }
        },
        {
          "id": "will",
          "label": "推開石蓋讀遺言",
          "to": "f3_brun_will",
          "when": {
            "class": "戰士",
            "none_flags": [
              "brun_read_will"
            ]
          }
        },
        {
          "id": "cut",
          "label": "斬斷鎖鏈",
          "to": "f3_sylvie_chain",
          "when": {
            "all_flags": [
              "sylvie_antler"
            ],
            "none_flags": [
              "sylvie_freed_deer",
              "sylvie_arrow"
            ]
          }
        },
        {
          "id": "make_arrow",
          "label": "製作鹿角箭",
          "to": "f3_shrine",
          "give": [
            "antler_arrow"
          ],
          "set_flag": [
            "sylvie_arrow"
          ],
          "when": {
            "all_flags": [
              "sylvie_antler"
            ],
            "none_flags": [
              "sylvie_freed_deer",
              "sylvie_arrow"
            ]
          }
        },
        {
          "id": "burn",
          "label": "燒掉筆記",
          "to": "f3_shrine",
          "set_flag": [
            "orr_burned"
          ],
          "when": {
            "all_flags": [
              "orr_notes"
            ],
            "none_flags": [
              "orr_burned",
              "orr_kept"
            ]
          }
        },
        {
          "id": "keep",
          "label": "收起筆記",
          "to": "f3_shrine",
          "set_flag": [
            "orr_kept"
          ],
          "when": {
            "all_flags": [
              "orr_notes"
            ],
            "none_flags": [
              "orr_burned",
              "orr_kept"
            ]
          }
        },
        {
          "id": "onward",
          "label": "去祭壇走廊",
          "to": "f3_shrine"
        }
      ]
    },
    {
      "id": "f3_brun_will",
      "type": "check",
      "facts": [
        "石蓋很沉。"
      ],
      "skill": "athletics",
      "dc": 12,
      "success_to": "f3_shrine",
      "fail_to": "f3_shrine",
      "on_success": {
        "set_flag": [
          "brun_read_will"
        ]
      },
      "on_failure": {
        "set_flag": [
          "brun_read_will"
        ],
        "hp_delta": -2,
        "minHp": 1
      }
    },
    {
      "id": "f3_sylvie_chain",
      "type": "check",
      "facts": [
        "鎖鏈扣住白鹿魂。"
      ],
      "skill": "stealth",
      "dc": 12,
      "success_to": "f3_shrine",
      "fail_to": "f3_shrine",
      "on_success": {
        "set_flag": [
          "sylvie_freed_deer"
        ]
      },
      "on_failure": {
        "set_flag": [
          "sylvie_freed_deer"
        ],
        "hp_delta": -2,
        "minHp": 1
      }
    },
    {
      "id": "f3_shrine",
      "type": "beat",
      "place": "祭壇走廊",
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
          ],
          "when": {
            "none_flags": [
              "opened_crypt"
            ]
          }
        },
        {
          "id": "rush_boss",
          "label": "直闖內室",
          "to": "f3_wight",
          "set_flag": [
            "skipped_crypt"
          ],
          "repeatable": true,
          "when": {
            "none_flags": [
              "opened_crypt"
            ]
          }
        },
        {
          "id": "to_wight",
          "label": "前往內室",
          "to": "f3_wight",
          "when": {
            "all_flags": [
              "opened_crypt"
            ]
          }
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
          "damage": "1d4+2",
          "per_extra": {
            "hp": 6,
            "copies": 0
          }
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
          "label": "前往內室",
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
          "damage": "1d6+1",
          "per_extra": {
            "hp": 10,
            "copies": 0
          }
        }
      ],
      "win_to": "cp_f3",
      "flee_to": "f3_shrine"
    },
    {
      "id": "cp_f3",
      "type": "checkpoint",
      "floor": 3,
      "name": "三層歇腳",
      "place": "林緣",
      "continue_label": "繼續",
      "facts": [],
      "continue_to": "post_tower"
    },
    {
      "id": "post_tower",
      "type": "beat",
      "place": "林緣",
      "facts": [
        "怨靈散成灰。",
        "你從內室牆上取下銅徽。",
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
        },
        {
          "id": "friend",
          "label": "向跟蹤者點頭道別",
          "to": "end_friend",
          "set_flag": [
            "chose_friend"
          ],
          "when": {
            "all_flags": [
              "left_potion"
            ]
          }
        },
        {
          "id": "monument",
          "label": "在塔門為第七盾隊立碑",
          "to": "end_warrior",
          "set_flag": [
            "chose_warrior"
          ],
          "when": {
            "all_flags": [
              "cls_warrior",
              "brun_buried_captain"
            ]
          }
        },
        {
          "id": "follow_deer",
          "label": "跟著白鹿走回林中",
          "to": "end_ranger",
          "set_flag": [
            "chose_ranger"
          ],
          "when": {
            "all_flags": [
              "cls_ranger",
              "sylvie_freed_deer"
            ]
          }
        },
        {
          "id": "sell",
          "label": "將真銅徽交給黑手",
          "to": "end_sold",
          "set_flag": [
            "finn_sold"
          ],
          "when": {
            "all_flags": [
              "cls_rogue",
              "finn_contract"
            ]
          }
        },
        {
          "id": "swap",
          "label": "將銅片交給黑手，真徽埋在塔門石縫",
          "to": "end_rogue",
          "set_flag": [
            "finn_swapped"
          ],
          "when": {
            "all_flags": [
              "cls_rogue",
              "finn_contract",
              "finn_brass_scrap"
            ]
          }
        },
        {
          "id": "escort",
          "label": "扶著艾文一同出塔",
          "to": "end_cleric",
          "set_flag": [
            "chose_cleric"
          ],
          "when": {
            "all_flags": [
              "cls_cleric",
              "mira_redeemed"
            ]
          }
        },
        {
          "id": "burn_page",
          "label": "在塔門燒盡最後一頁",
          "to": "end_mage",
          "set_flag": [
            "chose_mage"
          ],
          "when": {
            "all_flags": [
              "cls_mage",
              "orr_burned"
            ]
          }
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
          "from_pregen": "selected_rival",
          "per_extra": {
            "hp": 0,
            "copies": 0
          }
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
      "name": "廢塔一夜",
      "closing": "這一夜結束了。",
      "when": {
        "all_flags": [
          "left_with_badge"
        ]
      },
      "facts": [
        "你握緊銅徽。",
        "廢塔恢復寂靜。",
        {
          "text": "你喊出賽勒斯的名字，他終於消散。",
          "when": {
            "all_flags": [
              "knows_wight_name"
            ]
          }
        },
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_friend",
      "type": "end",
      "end": "win",
      "ending_type": "variant",
      "name": "化敵為友",
      "closing": "跟蹤者點頭，走進林裡。",
      "when": {
        "all_flags": [
          "left_potion",
          "chose_friend"
        ]
      },
      "facts": [
        "你向跟蹤者點頭道別。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_sold",
      "type": "end",
      "end": "win",
      "ending_type": "variant",
      "name": "收錢走人",
      "closing": "黑手收了銅徽。",
      "when": {
        "all_flags": [
          "finn_sold"
        ]
      },
      "facts": [
        "你將真銅徽交給黑手。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_warrior",
      "type": "end",
      "end": "win",
      "ending_type": "class",
      "name": "歸隊",
      "closing": "第七盾隊的名字留在塔門。",
      "when": {
        "all_flags": [
          "cls_warrior",
          "brun_buried_captain",
          "chose_warrior"
        ]
      },
      "facts": [
        "你在塔門為第七盾隊立碑。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_ranger",
      "type": "end",
      "end": "win",
      "ending_type": "class",
      "name": "林歸寂靜",
      "closing": "白鹿走回林裡。",
      "when": {
        "all_flags": [
          "cls_ranger",
          "sylvie_freed_deer",
          "chose_ranger"
        ]
      },
      "facts": [
        "你跟著白鹿走回林中。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_rogue",
      "type": "end",
      "end": "win",
      "ending_type": "class",
      "name": "偷天換徽",
      "closing": "真銅徽還在塔門石縫。",
      "when": {
        "all_flags": [
          "cls_rogue",
          "finn_contract",
          "finn_brass_scrap",
          "finn_swapped"
        ],
        "none_flags": [
          "finn_sold"
        ]
      },
      "facts": [
        "黑手拿走銅片。真銅徽埋在塔門石縫。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_cleric",
      "type": "end",
      "end": "win",
      "ending_type": "class",
      "name": "迷途者歸",
      "closing": "艾文跟著你走出廢塔。",
      "when": {
        "all_flags": [
          "cls_cleric",
          "mira_redeemed",
          "chose_cleric"
        ]
      },
      "facts": [
        "你扶著艾文一同出塔。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "end_mage",
      "type": "end",
      "end": "win",
      "ending_type": "class",
      "name": "師債徒還",
      "closing": "最後一頁燒成灰。",
      "when": {
        "all_flags": [
          "cls_mage",
          "orr_burned",
          "chose_mage"
        ]
      },
      "facts": [
        "你在塔門燒盡最後一頁。",
        "這一夜結束了。"
      ]
    },
    {
      "id": "secret_win",
      "type": "end",
      "end": "secret_win",
      "ending_type": "secret",
      "name": "隱藏結局",
      "closing": "隱藏結局。",
      "when": {
        "all_flags": [
          "secret_ready"
        ]
      },
      "facts": [
        "跟蹤者倒下。",
        "你清掃了整座廢塔。",
        "銅徽在夜色中發亮。",
        "隱藏結局。"
      ]
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
