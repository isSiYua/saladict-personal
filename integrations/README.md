# Saladict editor integrations

This directory contains two host adapters backed by one lookup core:

- `vscode/`: mouse-selection events are translated into a native VS Code Hover.
- `obsidian/`: mouseup events in Markdown views open a custom DOM popup.
- `shared/`: transport validation, Google fallback, dictionary parsing, and caching.

Neither integration writes ordinary lookup history. Only explicitly favorited entries are persisted by the host.

Run `npm run test:integrations` for focused tests and `npm run package:integrations` to create installable build folders and ZIP artifacts under `build/integrations/`.
