# 廢塔一夜

瀏覽器裡的單人一場文字冒險。正式遊戲是靜態檔案：`index.html`、`data/wasted_tower.js`、`js/` 底下的引擎。沒有安裝、登入、伺服器或網絡請求。用瀏覽器直接打開，或發佈到 GitHub Pages 皆可；`file://` 也能玩。

進度會自動寫進這台裝置的一個存檔欄，也會在每個行動之後更新。這不是一場打完就消失的進度。也可以把存檔碼複製出來再貼回去，免得瀏覽器（尤其是 iOS Safari）清掉本地記錄。


## 怎樣遊玩

1. 雙擊 `index.html`，或開啟 GitHub Pages 網址。
2. 選一個角色。若存檔欄已有進度，可以按「繼續上次的進度」。
3. 按畫面下方的按鈕行動。程式處理擲骰、生命、物品、戰鬥和場景。
4. 擲骰明細在紀錄裡。戰鬥時玩家先行動，仍然活著的敵人才還擊。
5. 每層結束會出現歇腳：看一段短摘要，然後「繼續前進」或「先離開」。先離開不會丟掉進度。
6. 任何結局都會顯示結局卡（職業、關鍵選擇、結局名稱），可下載成 PNG。
7. 生命歸零即失敗。可以「從頭再玩一次」，或回到標題畫面繼續上次自動存下的進度。
8. 「存檔碼」會顯示一整段文字。換裝置時，在標題畫面貼上並按「讀取存檔碼」。格式不對、版本太新、或對不上現在的腳本時，遊戲會說明原因，不會把畫面弄壞。

一場大約 15–20 分鐘，中間可以在歇腳點把手機放下。


## 發佈

把整個資料夾放到 GitHub Pages 的網站根目錄（不要只上傳 `index.html`）。沒有建置步驟、外部套件、CDN、字型或圖片。

`preview/` 是同一套頁面的副本，路徑不是網站根目錄。改完引擎後執行 `node scripts/build-preview.js`。從倉庫根目錄開靜態伺服器時，預覽網址是 `/preview/`。正式站的根目錄仍是倉庫根上的 `index.html`。

`node test-engine.js` 會檢查腳本圖、舊內容、存檔與結局卡。它不是玩家需要的檔案。


## 腳本資料格式

寫故事的人只改 `data/wasted_tower.js` 裡的 `wasted_tower` 物件。不要改 `js/engine.js` 來加劇情。物件本體是 JSON：鍵要加引號，不要留行尾逗號。檔頭和檔尾的程式包裝要留著。

啟動時檢查器會拒絕不完整的資料，並逐項列出問題。`node test-engine.js` 還會把整張腳本圖走一遍：每個結局都要走得到，每個場景都要有路可走，不能有死路。

### 一場冒險最少要有

`id`、`title`、`start`、`items`、`pregens`、`scenes`。

場景 `type` 只用這幾種：

| type | 用途 |
| --- | --- |
| `beat` | 敘事同選項 |
| `check` | 技能檢定。技能只限 `athletics`、`stealth`、`perception`、`insight`、`persuasion` |
| `combat` | 戰鬥。`win_to` 必填，`flee_to` 可省略 |
| `checkpoint` | 一層結束的歇腳。要有 `floor`、`name`、`facts`、`continue_to` |
| `end` | 結局。`end` 是 `win`、`lose` 或 `secret_win`；`name` 是結局卡上的名字 |

角色沿用現有預製角色的欄位。每人剛好一個 `features`（`damage`、`heal` 或 `ac_bonus`，`uses` 為 3）。消耗品要有 `heal` 或 `damage` 其中一項，不能兩項都有。

`facts` 可以是字串，也可以是 `{ "text": "……", "when": { … } }`。有 `when` 的句子只在條件成立時出現。現有句子請保持原樣，不要改寫。

### 條件 `when`

用在選項、句子或結局場景上。全部條件都要成立才算通過。可以寫的欄位：

- `class`：一個職業，或職業陣列（例如 `"戰士"`）
- `all_flags` / `none_flags`：旗標陣列。旗標要為真／要為假
- `flag_eq`：旗標必須等於某個布林、數字或字串
- `flag_min` / `flag_max`：數字旗標的下限／上限。還沒寫過的數字當 0
- `has_item` / `missing_item`：物品 id
- `cleared`：已經打贏的戰鬥場景 id

舊欄位仍然有效：選項上的 `require_flag`、`require_item`。

選項還可以：

- `set_flag`：把這些旗標設成真
- `set`：把旗標設成指定的布林、數字或字串
- `inc`：把數字加上去（沒有則從 0 起）
- `give` / `take`：給予或拿走物品
- `hp_delta`：生命變化

`flag_defs` 用來告訴結局卡哪些旗標要顯示。`key: true` 的旗標會按發生順序出現，`label` 就是卡上的字。數字旗標可以寫 `min` / `max`，加減之後會停在這個範圍裡。

開局時引擎會依 `meta.class_flags` 自動設上職業旗標（也可在角色上寫 `class_flag` 蓋過它）：

```js
"class_flags": {
  "戰士": "cls_warrior",
  "遊俠": "cls_ranger",
  "盜賊": "cls_rogue",
  "牧師": "cls_cleric",
  "法師": "cls_mage"
}
```

### 條件可以組合

`when` 裡的欄位仍然要全部成立。另外可以嵌：

- `not`：裡面的條件不成立才通過。例如只在旗標 X 沒設時出現：`{ "not": { "all_flags": ["quiet"] } }`
- `all`：陣列裡每一項都要成立
- `any`：陣列裡至少一項成立

數字比較沿用這三個欄位：`flag_min` 是 `>=`，`flag_max` 是 `<=`，`flag_eq` 是 `==`。還沒寫過的數字當 0。

```js
"when": {
  "all": [{ "flag_eq": { "aff_bandit": 2 } }],
  "any": [{ "all_flags": ["cls_warrior"] }, { "all_flags": ["cls_cleric"] }]
}
```

選項上的 `inc` 是加，`dec` 是減。`flag_defs` 若寫了 `min` / `max`，結果會夾在裡面，例如 `aff_bandit` 停在 0 到 2。

### 換一句或加一句

`facts` 裡的字串一定出現。`{ "text", "when" }` 是條件成立才**附加**。`replace` 是條件成立時**換掉**同一場裡那句原文；條件不成立就留著原句。

```js
"facts": [
  "門關著。",
  { "text": "門已經開了。", "replace": "門關著。", "when": { "all_flags": ["opened"] } },
  { "text": "你聽見腳步。", "when": { "not": { "all_flags": ["quiet"] } } }
]
```

### 檢定的成功和失敗

`check` 仍然是 d20 加調整，點數剛好等於 DC 算成功。`on_success` 和 `on_failure` 可以各自 `set_flag`、`inc`、`dec`、`give`、`take`、`hp_delta`。兩邊的 `success_to` / `fail_to` 可以指向同一場。舊的 `fail_hp_delta` 還在；沒有寫 `min_hp` 時，傷害仍然可以把生命打到 0。

`min_hp`（寫作裡的 minHp，兩個名字都可以）是這次傷害的下限。下面這次失敗最多掉到 1，不會因此死亡：

```js
"on_failure": { "set_flag": ["slipped"], "hp_delta": -20, "minHp": 1 }
```

### 物品

`give` 放入物品，`take` 拿走一件。消耗品照舊：`heal` 或 `damage` 二擇一，傷害類只能在戰鬥中用掉。例如獲得一支戰鬥中造成 8 點傷害的鹿角箭，並交出手上的藥水：

```js
"on_success": { "give": ["antler_arrow"], "take": ["potion"] }
```

物品本身要先寫在 `items`：`{ "id": "antler_arrow", "name": "鹿角箭", "kind": "consumable", "damage": 8 }`。

### 逃走與歇息

每場戰鬥的 `flee_to` 可以是場景 id。寫成 `"@checkpoint"` 時，逃走會回到這一輪最近踏進的歇腳點；還沒歇過腳就跟沒寫 `flee_to` 一樣，整場重來。現在塔裡的怨靈沒有改這欄，逃走仍然重開。

場景可以帶 `rest`。條件成立時，進入該場回復 `heal` 點生命，不會超過上限：

```js
"rest": { "heal": 4, "when": { "all_flags": ["cls_cleric"] } }
```

### 結局卡

結局場景可加 `ending_type`：`lose`、`main`、`variant`、`class`、`secret`。沒寫時，`win` 當 `main`，`secret_win` 當 `secret`，`lose` 當 `lose`。同一刻若有好幾個結局的條件都成立，卡片標題照這個順序挑：lose、secret、class、variant、main。

`closing` 是這張卡最底下的一句，可省略。`class_branches` 描述職業分支。`when` 成立才跟這名角色有關；`completed_when` 成立時卡片多一行 `branch: X (completed)`，否則是 `branch: X (missed): ` 加上 `miss_reason`。隱藏結局同時完成分支時，標題仍是 secret，並加上那一行 completed。

卡片還會列出角色與職業、關鍵選擇、戰鬥 `X/總數（含隱藏）`（`hidden: true` 的戰鬥算進總數；`omit_from_tally: true` 的戰鬥，例如對手對決，不計入）、剩餘生命、有記錄時的遊玩時間。結局畫面的「從頭再玩一次」會用同一個角色重開。

```js
"class_branches": [{
  "id": "warrior_branch",
  "label": "X",
  "when": { "all_flags": ["cls_warrior"] },
  "completed_when": { "all_flags": ["branch_done"] },
  "miss_reason": "沒有完成分支。"
}]
```

### 職業專用分支

在選項或句子加上 `when.class`。其他職業看不到那句話、也不能按那個選項。同一場 `beat` 請留至少一個沒有職業限制的選項，否則其他職業會走進死路，檢查器會拒絕。

### 用旗標打開一個結局

結局場景自己的 `when` 會擋結局。條件要在**進入該場景之前**已經成立（通常寫在前一個選項的 `set_flag` 或 `inc`）。只靠「打完所有戰鬥」不是唯一辦法；`meta.required_for_secret` 仍然會在打齊指定戰鬥後設上 `secret_ready`，隱藏結局另外用 `when.all_flags` 要求這個旗標。

下面這段**不是**現在塔裡的劇情，只示範格式。真的加進 `scenes` 時，還要讓前後場景接得上，並且跑 `node test-engine.js`。

```js
{
  "id": "bandit_talk",
  "type": "beat",
  "facts": [
    "盜墓者放下短斧。",
    { "text": "他看著你的長劍，沒有再靠近。", "when": { "class": "戰士" } }
  ],
  "choices": [
    {
      "id": "spare",
      "label": "放過他",
      "to": "mercy_end",
      "when": { "class": "戰士" },
      "set_flag": ["bandit_spared"],
      "inc": { "bandit_affinity": 1 }
    },
    { "id": "go", "label": "繼續前進", "to": "下一場的id" }
  ]
}
```

```js
{
  "id": "mercy_end",
  "type": "end",
  "end": "win",
  "name": "手下留情",
  "when": {
    "all_flags": ["bandit_spared"],
    "flag_min": { "bandit_affinity": 1 }
  },
  "facts": ["你沒有殺他。這一夜仍然結束。"]
}
```

並在 `flag_defs` 加上：

```js
"bandit_spared": { "key": true, "label": "放過他" }
```

戰士選「放過他」會進入「手下留情」，結局卡會列出「放過他」。其他職業只能走「繼續前進」。若 `inc` 忘了寫，親和沒有達到 1，這個結局就走不到，檢查器會報錯。

### 預留、這一階段不會結算

這些欄位可以先寫上，引擎會忽略內容，但格式不對會被拒絕，方便以後再加玩法：

- `achievements`：陣列
- `bestiary`：陣列
- 敵人的 `skills`：陣列

不要自創場景 `type`。檢查器只接受上表那五種。

### 存檔與匯出

遊玩時每個行動都會自動寫入這台裝置的一個存檔欄。標題畫面可以「繼續上次的進度」，也可以「清除這個存檔」。戰鬥或歇腳時按「存檔碼」，會得到以 `WT` 加版本號開頭的一段文字；換裝置或瀏覽器清掉記錄時，把整段貼回標題畫面的「讀取存檔碼」。格式不對、版本比遊戲新、或對不上現在的腳本時，只會顯示原因，畫面留在選角。

存檔碼以 `WT` 加版本號開頭。引擎裡的 `formatMigrations` 負責把舊存檔升級到現在的存檔格式；`scriptMigrations` 負責在 `meta.script_version` 提高時，把舊場景 id 改成新的。

改寫句子、加分支，通常不用動這兩個表。若你**改了已經上線的場景 id**，舊存檔會打不開，除非在 `js/engine.js` 的 `scriptMigrations` 加上一步：鍵是舊的 `scriptVersion`，函式回傳的存檔要把 `scriptVersion` 加一。沒有對應的升級時，遊戲會告訴玩家這份存檔讀不了，而不會直接當掉。
