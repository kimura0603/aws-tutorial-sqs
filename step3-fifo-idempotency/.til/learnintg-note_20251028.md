
## ../README.mdの問題の考察
### 1.FIFOを使うとスループットが下がるのはなぜか？
#### 自分なりに考えたこと
順番に処理される以上、同じメッセージグループIDを使うと、それが順番に処理されるのがスタンダードキューより遅くなるよね。

#### claudecodeによる訂正や補足
✅ 理解は正しい

**スループットの具体的な数値**:
- FIFO: 最大3,000メッセージ/秒（バッチ使用時30,000/秒）
- Standard: ほぼ無制限

**理由**:
1. **MessageGroupId単位で順序保証**が必要 → 並列処理の制限
2. **5分間の重複排除履歴**を保持するオーバーヘッド
3. 同じGroupID内では**1メッセージずつ処理**される

### 2.冪等性をSQSだけに任せずアプリで担保する理由は？
#### 自分なりに考えたこと
プロデューサー側の不具合等でコンテンツベースデュプリケーションの期限を過ぎた同じメッセージがキューに入ってくることがあるから。

#### claudecodeによる訂正や補足
✅ 理解は正しい（5分制限の指摘が的確）

**補足理由**:
1. **5分の制限** - 実験で確認したとおり、5分経過後は重複が届く
2. **Worker側での処理失敗** - SQSから削除されても処理が失敗する可能性
3. **複数Consumer** - 稀に同じメッセージが複数Workerに届く可能性（at-least-once配信）
4. **手動再送信** - 運用で意図的に再送することもある

**2層の重複排除**:
- SQS: 短期間（5分）の重複排除 → ネットワークリトライ対策
- DynamoDB: 永続的な冪等性保証 → 長期の重複・運用ミス対策

### 3.MessageGroupIdの粒度をどう決めるべきか？
#### 自分なりに考えたこと
 順序が維持されないといけない、かつスループットが下がりきれない粒度。

#### claudecodeによる訂正や補足
✅ 理解は正しい（トレードオフの理解）

**具体例**:
```javascript
// ❌ 細かすぎる → 順序保証の意味がない
MessageGroupId: messageId  // 全メッセージ異なる → FIFOの意味なし

// ❌ 粗すぎる → スループット低下
MessageGroupId: "global"   // 全メッセージ同じ → 完全に直列処理

// ✅ 適切 → ビジネスロジックで決定
MessageGroupId: userId     // ユーザー単位で順序保証
MessageGroupId: orderId    // 注文単位で順序保証
MessageGroupId: accountId  // アカウント単位で順序保証
```

**決定基準**:
1. どの単位で順序保証が必要か？（ビジネス要件）
2. 並列処理の度合いをどの程度確保したいか？（パフォーマンス要件）
3. MessageGroupIDの種類がどのくらいあるか？（カーディナリティ）

### 4.Content-based deduplication の5分間制限を超えた場合、どう対処すべきか？
#### 自分なりに考えたこと
冪等性を維持するため、ワーカー側で増幅内容をどう処理するか記載しないといけない。
またデータ構造としても、冪等性を維持してワーカーで処理しないのか、それとも別のデータとして処理するべきなのか、適切なパラメータ設計をしないといけない。

#### claudecodeによる訂正や補足
✅ 理解は正しい（DynamoDBでの冪等性チェックを指摘）

**具体的な対処法**:
1. **DynamoDBでの永続的な記録** - 今日実装した方法（`lambda/worker.js`）
   ```javascript
   // messageIdをDynamoDBに記録
   const existing = await dynamodb.getItem({ Key: { messageId } });
   if (existing.Item) {
     console.log('🔁 Duplicate detected. Skip');
     return; // 処理をスキップ
   }
   ```

2. **TTL設定の検討** - 古いレコードを自動削除
   ```javascript
   // 例: 30日後に自動削除
   ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
   ```

3. **MessageDeduplicationIdの使用** - より長い時間の重複排除が必要な場合
   ```javascript
   // Content-basedではなく明示的なID指定
   MessageDeduplicationId: id  // producer.jsの14行目
   ```

4. **ビジネスロジックでの判断** - 重複を許容するか、エラーにするか
   - 許容: ログだけ出して処理続行
   - 拒否: エラーを返してアラート

**実験で確認したこと**:
- 13:44 最初の送信 → 処理成功
- 13:50 同じ内容を再送信（6分後） → SQS通過 → DynamoDBで検知

## 補足: High throughput FIFO

### 通常FIFOとHigh throughput FIFOの違い

**通常FIFO**（このチュートリアルで使用）:
```typescript
const queue = new sqs.Queue(this, 'FifoQueue', {
  fifo: true,
  contentBasedDeduplication: true,
});
// キュー全体で3,000メッセージ/秒（バッチなし）
```

**High throughput FIFO**:
```typescript
const queue = new sqs.Queue(this, 'FifoQueue', {
  fifo: true,
  contentBasedDeduplication: true,
  deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
  fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
});
// MessageGroupID単位で3,000メッセージ/秒
// 100個のGroupIDがあれば → 300,000メッセージ/秒
```

### スループット比較

```javascript
// 通常FIFO
MessageGroupId: "user-1" → キュー全体で3,000/秒
MessageGroupId: "user-2" → 共有で3,000/秒
合計: 3,000/秒

// High throughput FIFO
MessageGroupId: "user-1" → 3,000/秒
MessageGroupId: "user-2" → 3,000/秒
合計: 6,000/秒（GroupID数に比例）
```

### 設定値の意味

- `deduplicationScope: MESSAGE_GROUP` - 重複排除をMessageGroup単位で行う
- `fifoThroughputLimit: PER_MESSAGE_GROUP_ID` - スループット制限をMessageGroupID単位にする

### いつ使うべきか

- MessageGroupIDが多数ある（ユーザー数が多い等）
- 順序保証を維持しつつ高スループットが必要
- 通常FIFOの3,000/秒では足りない場合