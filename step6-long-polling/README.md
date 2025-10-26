
# Step6: ロングポーリングと空振りの比較

## AWS構成

```
API Gateway
  ├─ POST /enqueue → Sender Lambda → SQS Queue
  └─ GET /poll → Poller Lambda → SQS Queue (receiveMessage)
```

### リソース構成
- **SQS Queue (LongPollQueue)**
  - Receive Message Wait Time: 20秒（ロングポーリング設定）
  - Visibility Timeout: 30秒

- **Lambda Function (Sender)**
  - Runtime: Node.js 20.x
  - Handler: `sender.handler`
  - 環境変数: `QUEUE_URL`
  - 機能: メッセージをキューに送信

- **Lambda Function (Poller)**
  - Runtime: Node.js 20.x
  - Handler: `poller.handler`
  - 環境変数: `QUEUE_URL`, `DEFAULT_WAIT=20`
  - Timeout: 30秒
  - 機能: SQSから手動でメッセージを取得（receiveMessage）

- **API Gateway (RestApi)**
  - エンドポイント:
    - `POST /enqueue`: メッセージ送信
    - `GET /poll?wait=<秒数>`: メッセージ取得（ロングポーリング）

### 処理フロー

1. **Sender**
   - リクエストから `count` と `payload` を取得
   - 指定された数のメッセージをキューに送信

2. **Poller**
   - クエリパラメータ `wait` で待機時間を指定（デフォルト: 20秒）
   - `receiveMessage` でメッセージを取得
   - 取得したメッセージを削除
   - 受信したメッセージ数を返却

## 学習ゴール
- ショートポーリング（wait=0）とロングポーリング（wait=20）の違いを体験
- 空振り（Empty Receive）によるコスト増加を理解
- API リクエスト数の削減効果を観察

## デプロイ
```bash
npm install  # CDK依存関係をインストール
cdk bootstrap  # 初回のみ
cdk deploy --outputs-file cdk-outputs.json
```

**Note:** Lambda関数は`NodejsFunction`で自動バンドルされるため、`lambda/`ディレクトリで個別に`npm install`する必要はありません。

## 実行

### 1. メッセージを送信
```bash
API=$(jq -r '.LongPollingStack.ApiBase' cdk-outputs.json)
curl -X POST "${API}enqueue" \
  -H "Content-Type: application/json" \
  -d '{"count":3,"payload":"test message"}'
```

### 2. ショートポーリング（wait=0）で取得
```bash
# キューが空の場合、即座に空のレスポンスが返る
curl "${API}poll?wait=0&max=10"
# Response: {"received":0,"wait":0,"messageIds":[]}
```

### 3. ロングポーリング（wait=20）で取得
```bash
# キューが空の場合、最大20秒間メッセージを待つ
# メッセージが届くと即座に返却される
curl "${API}poll?wait=20&max=10"
# Response: {"received":3,"wait":20,"messageIds":["...","...","..."]}
```

## 観察ポイント

### ショートポーリング vs ロングポーリング

| 項目 | ショートポーリング (wait=0) | ロングポーリング (wait=20) |
|------|---------------------------|--------------------------|
| 待機時間 | なし（即座に返却） | 最大20秒（メッセージ到着で即返却） |
| 空振り時の挙動 | すぐに空のレスポンス | 20秒間待機してから空のレスポンス |
| APIリクエスト数 | 多い（ポーリング頻度が高い） | 少ない（1回で最大20秒待機） |
| コスト | 高い（空振りリクエストが多い） | 低い（リクエスト数削減） |
| レイテンシ | 低い（即座に確認） | メッセージ到着時は低い |

### 実験: 空振りの回数を比較

#### ショートポーリングの場合
```bash
# キューが空の状態で5回ポーリング
for i in {1..5}; do
  echo "Poll $i:"
  curl "${API}poll?wait=0&max=10"
  echo ""
done
# → 5回すべてが空振り（5リクエスト課金）
```

#### ロングポーリングの場合
```bash
# 20秒待機中にメッセージを送信
curl "${API}poll?wait=20&max=10" &
sleep 5
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"count":1}'
# → ポーリングが5秒後にメッセージを受信して即座に返却
# → 1リクエストのみ課金
```

### CloudWatch Logs で確認
Poller Lambda のログで、待機時間とメッセージ受信数を確認

## 実験

### 1. ロングポーリングのメリット確認
```bash
# Step 1: キューを空にする
curl "${API}poll?wait=0&max=10"

# Step 2: ロングポーリング開始（別ターミナル）
time curl "${API}poll?wait=20&max=10"

# Step 3: 10秒後にメッセージ送信（元のターミナル）
sleep 10
curl -X POST "${API}enqueue" -H "Content-Type: application/json" -d '{"count":1}'

# → ロングポーリングは約10秒で完了（20秒待たずに返却）
```

### 2. コスト比較シミュレーション
```bash
# ショートポーリング: 1秒ごとに60回ポーリング = 60リクエスト
for i in {1..60}; do curl "${API}poll?wait=0"; sleep 1; done

# ロングポーリング: 20秒ごとに3回ポーリング = 3リクエスト
for i in {1..3}; do curl "${API}poll?wait=20"; done

# → リクエスト数が1/20に削減！
```

## 問題
1. ロングポーリングを使うべき状況と、ショートポーリングが適している状況は？
2. Lambda-SQS統合（Event Source Mapping）では、ロングポーリングがデフォルトで有効になる理由は？
3. `WaitTimeSeconds` を20秒に設定した場合、Lambda Timeout は何秒以上必要か？
4. SQSの料金体系において、ロングポーリングがコスト削減につながる理由を説明せよ。

## クリーンアップ
```bash
cdk destroy
```

削除されるリソース：
- Lambda関数（Sender, Poller）
- SQS キュー
- API Gateway
- IAMロール
