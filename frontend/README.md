# Frontend

## Dev Against Real Hardware

To run the UI against a device on your local network, provide `VITE_DEVICE_IP` when starting Vite. When this variable is set, the frontend sends API requests to that device and the mock backend is disabled automatically.

Examples:

```bash
VITE_DEVICE_IP=192.168.1.199 pnpm dev:device
VITE_DEVICE_IP=http://192.168.1.199 pnpm dev:device
```

To produce a build hard-wired to a device IP:

```bash
VITE_DEVICE_IP=192.168.1.199 pnpm build:device
```

Notes:

- `VITE_DEVICE_IP` accepts either a bare IP like `192.168.1.199` or a full URL like `http://192.168.1.199`.
- In normal dev mode without `VITE_DEVICE_IP`, the frontend keeps using the local mock unless `VITE_API_MOCK=false` is set.
- To debug frontend requests handled by the mock backend, run with `VITE_API_DEBUG=true`. The mock adapter will log each request and response in the browser console.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react';

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
});
```
