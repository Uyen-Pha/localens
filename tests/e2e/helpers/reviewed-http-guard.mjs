export async function forwardReviewedHttp(route, allowedOrigins, blocked, inspect) {
  const url = new URL(route.request().url());
  if (!['http:', 'https:'].includes(url.protocol) || !allowedOrigins.has(url.origin)) {
    blocked.push(`Blocked HTTP origin: ${url.origin}`);
    await route.abort();
    return;
  }
  const request = route.request();
  const headers = { ...request.headers() };
  // Interception supplies full bodies, not the browser's cached body. Avoid 304
  // responses without granting any exception to the all-3xx rejection below.
  if (['GET', 'HEAD'].includes(request.method())) {
    delete headers['if-none-match'];
    delete headers['if-modified-since'];
  }
  const response = await route.fetch({ maxRedirects: 0, headers });
  if (response.status() >= 300 && response.status() < 400) {
    // Omit query strings and Location values, which may contain auth material.
    blocked.push(`Blocked HTTP redirect ${response.status()}: ${url.origin}${url.pathname}`);
    await route.abort();
    return;
  }
  if (inspect) await inspect(response);
  await route.fulfill({ response });
}
