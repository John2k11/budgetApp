# BudgetGo

BudgetGo is a lightweight, browser-based budgeting app for tracking income and expenses, managing recurring items, and monitoring spending against a budget. It groups activity into pay cycles and includes an interactive trend chart, responsive transaction lists, and CSV backup tools.

## Features

- Configure a monthly payday and view transactions within pay-cycle date ranges.
- Add income, expenses, and savings transactions, and set budgets for each cycle. Savings transactions count as expenses in balances, budget tracking, and the trend chart.
- Get a suggested weekly spending amount by dividing the available balance by the weeks remaining in the selected cycle. A partial week counts as one week.
- Track recurring monthly income and outgoings. Generated transactions are created once per occurrence; editing a recurring outgoing changes future occurrences without rewriting transactions already created.
- Review cumulative income and expense trends against the cycle budget.
- Browse long transaction and recurring-outgoing lists with desktop pagination or mobile “Load more” controls.
- Choose blue, green, or purple color palettes and switch between light and dark modes.
- Download or import CSV backups, or connect a CSV file for live saving in supported browsers.

## Project structure

```text
budgetApp/
├── index.html       # App markup, forms, dialogs, and script/style references
├── css/
│   └── styles.css   # Layout, color palettes, light/dark themes, and responsive styles
└── js/
    ├── app.js       # UI rendering, pay-cycle logic, interactions, and chart
    └── storage.js   # Local persistence, CSV import/export, and live CSV connection
```

## Technologies

- HTML5 for the app structure, forms, and native dialogs.
- CSS for responsive layouts, theme palettes, and dark/light appearance.
- Vanilla JavaScript (ES6+) for application logic and interactions.
- Browser APIs: `localStorage` for saved data and preferences, `File`/`Blob` for CSV import and export, and the File System Access API with IndexedDB for optional live CSV connections.
- Inline SVG for the trend chart; no charting library or third-party runtime dependencies are required.

There is no package manager, build step, or server requirement. Open `index.html` in a modern browser to run the app. Some browser features, such as connecting a live CSV, depend on browser support and permissions.

## Data and pay-cycle behavior

BudgetGo saves transactions, cycle budgets, payday settings, recurring income/outgoings, and skipped recurring occurrences in browser storage. The existing storage key is `daybook-budget-v1`. Appearance preferences are saved separately in browser storage and synchronized between open BudgetGo tabs. When loading an older CSV backup without a payday setting, BudgetGo retains the payday saved in the browser.

The selected cycle-ending month identifies a pay cycle. A cycle starts on the configured payday in the prior month and ends the day before the payday in the selected month. Paydays that fall beyond a shorter month are clamped to that month’s last day. Transactions are grouped according to their date within these cycle bounds.

The weekly spending suggestion uses the current left-to-spend balance and the days remaining through the cycle end, including today. It rounds the number of remaining weeks up, so a partial week counts as a full week. If the cycle has ended, it displays no suggestion; if the available balance is zero or negative, it explains that no spending allowance remains.

CSV backups include the app’s transactions, budgets, payday setting, recurring items, and skipped occurrences. Import accepts supported older BudgetGo CSV formats for backward compatibility.

## Development

The app has no compile step. After changing JavaScript, syntax can be checked with:

```powershell
node --check .\js\app.js
node --check .\js\storage.js
```
