// Planche v2 — Tailwind preset. Usage: presets: [require('./design/tokens/tailwind.preset.js')] + import 'design/tokens/planche-tokens.css' once.
// shadcn/ui: map its semantic names onto Planche tokens (see aliases at the bottom).
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: 'var(--pl-bg)', sunken: 'var(--pl-bg-sunken)' },
        surface: 'var(--pl-surface)',
        card: 'var(--pl-card)',
        elevated: 'var(--pl-elevated)',
        overlay: 'var(--pl-overlay)',
        hover: 'var(--pl-hover)',
        active: 'var(--pl-active)',
        skeleton: 'var(--pl-skeleton)',
        line: { DEFAULT: 'var(--pl-border)', strong: 'var(--pl-border-strong)' },
        fg: { DEFAULT: 'var(--pl-fg)', 2: 'var(--pl-fg-2)', 3: 'var(--pl-fg-3)' },
        primary: { DEFAULT: 'var(--pl-primary)', fg: 'var(--pl-primary-fg)' },
        ring: 'var(--pl-ring)',
        accent: { DEFAULT: 'var(--pl-accent)', fg: 'var(--pl-accent-fg)', soft: 'var(--pl-accent-soft)' },
        danger: { DEFAULT: 'var(--pl-danger)', soft: 'var(--pl-danger-soft)' },
        success: 'var(--pl-success)',
        warning: 'var(--pl-warning)',
        status: {
          draft: 'var(--pl-s-draft)', todo: 'var(--pl-s-todo)', doing: 'var(--pl-s-doing)', review: 'var(--pl-s-review)',
          done: 'var(--pl-s-done)', cancelled: 'var(--pl-s-cancelled)', deleted: 'var(--pl-s-deleted)',
        },
      },
      fontFamily: { sans: ['var(--pl-font)'], mono: ['var(--pl-font-mono)'] },
      fontSize: {
        xs: ['11px', '14px'], sm: ['11.5px', '16px'], md: ['12px', '16px'], base: ['13px', '18px'],
        body: ['14px', '22px'], lg: ['16px', '22px'], xl: ['22px', '28px'], '2xl': ['24px', '30px'],
      },
      letterSpacing: { ui: '-0.005em', title: '-0.018em' },
      spacing: {
        0.5: '2px', 1.5: '6px', 2.5: '10px',
        row: '28px', 'row-menu': '30px', 'row-list': '38px', 'row-sub': '36px',
        toolbar: '44px', filterbar: '40px', sidebar: '220px', column: '226px', props: '300px',
      },
      borderRadius: { xs: '4px', sm: '5px', md: '6px', lg: '8px', xl: '10px', '2xl': '12px', pill: '11px' },
      boxShadow: {
        card: 'var(--pl-shadow-card)', drag: 'var(--pl-shadow-drag)', pop: 'var(--pl-shadow-pop)',
        panel: 'var(--pl-shadow-panel)', window: 'var(--pl-shadow-window)', ring: 'var(--pl-shadow-ring)',
      },
      transitionTimingFunction: { pl: 'cubic-bezier(.2,0,0,1)', 'pl-out': 'cubic-bezier(0,0,.2,1)' },
      transitionDuration: { fast: '120ms', base: '160ms', slow: '200ms' },
      keyframes: {
        'pl-in': { from: { opacity: 0, transform: 'translateY(-4px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        'pl-spin': { to: { transform: 'rotate(360deg)' } },
        'pl-slide': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(260%)' } },
      },
      animation: {
        'pl-in': 'pl-in 160ms cubic-bezier(.2,0,0,1)',      // Radix menu/popover/tooltip [data-state=open]
        'pl-spin': 'pl-spin 800ms linear infinite',
        'pl-slide': 'pl-slide 1.4s cubic-bezier(.2,0,0,1) infinite', // 2px indeterminate bar under the filter bar
      },
    },
  },
  plugins: [
    // Keyboard focus: every interactive element uses `focus-visible:shadow-ring outline-none`.
  ],
};

// shadcn/ui CSS variable aliases (paste into globals.css):
// --background: var(--pl-bg); --foreground: var(--pl-fg); --card: var(--pl-card);
// --popover: var(--pl-elevated); --primary: var(--pl-primary); --primary-foreground: var(--pl-primary-fg);
// --muted: var(--pl-bg-sunken); --muted-foreground: var(--pl-fg-3); --accent: var(--pl-active);
// --destructive: var(--pl-danger); --border: var(--pl-border); --input: var(--pl-border-strong);
// --ring: var(--pl-ring); --radius: 6px;
