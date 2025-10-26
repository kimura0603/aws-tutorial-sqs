
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
npm install  # CDK依存関係とesbuildをインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

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
```
  重複を観察するには、Worker処理時間を10秒に延ばす必要があ
  ります：

  // worker.js を以下に変更
  await new Promise(r => setTimeout(r, 10000));  // 
  10秒に延長

  実験手順:
  1. VisibilityTimeout を5秒に変更してデプロイ
  2. Worker処理を10秒に延ばす
  3. メッセージを送信
  4. CloudWatch Logsで同じジョブIDが2回処理されるのを確認

  CloudWatch Logsで見えるもの:
  Processing job: { id: '1234567890', ... }
  Processing job: { id: '1234567890', ... }  ← 同じID！
  ✅ Done: 1234567890
  ✅ Done: 1234567890
```

## クリーンアップ
学習終了後、AWSリソースを削除して課金を停止します：
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, Worker）
- SQSキュー
- API Gateway
- IAMロール

**Note:** CDKToolkitスタック（bootstrap時に作成）は削除されません。他のCDKプロジェクトでも使用するため、残しておいて問題ありません。
