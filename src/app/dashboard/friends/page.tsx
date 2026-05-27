import { Users } from 'lucide-react'
import FriendList from '@/components/friends/FriendList'

export const metadata = {
  title: '友だち管理 | LineHub',
}

export default function FriendsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ページヘッダー */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">友だち管理</h1>
              <p className="text-sm text-gray-500">LINE・メールの友だちを管理します</p>
            </div>
          </div>
        </div>

        {/* 友だちリスト（Client Component） */}
        <FriendList />
      </div>
    </div>
  )
}
