# 廢塔一夜

這是一款在瀏覽器內運行的單人一場 TRPG。正式遊戲只有一個檔案：`index.html`。毋須安裝、登入或連線，也不會儲存進度。

## 怎樣遊玩

1. 直接雙擊 `index.html`，或把它發佈到 GitHub Pages 後開啟網址。
2. 選擇一名預設角色。
3. 按畫面下方的按鈕行動。程式會處理擲骰、生命、物品、戰鬥和場景轉換。
4. 擲骰明細會顯示在紀錄內。戰鬥時每回合由玩家先行動，然後仍然存活的敵人還擊。
5. 生命降至 0、或到達失敗結局後，整場冒險會結束；按「從頭再玩一次」即可用全新狀態重來。

## 發佈

把 `index.html` 放到 GitHub Pages 網站根目錄即可。它沒有建置步驟、外部套件、CDN、字型、圖片或網絡請求；從 `file://` 開啟亦可正常遊玩。

`test-engine.js` 是 Node.js 測試程式，`browser-test.js` 是開發時使用的 Chromium 點擊測試，兩者均不是正式遊戲所需。

## 加入另一個冒險

1. 用文字編輯器開啟 `index.html`。
2. 找到有清楚標記的 `ADVENTURE DATA BLOCK`。
3. 在 `ADVENTURES` 物件內加入一個新鍵和完整的冒險物件，例如：

   ```js
   var ADVENTURES = {
     wasted_tower: { /* 原有冒險 */ },
     my_adventure: { /* 新冒險資料 */ }
   };
   ```

4. 把同一區塊內的 `DEFAULT_ADVENTURE_ID` 改成新鍵：

   ```js
   var DEFAULT_ADVENTURE_ID = 'my_adventure';
   ```

5. 儲存並重新開啟頁面。啟動檢查器會拒絕不完整的資料，並把問題逐項列出。

新冒險須沿用現有資料結構，最少包括 `title`、`start`、`items`、`pregens` 和 `scenes`。場景類型只可用 `beat`、`check`、`combat`、`end`；技能只可用 `athletics`、`stealth`、`perception`、`insight`、`persuasion`。所有場景及物品引用都必須指向已存在的 ID。消耗品必須有 `heal` 或 `damage` 其中一項，但不可兩項都有。

如要一次內嵌多個冒險，繼續在同一個 `ADVENTURES` 物件加入鍵即可；每次只會載入 `DEFAULT_ADVENTURE_ID` 指定的一個。
