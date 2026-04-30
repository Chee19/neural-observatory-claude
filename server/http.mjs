export function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

export function sendError(res, status, error, detail) {
  sendJson(res, status, detail ? { error, detail } : { error });
}
