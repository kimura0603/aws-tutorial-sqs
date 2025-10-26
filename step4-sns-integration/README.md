
# Step4: SNS連携（ファンアウト）

## 学習ゴール
- SNS（Push）→ SQS（Pull）連携で信頼性あるファンアウトを実装
- 複数の独立ワーカー（Mail / Inventory）で疎結合化を体験

## デプロイ
```bash
npm install -g aws-cdk
npm install
cdk bootstrap
cdk deploy
```

## 実行
```bash
API=$(jq -r .ApiEndpoint.value cdk-outputs.json)
curl -X POST "${API}publish" -H "Content-Type: application/json"       -d '{"type":"order.created","userId":"u1","payload":{"orderId":"o-123"}}'
```

## 観察
- CloudWatch Logs で MailWorker / InventoryWorker の両方に同じイベントが届く

## 問題
1. SNS→Lambda直結と SNS→SQS→Lambda の違い（再試行・バッファリング）の観点で説明せよ。
2. 個々のサービスがダウンしている場合の耐障害性の差は？
