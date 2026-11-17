# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Dienstplan per Sprachbefehl („Hey Siri, Plan aktuell“)

Die Adresse `https://schicht.vjbackhaus.de/?abruf=1` öffnet das Journal des aktuellen Monats und startet
sofort den Cloud-Abruf (wie „⚡ DP mit neuestem Stand laden“) – danach nur noch Airlock bestätigen.

iPhone-Kurzbefehl einrichten: App **Kurzbefehle** → **+** → Aktion **„URLs öffnen“** mit der Adresse oben →
Kurzbefehl **„Plan aktuell“** nennen. Ist Safari noch nicht angemeldet, zeigt die Anmeldeseite einen Hinweis;
nach der Anmeldung startet der Abruf automatisch.

## Update-Hinweis

Jede Veröffentlichung schreibt `/version.json` (eindeutige Kennung je Stand). Die App fragt sie beim Öffnen,
beim Zurückkehren und alle 10 Minuten ab und zeigt bei neuerem Stand „Neue Version verfügbar – Neu laden“.
Den Safari-Cache muss man dafür nicht leeren.
