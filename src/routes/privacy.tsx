import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: 'Privacy Policy - Zapdev' },
      { name: 'description', content: 'Zapdev Privacy Policy' },
    ],
  }),
})

function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      <p>Your privacy is important to us. This policy describes how we protect your information.</p>
    </div>
  )
}
