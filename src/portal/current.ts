import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { getSession } from './auth'
import { getAccess } from './data'

/** The signed-in person's access, fetched once per request. Sends anyone signed out to the sign-in page. */
export const requireAccess = cache(async () => {
  const session = await getSession()
  if (!session) redirect('/portal/sign-in')
  const access = await getAccess(session)
  return { session, ...access }
})
