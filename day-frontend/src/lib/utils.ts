import { isAxiosError } from 'axios'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** A link the server keeps on a flat (map, WhatsApp product, video): a web address and nothing else. */
export function isWebLink(value: string) {
  return /^https?:\/\/\S+$/.test(value.trim())
}

/** The server answered that the record is not there. Any other failure is not «not found». */
export function isNotFound(error: unknown) {
  return isAxiosError(error) && error.response?.status === 404
}
