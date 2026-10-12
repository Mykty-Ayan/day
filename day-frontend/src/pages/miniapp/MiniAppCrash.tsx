/** What the Mini App shows instead of a blank page when a screen throws. */

import { useTranslation } from 'react-i18next'
import { ActionButton, Screen } from './miniapp-ui'

export default function MiniAppCrash() {
  const { t } = useTranslation()
  return (
    <Screen>
      <p className="text-sm">{t('miniapp.crashed')}</p>
      <div className="mt-4 w-full max-w-xs">
        <ActionButton onClick={() => window.location.reload()}>{t('miniapp.reload')}</ActionButton>
      </div>
    </Screen>
  )
}
