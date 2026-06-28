# CodeMode Extraction

This app ports the existing AELIB CodeMode browser console into standalone CodeMind.

Source files from `JLPARTIN/AELIB--X1YA0I`:

- `apps/operator-console/app/codemode/page.tsx`
- `apps/operator-console/app/api/codemode/route.ts`
- `apps/operator-console/app/codemode/codemode.module.css`

Destination files in CodeMind:

- `apps/operator-console/app/codemode/page.tsx`
- `apps/operator-console/app/api/codemode/route.ts`
- `apps/operator-console/app/codemode/codemode.module.css`
- `apps/operator-console/app/layout.tsx`
- `apps/operator-console/app/page.tsx`
- `apps/operator-console/app/globals.css`
- `apps/operator-console/package.json`
- `apps/operator-console/README.md`

AELIB should call this standalone CodeMind workspace instead of owning the CodeMind UI long term.
