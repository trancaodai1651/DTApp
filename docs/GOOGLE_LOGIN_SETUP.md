# DT App Google sign-in setup

DT App uses Supabase Google OAuth. The first authorized administrator is `trancaodai1651@gmail.com`; admins can add more Google email addresses from **Users** inside the app. User bio pages and poster data remain scoped to the signed-in Supabase user by RLS.

## Configure Google OAuth

1. In Google Cloud Console, create an OAuth client with application type **Web application**.
2. Add `https://trancaodai1651.github.io` to **Authorized JavaScript origins**. For local development, add `http://127.0.0.1:5173`.
3. Add this URI under **Authorized redirect URIs**:

   `https://xpdosyzwdvfnxzwyjwur.supabase.co/auth/v1/callback`

4. In Supabase Dashboard → **Authentication → Sign In / Providers → Google**, enable Google and enter the Google **Client ID** and **Client Secret**. Keep the secret in Supabase; do not add it to GitHub or this repository.
5. In Supabase **Authentication → URL Configuration**, set the Site URL to `https://trancaodai1651.github.io/DTApp/` and allow these redirect URLs:

   - `https://trancaodai1651.github.io/DTApp/`
   - `http://127.0.0.1:5173/` for local development
   - `dtapp://auth/callback` for the desktop app

The Google client redirects back to Supabase. Supabase then redirects to the web app or the desktop deep link. See the [Supabase Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

## Apply the access and multi-bio schema

After Google OAuth is configured, run `supabase/migrations/20261022020000_google_access_multi_bios.sql` in Supabase SQL Editor. It seeds the owner account, creates the admin-managed email allowlist, scopes bio/poster/storage RLS to active app users, and adds unique custom slugs while retaining existing bio rows.

Enable **manual identity linking** in Supabase Authentication settings before the first Google sign-in on a device that still has a DT App guest session. The app links that Google identity to the existing anonymous session when possible, preserving that session's bio and poster data. Do not clear that browser profile or sign out of its old guest session before linking. Supabase describes this in its [anonymous sign-in guide](https://supabase.com/docs/guides/auth/auth-anonymous).

After OAuth and the migration are verified, turn off new anonymous sign-ins in Supabase. Existing users can still link their current guest session when manual identity linking is enabled.

## Desktop callback

Packaged DT App registers the `dtapp://` protocol. The application handles the callback and stores the Supabase session in the app profile; no OAuth secret is stored in the desktop package. On macOS, the `dtapp` URL scheme is included in the application bundle. Windows registers the scheme when the app starts.

## Bio URLs

Published pages use `https://trancaodai1651.github.io/DTApp/bio/<slug>`. GitHub Pages serves `public/404.html` for the nested route and forwards it to the app shell, which restores the readable `/bio/<slug>` address. Existing UUID hash links continue to work.
