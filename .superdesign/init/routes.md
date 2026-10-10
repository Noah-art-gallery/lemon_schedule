# Routes

| URL              | Entry                            | Summary                                    |
| ---------------- | -------------------------------- | ------------------------------------------ |
| `/`              | `src/app/page.tsx`               | Today task home                            |
| `/friends`       | `src/app/friends/page.tsx`       | Connections and friend activity            |
| `/pet`           | `src/app/pet/page.tsx`           | Private pet drawing and customization      |
| `/profile`       | `src/app/profile/page.tsx`       | Profile, invite code, blocks, and sign out |
| `/notifications` | `src/app/notifications/page.tsx` | In-app notifications                       |
| `/login`         | `src/app/login/page.tsx`         | Sign in                                    |
| `/signup`        | `src/app/signup/page.tsx`        | Account creation                           |

Every authenticated route uses `AppShell` from `src/components/layout/app-shell.tsx`.
