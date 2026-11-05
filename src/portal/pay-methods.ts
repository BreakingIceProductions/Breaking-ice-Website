/** How a payment was made, in words. Shared by the portal and the back office. */
export const METHOD_LABEL: Record<string, string> = {
  etransfer: 'e-Transfer',
  eft: 'EFT',
  card: 'card',
  acss_debit: 'bank debit',
  bank: 'bank transfer',
  outside: 'outside the portal',
}

export const methodLabel = (m?: string) => (m ? METHOD_LABEL[m] ?? m : '')

/** Clients say they've sent one of these; the card goes through Stripe. */
export const BANK_METHODS = ['etransfer', 'eft'] as const
export type BankMethod = (typeof BANK_METHODS)[number]
