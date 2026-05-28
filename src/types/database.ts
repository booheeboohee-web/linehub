export type Platform = 'line' | 'email'
export type FriendStatus = 'active' | 'blocked' | 'deleted'
export type ScenarioTrigger = 'friend_added' | 'keyword' | 'tag_added' | 'manual'
export type MessageType = 'text' | 'image' | 'flex' | 'template'
export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'done' | 'error'

export interface Friend {
  id: string
  platform: Platform
  platform_user_id: string
  display_name: string | null
  picture_url: string | null
  email: string | null
  phone: string | null
  note: string | null
  status: FriendStatus
  followed_at: string
  last_interacted_at: string | null
  created_at: string
  updated_at: string
  tags?: Tag[]
}

export interface Tag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface FriendTag {
  friend_id: string
  tag_id: string
  created_at: string
}

export interface Scenario {
  id: string
  name: string
  description: string | null
  platform: Platform | 'all'
  trigger_type: ScenarioTrigger
  trigger_keyword: string | null
  trigger_tag_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  steps?: ScenarioStep[]
}

export interface ScenarioStep {
  id: string
  scenario_id: string
  step_order: number
  delay_days: number
  delay_hours: number
  message_type: MessageType
  message_content: LineMessage
  created_at: string
}

export interface ScenarioSubscriber {
  id: string
  scenario_id: string
  friend_id: string
  current_step: number
  started_at: string
  next_send_at: string | null
  status: 'active' | 'completed' | 'stopped'
}

export interface Broadcast {
  id: string
  name: string
  platform: Platform | 'all'
  message_type: MessageType
  message_content: LineMessage
  target_type: 'all' | 'tag' | 'segment'
  target_tag_ids: string[] | null
  status: BroadcastStatus
  scheduled_at: string | null
  sent_at: string | null
  total_targets: number
  sent_count: number
  error_count: number
  created_at: string
  updated_at: string
}

export interface RichMenu {
  id: string
  name: string
  line_rich_menu_id: string | null
  size_width: number
  size_height: number
  selected: boolean
  chat_bar_text: string
  areas: RichMenuArea[]
  image_url: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number }
  action: {
    type: 'message' | 'uri' | 'postback' | 'richmenuswitch'
    text?: string
    uri?: string
    data?: string
    label?: string
    richMenuAliasId?: string
  }
}

export interface MessageLog {
  id: string
  friend_id: string | null
  platform: Platform
  direction: 'inbound' | 'outbound'
  message_type: MessageType | null
  message_content: LineMessage | null
  source_type: 'scenario' | 'broadcast' | 'manual' | 'webhook' | null
  source_id: string | null
  status: string
  error_message: string | null
  sent_at: string
}

// LINE Message types
export type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string }
  | { type: 'flex'; altText: string; contents: object }
  | { type: 'template'; altText: string; template: object }

// Database type for Supabase client
export interface Database {
  public: {
    Tables: {
      friends: {
        Row: Friend
        Insert: Omit<Friend, 'id' | 'created_at' | 'updated_at' | 'tags'>
        Update: Partial<Omit<Friend, 'id' | 'tags'>>
      }
      tags: {
        Row: Tag
        Insert: Omit<Tag, 'id' | 'created_at'>
        Update: Partial<Omit<Tag, 'id'>>
      }
      friend_tags: {
        Row: FriendTag
        Insert: FriendTag
        Update: never
      }
      scenarios: {
        Row: Scenario
        Insert: Omit<Scenario, 'id' | 'created_at' | 'updated_at' | 'steps'>
        Update: Partial<Omit<Scenario, 'id' | 'steps'>>
      }
      scenario_steps: {
        Row: ScenarioStep
        Insert: Omit<ScenarioStep, 'id' | 'created_at'>
        Update: Partial<Omit<ScenarioStep, 'id'>>
      }
      broadcasts: {
        Row: Broadcast
        Insert: Omit<Broadcast, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Broadcast, 'id'>>
      }
      rich_menus: {
        Row: RichMenu
        Insert: Omit<RichMenu, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<RichMenu, 'id'>>
      }
      message_logs: {
        Row: MessageLog
        Insert: Omit<MessageLog, 'id'>
        Update: never
      }
    }
    Views: {
      analytics_summary: {
        Row: {
          date: string
          platform: Platform
          direction: 'inbound' | 'outbound'
          message_count: number
          unique_friends: number
        }
      }
    }
    Functions: {
      get_friend_count: {
        Args: { p_platform?: string }
        Returns: number
      }
    }
  }
}
