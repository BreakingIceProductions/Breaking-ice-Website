import { ImageResponse } from 'next/og'

// The home-screen icon when the back office is saved from Safari. Square and opaque: iOS rounds the corners itself.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="180" height="180">
        <rect x="0" y="0" width="512" height="512" fill="#18202F" />
        <polygon points="116,127.96 232.67,127.96 232.67,302.38 116,384.04" fill="#C9773F" />
        <polygon points="279.33,127.96 396,127.96 396,302.38 279.33,384.04" fill="#FAF7F2" />
      </svg>
    ),
    size,
  )
}
