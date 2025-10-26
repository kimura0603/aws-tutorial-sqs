
# Step3: FIFOと冪等性

## 学習ゴール
- FIFOキューによる順序保証（MessageGroupId）
- 重複排除（MessageDeduplicationId / contentBasedDeduplication）
- DynamoDBを用いた冪等性の実装

## デプロイ
```bash
npm install -g aws-cdk
npm install
cdk bootstrap
cdk deploy
```

## 実行例（重複IDで2回送信）
```bash
API=$(jq -r .ApiEndpoint.value cdk-outputs.json)
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"same-1","userId":"u1","payload":"A"}'
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"id":"same-1","userId":"u1","payload":"A"}'
```

## 観察
- CloudWatch Logs にて「Duplicate detected. Skip」が出ることを確認
- FIFOにより同一GroupId(u1)の処理順序が守られる

## 問題
1. FIFOを使うとスループットが下がるのはなぜか？
2. 冪等性をSQSだけに任せずアプリで担保する理由は？
