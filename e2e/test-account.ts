/**
 * Credentials shared by E2E specs that need the initial admin account.
 *
 * The core spec registers this account and then recovers it with a reset code,
 * so specs running afterwards must use the recovered password.
 */
export const sharedTestAccount = {
	username: 'avery',
	displayName: 'Avery',
	initialPassword: 'correct-horse-battery-staple',
	recoveredPassword: 'recovered-correct-battery-horse'
} as const;
