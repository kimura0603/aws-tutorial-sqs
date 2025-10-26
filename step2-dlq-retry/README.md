
# Step2: DLQ（Dead Letter Queue）と再試行

## AWS構成

```
API Gateway (POST /enqueue)
    ↓
Lambda (Producer) ─→ SQS Queue ─→ Lambda (Worker)
                         ↓ (maxReceiveCount: 3回)
                     DLQ (Dead Letter Queue)
```

### リソース構成
- **SQS Queue (MainQueue)**
  - Visibility Timeout: 15秒
  - Dead Letter Queue: DLQ
  - Max Receive Count: 3 (3回の受信失敗でDLQへ移動)

- **SQS Queue (DLQ)**
  - Retention Period: 14日間
  - 失敗メッセージの保存・分析用

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
   - リクエストボディから `imageUrl` と `fail` フラグを取得
   - タイムスタンプベースのジョブIDを生成
   - `shouldFail` フラグをメッセージに含めてSQSに送信
   - クライアントに即座にレスポンスを返す

2. **Queue (SQS)**
   - メッセージを一時的に保持
   - Workerがメッセージを取得すると、15秒間他のコンシューマーから見えなくなる
   - 処理が失敗すると、メッセージは再度キューに戻る
   - `ReceiveCount` が3回に達すると、DLQに移動

3. **Worker (lambda/worker.js)**
   - SQSキューからメッセージをPull
   - `shouldFail` フラグが `true` の場合、意図的にエラーをスロー
   - エラーが発生すると、Lambdaは処理を失敗とマーク
   - SQSは自動的にメッセージを再配信（最大3回）
   - 3回失敗すると、メッセージはDLQに移動

4. **DLQ (Dead Letter Queue)**
   - 処理に失敗したメッセージを14日間保持
   - 手動での分析・再処理が可能
   - アラームやモニタリングの対象として運用

## 学習ゴール
- 自動再試行とDLQ（Dead Letter Queue）の動作を理解
- 失敗メッセージの隔離と運用の基本を体験
- `maxReceiveCount` と再試行の仕組みを観察

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行

### 正常なメッセージを送信
```bash
curl -X POST "$(jq -r '.DlqRetryStack.ApiEndpoint' cdk-outputs.json)enqueue" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://picsum.photos/id/2/200/300"}'
```

### 失敗をシミュレート
```bash
curl -X POST "$(jq -r '.DlqRetryStack.ApiEndpoint' cdk-outputs.json)enqueue" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/fail.jpg","fail":true}'
```

## 観察ポイント

### CloudWatch Logsで再試行を確認
1. Lambda Worker のログストリームを開く
2. 失敗メッセージを送信
3. 以下のようなログが3回表示されることを確認：
   ```
   Processing: 1234567890 { id: '1234567890', imageUrl: '...', shouldFail: true }
   ERROR Simulated failure for 1234567890
   ```
4. 3回の再試行後、メッセージがDLQに移動

### DLQの確認
```bash
# DLQのURLを取得
jq -r '.DlqRetryStack.DLQUrl' cdk-outputs.json

# AWS Console または CLI でDLQのメッセージ数を確認
aws sqs get-queue-attributes \
  --queue-url "$(jq -r '.DlqRetryStack.DLQUrl' cdk-outputs.json)" \
  --attribute-names ApproximateNumberOfMessages
```

### 再試行の仕組み
- Worker が例外をスローすると、Lambda は処理を失敗とマーク
- SQS はメッセージを削除せず、再度配信可能にする
- `ReceiveCount` が内部的にインクリメントされる
- `maxReceiveCount: 3` に達すると、DLQ に自動移動

## 実験

### Visibility Timeout と再試行の関係を観察
1. `DlqRetryStack.ts` の `visibilityTimeout` を5秒に変更
2. `worker.js` の処理時間を10秒に延長：
   ```javascript
   await new Promise(r => setTimeout(r, 10000));  // 10秒
   ```
3. Worker Lambda のタイムアウトを20秒に設定
4. `cdk deploy`
5. 正常なメッセージを送信
6. CloudWatch Logs で同じメッセージが複数回処理されることを確認
7. 最終的にDLQに移動する様子を観察

**期待される動作:**
- Visibility Timeout (5秒) < 処理時間 (10秒)
- メッセージが処理中に再度可視化される
- 別のWorkerまたは同じWorkerが再度処理を試みる
- 重複処理が発生し、最終的にDLQへ

## 問題
1. DLQがなぜ必要か、SNSにDLQがない理由と対比して説明せよ。
2. 可視性タイムアウトと再試行の相互作用を説明せよ。
3. `maxReceiveCount` を1に設定した場合、どのような影響があるか？
4. DLQに入ったメッセージをどのように処理すべきか？

## クリーンアップ
学習終了後、AWSリソースを削除して課金を停止します：
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Producer, Worker）
- SQSキュー（MainQueue, DLQ）
- API Gateway
- IAMロール

**Note:** DLQ内のメッセージも削除されます。本番環境では、DLQ内のメッセージを分析・バックアップしてから削除してください。
