
# Step9: FIFO深掘り - MessageGroupIdの戦略と頭詰まり

## AWS構成

```
API Gateway (POST /send)
    ↓
Lambda (Producer) ─→ FIFO Queue ─→ Lambda (Worker)
                      (MessageGroupId別に順序保証)
```

### リソース構成
- **SQS Queue (FifoDeepQueue.fifo)**
  - Type: FIFO
  - Content Based Deduplication: true
  - Visibility Timeout: 30秒
  - Queue Name: `FifoDeepQueue.fifo` (明示的に指定)

- **Lambda Function (Producer)**
  - Runtime: Node.js 20.x
  - Handler: `producer.handler`
  - 環境変数: `QUEUE_URL`
  - 機能: MessageGroupId と MessageDeduplicationId を指定してメッセージ送信

- **Lambda Function (Worker)**
  - Runtime: Node.js 20.x
  - Handler: `worker.handler`
  - イベントソース: FIFO SQS (バッチサイズ: 1)
  - 機能: メッセージを受信して処理（GroupId の順序を確認）

- **API Gateway (LambdaRestApi)**
  - エンドポイント: `POST /send`

### 処理フロー

1. **Producer**
   - `groups`: 作成する MessageGroupId の数
   - `perGroup`: 各グループあたりのメッセージ数
   - 各メッセージに MessageGroupId と MessageDeduplicationId を設定

2. **FIFO Queue**
   - MessageGroupId 単位で順序を保証
   - 同じ GroupId のメッセージは順番に処理される
   - 異なる GroupId は並列処理可能

3. **Worker**
   - メッセージを受信して処理
   - ログで GroupId と順序を確認

## 学習ゴール
- MessageGroupId の粒度設計の重要性を理解
- FIFOキューの「頭詰まり（Head-of-Line Blocking）」問題を体験
- 並列処理とスループット向上のトレードオフを学習

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行

### 1. 単一 MessageGroupId で頭詰まりを観察
```bash
API=$(jq -r '.FifoDeepStack.ApiEndpoint' cdk-outputs.json)

# 1つの GroupId で 20件のメッセージを送信
curl -X POST "${API}send" \
  -H "Content-Type: application/json" \
  -d '{"groups":1,"perGroup":20}'
```

CloudWatch Logs で観察：
```
Processing (FIFO): { id: 'user-0-1234567890-0' }
Processing (FIFO): { id: 'user-0-1234567890-1' }
...
Processing (FIFO): { id: 'user-0-1234567890-19' }
```

**観察ポイント:**
- すべてのメッセージが **順番に** 処理される
- 並列処理されない（1つの GroupId のため）
- スループットが低い

### 2. 複数 MessageGroupId で並列処理を観察
```bash
# 10個の GroupId で、各2件ずつ送信（計20件）
curl -X POST "${API}send" \
  -H "Content-Type: application/json" \
  -d '{"groups":10,"perGroup":2}'
```

CloudWatch Logs で観察：
```
Processing (FIFO): { id: 'user-0-1234567890-0' }
Processing (FIFO): { id: 'user-3-1234567891-0' }
Processing (FIFO): { id: 'user-1-1234567892-0' }
Processing (FIFO): { id: 'user-0-1234567893-1' }  ← user-0 の2件目
Processing (FIFO): { id: 'user-5-1234567894-0' }
...
```

**観察ポイント:**
- 異なる GroupId のメッセージが **並列処理** される
- 同じ GroupId 内では順序が保証される
- スループットが向上

## 観察ポイント

### MessageGroupId の粒度による影響

| MessageGroupId の粒度 | 順序保証 | 並列処理 | スループット | 使用例 |
|---------------------|---------|---------|------------|--------|
| 全メッセージ同一 | 全体で順序保証 | なし | 低い | 全体の順序が必須 |
| ユーザーID単位 | ユーザー内で順序保証 | ユーザー間で並列 | 中程度 | ユーザー別の操作履歴 |
| 注文ID単位 | 注文内で順序保証 | 注文間で並列 | 高い | 注文処理 |
| リソースID単位 | リソース内で順序保証 | リソース間で並列 | 高い | 在庫更新、アカウント操作 |

### 頭詰まり（Head-of-Line Blocking）問題
- 単一の MessageGroupId を使用すると、すべてのメッセージが直列処理
- 1つのメッセージが遅延すると、後続メッセージもブロックされる
- FIFOキューの並列処理能力が活用できない

### 解決策
1. **MessageGroupId を細かく分割**
   - ユーザーID、注文ID、リソースIDなどの単位で分割
   - 並列処理可能な粒度を選択

2. **順序保証が必要な範囲を最小化**
   - 本当に順序が必要な範囲だけを同じ GroupId にする
   - 不要な範囲は異なる GroupId にする

3. **標準キューとの使い分け**
   - 順序保証が不要な処理は標準キューを使用
   - FIFOキューはスループット上限あり（3000 messages/sec with batching）

## 実験

### 1. 頭詰まりのシミュレーション
Worker のコードを修正して、処理時間を追加：

```javascript
// worker.js に追加
await new Promise(r => setTimeout(r, 1000));  // 1秒の処理時間
```

単一 GroupId で送信：
```bash
time curl -X POST "${API}send" -H "Content-Type: application/json" -d '{"groups":1,"perGroup":10}'
# → 約10秒かかる（直列処理）
```

複数 GroupId で送信：
```bash
time curl -X POST "${API}send" -H "Content-Type: application/json" -d '{"groups":10,"perGroup":1}'
# → 約1-2秒で完了（並列処理）
```

### 2. MessageDeduplicationId の重要性
Producer のコードで MessageDeduplicationId を固定してみる：

```javascript
// before
MessageDeduplicationId: message.id,

// after
MessageDeduplicationId: groupId,  // GroupId と同じ値
```

→ 同じ GroupId 内で1件しか処理されない（重複排除される）

## 問題
1. MessageGroupId をどのような基準で設計すべきか？
2. 頭詰まりを回避しつつ、順序保証を実現する方法は？
3. FIFO キューのスループット上限（3000 messages/sec）に達した場合の対策は？
4. MessageDeduplicationId と MessageGroupId の関係は？
5. 標準キューと FIFO キューを組み合わせて使う設計例は？

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, Worker）
- FIFO SQS キュー
- API Gateway
- IAMロール
