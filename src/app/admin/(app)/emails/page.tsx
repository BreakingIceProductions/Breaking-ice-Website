import '../../../css/admin-simple-a.css'
import '../../../css/admin-emails.css'
import { requireAdmin } from '@/admin/auth'
import { googleOAuthReady } from '@/admin/config'
import { blockTokens } from '@/admin/email-blocks-shared'
import { getEmailTemplates } from '@/admin/email-templates'
import { mailState } from '@/admin/gmail'
import { EmailsApp } from '@/admin/ui/emails'
import { getPortalSettings } from '@/portal/data'
import { r2Ready } from '@/portal/r2'

export const metadata = { title: 'Emails' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Client correspondence: one conversation per client, from Josh's Gmail, with a composer that sends through Gmail. */
export default async function EmailsPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  if (admin.viewOnly) {
    return (
      <div className="a-page ml">
        <header className="a-head"><h1 className="a-h1 sa-h1">Emails</h1></header>
        <p className="sa-empty">Email is only open to the owner sign-in.</p>
      </div>
    )
  }
  const sp = await searchParams
  const client = typeof sp.client === 'string' && /^[\w.-]{1,200}$/.test(sp.client) ? sp.client : undefined
  const [state, { templates }, settings] = await Promise.all([mailState(), getEmailTemplates().catch(() => ({ templates: [] })), getPortalSettings().catch(() => null)])
  return (
    <EmailsApp
      state={state}
      initialClient={client}
      // Portal blocks need a project to fill them, so templates that use them stay on the project page.
      templates={templates.filter((t) => !blockTokens(t.body).length).map((t) => ({ key: t._key, name: t.name, subject: t.subject, body: t.body }))}
      signOff={settings?.signOff ?? ''}
      bigUploads={r2Ready() || state === 'sample'}
      canConnect={googleOAuthReady()}
    />
  )
}
