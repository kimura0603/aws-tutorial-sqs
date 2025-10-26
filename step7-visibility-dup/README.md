
# Step7: Visibility Timeout超過による重複と冪等性

## AWS構成

```
API Gateway (POST /enqueue)
    ↓
Lambda (Producer) ─→ SQS Queue (VT: 5秒) ─→ Lambda (Worker)
                                                 ↓
                                            DynamoDB (冪等性チェック)
                                                 ↓
                                        changeMessageVisibility
```

### リソース構成
- **SQS Queue (ShortVTQueue)**
  - Visibility Timeout: **5秒**（意図的に短く設定）
  - この短いVTにより、長時間処理で重複配信が発生

- **DynamoDB Table (IdemTable)**
  - Partition Key: `messageId` (String)
  - 用途: 処理済みメッセージの記録（冪等性保証）

- **Lambda Function (Producer)**
  - Runtime: Node.js 20.x
  - Handler: `producer.handler`
  - 環境変数: `QUEUE_URL`

- **Lambda Function (Worker)**
  - Runtime: Node.js 20.x
  - Handler: `worker.handler`
  - 環境変数: `TABLE_NAME`, `QUEUE_URL`
  - Timeout: 30秒
  - イベントソース: SQS (バッチサイズ: 1)

- **API Gateway (LambdaRestApi)**
  - エンドポイント: `POST /enqueue`

### 処理フロー

1. **Producer**
   - `id` と `sleep`（処理時間）をメッセージに含めて送信

2. **Worker**
   - DynamoDBで冪等性チェック（既処理なら skip）
   - 処理開始（`sleep` 秒間の長時間処理をシミュレート）
   - 3秒ごとに `changeMessageVisibility` を呼び出してVTを延長（10秒に更新）
   - 処理完了後、DynamoDBに記録（ConditionExpression で二重書き込み防止）

3. **重複配信の発生**
   - Visibility Timeout (5秒) < 処理時間 (8秒) の場合
   - 処理中にメッセージが再度可視化される
   - 別のWorker（または同じWorker）が再度メッセージを取得
   - DynamoDBの冪等性チェックで重複を検出

## 学習ゴール
- Visibility Timeout 超過による重複配信の仕組みを理解
- `changeMessageVisibility` による VT 延長の実装
- DynamoDB を用いた冪等性保証の重要性を体験

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行

### 1. VT超過による重複を観察（changeMessageVisibility なし）
Worker のコードを一時的に修正して、`changeMessageVisibility` の呼び出しをコメントアウト：

```javascript
// 16-17行目をコメントアウト
// await sqs.changeMessageVisibility(...).promise();
```

再デプロイ後、長時間処理のメッセージを送信：

```bash
API=$(jq -r '.VisibilityDupStack.ApiEndpoint' cdk-outputs.json)
curl -X POST "${API}enqueue" \
  -H "Content-Type: application/json" \
  -d '{"id":"msg-1","sleep":8}'
```

CloudWatch Logs で観察：
```
Start msg-1 sleep 8
Start msg-1 sleep 8  ← 5秒後に重複配信！
🔁 Duplicate detect. Skip: msg-1  ← DynamoDBで検出
✅ Completed msg-1
```

### 2. changeMessageVisibility による VT 延長（正常動作）
元のコードに戻して再デプロイ：

```bash
curl -X POST "${API}enqueue" \
  -H "Content-Type: application/json" \
  -d '{"id":"msg-2","sleep":8}'
```

CloudWatch Logs で観察：
```
Start msg-2 sleep 8
✅ Completed msg-2  ← 重複なし（VTを3秒ごとに延長）
```

## 観察ポイント

### Visibility Timeout の役割
- メッセージを取得したWorkerが処理中、他のWorkerから見えないようにする
- デフォルトでは取得時の VT が適用される
- VT 内に処理が完了しないと、メッセージが再度可視化される

### changeMessageVisibility の重要性
- 長時間処理では、定期的に VT を延長する必要がある
- 延長しないと、処理中にメッセージが再配信される
- Step7 では 3秒ごとに VT を 10秒に更新

### 冪等性の必要性
- VT 延長に失敗した場合、重複配信が発生する可能性がある
- ネットワーク障害や Lambda タイムアウトでも重複が発生
- DynamoDB の ConditionExpression で二重処理を防止

## 実験

### 1. VT を超える処理時間で重複を確認
```bash
# VT: 5秒、処理時間: 15秒 → 確実に重複
curl -X POST "${API}enqueue" \
  -H "Content-Type: application/json" \
  -d '{"id":"long-job","sleep":15}'
```

### 2. changeMessageVisibility の失敗をシミュレート
Worker のコードを修正して、VT延長を意図的に失敗させる：
```javascript
// changeMessageVisibility を呼ばない、またはエラーをスロー
throw new Error('VT extension failed');
```

### 3. DynamoDB の ConditionExpression がない場合
一時的に ConditionExpression を削除：
```javascript
// before
await ddb.put({ ..., ConditionExpression: 'attribute_not_exists(messageId)' }).promise();

// after (削除)
await ddb.put({ ... }).promise();
```

→ 重複処理が実際に実行される（冪等性が失われる）

## 問題
1. Visibility Timeout を適切に設定するための考慮事項は？
2. changeMessageVisibility を呼び出す頻度はどう決めるべきか？
3. DynamoDB の ConditionExpression が失敗した場合、どう処理すべきか？
4. 冪等性を DynamoDB 以外の方法で実装する場合、どんな選択肢があるか？
5. Step1 で Visibility Timeout を短くした実験との違いは？

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, Worker）
- SQS キュー
- DynamoDB テーブル
- API Gateway
- IAMロール
