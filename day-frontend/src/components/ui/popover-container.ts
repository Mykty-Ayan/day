import { createContext } from 'react'

/** Where a popover is drawn: the page, or the panel it is opened in. A modal panel
 *  takes the clicks off everything outside it, so a menu drawn on the page beside it
 *  would show but let its clicks fall through to the panel below. */
export const PopoverContainer = createContext<HTMLElement | null>(null)
