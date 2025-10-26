
# Step3: FIFOと冪等性

## AWS構成

```
API Gateway (POST /enqueue)
    ↓
Lambda (Producer) ─→ FIFO Queue ─→ Lambda (Worker)
                                        ↓
                                   DynamoDB (冪等性チェック)
```

### リソース構成
- **SQS Queue (FifoQueue)**
  - Type: FIFO (.fifo suffix)
  - Content Based Deduplication: true
  - Visibility Timeout: 30秒
  - MessageGroupId による順序保証

- **DynamoDB Table (ProcessedTable)**
  - Partition Key: `messageId` (String)
  - Billing Mode: PAY_PER_REQUEST
  - 用途: 処理済みメッセージIDの記録（冪等性保証）

- **Lambda Function (Producer)**
  - Runtime: Node.js 20.x
  - Handler: `producer.handler`
  - 環境変数: `QUEUE_URL`

- **Lambda Function (Worker)**
  - Runtime: Node.js 20.x
  - Handler: `worker.handler`
  - 環境変数: `TABLE_NAME`
  - イベントソース: FIFO SQS (バッチサイズ: 1)

- **API Gateway (LambdaRestApi)**
  - エンドポイント: `POST /enqueue`

### 処理フロー

1. **Producer**
   - リクエストから `id`, `userId`, `payload` を取得
   - FIFOキューに送信（MessageGroupId = userId）

2. **FIFO Queue**
   - Content-based deduplication により、同一内容のメッセージを5分間重複排除
   - MessageGroupId 単位で順序を保証

3. **Worker**
   - DynamoDBで messageId の存在確認（冪等性チェック）
   - 未処理なら DynamoDB に記録して処理実行
   - 既処理なら「Duplicate detected. Skip」とログ出力

## 学習ゴール
- FIFOキューによる順序保証（MessageGroupId）
- 重複排除（MessageDeduplicationId / contentBasedDeduplication）
- DynamoDBを用いた冪等性の実装

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行例（重複IDで2回送信）
```bash
API=$(jq -r '.FifoIdemStack.ApiEndpoint' cdk-outputs.json)
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"same-1","userId":"u1","payload":"A"}'
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"same-1","userId":"u1","payload":"A"}'
```

## 観察ポイント

### CloudWatch Logsで確認
- 1回目: 正常処理
  ```
  Processing: same-1 { id: 'same-1', userId: 'u1', payload: 'A' }
  ✅ Processed: same-1
  ```
- 2回目: SQSレベルで重複排除されるため、Workerには届かない
  （Content-based deduplication が機能）

### DynamoDBで確認
```bash
TABLE_NAME=$(jq -r '.FifoIdemStack.TableName' cdk-outputs.json)
aws dynamodb scan --table-name $TABLE_NAME
```

### 順序保証の確認
```bash
# 同じuserIdで複数メッセージを送信
API=$(jq -r '.FifoIdemStack.ApiEndpoint' cdk-outputs.json)
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"msg-1","userId":"u1","payload":"First"}'
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"msg-2","userId":"u1","payload":"Second"}'
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"msg-3","userId":"u1","payload":"Third"}'
```

CloudWatch Logsで、同一MessageGroupId (u1) 内で順序が保証されることを確認

## 実験

### 異なるMessageGroupIdでの並列処理
```bash
# 異なるuserIdで送信
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"msg-a","userId":"user-a","payload":"A"}'
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"msg-b","userId":"user-b","payload":"B"}'
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"msg-c","userId":"user-c","payload":"C"}'
```

異なるMessageGroupIdは並列処理される（順序保証はグループ内のみ）

## 問題
1. FIFOを使うとスループットが下がるのはなぜか？
2. 冪等性をSQSだけに任せずアプリで担保する理由は？
3. MessageGroupIdの粒度をどう決めるべきか？
4. Content-based deduplication の5分間制限を超えた場合、どう対処すべきか？

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, Worker）
- FIFO SQSキュー
- DynamoDB テーブル
- API Gateway
- IAMロール
