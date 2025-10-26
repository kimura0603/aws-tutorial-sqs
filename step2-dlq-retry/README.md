
# Step2: DLQと再試行

## 学習ゴール
- 自動再試行とDLQ（Dead Letter Queue）の動作を理解
- 失敗メッセージの隔離と運用の基本を体験

## デプロイ
```bash
npm install -g aws-cdk
npm install
cdk bootstrap
cdk deploy
```

## 実行（失敗をシミュレート）
```bash
curl -X POST "$(jq -r .ApiEndpoint.value cdk-outputs.json)enqueue"       -H "Content-Type: application/json"       -d '{"imageUrl":"https://example.com/fail.jpg","fail":true}'
```

## 観察
- CloudWatch Logsで再試行の回数を確認
- `maxReceiveCount` に達するとDLQにメッセージが移動

## 問題
1. DLQがなぜ必要か、SNSにDLQがない理由と対比して説明せよ。
2. 可視性タイムアウトと再試行の相互作用を説明せよ。
