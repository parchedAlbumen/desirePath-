# React + Vite

## Authentication API contract

The sign-up and login screens send JSON to the backend:

- `POST /api/auth/signup` to create an account
- `POST /api/auth/login` to sign in

Both requests use `Content-Type: application/json` and the same body:

```json
{
  "email": "runner@example.com",
  "password": "your-password"
}
```

The frontend treats any 2xx response as success and displays a non-2xx or network error to the user. The Vite development server proxies `/api` to `http://localhost:8000`.
After a successful response, the frontend stores a tab-scoped sign-in marker so the shared sign-in/log-out control updates across pages. This is UI state only; replace it with the backend's authenticated session mechanism when one is implemented.

Completed runs are kept in browser storage. Favorite run IDs are saved separately in local storage, scoped to the signed-in email on this browser, so favoriting a run does not remove it from recent runs.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
