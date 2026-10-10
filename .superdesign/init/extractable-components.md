# Extractable components

## AppShell

- Source: `src/components/layout/app-shell.tsx`
- Category: layout
- Description: Authenticated responsive shell with top bar, bottom nav, demo banner, and main content.
- Extractable props: `notificationCount`.
- Hardcoded: skip link, application regions, demo banner copy.

## TopBar

- Source: `src/components/layout/top-bar.tsx`
- Category: layout
- Description: Brand and notification entry point.
- Extractable props: `notificationCount`.
- Hardcoded: Brand, Bell icon, notification href.

## BottomNav

- Source: `src/components/layout/bottom-nav.tsx`
- Category: layout
- Description: Persistent four-item navigation.
- Extractable props: active route.
- Hardcoded: Home, Friends, Pet, Profile labels and Lucide icons.

## Button

- Source: `src/components/ui/button.tsx`
- Category: basic
- Description: Accessible action button.
- Extractable props: variant, size, loading, fullWidth.
- Hardcoded: class structure and loading copy.

## Card

- Source: `src/components/ui/card.tsx`
- Category: basic
- Description: The shared content surface.
- Extractable props: tone, semantic element.
- Hardcoded: card class structure.
