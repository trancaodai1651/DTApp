import type { User } from '@supabase/supabase-js';
export function hasGoogleIdentity(value: unknown): value is User;
export function authUserKey(value: User | null | undefined): string;
export function googleOAuthQuery(emailHint?: string): Record<string, string>;
