
# Step5: 総合演習（設計課題付き）

## 学習ゴール
- SNS→SQS(標準/ FIFO) ファンアウト
- DLQ運用（Mail=2回, Inventory=3回で隔離）
- DynamoDBによる冪等性
- 実務レベルの設計判断

## デプロイ
```bash
npm install -g aws-cdk
npm install
cdk bootstrap
cdk deploy
```

## 実行例（失敗をシミュレート）
```bash
API=$(jq -r .ApiEndpoint.value cdk-outputs.json)
# メールだけ失敗
curl -X POST "${API}order" -H "Content-Type: application/json" -d '{"failMail":true}'
# 在庫だけ失敗（FIFO側の挙動とDLQ移動を観察）
curl -X POST "${API}order" -H "Content-Type: application/json" -d '{"failInventory":true}'
```

## 設計課題
1. 決済・在庫・メールのうち、どれをFIFOにすべきか？理由は？
2. バックログが増えた際、Lambdaの同時実行制限とキューサイズをどう監視・制御する？
3. 冪等性や順序保証を保ちつつスループットを上げる別案は？（GroupIdの切り方等）
