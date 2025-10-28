# Step2: DLQ & Retry - 学習ノート

## DLQ（Dead Letter Queue）の基本

### DLQとは
- メッセージ処理に失敗したメッセージを隔離する専用キュー
- `maxReceiveCount`で指定した回数リトライ後、DLQに移動
- 失敗したメッセージを後で分析・再処理できる

### 設定例
```typescript
const dlq = new sqs.Queue(this, 'DLQ', {
  retentionPeriod: cdk.Duration.days(14)
});

const queue = new sqs.Queue(this, 'MainQueue', {
  visibilityTimeout: cdk.Duration.seconds(15),
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3  // 3回失敗したらDLQへ
  },
});
```

## DLQのメッセージ確認方法

### AWSコンソールでの確認

1. **メッセージ数の確認**
   - SQSコンソール → キュー一覧
   - 「Messages available」列に表示

2. **メッセージ内容の確認**
   - DLQを選択 → 「Send and receive messages」
   - 「Poll for messages」ボタン
   - ⚠️ 注意：Pollするとメッセージが一時的に見えなくなる（Visibility Timeout適用）

3. **メトリクスでの確認**
   - 「Monitoring」タブ → CloudWatchメトリクス
   - `ApproximateNumberOfMessagesVisible`: キューに残っているメッセージ数
   - `ApproximateNumberOfMessagesNotVisible`: 処理中のメッセージ数

### CLIでの確認
```bash
aws sqs get-queue-attributes \
  --queue-url <DLQ_URL> \
  --attribute-names ApproximateNumberOfMessages
```

## DLQから通常キューへの再処理（Redrive）

### 方法1: DLQ Redrive機能（推奨）

AWSコンソールでの操作：
1. DLQの詳細画面を開く
2. 「デッドレターキューの再処理」タブ
3. 「デッドレターキューの再処理を開始」ボタン
4. **「再処理のためにソースキューに入れる」** を選択
   - ソースキュー = DLQにメッセージを送った元のキュー（MainQueue）
5. 「再処理」ボタンをクリック

⚠️ **重要：** 「再処理のためにソースキューに入れる」を選ぶと、MainQueueに戻る（DLQに戻るわけではない）

### 方法2: 手動でのコピー＆ペースト

1. DLQで「Poll for messages」
2. メッセージ内容をコピー
3. **MainQueueの画面**を開く（DLQの画面ではない！）
4. 「Send and receive messages」→「Send message」
5. コピーした内容をペースト → Send
6. DLQのメッセージを削除

### 再処理後の動作

**DLQ → MainQueueへRedrive/送信すると：**
1. MainQueueに新しいメッセージとして追加される
2. **キューの最後尾に追加される**（元の位置には戻らない）
3. EventSourceMappingが検知
4. Worker Lambdaが自動的にトリガーされる ✅

つまり、MainQueueに入れれば、手動送信でもRedriveでも、**Worker Lambdaは自動実行される**。

## Message IDの理解

SQSには2種類のIDが存在する：

### 1. SQS Message ID（キューレベル）
- **AWSが自動生成**する識別子
- SQS内部で使用
- `record.messageId` でアクセス
- **リトライで変わるタイミング：**
  - 同一キュー内の再配信（Visibility Timeout後）= 同じMessage ID
  - DLQ Redrive = 新しいMessage IDが発行される

### 2. アプリケーションのid（ビジネスロジックレベル）
- **アプリケーションが定義**する識別子
- メッセージ本体（Body）の中の任意のフィールド
- `JSON.parse(record.body).id` でアクセス
- **リトライされても変わらない**（同じジョブを再処理するため）

### 具体例

```javascript
// Producer Lambda
const msg = {
  id: Date.now().toString(),  // アプリケーションのid
  imageUrl: body.imageUrl,
  shouldFail: !!body.fail,
};
await sqs.sendMessage({
  QueueUrl: process.env.QUEUE_URL,
  MessageBody: JSON.stringify(msg),
});
// → SQSが自動的にMessage IDを発行
```

```javascript
// Worker Lambda
exports.handler = async (event) => {
  for (const record of event.Records) {
    console.log(record.messageId);        // SQS Message ID（例: "a1b2c3d4-..."）
    const job = JSON.parse(record.body);
    console.log(job.id);                   // アプリのid（例: "1761475180804"）
  }
};
```

### リトライ時の動作フロー

```
1回目: MessageId=ABC123, body.id=1761475180804
       ↓ 失敗
2回目: MessageId=ABC123, body.id=1761475180804（再配信、同じMessage ID）
       ↓ 失敗
3回目: MessageId=ABC123, body.id=1761475180804（再配信、同じMessage ID）
       ↓ 失敗
DLQ行き: MessageId=DEF456（新規発行）, body.id=1761475180804（同じ）
       ↓ Redrive
再処理: MessageId=GHI789（新規発行）, body.id=1761475180804（同じ）
```

**ポイント：**
- SQS Message IDは送信のたびに新しく発行される
- アプリケーションのidは同じジョブなら変わらない
- 重複処理を防ぐには、アプリケーションのidで判定する必要がある

## CloudWatch Logsでのログ確認

### ログの時刻表示
- CloudWatch Logsの時刻は **UTC** で表示される
- 日本時間（JST）= UTC + 9時間

### 確認コマンド
```bash
# 最新のログを確認
aws logs tail /aws/lambda/<function-name> --since 5m --format short

# リアルタイムでログを追跡
aws logs tail /aws/lambda/<function-name> --follow
```

## 再処理時の注意点

### shouldFailフラグの扱い

```javascript
if (job.shouldFail) {
  throw new Error('Simulated failure');
}
```

- DLQから再処理する場合、`shouldFail: true` のままだと再び失敗する
- 再処理前にメッセージ内容を確認し、必要に応じて `shouldFail: false` に変更する
- または、失敗原因を修正してから再処理する

### 手動送信時の注意

**Producer Lambda経由の場合：**
```javascript
id: Date.now().toString(),  // 常に新しいIDを生成
```

**コンソールから直接送信の場合：**
- Producer Lambdaを経由しないため、送信したidがそのまま使われる
- 重複したidを送ると、重複処理が発生する可能性がある
- ただし、SQS Message IDは常に新規発行されるため、SQSレベルでは重複しない

## まとめ

- DLQは失敗メッセージの隔離・分析・再処理のための仕組み
- Redrive機能を使えば、簡単にMainQueueへ戻せる
- MainQueueに戻ったメッセージは、Worker Lambdaが自動実行する
- Message IDとアプリケーションのidは別物
- CloudWatch Logsの時刻はUTC表示
- 再処理前に失敗原因を確認・修正することが重要
