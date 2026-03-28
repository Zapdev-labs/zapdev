import { createFileRoute } from '@tanstack/react-router'
import { ShowcaseView } from '@/modules/home/ui/views/showcase-view'

export const Route = createFileRoute('/showcase')({
  component: ShowcasePage,
  head: () => ({
    meta: [
      { title: 'Showcase - Zapdev' },
      { name: 'description', content: 'See what others have built with Zapdev' },
    ],
  }),
})

function ShowcasePage() {
  return <ShowcaseView />
}
