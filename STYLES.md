# Project Design System & Default Styles

Tech stack: React + TypeScript + Tailwind CSS + Framer Motion + Lucide React icons

---

## Color Palette

| Role | Tailwind Classes |
|------|-----------------|
| **Primary action** | `bg-black text-white hover:bg-gray-800` |
| **Background** | `bg-white` |
| **Surface** | `bg-gray-50` |
| **Surface hover** | `bg-gray-100` |
| **Border default** | `border-gray-200` |
| **Border subtle** | `border-gray-100` |
| **Text primary** | `text-gray-900` |
| **Text secondary** | `text-gray-700` / `text-gray-800` |
| **Text muted** | `text-gray-500` |
| **Text faint** | `text-gray-400` |
| **Text hint** | `text-gray-300` |
| **Success** | `bg-emerald-500` / `bg-emerald-100 text-emerald-700` / `bg-green-50 text-green-700` |
| **Warning** | `bg-amber-400` / `bg-amber-100 text-amber-700` / `bg-amber-50 text-amber-700` |
| **Error** | `bg-red-600 text-white` / `bg-red-50 text-red-600` |
| **Info/Active** | `bg-blue-500` / `bg-blue-50 text-blue-700` / `bg-blue-100 text-blue-700` |
| **Accent** | `bg-indigo-50 text-indigo-600` |

---

## Border Radius

| Element | Class |
|---------|-------|
| Cards / Modals large | `rounded-3xl` |
| Cards / Modals | `rounded-2xl` |
| Cards / Buttons / Inputs | `rounded-xl` |
| Small elements | `rounded-lg` |
| Badges / Icons | `rounded-full` |
| Tags | `rounded-md` |

---

## Shadows

| Level | Class |
|-------|-------|
| Subtle | `shadow-sm` |
| Default | `shadow-md` |
| Elevated | `shadow-lg` |
| High | `shadow-xl` |
| Modal | `shadow-2xl` |
| Ring accent | `ring-1 ring-black/5` |

---

## Typography

| Role | Classes |
|------|---------|
| Page heading | `text-xl font-bold text-gray-900` |
| Section heading | `text-sm font-bold text-gray-900` |
| Body | `text-sm text-gray-700` |
| Label | `text-xs font-bold text-gray-400 uppercase tracking-wider` |
| Caption | `text-xs text-gray-500` |
| Micro | `text-[10px] font-bold` |
| Nano | `text-[9px] font-bold uppercase` |

---

## Component Patterns

### Card (GlassCard)
```
bg-white border border-gray-200 rounded-xl p-5 shadow-sm
```
Hover variant: `hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer`

### Modal Overlay
```
fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm px-4
```

### Modal Container
```
bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100
```
Large variant: `rounded-3xl max-w-sm`

### Toolbar / Header Bar
```
flex justify-between items-center p-4 border-b border-gray-100 bg-white
```

### Button Group
```
bg-gray-50 rounded-xl p-1 items-center shadow-sm border border-gray-100
```

### Primary Button
```
bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg hover:shadow-xl transition-all
```

### Secondary Button
```
bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold text-gray-700 hover:text-black transition-colors
```

### Action Button (colored)
```
bg-{color}-50 text-{color}-700 hover:bg-{color}-100 py-3 rounded-xl text-sm font-bold transition-colors
```
Colors: green (WhatsApp), blue (check-in), amber (check-out)

### Icon Button
```
p-1.5 hover:bg-white hover:shadow-sm rounded-lg text-gray-600 transition-all
```

### Disabled Button
```
bg-gray-200 text-gray-400 cursor-not-allowed
```

### Text Input / Textarea
```
w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 resize-none text-gray-800
```

### Badge / Status Tag
```
px-2 py-0.5 rounded-md text-[10px] font-bold uppercase
```
Success: `bg-emerald-100 text-emerald-700`
Warning: `bg-amber-100 text-amber-700`

### Info Section / Detail Card
```
bg-gray-50 rounded-xl p-4 space-y-2
```

### Error Banner (floating)
```
bg-red-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium
```

### Error Inline
```
bg-red-50 text-red-600 text-sm rounded-lg p-3 flex items-center gap-2
```

### Divider
```
h-px bg-gray-200
```
or `border-t border-gray-100`

### Footer Bar
```
bg-gray-50 p-3 border-t border-gray-100
```

### Spinner (loading)
```
w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin
```

---

## Framer Motion Animations

### Card Entrance
```ts
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4 }}
```

### Modal Enter/Exit
```ts
initial={{ scale: 0.9, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}
exit={{ scale: 0.9, opacity: 0 }}
```

### Tooltip / Popover
```ts
initial={{ opacity: 0, scale: 0.95, y: 10 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95 }}
```

### Slide Down (banners)
```ts
initial={{ opacity: 0, y: -20 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -20 }}
```

### Fade
```ts
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
```

### Subtle Slide Up
```ts
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -10 }}
```

---

## Design Principles

1. **Clean & minimal** - White-based UI, no visual clutter
2. **Black as primary** - Primary actions use solid black, not brand colors
3. **Gray hierarchy** - Use gray scale (900→100) for visual hierarchy
4. **Semantic status colors** - Emerald=success, Amber=warning, Red=error, Blue=info/active
5. **Generous rounding** - xl to 3xl for containers, keep things soft
6. **Subtle depth** - Light shadows + thin borders, never heavy drop shadows
7. **Smooth motion** - Framer Motion on all interactive elements
8. **Backdrop blur** - Modal overlays use `bg-black/20 backdrop-blur-sm`
9. **Consistent spacing** - p-3 to p-6 for padding, gap-2 for tight groups, gap-4 for sections
10. **Icons** - Lucide React, sizes 14-20px, matching text color
