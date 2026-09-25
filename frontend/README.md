# KAVACH Frontend — React + TypeScript

## NOT FULLY IMPLEMENTED — SKELETAL STRUCTURE

Stack: React + Vite + TypeScript + Tailwind + shadcn/ui

### What Should Exist (not implemented due to token budget)
1. **6 Pages**: Today, Ask Kavach, Alerts, Mule Rings, Rulebook, Time Machine
2. **Components**: Shadcn/ui buttons, cards, tables, charts (Recharts), graph (React Flow)
3. **i18n**: EN/HI toggle via react-i18next
4. **Product Tour**: react-joyride 6-step walkthrough
5. **API Layer**: TanStack Query + typed API client in `src/services/api/`

### To Complete (estimate: 10-12 hours)
```bash
# Setup
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-query recharts react-flow-renderer react-i18next react-joyride
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Add shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card table badge

# Implement pages following PROJECT_BRIEF.md design rules
# - Calm bank-grade look, indigo accent
# - ₹ in lakh/crore, dates as "12 Sep 2026"
# - RED/AMBER/GREEN with icon + word
# - WCAG AA contrast, keyboard accessible

# Build
npm run build
# Output: dist/ (served by FastAPI backend)
```

### Design System
- **Colors**: Indigo-600 accent, neutral-50 to neutral-900 scale
- **Typography**: System font stack, 16px base
- **Status**: 🔴 RED, 🟡 AMBER, 🟢 GREEN always paired with text
- **Money**: ₹12.4 L, ₹3.1 Cr (lakh/crore formatting)

### Example Page: Today
```tsx
export function TodayPage() {
  const { data } = useQuery(['home'], fetchHomeData);
  
  return (
    <div className="p-6 space-y-6">
      <ReadinessGauge score={data.readiness_score} />
      <MetricTiles metrics={data.tiles} />
      <AttentionCards items={data.attention_items} />
      <TrendChart data={data.trend} />
    </div>
  );
}
```

See PROJECT_BRIEF.md for full frontend requirements.
