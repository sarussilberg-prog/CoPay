/* eslint-disable */
// CoPay · shared UI primitives (Icon, Button, Input, Avatar, Chip, Card, FAB)
// Visual rules pulled from tailwind.config.js + theme/* + components/* in the
// navesarussi/kupa repo. All colors flow from CSS vars in colors_and_type.css.

// ---------------------------------------------------------------------------
// Icon — small SVG sprite (the live app uses Ionicons via @expo/vector-icons).
// We pull the same icons from the ionicons unpkg CDN.
// ---------------------------------------------------------------------------
const ICONS = {
  'chevron-back': 'chevron-back',
  'chevron-forward': 'chevron-forward',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  'settings-outline': 'settings-outline',
  'people-outline': 'people-outline',
  'people-circle-outline': 'people-circle-outline',
  'home-outline': 'home-outline',
  'airplane-outline': 'airplane-outline',
  'heart-outline': 'heart-outline',
  'briefcase-outline': 'briefcase-outline',
  'calendar-outline': 'calendar-outline',
  'apps-outline': 'apps-outline',
  'share-outline': 'share-outline',
  'chatbubble-outline': 'chatbubble-outline',
  'language-outline': 'language-outline',
  'ellipsis-vertical': 'ellipsis-vertical',
  'add': 'add',
  'close': 'close',
  'arrow-up-circle-outline': 'arrow-up-circle-outline',
  'arrow-down-circle-outline': 'arrow-down-circle-outline',
  'checkmark-circle-outline': 'checkmark-circle-outline',
  'checkmark-circle': 'checkmark-circle',
  'alert-circle-outline': 'alert-circle-outline',
  'time-outline': 'time-outline',
  'wallet-outline': 'wallet-outline',
  'card-outline': 'card-outline',
  'restaurant-outline': 'restaurant-outline',
  'car-outline': 'car-outline',
  'bed-outline': 'bed-outline',
  'flash-outline': 'flash-outline',
  'film-outline': 'film-outline',
  'cart-outline': 'cart-outline',
  'medkit-outline': 'medkit-outline',
  'pricetag-outline': 'pricetag-outline',
  'receipt-outline': 'receipt-outline',
  'pencil': 'pencil',
  'search-outline': 'search-outline',
  'filter-outline': 'filter-outline',
  'list-outline': 'list-outline',
  'log-out-outline': 'log-out-outline',
};

function Icon({ name, size = 24, color, style }) {
  const slug = ICONS[name] || name;
  const url = `https://cdn.jsdelivr.net/npm/ionicons@7.1.0/dist/svg/${slug}.svg`;
  const [svg, setSvg] = React.useState(null);
  React.useEffect(() => {
    const cache = window.__copayIconCache = window.__copayIconCache || {};
    if (cache[slug]) { setSvg(cache[slug]); return; }
    let live = true;
    fetch(url).then(r => r.text()).then(t => {
      // 1. strip existing fill/stroke values (keep `fill="none"` to preserve outline icons)
      // 2. drop the .ionicon class
      // 3. THEN add currentColor on the root <svg>
      const cleaned = t
        .replace(/class="[^"]*"/g, '')
        .replace(/ (fill|stroke)="(?!none)[^"]*"/g, '');
      const inlined = cleaned.replace(/<svg /, '<svg fill="currentColor" stroke="currentColor" ');
      cache[slug] = inlined;
      if (live) setSvg(inlined);
    }).catch(() => {});
    return () => { live = false; };
  }, [slug, url]);
  return (
    <span
      role="img"
      aria-label={name}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, color: color || 'currentColor',
        flexShrink: 0, ...style,
      }}
      dangerouslySetInnerHTML={svg ? { __html: svg.replace(/<svg /, `<svg width="${size}" height="${size}" `) } : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Button — primary / secondary / outline / danger · 16-px radius · opacity press
// ---------------------------------------------------------------------------
function Button({
  title, onClick, variant = 'primary', loading = false, disabled = false, fullWidth = true, leftIcon, style,
}) {
  const isDisabled = disabled || loading;
  const variants = {
    primary:   { background: 'var(--primary)', color: '#fff', border: '0' },
    secondary: { background: 'var(--primary-extra-light)', color: 'var(--primary-dark)', border: '0' },
    outline:   { background: '#fff', color: 'var(--gray-700)', border: '1px solid var(--border-strong)' },
    danger:    { background: 'var(--error)', color: '#fff', border: '0' },
  }[variant];
  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      style={{
        ...variants,
        borderRadius: 'var(--radius-xl)',
        padding: '14px 24px',
        fontSize: 16, fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        width: fullWidth ? '100%' : 'auto',
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'opacity .15s ease',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      onMouseDown={(e) => { if (!isDisabled) e.currentTarget.style.opacity = 0.7; }}
      onMouseUp={(e) => { if (!isDisabled) e.currentTarget.style.opacity = 1; }}
      onMouseLeave={(e) => { if (!isDisabled) e.currentTarget.style.opacity = 1; }}
    >
      {loading
        ? <Spinner color={variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--primary)'} />
        : (<>{leftIcon}{title}</>)}
    </button>
  );
}

function Spinner({ size = 16, color = '#fff' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      border: `2px solid ${color}`, borderTopColor: 'transparent',
      animation: 'copay-spin .8s linear infinite',
    }} />
  );
}

// ---------------------------------------------------------------------------
// Input · 16-px radius, gray-300 border, focus → primary outline
// ---------------------------------------------------------------------------
function Input({ label, error, placeholder, value, onChange, type = 'text', style }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', marginBottom: 8 }}>{label}</div>}
      <input
        type={type}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={onChange}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#fff',
          border: `1px solid ${error ? 'var(--error)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius-xl)',
          padding: '12px 16px',
          fontSize: 16, color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)';
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-extra-light)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--error)' : 'var(--border-strong)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {error && <div style={{ fontSize: 14, color: 'var(--error)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberAvatar · initials in slate circle (or image)
// ---------------------------------------------------------------------------
const AVATAR_SIZES = { xs: 32, sm: 36, md: 44, lg: 56 };
function MemberAvatar({ name, initials, size = 'md', avatarUrl, style }) {
  const px = AVATAR_SIZES[size] ?? size;
  const ini = (initials || (name || '').split(' ').map(s => s[0]).join('').slice(0, 2)).toUpperCase();
  return (
    <div
      style={{
        width: px, height: px, borderRadius: '50%',
        background: 'var(--slate-100)',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--slate-600)',
        fontWeight: 600,
        fontSize: Math.max(10, Math.round(px * 0.32)),
        flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : ini}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupAvatar · gradient + Ionicon (type fallback)
// ---------------------------------------------------------------------------
const GROUP_VISUAL = {
  trip:    { icon: 'airplane-outline',       grad: 'var(--grad-trip)'    },
  home:    { icon: 'home-outline',           grad: 'var(--grad-home)'    },
  couple:  { icon: 'heart-outline',          grad: 'var(--grad-couple)'  },
  general: { icon: 'people-outline',         grad: 'var(--grad-general)' },
  work:    { icon: 'briefcase-outline',      grad: 'var(--grad-work)'    },
  event:   { icon: 'calendar-outline',       grad: 'var(--grad-event)'   },
  friends: { icon: 'people-circle-outline',  grad: 'var(--grad-friends)' },
  other:   { icon: 'apps-outline',           grad: 'var(--grad-other)'   },
};
const GROUP_AVATAR_SIZES = { sm: { px: 48, r: 12, ic: 22 }, md: { px: 64, r: 20, ic: 28 }, lg: { px: 96, r: 20, ic: 40 } };
function GroupAvatar({ type = 'general', size = 'sm', style }) {
  const v = GROUP_VISUAL[type] || GROUP_VISUAL.general;
  const s = GROUP_AVATAR_SIZES[size];
  return (
    <div style={{
      width: s.px, height: s.px, borderRadius: s.r,
      background: v.grad,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, ...style,
    }}>
      <Icon name={v.icon} size={s.ic} color="#fff" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BalanceChip · pill (small) — list-row summary
// ---------------------------------------------------------------------------
function BalanceChip({ net, currency }) {
  const settled = Math.abs(net) < 0.01;
  const owed = net > 0;
  const bg = settled ? 'var(--gray-100)' : (owed ? 'var(--success-bg)' : 'var(--error-bg)');
  const fg = settled ? 'var(--text-secondary)' : (owed ? '#059669' : '#DC2626');
  const label = settled ? 'Settled'
    : (owed ? `+${currency} ${Math.abs(net).toFixed(2)}` : `−${currency} ${Math.abs(net).toFixed(2)}`);
  return (
    <span style={{
      borderRadius: 9999, padding: '4px 10px',
      fontSize: 12, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      background: bg, color: fg,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// AmountChip · bordered rounded-md (used in balance breakdown)
// ---------------------------------------------------------------------------
function AmountChip({ tone, label }) {
  const palette = {
    owed:    { bg: 'var(--success-bg)', fg: 'var(--success-text)', bd: 'var(--success-border)' },
    owe:     { bg: 'var(--error-bg)',   fg: 'var(--error-text)',   bd: 'var(--error-border)'   },
    neutral: { bg: 'var(--gray-50)',    fg: 'var(--text-secondary)', bd: 'var(--border)'       },
  }[tone];
  return (
    <span style={{
      borderRadius: 'var(--radius-md)', padding: '4px 10px',
      fontSize: 14, fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      background: palette.bg, color: palette.fg,
      border: `1px solid ${palette.bd}`,
    }}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// Card · the canonical container (white, soft border + shadow, 16-px radius)
// ---------------------------------------------------------------------------
function Card({ children, radius = 16, padding = 16, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: radius,
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-sm)',
        padding,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >{children}</div>
  );
}

// ---------------------------------------------------------------------------
// FAB pair (Message + Add expense)
// ---------------------------------------------------------------------------
function FabPair({ onMessage, onExpense }) {
  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 6,
      display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center',
      zIndex: 10,
    }}>
      <button
        onClick={onMessage}
        style={{
          background: '#fff', color: 'var(--primary-dark)',
          border: '1px solid var(--border-tint)',
          borderRadius: 28, padding: '12px 16px',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
          boxShadow: 'var(--shadow-fab)', fontFamily: 'var(--font-sans)',
        }}
      >
        <Icon name="chatbubble-outline" size={20} color="var(--primary)" />
        Message
      </button>
      <button
        onClick={onExpense}
        style={{
          background: 'var(--primary)', color: '#fff', border: 0,
          borderRadius: 28, padding: '12px 16px',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 15, fontWeight: 600, cursor: 'pointer',
          boxShadow: 'var(--shadow-fab)', fontFamily: 'var(--font-sans)',
        }}
      >
        <Icon name="add" size={22} color="#fff" />
        Add expense
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppBar (screen header) — used inside individual screens, NOT the bottom tab
// ---------------------------------------------------------------------------
function AppBar({ title, left, right, subtitle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 16px 12px 16px', background: '#fff',
      borderBottom: '1px solid var(--border-soft)',
      minHeight: 48,
    }}>
      <div style={{ width: 36, display: 'flex' }}>{left || null}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', letterSpacing: '-0.005em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ width: 36, display: 'flex', justifyContent: 'flex-end' }}>{right || null}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BottomTabBar — Groups · Activity · Profile
// ---------------------------------------------------------------------------
function BottomTabBar({ active, onChange }) {
  const tabs = [
    { id: 'groups',   label: 'Groups',   icon: 'people-outline' },
    { id: 'activity', label: 'Activity', icon: 'list-outline' },
    { id: 'profile',  label: 'Profile',  icon: 'wallet-outline' },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around',
      background: '#fff',
      borderTop: '1px solid var(--border-soft)',
      paddingTop: 8, paddingBottom: 8,
    }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            background: 'transparent', border: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            cursor: 'pointer', padding: '4px 12px',
            color: on ? 'var(--primary)' : 'var(--gray-400)',
            fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: on ? 600 : 500,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <Icon name={t.icon} size={24} color={on ? 'var(--primary)' : 'var(--gray-400)'} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IconButton (round, transparent)
// ---------------------------------------------------------------------------
function IconButton({ name, onClick, size = 22, color = 'var(--gray-600)', bg }) {
  return (
    <button onClick={onClick} style={{
      background: bg || 'transparent', border: 0, padding: 6,
      borderRadius: 9999, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      WebkitTapHighlightColor: 'transparent',
    }}>
      <Icon name={name} size={size} color={color} />
    </button>
  );
}

Object.assign(window, {
  Icon, IconButton, Button, Spinner, Input, MemberAvatar, GroupAvatar,
  BalanceChip, AmountChip, Card, FabPair, AppBar, BottomTabBar,
  GROUP_VISUAL,
});
