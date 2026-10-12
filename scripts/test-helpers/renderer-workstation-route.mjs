// Renderer science suites must use the retained Legacy DOM: PR #177 makes
// UI v2 the default app.html and moves the old workstation to app-legacy.html.
// Probe the actual HTML to support existing experimental branch checkouts.
export function isScientificRendererWorkstation(markup) {
  return (
    typeof markup === 'string' &&
    markup.includes('id="threeHost"') &&
    markup.includes('app.js') &&
    !markup.includes('data-ui="v2"')
  );
}

export async function resolveRendererWorkstationUrl(baseUrl, request = fetch) {
  const root = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  for (const name of ['app-legacy.html', 'app.html']) {
    const address = new URL(name, root).href;
    const response = await request(address);
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error('Renderer workstation HTTP ' + response.status + ' at ' + address);
    }
    const markup = await response.text();
    if (isScientificRendererWorkstation(markup)) return address;
    if (name === 'app.html') {
      throw new Error(
        'Renderer scientific DOM not found: default app.html is UI v2; ' +
          'the retained app-legacy.html is required for this test.',
      );
    }
    // Some dev servers return a generic 200 HTML fallback for unknown paths.
  }
  throw new Error('Scientific 3D workstation unavailable at /app-legacy.html or /app.html');
}
