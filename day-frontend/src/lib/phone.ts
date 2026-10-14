/** Digits to dial or open in WhatsApp. Kazakh numbers come as "8 701…", "701…"
 *  or "+7 701…"; wa.me and tel: need "7701…". A number written with its own "+"
 *  already carries its country code (+852 9123 4567 is not "8 …"). */
export function phoneDigits(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  const digits = text.replace(/\D/g, '')
  if (text.startsWith('+')) return digits
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('7')) return `7${digits}`
  return digits
}
