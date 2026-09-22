import type { Prisma } from '@prisma/client';
import { createPasswordHash, normalizePlayerName, verifyPassword } from './auth';

export class PlayerLoginError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function authenticatePlayer(
  transaction: Prisma.TransactionClient,
  rawName: string,
  password: string,
) {
  const { name, normalizedName } = normalizePlayerName(rawName);
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedName}))`;
  const existing = await transaction.user.findFirst({ where: { normalizedName } });

  if (!existing) {
    return transaction.user.create({
      data: {
        name,
        normalizedName,
        passwordHash: password ? createPasswordHash(password) : null,
      },
    });
  }

  if (existing.passwordHash) {
    if (!password) {
      throw new PlayerLoginError(401, 'Dieser Spielername ist mit einem Passwort geschützt.');
    }
    if (!verifyPassword(password, existing.passwordHash)) {
      throw new PlayerLoginError(401, 'Das Passwort für diesen Spielernamen ist nicht korrekt.');
    }
    return existing;
  }

  if (!password) return existing;

  return transaction.user.update({
    where: { id: existing.id },
    data: { name, passwordHash: createPasswordHash(password) },
  });
}
