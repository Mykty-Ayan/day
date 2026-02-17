import { createFileRoute } from '@tanstack/react-router'
import ImportPreviewPage from '../../pages/ai-import/ImportPreviewPage'

export const Route = createFileRoute('/ai-import/$jobId')({
  component: ImportPreviewPage,
})
