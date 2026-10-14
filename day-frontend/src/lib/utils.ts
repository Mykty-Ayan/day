import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** A link the server keeps on a flat (map, WhatsApp product, video): a web address and nothing else. */
export function isWebLink(value: string) {
  return /^https?:\/\/\S+$/.test(value.trim())
}
