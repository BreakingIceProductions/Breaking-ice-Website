// Lets the back office be saved to the iPhone or iPad home screen from Safari and open full screen, like an app.
export const dynamic = 'force-static'

export function GET() {
  const manifest = {
    name: 'Breaking Ice back office',
    short_name: 'Breaking Ice',
    id: '/admin',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    background_color: '#18202F',
    theme_color: '#18202F',
    icons: [
      { src: '/admin/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/brand/bi-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
  })
}
