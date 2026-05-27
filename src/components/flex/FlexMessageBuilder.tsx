'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ShoppingBag, Newspaper, LayoutGrid, AlertTriangle, ClipboardList } from 'lucide-react'

// ---- Google Drive URL 変換 ----
function convertImageUrl(url: string): { url: string; warning: string | null } {
  if (!url) return { url, warning: null }

  // Google Drive 共有リンク → 直接表示URL に変換
  // 例: https://drive.google.com/file/d/FILE_ID/view
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (driveMatch) {
    const fileId = driveMatch[1]
    return {
      url: `https://drive.google.com/uc?export=view&id=${fileId}`,
      warning: 'Google Driveの画像はLINE送信時に表示されない場合があります。Supabase StorageやImgurなど公開URLの使用を推奨します。',
    }
  }

  // Google Drive の uc リンクはそのまま（既に変換済み）
  if (url.includes('drive.google.com/uc')) {
    return {
      url,
      warning: 'Google Driveの画像はLINE送信時に表示されない場合があります。',
    }
  }

  return { url, warning: null }
}

// ---- テンプレート型定義 ----
export type FlexTemplate = 'product' | 'news' | 'carousel' | 'survey'

export interface SurveyOption {
  label: string   // ボタンに表示するテキスト
  tag: string     // 自動付与するタグ名
}

export interface SurveyCard {
  imageUrl: string
  question: string
  replyMessage: string  // 回答後の自動返信メッセージ
  options: SurveyOption[]
}

interface ProductCard {
  imageUrl: string
  title: string
  price: string
  buttonLabel: string
  buttonUrl: string
}

interface NewsCard {
  imageUrl: string
  headline: string
  body: string
  buttonLabel: string
  buttonUrl: string
}

interface FlexMessageBuilderProps {
  onChange: (message: object) => void
}

// ---- LINE Flex JSON生成 ----
function buildProductBubble(card: ProductCard) {
  return {
    type: 'bubble',
    hero: {
      type: 'image',
      url: card.imageUrl || 'https://via.placeholder.com/400x260',
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: card.title || '商品名', weight: 'bold', size: 'xl', wrap: true },
        { type: 'text', text: card.price || '¥0', color: '#e74c3c', size: 'lg', weight: 'bold' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#6366f1',
          action: {
            type: 'uri',
            label: card.buttonLabel || '詳しく見る',
            uri: card.buttonUrl || 'https://example.com',
          },
        },
      ],
    },
  }
}

function buildNewsBubble(card: NewsCard) {
  return {
    type: 'bubble',
    hero: card.imageUrl
      ? {
          type: 'image',
          url: card.imageUrl,
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover',
        }
      : undefined,
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: card.headline || '見出し', weight: 'bold', size: 'lg', wrap: true },
        {
          type: 'text',
          text: card.body || '本文テキスト',
          size: 'sm',
          color: '#555555',
          wrap: true,
          maxLines: 3,
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: card.buttonLabel || '続きを読む',
            uri: card.buttonUrl || 'https://example.com',
          },
        },
      ],
    },
  }
}

function buildSurveyBubble(card: SurveyCard) {
  const { url: convertedImage } = convertImageUrl(card.imageUrl)
  const buttons = card.options.map((opt) => ({
    type: 'button',
    style: 'secondary',
    action: {
      type: 'postback',
      label: opt.label || '選択肢',
      data: `survey_tag=${encodeURIComponent(opt.tag || opt.label)}&reply=${encodeURIComponent(card.replyMessage || 'ご回答ありがとうございます！')}`,
      displayText: opt.label || '選択肢',
    },
  }))

  return {
    type: 'bubble',
    ...(convertedImage ? {
      hero: {
        type: 'image',
        url: convertedImage,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
    } : {}),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: [
        {
          type: 'text',
          text: '📋 アンケート',
          size: 'xs',
          color: '#6366f1',
          weight: 'bold',
        },
        {
          type: 'text',
          text: card.question || '質問を入力してください',
          weight: 'bold',
          size: 'md',
          wrap: true,
          margin: 'sm',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: buttons.length > 0 ? buttons : [
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: '選択肢を追加', data: 'dummy', displayText: '選択肢を追加' },
        },
      ],
    },
  }
}

// ---- アンケートフォーム ----
function SurveyCardForm({
  card,
  onChange,
}: {
  card: SurveyCard
  onChange: (c: SurveyCard) => void
}) {
  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <ImageUrlField
        label="ヘッダー画像URL（任意）"
        value={card.imageUrl}
        onChange={(v) => onChange({ ...card, imageUrl: v })}
      />
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">質問文</label>
        <textarea
          value={card.question}
          onChange={(e) => onChange({ ...card, question: e.target.value })}
          placeholder="例：今のお悩みを教えてください"
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">回答後の自動返信メッセージ</label>
        <input
          type="text"
          value={card.replyMessage}
          onChange={(e) => onChange({ ...card, replyMessage: e.target.value })}
          placeholder="例：ご回答ありがとうございます！"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">選択肢（タップで自動タグ付き）</label>
          <span className="text-xs text-gray-400">{card.options.length}/4</span>
        </div>
        <div className="space-y-2">
          {card.options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => {
                    const updated = [...card.options]
                    updated[i] = { ...opt, label: e.target.value }
                    onChange({ ...card, options: updated })
                  }}
                  placeholder={`選択肢 ${i + 1}（例：集客が少ない）`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <input
                  type="text"
                  value={opt.tag}
                  onChange={(e) => {
                    const updated = [...card.options]
                    updated[i] = { ...opt, tag: e.target.value }
                    onChange({ ...card, options: updated })
                  }}
                  placeholder={`付与タグ名（例：集客悩み）`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                onClick={() => {
                  const updated = card.options.filter((_, idx) => idx !== i)
                  onChange({ ...card, options: updated })
                }}
                className="mt-1 text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {card.options.length < 4 && (
          <button
            onClick={() => {
              const updated = [...card.options, { label: '', tag: '' }]
              onChange({ ...card, options: updated })
            }}
            className="mt-2 w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" />
            選択肢を追加（最大4つ）
          </button>
        )}
      </div>

      <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700">
        💡 選択肢をタップすると「付与タグ」が自動的に友だちに付きます
      </div>
    </div>
  )
}

// ---- 画像URLフィールド（Google Drive変換＋警告付き）----
function ImageUrlField({
  value,
  onChange,
  label = '画像URL',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const { url: converted, warning } = convertImageUrl(value)
  const showConverted = converted !== value && value !== ''

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (showConverted) onChange(converted) }}
        placeholder="https://example.com/image.jpg"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      {showConverted && (
        <p className="text-xs text-indigo-600 mt-1">
          ✅ Google DriveのURLを自動変換しました
        </p>
      )}
      {warning && (
        <div className="flex items-start gap-1.5 mt-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-yellow-700">{warning}</p>
        </div>
      )}
    </div>
  )
}

// ---- 商品カードフォーム ----
function ProductCardForm({
  card,
  onChange,
  index,
}: {
  card: ProductCard
  onChange: (c: ProductCard) => void
  index?: number
}) {
  const field = (label: string, key: keyof ProductCard, placeholder: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {index !== undefined ? `カード${index + 1} - ` : ''}{label}
      </label>
      <input
        type="text"
        value={card[key]}
        onChange={(e) => onChange({ ...card, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
    </div>
  )
  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <ImageUrlField
        label={index !== undefined ? `カード${index + 1} - 画像URL` : '画像URL'}
        value={card.imageUrl}
        onChange={(v) => onChange({ ...card, imageUrl: v })}
      />
      {field('商品名', 'title', '例：プレミアムプラン')}
      {field('価格', 'price', '例：¥9,800')}
      {field('ボタンラベル', 'buttonLabel', '例：購入する')}
      {field('ボタンURL', 'buttonUrl', 'https://example.com')}
    </div>
  )
}

// ---- 記事カードフォーム ----
function NewsCardForm({
  card,
  onChange,
  index,
}: {
  card: NewsCard
  onChange: (c: NewsCard) => void
  index?: number
}) {
  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <ImageUrlField
        label={`${index !== undefined ? `カード${index + 1} - ` : ''}サムネイル画像URL（任意）`}
        value={card.imageUrl}
        onChange={(v) => onChange({ ...card, imageUrl: v })}
      />
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">見出し</label>
        <input
          type="text"
          value={card.headline}
          onChange={(e) => onChange({ ...card, headline: e.target.value })}
          placeholder="例：最新情報のお知らせ"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">本文（最大3行表示）</label>
        <textarea
          value={card.body}
          onChange={(e) => onChange({ ...card, body: e.target.value })}
          placeholder="記事の概要テキスト..."
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">ボタンラベル</label>
        <input
          type="text"
          value={card.buttonLabel}
          onChange={(e) => onChange({ ...card, buttonLabel: e.target.value })}
          placeholder="続きを読む"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">リンクURL</label>
        <input
          type="text"
          value={card.buttonUrl}
          onChange={(e) => onChange({ ...card, buttonUrl: e.target.value })}
          placeholder="https://example.com/article"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
    </div>
  )
}

// ---- LINEプレビュー ----
function FlexPreview({ message }: { message: object | null }) {
  if (!message) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      左で設定するとプレビューが表示されます
    </div>
  )

  const msg = message as any
  const contents = msg.contents

  const renderBubble = (bubble: any, key?: number) => (
    <div
      key={key}
      className="bg-white rounded-2xl shadow-md overflow-hidden w-56 flex-shrink-0"
    >
      {bubble.hero && (
        <div className="w-full h-32 bg-gray-200 overflow-hidden">
          <img
            src={bubble.hero.url}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src =
                'https://placehold.co/400x260/e2e8f0/94a3b8?text=画像'
            }}
          />
        </div>
      )}
      {bubble.body && (
        <div className="p-3 space-y-1">
          {bubble.body.contents?.map((c: any, i: number) => (
            <p
              key={i}
              className={cn(
                'text-sm',
                c.weight === 'bold' && 'font-bold',
                c.color === '#e74c3c' && 'text-red-500',
                c.color === '#555555' && 'text-gray-500',
              )}
            >
              {c.text}
            </p>
          ))}
        </div>
      )}
      {bubble.footer && (
        <div className="px-3 pb-3 space-y-1.5">
          {bubble.footer.contents?.map((c: any, i: number) => (
            <button
              key={i}
              className={cn(
                'w-full py-2 rounded-lg text-sm font-medium',
                c.style === 'primary'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-300 text-gray-700 bg-white',
              )}
            >
              {c.action?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 mb-3 text-center">📱 LINEプレビュー</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {contents?.type === 'carousel'
          ? contents.contents?.map((b: any, i: number) => renderBubble(b, i))
          : renderBubble(contents)}
      </div>
    </div>
  )
}

// ---- メインコンポーネント ----
const defaultProduct = (): ProductCard => ({
  imageUrl: '',
  title: '',
  price: '',
  buttonLabel: '詳しく見る',
  buttonUrl: '',
})

const defaultNews = (): NewsCard => ({
  imageUrl: '',
  headline: '',
  body: '',
  buttonLabel: '続きを読む',
  buttonUrl: '',
})

const defaultSurvey = (): SurveyCard => ({
  imageUrl: '',
  question: '',
  replyMessage: 'ご回答ありがとうございます！',
  options: [
    { label: '', tag: '' },
    { label: '', tag: '' },
  ],
})

export default function FlexMessageBuilder({ onChange }: FlexMessageBuilderProps) {
  const [template, setTemplate] = useState<FlexTemplate>('product')
  const [altText, setAltText] = useState('')

  // 商品カード
  const [productCard, setProductCard] = useState<ProductCard>(defaultProduct())

  // 記事カード
  const [newsCard, setNewsCard] = useState<NewsCard>(defaultNews())

  // カルーセル（商品カードの配列）
  const [carouselCards, setCarouselCards] = useState<ProductCard[]>([defaultProduct()])

  // アンケート
  const [surveyCard, setSurveyCard] = useState<SurveyCard>(defaultSurvey())

  const buildMessage = (
    tmpl: FlexTemplate,
    pc: ProductCard,
    nc: NewsCard,
    cc: ProductCard[],
    sc: SurveyCard,
    alt: string,
  ): object => {
    let contents: object
    if (tmpl === 'product') {
      contents = buildProductBubble(pc)
    } else if (tmpl === 'news') {
      contents = buildNewsBubble(nc)
    } else if (tmpl === 'survey') {
      contents = buildSurveyBubble(sc)
    } else {
      contents = {
        type: 'carousel',
        contents: cc.map(buildProductBubble),
      }
    }
    return {
      type: 'flex',
      altText: alt || (tmpl === 'product' ? '商品情報' : tmpl === 'news' ? 'お知らせ' : tmpl === 'survey' ? 'アンケート' : 'カタログ'),
      contents,
    }
  }

  const currentMessage = buildMessage(template, productCard, newsCard, carouselCards, surveyCard, altText)

  const handleChange = (updates: {
    tmpl?: FlexTemplate
    pc?: ProductCard
    nc?: NewsCard
    cc?: ProductCard[]
    sc?: SurveyCard
    alt?: string
  }) => {
    const msg = buildMessage(
      updates.tmpl ?? template,
      updates.pc ?? productCard,
      updates.nc ?? newsCard,
      updates.cc ?? carouselCards,
      updates.sc ?? surveyCard,
      updates.alt ?? altText,
    )
    onChange(msg)
  }

  const templates = [
    { id: 'product' as FlexTemplate, label: '商品カード', icon: ShoppingBag },
    { id: 'news' as FlexTemplate, label: '記事カード', icon: Newspaper },
    { id: 'carousel' as FlexTemplate, label: 'カルーセル', icon: LayoutGrid },
    { id: 'survey' as FlexTemplate, label: 'アンケート', icon: ClipboardList },
  ]

  return (
    <div className="flex gap-4 h-full">
      {/* 左：設定 */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* テンプレート選択 */}
        <div className="flex gap-2">
          {templates.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTemplate(id)
                handleChange({ tmpl: id })
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                template === id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* 代替テキスト */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            代替テキスト（通知に表示される文字）
          </label>
          <input
            type="text"
            value={altText}
            onChange={(e) => {
              setAltText(e.target.value)
              handleChange({ alt: e.target.value })
            }}
            placeholder="例：新商品のお知らせ"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* テンプレート別フォーム */}
        {template === 'product' && (
          <ProductCardForm
            card={productCard}
            onChange={(c) => {
              setProductCard(c)
              handleChange({ pc: c })
            }}
          />
        )}

        {template === 'news' && (
          <NewsCardForm
            card={newsCard}
            onChange={(c) => {
              setNewsCard(c)
              handleChange({ nc: c })
            }}
          />
        )}

        {template === 'survey' && (
          <SurveyCardForm
            card={surveyCard}
            onChange={(c) => {
              setSurveyCard(c)
              handleChange({ sc: c })
            }}
          />
        )}

        {template === 'carousel' && (
          <div className="space-y-3">
            {carouselCards.map((card, i) => (
              <div key={i} className="relative">
                <ProductCardForm
                  card={card}
                  index={i}
                  onChange={(c) => {
                    const updated = [...carouselCards]
                    updated[i] = c
                    setCarouselCards(updated)
                    handleChange({ cc: updated })
                  }}
                />
                {carouselCards.length > 1 && (
                  <button
                    onClick={() => {
                      const updated = carouselCards.filter((_, idx) => idx !== i)
                      setCarouselCards(updated)
                      handleChange({ cc: updated })
                    }}
                    className="absolute top-2 right-2 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {carouselCards.length < 10 && (
              <button
                onClick={() => {
                  const updated = [...carouselCards, defaultProduct()]
                  setCarouselCards(updated)
                  handleChange({ cc: updated })
                }}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" />
                カードを追加（最大10枚）
              </button>
            )}
          </div>
        )}
      </div>

      {/* 右：プレビュー */}
      <div className="w-72 flex-shrink-0 bg-gray-100 rounded-2xl overflow-hidden">
        <FlexPreview message={currentMessage} />
      </div>
    </div>
  )
}
