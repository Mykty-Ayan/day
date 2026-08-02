import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, KeyRound, MessageCircle, Plus, Send, ShieldAlert, UserPlus, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import { showToast } from '../../components/ui/Toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Checkbox } from '../../components/ui/checkbox'
import { useCurrentUser } from '../../hooks/useAuth'
import {
  useChannels,
  useDisconnectChannel,
  useRegisterWhatsApp,
  useTelegramLinkCode,
} from '../../hooks/useChannels'
import {
  useApiKeyScopes,
  useApiKeys,
  useCreateApiKey,
  useCreateTeamMember,
  useDeactivateTeamMember,
  useRevokeApiKey,
  useTeam,
  useUpdateTeamMember,
} from '../../hooks/useTeam'
import type { CreatedApiKey, TeamMember, UserRole } from '../../api/team'

const ASSIGNABLE_ROLES: UserRole[] = ['manager', 'cleaner']

const ROLE_TONE: Record<UserRole, string> = {
  owner: 'bg-gray-900 text-white',
  manager: 'bg-blue-50 text-blue-700 border border-blue-200',
  cleaner: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

function formatDate(value: string | null, language: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(language, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function TeamPage() {
  const { t, i18n } = useTranslation()
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser()
  const isOwner = currentUser?.role === 'owner'

  const { data: team = [], isLoading: isTeamLoading, isError: isTeamError } = useTeam(isOwner)
  const { data: apiKeys = [], isLoading: areKeysLoading } = useApiKeys(isOwner)
  const { data: scopes = [] } = useApiKeyScopes(isOwner)

  const createMember = useCreateTeamMember()
  const updateMember = useUpdateTeamMember()
  const deactivateMember = useDeactivateTeamMember()
  const createKey = useCreateApiKey()
  const revokeKey = useRevokeApiKey()

  const { data: channels = [] } = useChannels(isOwner)
  const requestTelegramCode = useTelegramLinkCode()
  const registerWhatsApp = useRegisterWhatsApp()
  const disconnectChannel = useDisconnectChannel()

  const [showMemberForm, setShowMemberForm] = useState(false)
  const [memberForm, setMemberForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'cleaner' as UserRole,
  })
  const [memberToDeactivate, setMemberToDeactivate] = useState<TeamMember | null>(null)

  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [keyScopes, setKeyScopes] = useState<string[]>([])
  // Shown once, right after creation — the secret cannot be retrieved again.
  const [issuedKey, setIssuedKey] = useState<CreatedApiKey | null>(null)
  const [keyToRevoke, setKeyToRevoke] = useState<{ id: string; name: string } | null>(null)

  const [telegramCode, setTelegramCode] = useState<string | null>(null)
  const [whatsappChannelId, setWhatsappChannelId] = useState('')

  const sortedTeam = useMemo(
    () => [...team].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [team],
  )

  if (isUserLoading) return <Spinner />

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <ShieldAlert className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">{t('team.ownerOnly')}</p>
      </div>
    )
  }

  async function submitMember() {
    if (!memberForm.email.trim() || memberForm.password.length < 8) {
      showToast('error', t('team.validation.emailAndPassword'))
      return
    }
    try {
      await createMember.mutateAsync({
        email: memberForm.email.trim(),
        password: memberForm.password,
        role: memberForm.role,
        full_name: memberForm.full_name.trim(),
        phone: memberForm.phone.trim() || null,
      })
      setMemberForm({ email: '', password: '', full_name: '', phone: '', role: 'cleaner' })
      setShowMemberForm(false)
      showToast('success', t('team.memberCreated'))
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      showToast('error', detail || t('team.memberFailed'))
    }
  }

  async function submitKey() {
    if (!keyName.trim() || keyScopes.length === 0) {
      showToast('error', t('team.validation.nameAndScopes'))
      return
    }
    try {
      const created = await createKey.mutateAsync({ name: keyName.trim(), scopes: keyScopes })
      setIssuedKey(created)
      setKeyName('')
      setKeyScopes([])
      setShowKeyForm(false)
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      showToast('error', detail || t('team.keyFailed'))
    }
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      showToast('success', t('team.keyCopied'))
    } catch {
      showToast('error', t('team.keyCopyFailed'))
    }
  }

  async function requestCode() {
    try {
      const issued = await requestTelegramCode.mutateAsync()
      setTelegramCode(issued.code)
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      showToast('error', detail || t('channels.codeFailed'))
    }
  }

  async function submitWhatsApp() {
    if (!whatsappChannelId.trim()) {
      showToast('error', t('channels.channelIdRequired'))
      return
    }
    try {
      await registerWhatsApp.mutateAsync(whatsappChannelId.trim())
      setWhatsappChannelId('')
      showToast('success', t('channels.whatsappConnected'))
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      showToast('error', detail || t('channels.whatsappFailed'))
    }
  }

  function toggleScope(scope: string) {
    setKeyScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <h1 className="text-xl font-bold text-gray-900">{t('team.title')}</h1>

        {/* ---------- team ---------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <div>
                <h2 className="text-sm font-bold text-gray-900">{t('team.members')}</h2>
                <p className="text-xs text-gray-500">{t('team.membersDescription')}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setShowMemberForm((open) => !open)}>
              {showMemberForm ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {showMemberForm ? t('common.cancel') : t('team.addMember')}
            </Button>
          </div>

          {showMemberForm && (
            <div className="mb-4 space-y-3 rounded-xl bg-gray-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="member-email" className="mb-1.5 block text-xs font-bold text-gray-500">
                    {t('team.email')}
                  </label>
                  <input
                    id="member-email"
                    type="email"
                    value={memberForm.email}
                    onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <div>
                  <label htmlFor="member-password" className="mb-1.5 block text-xs font-bold text-gray-500">
                    {t('team.password')}
                  </label>
                  <input
                    id="member-password"
                    type="text"
                    autoComplete="new-password"
                    value={memberForm.password}
                    onChange={(e) => setMemberForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={t('team.passwordHint')}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <div>
                  <label htmlFor="member-name" className="mb-1.5 block text-xs font-bold text-gray-500">
                    {t('team.fullName')}
                  </label>
                  <input
                    id="member-name"
                    type="text"
                    value={memberForm.full_name}
                    onChange={(e) => setMemberForm((f) => ({ ...f, full_name: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <div>
                  <label htmlFor="member-phone" className="mb-1.5 block text-xs font-bold text-gray-500">
                    {t('team.phone')}
                  </label>
                  <input
                    id="member-phone"
                    type="tel"
                    value={memberForm.phone}
                    onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="member-role" className="mb-1.5 block text-xs font-bold text-gray-500">
                  {t('team.role')}
                </label>
                <Select
                  value={memberForm.role}
                  onValueChange={(value) => setMemberForm((f) => ({ ...f, role: value as UserRole }))}
                >
                  <SelectTrigger id="member-role" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`team.roles.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-gray-500">{t(`team.roleHints.${memberForm.role}`)}</p>
              </div>

              <Button onClick={submitMember} disabled={createMember.isPending}>
                <Plus className="h-4 w-4" />
                {t('team.createMember')}
              </Button>
            </div>
          )}

          {isTeamLoading ? (
            <Spinner />
          ) : isTeamError ? (
            <p className="py-6 text-center text-sm text-gray-500">{t('common.errorLoading')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sortedTeam.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {member.full_name || member.email}
                    </p>
                    <p className="truncate text-xs text-gray-500">{member.email}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${ROLE_TONE[member.role]}`}>
                    {t(`team.roles.${member.role}`)}
                  </span>
                  {member.is_active ? (
                    member.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => setMemberToDeactivate(member)}
                        className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
                      >
                        {t('team.deactivate')}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        updateMember.mutate({ userId: member.id, data: { is_active: true } })
                      }
                      className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100"
                    >
                      {t('team.reactivate')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- bots ---------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-gray-500" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">{t('channels.title')}</h2>
              <p className="text-xs text-gray-500">{t('channels.description')}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Telegram */}
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-900">
                    {t('channels.telegram')}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  onClick={requestCode}
                  disabled={requestTelegramCode.isPending}
                >
                  {t('channels.getCode')}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-500">{t('channels.telegramHint')}</p>

              {telegramCode && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
                  <code className="flex-1 text-base font-bold tracking-widest text-gray-900">
                    /start {telegramCode}
                  </code>
                  <Button variant="secondary" onClick={() => copyKey(`/start ${telegramCode}`)}>
                    <Copy className="h-4 w-4" />
                    {t('team.copy')}
                  </Button>
                </div>
              )}
            </div>

            {/* WhatsApp */}
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-900">
                  {t('channels.whatsapp')}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500">{t('channels.whatsappHint')}</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label
                    htmlFor="whapi-channel"
                    className="mb-1.5 block text-xs font-bold text-gray-500"
                  >
                    {t('channels.channelId')}
                  </label>
                  <input
                    id="whapi-channel"
                    type="text"
                    value={whatsappChannelId}
                    onChange={(e) => setWhatsappChannelId(e.target.value)}
                    placeholder="ABCDEF-1234"
                    className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <Button onClick={submitWhatsApp} disabled={registerWhatsApp.isPending}>
                  {t('channels.connect')}
                </Button>
              </div>
            </div>

            {/* Connected */}
            {channels.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {channels.map((channel) => (
                  <li key={channel.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {t(`channels.${channel.channel}`)}
                        {channel.display_name ? ` · ${channel.display_name}` : ''}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        <code>{channel.external_id}</code>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => disconnectChannel.mutate(channel.id)}
                      className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
                    >
                      {t('channels.disconnect')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ---------- service keys ---------- */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-gray-500" />
              <div>
                <h2 className="text-sm font-bold text-gray-900">{t('team.apiKeys')}</h2>
                <p className="text-xs text-gray-500">{t('team.apiKeysDescription')}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setShowKeyForm((open) => !open)}>
              {showKeyForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showKeyForm ? t('common.cancel') : t('team.addKey')}
            </Button>
          </div>

          {issuedKey && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                {t('team.keyShownOnce')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-gray-800">
                  {issuedKey.key}
                </code>
                <Button variant="secondary" onClick={() => copyKey(issuedKey.key)}>
                  <Copy className="h-4 w-4" />
                  {t('team.copy')}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setIssuedKey(null)}
                className="mt-2 min-h-[44px] text-xs font-bold text-amber-800 underline"
              >
                {t('team.keyStored')}
              </button>
            </div>
          )}

          {showKeyForm && (
            <div className="mb-4 space-y-3 rounded-xl bg-gray-50 p-4">
              <div>
                <label htmlFor="key-name" className="mb-1.5 block text-xs font-bold text-gray-500">
                  {t('team.keyName')}
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder={t('team.keyNamePlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold text-gray-500">{t('team.scopes')}</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {scopes.map((scope) => (
                    <label
                      key={scope}
                      className="flex min-h-[44px] items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700"
                    >
                      <Checkbox
                        checked={keyScopes.includes(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                      />
                      <code>{scope}</code>
                    </label>
                  ))}
                </div>
              </div>

              <Button onClick={submitKey} disabled={createKey.isPending}>
                <KeyRound className="h-4 w-4" />
                {t('team.createKey')}
              </Button>
            </div>
          )}

          {areKeysLoading ? (
            <Spinner />
          ) : apiKeys.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t('team.noKeys')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {apiKeys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{key.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      <code>{key.key_hint}…</code> · {key.scopes.length} {t('team.scopesShort')} ·{' '}
                      {t('team.lastUsed')}: {formatDate(key.last_used_at, i18n.language)}
                    </p>
                  </div>
                  {key.is_active ? (
                    <button
                      type="button"
                      onClick={() => setKeyToRevoke({ id: key.id, name: key.name })}
                      className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
                    >
                      {t('team.revoke')}
                    </button>
                  ) : (
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-500">
                      {t('team.revoked')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.div>

      <ConfirmDialog
        open={memberToDeactivate !== null}
        title={t('team.deactivateTitle')}
        message={t('team.deactivateMessage', {
          name: memberToDeactivate?.full_name || memberToDeactivate?.email || '',
        })}
        confirmLabel={t('team.deactivate')}
        onConfirm={async () => {
          if (!memberToDeactivate) return
          await deactivateMember.mutateAsync(memberToDeactivate.id)
          setMemberToDeactivate(null)
          showToast('success', t('team.memberDeactivated'))
        }}
        onCancel={() => setMemberToDeactivate(null)}
      />

      <ConfirmDialog
        open={keyToRevoke !== null}
        title={t('team.revokeTitle')}
        message={t('team.revokeMessage', { name: keyToRevoke?.name ?? '' })}
        confirmLabel={t('team.revoke')}
        onConfirm={async () => {
          if (!keyToRevoke) return
          await revokeKey.mutateAsync(keyToRevoke.id)
          setKeyToRevoke(null)
          showToast('success', t('team.keyRevoked'))
        }}
        onCancel={() => setKeyToRevoke(null)}
      />
    </div>
  )
}
