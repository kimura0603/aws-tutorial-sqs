
# Step8: バッチ処理と部分失敗

## AWS構成

```
API Gateway (POST /enqueue)
    ↓
Lambda (Producer) ─→ SQS Queue ─→ Lambda (Worker, batchSize: 10)
                         ↓                    ↓
                        DLQ           batchItemFailures で部分失敗を報告
```

### リソース構成
- **SQS Queue (BatchQueue)**
  - Dead Letter Queue: DLQ
  - Max Receive Count: 2
  - バッチ処理用のキュー

- **SQS Queue (DLQ)**
  - 失敗メッセージの保管

- **Lambda Function (Producer)**
  - Runtime: Node.js 20.x
  - Handler: `producer.handler`
  - 環境変数: `QUEUE_URL`
  - 機能: 複数メッセージを一度にキューに送信

- **Lambda Function (Worker)**
  - Runtime: Node.js 20.x
  - Handler: `worker.handler`
  - イベントソース: SQS (バッチサイズ: 10, reportBatchItemFailures: true)
  - 機能: バッチ処理で一部のメッセージのみ失敗を報告

- **API Gateway (LambdaRestApi)**
  - エンドポイント: `POST /enqueue`

### 処理フロー

1. **Producer**
   - `count` 個のメッセージをキューに送信
   - `failEvery` 番目のメッセージに `shouldFail: true` を設定

2. **SQS Queue**
   - 最大10件のメッセージをバッチでWorkerに配信

3. **Worker (reportBatchItemFailures: true)**
   - バッチ内の各メッセージを処理
   - `shouldFail: true` のメッセージは失敗
   - **成功したメッセージ**: 自動削除
   - **失敗したメッセージ**: `batchItemFailures` で報告 → 再試行 → DLQ

4. **従来の動作との違い (reportBatchItemFailures: false)**
   - バッチ内の1件でも失敗すると、**全メッセージが再試行**
   - 成功していたメッセージも再処理される（重複処理）

## 学習ゴール
- バッチ処理による効率化を理解
- `reportBatchItemFailures` による部分失敗の制御
- 部分失敗がない場合の問題（全件再試行）を体験

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行

### 1. バッチ処理と部分失敗を観察
```bash
API=$(jq -r '.BatchPartialStack.ApiEndpoint' cdk-outputs.json)

# 10件のメッセージを送信、3件ごとに失敗
curl -X POST "${API}enqueue" \
  -H "Content-Type: application/json" \
  -d '{"count":10,"failEvery":3}'
```

CloudWatch Logs で観察：
```
✅ OK: 1234567890-1
✅ OK: 1234567890-2
❌ FAIL: msg-id-3 Intentional failure 1234567890-3  ← 3番目失敗
✅ OK: 1234567890-4
✅ OK: 1234567890-5
❌ FAIL: msg-id-6 Intentional failure 1234567890-6  ← 6番目失敗
✅ OK: 1234567890-7
✅ OK: 1234567890-8
❌ FAIL: msg-id-9 Intentional failure 1234567890-9  ← 9番目失敗
✅ OK: 1234567890-10
```

**期待される動作:**
- 成功したメッセージ（1,2,4,5,7,8,10）: 即座に削除
- 失敗したメッセージ（3,6,9）: `batchItemFailures` で報告 → 再試行 → DLQ

### 2. DLQを確認
```bash
# 失敗メッセージが DLQ に移動していることを確認
aws sqs get-queue-attributes \
  --queue-url <DLQ_URL> \
  --attribute-names ApproximateNumberOfMessages
```

## 観察ポイント

### reportBatchItemFailures の有無による違い

#### reportBatchItemFailures: true（Step8の設定）
- 失敗したメッセージのみ再試行
- 成功したメッセージは削除される
- 効率的でコスト削減

#### reportBatchItemFailures: false（従来の動作）
- バッチ内の1件でも失敗すると、**全メッセージが再試行**
- 成功していたメッセージも再処理
- 重複処理が発生（冪等性が必須）

### Worker の実装
```javascript
return { batchItemFailures: failures };
// failures = [{ itemIdentifier: messageId }, ...]
```

失敗したメッセージの `messageId` を配列で返すことで、SQS に部分失敗を通知

## 実験

### 1. reportBatchItemFailures を無効化して比較
`lib/BatchPartialStack.ts` を一時的に修正：

```typescript
// before
worker.addEventSource(new sources.SqsEventSource(queue, {
  batchSize: 10,
  reportBatchItemFailures: true
}));

// after
worker.addEventSource(new sources.SqsEventSource(queue, {
  batchSize: 10,
  reportBatchItemFailures: false
}));
```

再デプロイして同じメッセージを送信：
```bash
curl -X POST "${API}enqueue" \
  -H "Content-Type: application/json" \
  -d '{"count":10,"failEvery":3}'
```

**期待される動作:**
- バッチ全体が再試行される
- 成功していたメッセージも再度処理される
- CloudWatch Logs で同じメッセージが複数回表示される

### 2. バッチサイズを変更して観察
```typescript
// batchSize: 10 → 1 に変更
worker.addEventSource(new sources.SqsEventSource(queue, {
  batchSize: 1,
  reportBatchItemFailures: true
}));
```

→ メッセージが1件ずつ処理される（部分失敗の概念が不要）

## 問題
1. reportBatchItemFailures を使うべき状況は？
2. バッチサイズを大きくするメリットとデメリットは？
3. 冪等性が実装されていない場合、reportBatchItemFailures=false の影響は？
4. バッチ処理で一部が成功、一部が失敗する典型的なシナリオは？
5. DLQ に入ったメッセージの再処理方法は？（Redrive policy）

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, Worker）
- SQS キュー（BatchQueue, DLQ）
- API Gateway
- IAMロール
