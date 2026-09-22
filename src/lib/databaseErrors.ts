export function databaseErrorResponse(error: unknown, fallback: string) {
  const candidate = error as { code?: unknown; name?: unknown };
  const unavailable = candidate?.code === 'P1001' || candidate?.name === 'PrismaClientInitializationError';
  return unavailable
    ? { message: 'Der Spielserver kann die Datenbank derzeit nicht erreichen. Bitte versuche es gleich noch einmal.', status: 503 }
    : { message: fallback, status: 500 };
}
