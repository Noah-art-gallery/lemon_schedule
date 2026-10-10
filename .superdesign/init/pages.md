# Page dependency trees

## `/profile`

Entry: `src/app/profile/page.tsx`

- `src/features/profile/profile-screen.tsx`
  - `src/components/layout/app-shell.tsx`
    - `src/components/layout/top-bar.tsx`
      - `src/components/layout/brand.tsx`
    - `src/components/layout/bottom-nav.tsx`
  - `src/components/layout/page-heading.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/card.tsx`
  - `src/components/ui/field.tsx`
  - `src/features/auth/auth-provider.tsx`
  - `src/features/auth/auth-service.ts`
  - `src/features/push/push-service.ts`
  - `src/features/profile/profile-service.ts`

The page currently presents identity editing, invite code, a block-list disclosure, and a low-emphasis logout action.

## `/pet`

Entry: `src/app/pet/page.tsx`

- `src/features/pet/pet-screen.tsx`
  - `src/components/layout/app-shell.tsx`
  - `src/components/layout/page-heading.tsx`
  - `src/components/ui/button.tsx`
  - `src/components/ui/card.tsx`
  - `src/features/pet/pet-canvas.tsx`
