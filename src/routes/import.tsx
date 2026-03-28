import { createFileRoute } from '@tanstack/react-router'
import { ImportView } from '@/modules/import/ui/views/import-view'

export const Route = createFileRoute('/import')({
  component: ImportPage,
  head: () => ({
    meta: [
      { title: 'Import Project - Zapdev' },
      { name: 'description', content: 'Import your existing projects into Zapdev' },
    ],
  }),
})

function ImportPage() {
  return <ImportView />
}
