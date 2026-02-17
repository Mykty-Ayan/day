import { createFileRoute } from '@tanstack/react-router'
import AIImportPage from '../../pages/ai-import/AIImportPage'

export const Route = createFileRoute('/ai-import/')({
  component: AIImportPage,
})
