// Native-v2 release gate. The former executable Legacy DOM contract is
// reproducible at the immutable legacy-frozen tag, not at /app-legacy.html.
import { runNativeReleaseOwner } from './v2/check-source-sunset-release-owners.mjs';

const scope = process.env.WAFERCAD_PRODUCT_SCOPE;
if (scope !== 'layout' && scope !== 'renderer') {
  throw new Error('Unknown product acceptance scope: ' + scope);
}
runNativeReleaseOwner(scope);
