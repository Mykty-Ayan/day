/** Digits to dial or open in WhatsApp. Kazakh numbers come as "8 701…", "701…"
 *  or "+7 701…"; wa.me and tel: need "7701…". */
export function phoneDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('7')) return `7${digits}`
  return digits
}
