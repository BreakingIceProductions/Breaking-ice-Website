import { redirect } from 'next/navigation'

/** Old project links (and emails) open the project in the library. */
export default async function PortalProject({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/portal?at=${encodeURIComponent(slug)}`)
}
