NT2 Navigation Research Platform

A mobile-optimized navigation experiment platform built with React 19 + Vite.
This project implements two experimental conditions (egocentric vs allocentric) and is designed for deployment as a Progressive Web App (PWA).

Project Structure
nt2-nav/
├── index.html              # Entry HTML
├── vite.config.js          # Vite configuration (host enabled)
├── package.json            # Dependencies: React 19 + Vite (rolldown)
├── public/
│   ├── ins.png             # Installation guidance image (phone posture)
│   ├── rest.png            # Rest instruction image (look around)
│   └── vite.svg
└── src/
    ├── main.jsx            # React entry point (renders <App />)
    ├── index.css           # Global styles (reset + full-screen layout)
    ├── App.jsx             # Condition selector (Ego / Allo)
    ├── haptics.js          # Shared vibration + audio feedback module
    ├── nla-ego-version.jsx # Egocentric condition (full experiment logic)
    └── nla-allo-version.jsx# Allocentric condition (full experiment logic)
Features

Two experimental conditions:

Egocentric navigation

Allocentric navigation

Real-time interaction and response validation

Mobile-first full-screen UI

Haptic feedback (vibration) support

Designed for PWA deployment (installable app-like experience)

Development

Install dependencies:

npm install

Run locally:

npm run dev

Build for production:

npm run build

Preview production build:

npm run preview
Deployment Plan

The platform is intended to be deployed as:

A Progressive Web App (PWA) hosted over HTTPS

Installable on mobile devices in standalone mode

Integrated with Supabase for session and experimental data storage

Research Purpose

This platform is part of a navigation cognition study investigating differences between egocentric and allocentric spatial processing. The system is structured to support scalable deployment and structured data collection for experimental analysis.


# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
