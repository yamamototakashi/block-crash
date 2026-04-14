# Block Crash

軽くてすぐ遊べる、iPhone対応のPWAブロック崩しゲーム。
HTML / CSS / Vanilla JavaScript のみ、外部依存ゼロ。

## 1. ファイル構成

```
block-crash/
├── index.html              # 画面構造（オーバーレイUI含む）
├── styles.css              # 見た目
├── manifest.webmanifest    # PWAマニフェスト
├── sw.js                   # Service Worker（オフライン対応）
├── icon.svg                # アイコン（manifest/apple-touch共通）
├── stages.js               # 各モードのステージデータ
├── audio.js                # Web Audio によるSE
├── engine.js               # 定数・エンティティ・物理ヘルパ
├── game.js                 # ゲーム本体（状態/更新/描画）
├── main.js                 # エントリポイント・DOM/入力配線
└── README.md
```

## 2. セットアップ & 動作確認

### ローカルで遊ぶ
Service Worker は `file://` では動かないため、簡易HTTPサーバーで起動してください。

```bash
# Python 3 がある場合
cd block-crash
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開くだけでOKです。

> `file://` で直接開いてもゲームは動きますが、PWA（インストール、オフライン）は有効になりません。

### iPhone で遊ぶ
1. 同じLANからMacのIPで `http://<Mac-IP>:8080/` にアクセス
2. 右上の共有メニュー → **「ホーム画面に追加」**
3. 追加されたアイコンから起動するとフル画面のPWAとして動作します
4. セーフエリア（ノッチ / ホームバー）は考慮済み

### デスクトップで遊ぶ
- マウスで動かすとパドルが追従します
- `Space`/`Enter` でボール発射 or レーザー発射
- `←` `→` で微調整、`P` / `Esc` で一時停止

## 3. 操作

| 操作 | 効果 |
|---|---|
| 画面ドラッグ / マウス移動 | パドル移動 |
| タップ / クリック / Space | ボール発射、レーザー発射 |
| 右上 ❚❚ | 一時停止 |

## 4. モード

- **CLASSIC**: 王道。最初に遊ぶならこれ
- **RAINBOW**: 同色を連続で壊すと倍率UP
- **CHAOS**: 一定間隔で変則イベント（速度変化・拡大縮小・カプセル雨など）
- **PUZZLE**: 硬いブロック / 爆弾中心の戦略配置

各モード5ステージずつ。

## 5. ブロックとアイテム

| 記号 | ブロック |
|---|---|
| N | 通常 |
| T | タフ（2ヒット） |
| B | 爆弾（3x3で誘爆） |
| C | チェーン（周囲1マスを巻き込む） |
| R | レインボー（RAINBOWモードで万能色） |

カプセルアイテム:
- **M** マルチボール（分裂）
- **W** パドル拡大
- **N** パドル縮小（CHAOSのみ出現）
- **F** ファイアボール（貫通）
- **L** レーザー発射
- **S** スロー
- **+** ライフ+1

## 6. ステージ追加の仕方

`stages.js` の配列に8文字×N行の文字列配列を push するだけ。

```js
STAGES.CLASSIC.push([
  "NNNNNNNN",
  ".TTTTTT.",
  "NNNNNNNN"
]);
```

読み込み時に行長=8を自動検証し、違う行はコンソール警告されます。

## 7. 今後の改善案

- ハイスコアの永続化（localStorage）とベストスコア表示
- ステージごとの制限時間 or ノーミスボーナス
- ギミック追加：重力反転、壁抜けワープ、磁力パドル
- カスタムビルド機能（自作ステージを共有）
- コントローラー対応（Gamepad API）
- 難易度選択（EASY/NORMAL/HARD）でボール速度の係数切り替え
- iOSの触覚フィードバック（Haptic Feedback API）対応の強化
- BGMトラック（ChiptuneシンセをWeb Audioで生成）

## 8. 技術メモ（エラー回避のポイント）

- **非モジュール構成** にして `file://` でのCORS問題を回避
- Service Worker は `location.protocol` が http(s) の場合のみ登録
- 物理はサブステップ化し、高速ボール時のトンネリングを防止
- `circleRect` は距離0時も安全にフォールバック（中心が矩形内）
- 衝突チェーン処理はイテレーション中の配列変更を避けるため2パス
- iOS Safari の音声は最初のユーザー操作で `AudioContext.resume()`
- `touchstart/move` は `{passive:false}` + `preventDefault` でスクロール抑制
- ステージ読み込み時に行長を検証し不正データはスキップ
