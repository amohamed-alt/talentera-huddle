# Talentera Huddle

Talentera Huddle is now served from the repository root as a React dashboard.

## Production

- Main dashboard: `index.html`
- React application: `react-preview/app-v6.jsx`
- Core styling: `react-preview/styles-v6.css`
- Final UI fixes: `react-preview/styles-v6-fixes.css`
- Deal Movement V7: `react-preview/deal-movement-v7.jsx`
- Deal Movement styling: `react-preview/deal-movement-v7.css`
- External dashboard links: `react-preview/external-links.js`

## Data flow

The React application continues to read the automated repository files directly:

- `data.json`
- `data-retention.json`

Runtime requests use cache busting and `cache: no-store`, so the existing n8n/GitHub data refresh flow remains unchanged.

## Included functionality

- Team and rep KPI breakdowns for Yesterday, Month to Date and Year to Date
- Calls, connected calls, meetings, leads, pipeline and revenue metrics
- Online and offline leads requiring contact
- Rep coaching and required actions
- Open, won, lost, cold, stuck and no-future-task deal workspaces
- Rank A/B coverage, country filtering, contacted, not contacted and completed meetings
- Market and M&A news
- Separate Won, Lost and At-Risk Deal Movement tables
- Lost Reason breakdown by deal count and amount
- Acquisition financial dashboard without the Missing Financial Data panel
- Retention and P&L external dashboard links

The previous static dashboard files remain in the repository for history, but the production root no longer loads them.
