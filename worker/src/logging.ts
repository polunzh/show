export function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function log(event: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...data,
    }),
  );
}
