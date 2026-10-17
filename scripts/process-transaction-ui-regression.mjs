// Native-v2 release gate. The former executable Legacy DOM contract is
// reproducible at the immutable legacy-frozen tag, not at /app-legacy.html.
import { runNativeReleaseOwner } from './v2/check-source-sunset-release-owners.mjs';

export async function runTransactionAcceptance() {
  runNativeReleaseOwner('transaction');
}

if (process.argv[1]?.endsWith('process-transaction-ui-regression.mjs')) {
  await runTransactionAcceptance();
}
