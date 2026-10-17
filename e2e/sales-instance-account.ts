/**
 * Credentials of the account the sales proofs share on their dedicated instance.
 *
 * The reconciliation proof registers this account and the statistics proof signs in with it, so
 * both proofs can run on the same instance in any order, and a retry finds the account again.
 */
export const salesAccount = {
	username: 'salesproofs',
	displayName: 'Sales proofs',
	password: 'correct-horse-battery-staple'
};
