(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);

    try {
      const request = args[0];
      const url = typeof request === 'string'
        ? request
        : request?.url || '';

      if (!/data\.json(?:\?|$)/i.test(url)) {
        return response;
      }

      const raw = await response.clone().text();
      const cleaned = raw.replace(/^\uFEFF?\s*=\s*/, '');

      if (cleaned === raw) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.set('content-type', 'application/json; charset=utf-8');

      console.warn('Sanitized invalid leading "=" from data.json');

      return new Response(cleaned, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error('data.json sanitizer failed:', error);
      return response;
    }
  };
})();