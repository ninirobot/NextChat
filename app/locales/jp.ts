import { SubmitKey } from "../store/config";
import type { PartialLocaleType } from "./index";
import { getClientConfig } from "../config/client";
import { SAAS_CHAT_UTM_URL } from "@/app/constant";
const isApp = !!getClientConfig()?.isApp;

const jp: PartialLocaleType = {
  WIP: "この機能は開発中です",
  Error: {
    Unauthorized: isApp
      ? `😆 会話中に問題が発生しましたが、心配しないでください:
    \\ 1️⃣ 設定なしで始めたい場合は、[ここをクリックしてすぐにチャットを開始 🚀](${SAAS_CHAT_UTM_URL})
    \\ 2️⃣ 自分のOpenAIリソースを使用したい場合は、[ここをクリックして](/#/settings)設定を変更してください ⚙️`
      : `😆 会話中に問題が発生しましたが、心配しないでください:
    \ 1️⃣ 設定なしで始めたい場合は、[ここをクリックしてすぐにチャットを開始 🚀](${SAAS_CHAT_UTM_URL})
    \ 2️⃣ プライベートデプロイ版を使用している場合は、[ここをクリックして](/#/auth)アクセストークンを入力してください 🔑
    \ 3️⃣ 自分のOpenAIリソースを使用したい場合は、[ここをクリックして](/#/settings)設定を変更してください ⚙️
 `,
  },
  Auth: {
    Title: "パスワードが必要です",
    Tips: "管理者がパスワード認証を有効にしました。以下にアクセスコードを入力してください",
    SubTips: "または、OpenAIまたはGoogle APIキーを入力してください",
    Input: "ここにアクセスコードを入力",
    Confirm: "確認",
    Later: "後で",
    Return: "戻る",
    SaasTips: "設定が面倒すぎる、すぐに使いたい",
    TopTips:
      "🥳 NextChat AIの発売特典で、OpenAI o1、GPT-4o、Claude-3.5などの最新の大規模モデルを今すぐアンロック",
  },
  ChatItem: {
    ChatItemCount: (count: number) => `${count}件の会話`,
  },
  Chat: {
    SubTitle: (count: number) => `合計${count}件の会話`,
    EditMessage: {
      Title: "メッセージ履歴を編集",
      Topic: {
        Title: "チャットテーマ",
        SubTitle: "現在のチャットテーマを変更",
      },
    },
    Actions: {
      ChatList: "メッセージリストを見る",
      CompressedHistory: "圧縮された履歴プロンプトを見る",
      Export: "チャット履歴をエクスポート",
      Copy: "コピー",
      Stop: "停止",
      Retry: "再試行",
      Pin: "固定",
      PinToastContent: "1件の会話をプリセットプロンプトに固定しました",
      PinToastAction: "見る",
      Delete: "削除",
      Edit: "編集",
      RefreshTitle: "タイトルを更新",
      RefreshToast: "タイトル更新リクエストが送信されました",
      FullScreen: "フルスクリーン",
      Speech: "再生",
      StopSpeech: "停止",
      PreviousVersion: "前のバージョン",
      NextVersion: "次のバージョン",
    },
    Commands: {
      new: "新しいチャット",
      newm: "マスクから新しいチャット",
      next: "次のチャット",
      prev: "前のチャット",
      clear: "コンテキストをクリア",
      fork: "チャットをコピー",
      del: "チャットを削除",
    },
    InputActions: {
      Stop: "応答を停止",
      ToBottom: "最新へスクロール",
      Theme: {
        auto: "自動テーマ",
        light: "ライトモード",
        dark: "ダークモード",
      },
      Prompt: "クイックコマンド",
      Masks: "すべてのマスク",
      Clear: "チャットをクリア",
      Settings: "チャット設定",
      UploadImage: "画像をアップロード",
      UploadFile: "ファイルをアップロード",
    },
    Rename: "チャットの名前を変更",
    Typing: "入力中…",
    Input: (submitKey: string) => {
      var inputHints = `${submitKey}で送信`;
      if (submitKey === String(SubmitKey.Enter)) {
        inputHints += "、Shift + Enterで改行";
      }
      return inputHints + "、/で補完をトリガー、:でコマンドをトリガー";
    },
    Send: "送信",
    StartSpeak: "話し始める",
    StopSpeak: "話すのを止める",
    Config: {
      Reset: "メモリをクリア",
      SaveAs: "マスクとして保存",
    },
    IsContext: "プリセットプロンプト",
    ShortcutKey: {
      Title: "キーボードショートカット",
      newChat: "新しいチャットを開く",
      focusInput: "入力フィールドにフォーカス",
      copyLastMessage: "最後の返信をコピー",
      copyLastCode: "最後のコードブロックをコピー",
      showShortcutKey: "ショートカットを表示",
      clearContext: "コンテキストをクリア",
    },
    Thinking: "思考中",
    Thought: "思考",
    ThinkingDuration: (d: number) => `${d}秒かかりました`,
    TokenUsage: "トークン使用量",
    TokenTooltip: {
      Context: "コンテキストメッセージ数",
      CurrentToken: "現在のトークン数",
      EstimatedToken: "推定総トークン数",
      Input: "入力トークン",
      Output: "出力トークン",
      Total: "現在のチャットの総トークン",
      Unknown: "未知",
    },
  },
  Export: {
    Title: "チャット履歴を共有",
    Copy: "すべてコピー",
    Download: "ファイルをダウンロード",
    Share: "ShareGPTに共有",
    MessageFromYou: "ユーザー",
    MessageFromChatGPT: "ChatGPT",
    Format: {
      Title: "エクスポート形式",
      SubTitle: "MarkdownテキストまたはPNG画像としてエクスポートできます",
    },
    IncludeContext: {
      Title: "マスクコンテキストを含む",
      SubTitle: "メッセージにマスクコンテキストを表示するかどうか",
    },
    Steps: {
      Select: "選択",
      Preview: "プレビュー",
    },
    Image: {
      Toast: "スクリーンショットを生成中",
      Modal: "長押しまたは右クリックして画像を保存",
    },
    Artifacts: {
      Title: "アーティファクトを共有",
      Error: "共有エラー",
    },
  },
  Select: {
    Search: "メッセージを検索",
    All: "すべて選択",
    Latest: "最新の数件",
    Clear: "選択をクリア",
  },
  Memory: {
    Title: "履歴の要約",
    EmptyContent: "対話内容が短いため、要約は不要です",
    Send: "チャット履歴を自動的に圧縮し、コンテキストとして送信",
    Copy: "要約をコピー",
    Reset: "[unused]",
    ResetConfirm: "履歴の要約をリセットしてもよろしいですか？",
  },
  Home: {
    NewChat: "新しいチャット",
    DeleteChat: "選択した会話を削除してもよろしいですか？",
    DeleteToast: "会話を削除しました",
    Revert: "元に戻す",
  },
  Settings: {
    Title: "設定",
    SubTitle: "すべての設定オプション",
    ShowPassword: "パスワードを表示",
    Tab: {
      General: "一般",
      Sync: "同期",
      Mask: "アシスタント",
      ModelService: "モデルサービス",
      Model: "モデル設定",
      TTS: "音声合成",
    },

    Danger: {
      Reset: {
        Title: "すべての設定をリセット",
        SubTitle: "すべての設定項目をデフォルト値にリセット",
        Action: "今すぐリセット",
        Confirm: "すべての設定をリセットしてもよろしいですか？",
      },
      Clear: {
        Title: "すべてのデータをクリア",
        SubTitle: "すべてのチャット、設定データをクリア",
        Action: "今すぐクリア",
        Confirm: "すべてのチャット、設定データをクリアしてもよろしいですか？",
      },
    },
    Lang: {
      Name: "Language", // ATTENTION: if you wanna add a new translation, please do not translate this value, leave it as `Language`
      All: "すべての言語",
    },
    Avatar: "アバター",
    FontSize: {
      Title: "フォントサイズ",
      SubTitle: "チャット内容のフォントサイズ",
    },
    FontFamily: {
      Title: "チャットフォント",
      SubTitle:
        "チャットコンテンツのフォント、空白の場合はグローバルデフォルトフォントを適用します",
      Placeholder: "フォント名",
    },

    InputTemplate: {
      Title: "入力テンプレート",
      SubTitle: "最新のメッセージがこのテンプレートに埋め込まれます",
    },

    Update: {
      Version: (x: string) => `現在のバージョン：${x}`,
      IsLatest: "最新バージョンです",
      CheckUpdate: "更新を確認",
      IsChecking: "更新を確認中...",
      FoundUpdate: (x: string) => `新しいバージョンを発見：${x}`,
      GoToUpdate: "更新へ進む",
      Success: "更新に成功しました",
      Failed: "更新に失敗しました",
    },
    SendKey: "送信キー",
    Theme: "テーマ",
    TightBorder: "ボーダーレスモード",
    SendPreviewBubble: {
      Title: "プレビューバブル",
      SubTitle: "プレビューバブルでMarkdownコンテンツをプレビュー",
    },
    AutoGenerateTitle: {
      Title: "自動タイトル生成",
      SubTitle: "チャット内容に基づいて適切なタイトルを生成",
    },
    Sync: {
      CloudState: "クラウドデータ",
      NotSyncYet: "まだ同期されていません",
      Success: "同期に成功しました",
      Fail: "同期に失敗しました",

      Config: {
        Modal: {
          Title: "クラウド同期の設定",
          Check: "可用性を確認",
        },
        SyncType: {
          Title: "同期タイプ",
          SubTitle: "好きな同期サーバーを選択",
        },
        Proxy: {
          Title: "プロキシを有効化",
          SubTitle:
            "ブラウザで同期する場合、クロスオリジン制限を避けるためにプロキシを有効にする必要があります",
        },
        ProxyUrl: {
          Title: "プロキシURL",
          SubTitle: "このプロジェクトに組み込まれたクロスオリジンプロキシ専用",
        },

        WebDav: {
          Endpoint: "WebDAV エンドポイント",
          UserName: "ユーザー名",
          Password: "パスワード",
        },

        UpStash: {
          Endpoint: "UpStash Redis REST URL",
          UserName: "バックアップ名",
          Password: "UpStash Redis REST トークン",
        },
      },

      LocalState: "ローカルデータ",
      Overview: (overview: any) => {
        return `${overview.chat} 回の対話、${overview.message} 件のメッセージ、${overview.prompt} 件のプロンプト、${overview.mask} 件のマスク`;
      },
      ImportFailed: "インポートに失敗しました",
    },
    Mask: {
      Splash: {
        Title: "マスク起動画面",
        SubTitle: "新しいチャットを作成する際にマスク起動画面を表示",
      },
      Builtin: {
        Title: "内蔵マスクを非表示",
        SubTitle: "すべてのマスクリストで内蔵マスクを非表示",
      },
    },
    Prompt: {
      Disable: {
        Title: "プロンプトの自動補完を無効化",
        SubTitle: "入力フィールドの先頭に / を入力して自動補完をトリガー",
      },
      List: "カスタムプロンプトリスト",
      ListCount: (builtin: number, custom: number) =>
        `内蔵 ${builtin} 件、ユーザー定義 ${custom} 件`,
      Edit: "編集",
      Modal: {
        Title: "プロンプトリスト",
        Add: "新規作成",
        Search: "プロンプトを検索",
      },
      EditModal: {
        Title: "プロンプトを編集",
      },
    },
    HistoryCount: {
      Title: "履歴メッセージ数",
      SubTitle: "各リクエストに含まれる履歴メッセージの数",
    },
    CompressThreshold: {
      Title: "履歴メッセージの圧縮閾値",
      SubTitle: "未圧縮の履歴メッセージがこの値を超えた場合、圧縮が行われます",
    },

    Usage: {
      Title: "残高確認",
      SubTitle(used: any, total: any) {
        return `今月の使用量 $${used}、サブスクリプション合計 $${total}`;
      },
      IsChecking: "確認中…",
      Check: "再確認",
      NoAccess: "APIキーまたはアクセスパスワードを入力して残高を確認",
    },

    Access: {
      SaasStart: {
        Title: "NextChat AIを使用する",
        Label: "(コストパフォーマンスの最も高いソリューション)",
        SubTitle:
          "NextChatによって公式に管理されており、設定なしですぐに使用でき、OpenAI o1、GPT-4o、Claude-3.5などの最新の大規模モデルをサポートしています",
        ChatNow: "今すぐチャット",
      },

      AccessCode: {
        Title: "アクセスパスワード",
        SubTitle: "管理者が暗号化アクセスを有効にしました",
        Placeholder: "アクセスパスワードを入力してください",
      },
      CustomEndpoint: {
        Title: "カスタムエンドポイント",
        SubTitle: "カスタムAzureまたはOpenAIサービスを使用するかどうか",
      },
      Provider: {
        Title: "モデルプロバイダー",
        SubTitle: "異なるプロバイダーに切り替える",
      },
      OpenAI: {
        ApiKey: {
          Title: "APIキー",
          SubTitle: "カスタムOpenAIキーを使用してパスワードアクセス制限を回避",
          Placeholder: "OpenAI APIキー",
        },

        Endpoint: {
          Title: "エンドポイント",
          SubTitle:
            "デフォルト以外のアドレスにはhttp(s)://を含める必要があります",
        },
      },
      Azure: {
        ApiKey: {
          Title: "APIキー",
          SubTitle: "カスタムAzureキーを使用してパスワードアクセス制限を回避",
          Placeholder: "Azure APIキー",
        },

        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "例：",
        },

        ApiVerion: {
          Title: "APIバージョン (azure api version)",
          SubTitle: "特定のバージョンを選択",
        },
      },
      Anthropic: {
        ApiKey: {
          Title: "APIキー",
          SubTitle:
            "カスタムAnthropicキーを使用してパスワードアクセス制限を回避",
          Placeholder: "Anthropic APIキー",
        },

        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "例：",
        },

        ApiVerion: {
          Title: "APIバージョン (claude api version)",
          SubTitle: "特定のAPIバージョンを選択",
        },
      },
      Google: {
        ApiKey: {
          Title: "APIキー",
          SubTitle: "Google AIからAPIキーを取得",
          Placeholder: "Google AI Studio APIキーを入力",
        },

        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "例：",
        },

        ApiVersion: {
          Title: "APIバージョン（gemini-pro専用）",
          SubTitle: "特定のAPIバージョンを選択",
        },
        GoogleSafetySettings: {
          Title: "Google セーフティ設定",
          SubTitle: "コンテンツフィルタリングレベルを設定",
        },
      },
      Baidu: {
        ApiKey: {
          Title: "APIキー",
          SubTitle: "カスタムBaidu APIキーを使用",
          Placeholder: "Baidu APIキー",
        },
        SecretKey: {
          Title: "シークレットキー",
          SubTitle: "カスタムBaiduシークレットキーを使用",
          Placeholder: "Baiduシークレットキー",
        },
        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "カスタムはサポートしていません、.env設定に進んでください",
        },
      },
      ByteDance: {
        ApiKey: {
          Title: "APIキー",
          SubTitle: "カスタムByteDance APIキーを使用",
          Placeholder: "ByteDance APIキー",
        },
        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "例：",
        },
      },
      Alibaba: {
        ApiKey: {
          Title: "APIキー",
          SubTitle: "カスタムAlibaba Cloud APIキーを使用",
          Placeholder: "Alibaba Cloud APIキー",
        },
        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "例：",
        },
      },
      Tencent: {
        ApiKey: {
          Title: "Tencent API Key",
          SubTitle: "Use a custom Tencent API Key",
          Placeholder: "Tencent API Key",
        },
        SecretKey: {
          Title: "Tencent Secret Key",
          SubTitle: "Use a custom Tencent Secret Key",
          Placeholder: "Tencent Secret Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "not supported, configure in .env",
        },
      },
      Moonshot: {
        ApiKey: {
          Title: "Moonshot API Key",
          SubTitle: "Use a custom Moonshot API Key",
          Placeholder: "Moonshot API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      DeepSeek: {
        ApiKey: {
          Title: "DeepSeek API Key",
          SubTitle: "Use a custom DeepSeek API Key",
          Placeholder: "DeepSeek API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      XAI: {
        ApiKey: {
          Title: "XAI API Key",
          SubTitle: "Use a custom XAI API Key",
          Placeholder: "XAI API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      ChatGLM: {
        ApiKey: {
          Title: "ChatGLM API Key",
          SubTitle: "Use a custom ChatGLM API Key",
          Placeholder: "ChatGLM API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      SiliconFlow: {
        ApiKey: {
          Title: "SiliconFlow API Key",
          SubTitle: "Use a custom SiliconFlow API Key",
          Placeholder: "SiliconFlow API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      Iflytek: {
        ApiKey: {
          Title: "Iflytek API Key",
          SubTitle: "Use a Iflytek API Key",
          Placeholder: "Iflytek API Key",
        },
        ApiSecret: {
          Title: "Iflytek API Secret",
          SubTitle: "Use a Iflytek API Secret",
          Placeholder: "Iflytek API Secret",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      AI302: {
        ApiKey: {
          Title: "API キー",
          SubTitle: "カスタム 302.AI API キーを使用",
          Placeholder: "302.AI API キー",
        },
        Endpoint: {
          Title: "エンドポイント",
          SubTitle: "例：",
        },
      },
      Meituan: {
        ApiKey: {
          Title: "Meituan API Key",
          SubTitle: "Use a custom Meituan API Key",
          Placeholder: "Meituan API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      OpenRouter: {
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
        ApiKey: {
          Title: "API Key",
          SubTitle: "Use a custom OpenRouter API Key",
          Placeholder: "OpenRouter API Key",
        },
      },
      Nvidia: {
        ApiKey: {
          Title: "Nvidia API Key",
          SubTitle: "Use a custom Nvidia API Key",
          Placeholder: "Nvidia API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      CustomModel: {
        Title: "カスタムモデル名",
        SubTitle: "カスタムモデルの選択肢を追加、英語のカンマで区切る",
      },
    },

    Model: "モデル (model)",
    CompressModel: {
      Title: "圧縮モデル",
      SubTitle: "履歴を圧縮するために使用されるモデル",
    },
    Temperature: {
      Title: "ランダム性 (temperature)",
      SubTitle: "値が大きいほど応答がランダムになります",
    },
    TopP: {
      Title: "トップP (top_p)",
      SubTitle:
        "ランダム性に似ていますが、ランダム性と一緒に変更しないでください",
    },
    MaxTokens: {
      Title: "1回の応答制限 (max_tokens)",
      SubTitle: "1回の対話で使用される最大トークン数",
    },
    PresencePenalty: {
      Title: "新鮮度 (presence_penalty)",
      SubTitle: "値が大きいほど新しいトピックに移行する可能性が高くなります",
    },
    FrequencyPenalty: {
      Title: "頻度ペナルティ (frequency_penalty)",
      SubTitle: "値が大きいほど繰り返しの単語が減少します",
    },
    ThinkingBudget: {
      Title: "思考予算 (thinking_budget)",
      SubTitle: "LongCat-Thinkingの最大トークン数",
    },
    Thinking: {
      Title: "思考を有効化",
      SubTitle: "モデルの深い思考を有効化",
    },
    KimiThinking: {
      Title: "思考を有効化",
      SubTitle: "Kimi 2.5モデルの深い思考を有効化",
    },
    GeminiFlashThinkingBudget: {
      Title: "Gemini 2.5 Flash 思考予算",
      SubTitle: "0-24576トークンまたは-1で自動",
    },
    GeminiProThinkingBudget: {
      Title: "Gemini 2.5 Pro 思考予算",
      SubTitle: "128-32768トークンまたは-1で自動",
    },
    AspectRatio: {
      Title: "Aspect Ratio",
      SubTitle: "Aspect ratio for generated images (supported models only)",
    },
    ThoughtSummary: {
      Title: "Thought Summary",
      SubTitle: "Include model's internal reasoning summary in response",
    },
    ThinkingLevel: {
      Title: "Thinking Level",
      SubTitle: "Control the depth of thought (Gemini 3 only)",
    },
    ReasoningEffort: {
      Title: "推理強度 (reasoning_effort)",
      SubTitle: "推理モデルの思考深度を制御 (GPT-OSS シリーズのみ)",
    },
    TTS: {
      Enable: {
        Title: "Enable TTS",
        SubTitle: "Enable text-to-speech service",
      },
      Autoplay: {
        Title: "Enable Autoplay",
        SubTitle:
          "Automatically generate speech and play, you need to enable the text-to-speech switch first",
      },
      Model: "Model",
      Voice: {
        Title: "Voice",
        SubTitle: "The voice to use when generating the audio",
      },
      Speed: {
        Title: "Speed",
        SubTitle: "The speed of the generated audio",
      },
      Engine: "TTS Engine",
    },
    Realtime: {
      Enable: {
        Title: "Realtime Chat",
        SubTitle: "Enable realtime chat feature",
      },
      Provider: {
        Title: "Model Provider",
        SubTitle: "Switch between different providers",
      },
      Model: {
        Title: "Model",
        SubTitle: "Select a model",
      },
      ApiKey: {
        Title: "API Key",
        SubTitle: "API Key",
        Placeholder: "API Key",
      },
      Azure: {
        Endpoint: {
          Title: "Endpoint",
          SubTitle: "Endpoint",
        },
        Deployment: {
          Title: "Deployment Name",
          SubTitle: "Deployment Name",
        },
      },
      Temperature: {
        Title: "Randomness (temperature)",
        SubTitle: "Higher values result in more random responses",
      },
    },
  },
  Store: {
    DefaultTopic: "新しいチャット",
    BotHello: "何かお手伝いできますか？",
    Error: "エラーが発生しました。後でもう一度試してください",
    Prompt: {
      History: (content: string) =>
        "これは前提としての履歴チャットの要約です：" + content,
      Topic:
        "この文の簡潔なテーマを四から五文字で返してください。説明、句読点、感嘆詞、余計なテキストは不要です。太字も不要です。テーマがない場合は「雑談」と返してください",
      Summarize:
        "対話の内容を簡潔に要約し、後続のコンテキストプロンプトとして使用します。200文字以内に抑えてください",
    },
  },
  Copy: {
    Success: "クリップボードに書き込みました",
    Failed: "コピーに失敗しました。クリップボードの権限を付与してください",
  },
  Download: {
    Success: "内容がダウンロードされました",
    Failed: "ダウンロードに失敗しました",
  },
  Context: {
    Toast: (x: any) => `${x} 件のプリセットプロンプトが含まれています`,
    Edit: "現在の対話設定",
    Add: "対話を追加",
    Clear: "コンテキストがクリアされました",
    Revert: "コンテキストを元に戻す",
  },

  FineTuned: {
    Sysmessage: "あなたはアシスタントです",
  },
  SearchChat: {
    Name: "検索",
    Page: {
      Title: "チャット履歴を検索",
      Search: "検索キーワードを入力",
      NoResult: "結果が見つかりませんでした",
      NoData: "データがありません",
      Loading: "読み込み中",

      SubTitle: (count: number) => `${count} 件の結果が見つかりました`,
    },
    Item: {
      View: "表示",
    },
  },
  Mask: {
    Name: "マスク",
    Page: {
      Title: "プリセットキャラクターマスク",
      SubTitle: (count: number) => `${count} 件のプリセットキャラクター定義`,
      Search: "キャラクターマスクを検索",
      Create: "新規作成",
    },
    Item: {
      Info: (count: number) => `${count} 件のプリセット対話が含まれています`,
      Chat: "対話",
      View: "表示",
      Edit: "編集",
      Delete: "削除",
      DeleteConfirm: "削除してもよろしいですか？",
    },
    EditModal: {
      Title: (readonly: boolean) =>
        `プリセットマスクの編集 ${readonly ? "（読み取り専用）" : ""}`,
      Download: "プリセットをダウンロード",
      Clone: "プリセットをクローン",
    },
    Config: {
      Avatar: "キャラクターアバター",
      Name: "キャラクター名",
      Sync: {
        Title: "グローバル設定を使用",
        SubTitle: "現在の対話でグローバルモデル設定を使用するかどうか",
        Confirm:
          "現在の対話のカスタム設定が自動的に上書きされます。グローバル設定を有効にしてもよろしいですか？",
      },
      HideContext: {
        Title: "プリセット対話を非表示",
        SubTitle:
          "非表示にすると、プリセット対話はチャット画面に表示されません",
      },
      Artifacts: {
        Title: "アーティファクトを有効化",
        SubTitle: "HTMLコンテンツを直接レンダリング可能にします",
      },
      CodeFold: {
        Title: "コードの折りたたみを有効化",
        SubTitle: "長すぎるコードブロックを自動的に折りたたみ/展開します",
      },
      Share: {
        Title: "このマスクを共有",
        SubTitle: "このマスクの直リンクを生成",
        Action: "リンクをコピー",
      },
    },
  },
  NewChat: {
    Return: "戻る",
    Skip: "直接開始",
    NotShow: "今後表示しない",
    ConfirmNoShow:
      "無効にしてもよろしいですか？無効にした後、設定でいつでも再度有効にできます。",
    Title: "マスクを選択",
    SubTitle: "今すぐ始めよう、マスクの背後にある魂と思考の衝突",
    More: "すべて表示",
  },

  URLCommand: {
    Code: "リンクにアクセスコードが含まれています。自動入力しますか？",
    Settings: "リンクにプリセット設定が含まれています。自動入力しますか？",
  },

  UI: {
    Confirm: "確認",
    Cancel: "キャンセル",
    Close: "閉じる",
    Create: "新規作成",
    Edit: "編集",
    Export: "エクスポート",
    Import: "インポート",
    Sync: "同期",
    Config: "設定",
  },

  Exporter: {
    Description: {
      Title: "コンテキストをクリアした後のメッセージのみが表示されます",
    },
    Model: "モデル",
    Messages: "メッセージ",
    Topic: "テーマ",
    Time: "時間",
  },
};

export default jp;
