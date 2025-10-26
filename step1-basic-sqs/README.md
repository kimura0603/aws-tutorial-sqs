
# Step1: Basic SQS（Pullモデルの体験）

## AWS構成

```
API Gateway (POST /enqueue)
    ↓
Lambda (Producer) ─→ SQS Queue ─→ Lambda (Worker)
```

### リソース構成
- **SQS Queue (BasicQueue)**
  - Visibility Timeout: 30秒

- **Lambda Function (Producer)**
  - Runtime: Node.js 20.x
  - Handler: `producer.handler`
  - 環境変数: `QUEUE_URL`
  - 権限: SQSへのメッセージ送信 (`sqs:SendMessage`)

- **Lambda Function (Worker)**
  - Runtime: Node.js 20.x
  - Handler: `worker.handler`
  - イベントソース: SQS (バッチサイズ: 1)
  - トリガー: SQSキューからのメッセージ受信

- **API Gateway (LambdaRestApi)**
  - エンドポイント: `POST /enqueue`
  - 統合: Producer Lambda

### 処理フロー

1. **Producer (lambda/producer.js)**
   - API Gatewayからリクエストを受信（`POST /enqueue`）
   - リクエストボディから `imageUrl` を取得
   - タイムスタンプベースのジョブIDを生成
   - SQSキューにメッセージを送信
   - クライアントに即座にレスポンスを返す（非同期処理開始）

2. **Queue (SQS)**
   - メッセージを一時的に保持
   - Workerがメッセージを取得すると、30秒間他のコンシューマーから見えなくなる（Visibility Timeout）
   - 処理が完了すると、メッセージは自動削除される

3. **Worker (lambda/worker.js)**
   - SQSキューからメッセージをPull（バッチサイズ: 1）
   - ジョブ内容をログ出力
   - 1秒間の処理を実行（画像処理などの重い処理を想定）
   - 処理完了をログ出力
   - 正常終了すると、LambdaがSQSからメッセージを自動削除

## 学習ゴール
- API → SQS → Lambda の非同期処理フローを体験
- Visibility Timeout と再試行の関係を理解

## デプロイ
```bash
npm install -g aws-cdk
npm install
cdk bootstrap
cdk deploy --outputs-file cdk-outputs.json
```

## 実行
```bash
curl -X POST "$(jq -r .ApiEndpoint.value cdk-outputs.json)enqueue"       -H "Content-Type: application/json"       -d '{"imageUrl":"https://picsum.photos/id/1/200/300"}'
```

## 観察ポイント
- CloudWatch Logs の Worker 出力
- VisibilityTimeout を 5秒 に下げて再デプロイ → 同一メッセージの再配信を観察

## 問題
1. なぜSQSはPushではなくPullモデルなのか？
2. Visibility Timeout が短すぎると何が起きるか？
