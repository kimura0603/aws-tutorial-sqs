
# SQS × SNS 5ステップ実践チュートリアル（TypeScript CDK・完全版）

各 `step*/` は独立した CDK アプリです。フォルダに移動して `cdk deploy` すれば、そのステップの学習内容を体験できます。

## ステップ概要
1. **step1-basic-sqs**: 非同期処理の基本（API→SQS→Lambda）
2. **step2-dlq-retry**: 自動再試行とDLQの運用
3. **step3-fifo-idempotency**: FIFO・重複排除・DynamoDB冪等性
4. **step4-sns-integration**: SNS→SQSファンアウト
5. **step5-design-challenges**: 総合構成＋設計課題
6. step6-long-polling
7. step7-visibility-dup
8. step8-batch-partial
9. step9-fifo-deep


## 進め方
- 各ステップの `README.md` に操作手順と課題がまとまっています。
- CloudWatch Logs を観察しながら、再試行・DLQ・順序保証・冪等性の**実際の挙動**を確かめてください。

## チュートリアルのすゝめ
### 学習ノートのルール
- 各stepフォルダの中に `.tls/` フォルダを作成してください
- `.tls/learning-notes.md` ファイルに、そのステップで学んだことや気づきを記録していきます
