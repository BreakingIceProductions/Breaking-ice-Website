import { redirect } from 'next/navigation'

/** Leads now sit on the one Pipeline board, in the Sales columns. */
export default function Leads() {
  redirect('/admin/pipeline')
}
