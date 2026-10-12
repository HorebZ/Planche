// Planche — Tailwind preset. Pair with planche-tokens.css (CSS variables, light + [data-theme="dark"]).
// shadcn/ui: map its semantic names onto Planche tokens in the same file (see `shadcnAliases`).
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: 'var(--pl-bg)', sunken: 'var(--pl-bg-sunken)' },
        surface: 'var(--pl-surface)',
        elevated: 'var(--pl-elevated)',
        sidebar: 'var(--pl-sidebar)',
        overlay: 'var(--pl-overlay)',
        hover: 'var(--pl-hover)',
        active: 'var(--pl-active)',
        kbd: 'var(--pl-kbd)',
        skeleton: 'var(--pl-skeleton)',
        line: { DEFAULT: 'var(--pl-border)', strong: 'var(--pl-border-strong)' },
        fg: { DEFAULT: 'var(--pl-fg)', 2: 'var(--pl-fg-2)', 3: 'var(--pl-fg-3)' },
        accent: { DEFAULT: 'var(--pl-accent)', fg: 'var(--pl-accent-fg)', soft: 'var(--pl-accent-soft)' },
        focus: 'var(--pl-focus)',
        danger: { DEFAULT: 'var(--pl-danger)', soft: 'var(--pl-danger-soft)' },
        success: 'var(--pl-success)',
        warning: 'var(--pl-warning)',
        status: {
          backlog: 'var(--pl-s-backlog)', todo: 'var(--pl-s-todo)', doing: 'var(--pl-s-doing)',
          review: 'var(--pl-s-review)', done: 'var(--pl-s-done)',
        },
      },
      fontFamily: { sans: ['var(--pl-font)'], mono: ['var(--pl-font-mono)'] },
      fontSize: {
        '2xs': ['10.5px', '14px'], xs: ['11px', '14px'], sm: ['12px', '16px'], base: ['13px', '17px'],
        md: ['14px', '18px'], lg: ['17px', '22px'], xl: ['20px', '26px'], '2xl': ['24px', '30px'],
      },
      spacing: { 0.5: '2px', 1.5: '6px', 2.5: '10px', row: '26px', toolbar: '48px', sidebar: '232px', column: '228px' },
      borderRadius: { xs: '3px', sm: '5px', md: '6px', lg: '8px', xl: '10px', window: '12px' },
      boxShadow: {
        card: 'var(--pl-shadow-card)', drag: 'var(--pl-shadow-drag)', pop: 'var(--pl-shadow-pop)',
        window: 'var(--pl-shadow-window)', ring: 'var(--pl-ring)',
      },
      transitionTimingFunction: { pl: 'cubic-bezier(.2,0,0,1)', 'pl-out': 'cubic-bezier(0,0,.2,1)' },
      transitionDuration: { fast: '150ms', base: '180ms', slow: '200ms' },
      keyframes: {
        'pl-in': { from: { opacity: 0, transform: 'translateY(-4px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        'pl-panel': { from: { transform: 'translateX(16px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        'pl-spin': { to: { transform: 'rotate(360deg)' } },
        'pl-shimmer': { '0%,100%': { opacity: .55 }, '50%': { opacity: 1 } },
      },
      animation: {
        'pl-in': 'pl-in 180ms cubic-bezier(.2,0,0,1)',     // Radix menu/popover/tooltip [data-state=open]
        'pl-panel': 'pl-panel 200ms cubic-bezier(.2,0,0,1)', // issue side panel
        'pl-spin': 'pl-spin 800ms linear infinite',
        'pl-shimmer': 'pl-shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // Keyboard focus: every interactive element uses `focus-visible:shadow-ring outline-none`.
  ],
};

// shadcn/ui CSS variable aliases (paste into globals.css):
// --background: var(--pl-bg); --foreground: var(--pl-fg); --card: var(--pl-surface);
// --popover: var(--pl-elevated); --primary: var(--pl-accent); --primary-foreground: var(--pl-accent-fg);
// --muted: var(--pl-bg-sunken); --muted-foreground: var(--pl-fg-3); --accent: var(--pl-active);
// --destructive: var(--pl-danger); --border: var(--pl-border); --input: var(--pl-border-strong);
// --ring: var(--pl-focus); --radius: 6px;
