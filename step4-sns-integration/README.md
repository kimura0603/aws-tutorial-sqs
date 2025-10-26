
# Step4: SNS連携（ファンアウト）

## AWS構成

```
API Gateway (POST /publish)
    ↓
Lambda (Producer) ─→ SNS Topic ─┬→ Mail Queue → Mail Worker
                                 └→ Inventory Queue → Inventory Worker
```

### リソース構成
- **SNS Topic (Topic)**
  - Fanout パターンで複数のサブスクライバーに配信

- **SQS Queue (MailQueue)**
  - SNS からのメッセージを受信
  - Mail Worker 用

- **SQS Queue (InventoryQueue)**
  - SNS からのメッセージを受信
  - Inventory Worker 用

- **Lambda Function (Producer)**
  - Runtime: Node.js 20.x
  - Handler: `producer.handler`
  - 環境変数: `TOPIC_ARN`
  - 権限: SNS への Publish

- **Lambda Function (MailWorker)**
  - Runtime: Node.js 20.x
  - Handler: `mailWorker.handler`
  - イベントソース: MailQueue (バッチサイズ: 1)

- **Lambda Function (InventoryWorker)**
  - Runtime: Node.js 20.x
  - Handler: `inventoryWorker.handler`
  - イベントソース: InventoryQueue (バッチサイズ: 1)

- **API Gateway (LambdaRestApi)**
  - エンドポイント: `POST /publish`

### 処理フロー

1. **Producer**
   - API Gateway からリクエストを受信
   - SNS Topic にメッセージを Publish

2. **SNS Topic**
   - 全てのサブスクライバー（MailQueue, InventoryQueue）に同時配信
   - ファンアウトパターンを実現

3. **SQS Queues**
   - SNS からのメッセージをバッファリング
   - 各 Worker が独立したペースで処理可能

4. **Workers**
   - **MailWorker**: メール送信処理をシミュレート
   - **InventoryWorker**: 在庫更新処理をシミュレート
   - それぞれが独立して動作（疎結合）

## 学習ゴール
- SNS（Push）→ SQS（Pull）連携で信頼性あるファンアウトを実装
- 複数の独立ワーカー（Mail / Inventory）で疎結合化を体験
- SNS→SQS のメッセージフォーマットを理解

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行
```bash
API=$(jq -r '.SnsIntegrationStack.ApiEndpoint' cdk-outputs.json)
curl -X POST "${API}publish" \
  -H "Content-Type: application/json" \
  -d '{"type":"order.created","userId":"u1","payload":{"orderId":"o-123"}}'
```

## 観察ポイント

### CloudWatch Logsで確認
1. MailWorker のログストリームを開く
   ```
   📧 MailWorker processing: order.created for u1
   Payload: { orderId: 'o-123' }
   ```

2. InventoryWorker のログストリームを開く
   ```
   📦 InventoryWorker processing: order.created for u1
   Payload: { orderId: 'o-123' }
   ```

3. **両方の Worker に同じイベントが届くことを確認**

### SNS→SQS のメッセージフォーマット
SNS経由のメッセージは以下のようにラップされます：
```json
{
  "Type": "Notification",
  "MessageId": "...",
  "TopicArn": "...",
  "Message": "{\"type\":\"order.created\",\"userId\":\"u1\",\"payload\":{\"orderId\":\"o-123\"}}",
  "Timestamp": "...",
  ...
}
```

Worker側で `JSON.parse(JSON.parse(record.body).Message)` が必要

## 実験

### 片方のWorkerが失敗しても他方は成功することを確認
Workerのコードを一時的に修正して、片方だけエラーをスローさせる：

```javascript
// mailWorker.js に追加
throw new Error('Mail service down');
```

再デプロイ後、メッセージを送信すると：
- MailWorker: エラーで再試行→DLQ（設定していれば）
- InventoryWorker: 正常に処理完了

→ **疎結合により、片方の障害が他方に影響しない**

## 問題
1. SNS→Lambda直結と SNS→SQS→Lambda の違い（再試行・バッファリング）の観点で説明せよ。
2. 個々のサービスがダウンしている場合の耐障害性の差は？
3. SNS のメッセージフィルタリング機能を使うとどんなメリットがあるか？
4. ファンアウト先が10個になった場合、どのような考慮が必要か？

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, MailWorker, InventoryWorker）
- SNS Topic
- SQS キュー（MailQueue, InventoryQueue）
- SNS Subscriptions
- API Gateway
- IAMロール
