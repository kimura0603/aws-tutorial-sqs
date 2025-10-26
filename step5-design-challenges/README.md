
# Step5: 総合演習（設計課題付き）

## AWS構成

```
API Gateway (POST /order)
    ↓
Lambda (Producer) ─→ SNS Topic ─┬→ Mail Queue (標準) → Mail Worker
                                 │    ↓ (maxReceiveCount: 2)
                                 │  Mail DLQ
                                 │
                                 └→ Inventory Queue (FIFO) → Inventory Worker
                                      ↓ (maxReceiveCount: 3)        ↓
                                    Inventory DLQ          DynamoDB (冪等性)
```

### リソース構成
- **SNS Topic (OrderTopic)**
  - 注文イベントを複数のサブスクライバーに配信

- **SQS Queue (MailQueue) - 標準キュー**
  - Dead Letter Queue: MailDLQ
  - Max Receive Count: 2

- **SQS Queue (MailDLQ)**
  - メール送信失敗メッセージの保管

- **SQS Queue (InventoryQueue) - FIFOキュー**
  - Content Based Deduplication: true
  - Visibility Timeout: 30秒
  - Dead Letter Queue: InventoryDLQ
  - Max Receive Count: 3

- **SQS Queue (InventoryDLQ)**
  - 在庫更新失敗メッセージの保管

- **DynamoDB Table (ProcessedTable)**
  - Partition Key: `messageId` (String)
  - 用途: 在庫ワーカーの冪等性保証

- **Lambda Functions**
  - **Producer**: 注文をSNSに発行
  - **MailWorker**: メール送信処理（標準キューから）
  - **InventoryWorker**: 在庫更新処理（FIFOキューから、DynamoDBで冪等性保証）

### 処理フロー

1. **Producer**
   - 注文データを SNS Topic に Publish

2. **SNS Topic**
   - MailQueue (標準) と InventoryQueue (FIFO) に配信

3. **MailWorker**
   - 標準キューから処理（順序保証なし、高スループット）
   - 失敗時: 2回再試行後、MailDLQへ

4. **InventoryWorker**
   - FIFOキューから処理（順序保証あり）
   - DynamoDBで冪等性チェック
   - 失敗時: 3回再試行後、InventoryDLQへ

## 学習ゴール
- SNS→SQS(標準/ FIFO) ファンアウト
- DLQ運用（Mail=2回, Inventory=3回で隔離）
- DynamoDBによる冪等性
- 実務レベルの設計判断

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行例

### 正常な注文
```bash
API=$(jq -r '.DesignChallengesStack.ApiEndpoint' cdk-outputs.json)
curl -X POST "${API}order" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","orderId":"order-123","amount":1000}'
```

### メールだけ失敗をシミュレート
```bash
curl -X POST "${API}order" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","orderId":"order-124","amount":2000,"failMail":true}'
```

### 在庫だけ失敗をシミュレート（FIFO側の挙動とDLQ移動を観察）
```bash
curl -X POST "${API}order" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","orderId":"order-125","amount":3000,"failInventory":true}'
```

## 観察ポイント

### CloudWatch Logsで確認
1. **正常ケース**
   - MailWorker: メール送信成功
   - InventoryWorker: 在庫更新成功、DynamoDBに記録

2. **failMail: true**
   - MailWorker: 2回再試行してMailDLQへ移動
   - InventoryWorker: 正常に処理（疎結合により影響なし）

3. **failInventory: true**
   - MailWorker: 正常に処理
   - InventoryWorker: 3回再試行してInventoryDLQへ移動

### DLQの確認
```bash
# CloudWatch Metrics で DLQ のメッセージ数を確認
# または CLI で確認
aws sqs get-queue-attributes \
  --queue-url <DLQ_URL> \
  --attribute-names ApproximateNumberOfMessages
```

### 標準キュー vs FIFOキューの違い
- **MailQueue (標準)**
  - 高スループット
  - 順序保証なし
  - At-Least-Once 配信

- **InventoryQueue (FIFO)**
  - MessageGroupId で順序保証
  - Content-based deduplication
  - Exactly-Once 処理（DynamoDBと組み合わせ）

## 設計課題
1. **決済・在庫・メールのうち、どれをFIFOにすべきか？理由は？**
   - ヒント: 順序保証が必要なのは？重複処理の影響は？

2. **バックログが増えた際、Lambdaの同時実行制限とキューサイズをどう監視・制御する？**
   - ヒント: CloudWatch Metrics, Lambda Reserved Concurrency, SQS Redrive Policy

3. **冪等性や順序保証を保ちつつスループットを上げる別案は？（GroupIdの切り方等）**
   - ヒント: MessageGroupId の粒度、並列処理可能な単位

4. **DLQに入ったメッセージをどう運用すべきか？**
   - ヒント: アラーム、手動再処理、Redrive、分析

5. **SNS→Lambda直結ではなく、SNS→SQS→Lambdaを選択する理由は？**
   - ヒント: バッファリング、再試行制御、バックプレッシャー

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, MailWorker, InventoryWorker）
- SNS Topic
- SQS キュー（MailQueue, InventoryQueue, MailDLQ, InventoryDLQ）
- DynamoDB テーブル
- API Gateway
- IAMロール
