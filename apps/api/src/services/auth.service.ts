import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@studio/db";
import type { LoginInput, RegisterInput } from "@studio/shared";
import { config } from "../config.js";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, jti: crypto.randomUUID() }, config.jwtAccessSecret, {
    expiresIn: config.jwtAccessExpiresIn,
  } as jwt.SignOptions);
}

function signRefreshToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, jti: crypto.randomUUID() }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn,
  } as jwt.SignOptions);
}

function refreshExpiryDate(): Date {
  const match = /^(\d+)([dhms])$/.exec(config.jwtRefreshExpiresIn);
  const now = Date.now();
  if (!match) {
    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return new Date(now + amount * (multipliers[unit] ?? 86_400_000));
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
    },
  });

  return issueTokens(user.id, user.email, user.name);
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  return issueTokens(user.id, user.email, user.name);
}

async function issueTokens(userId: string, email: string, name: string) {
  const accessToken = signAccessToken(userId, email);
  const refreshToken = signRefreshToken(userId, email);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiryDate(),
    },
  });

  return {
    user: { id: userId, email, name },
    accessToken,
    refreshToken,
  };
}

export async function refreshSession(refreshToken: string) {
  let payload: { userId: string; email: string };
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as {
      userId: string;
      email: string;
    };
  } catch {
    throw Object.assign(new Error("Invalid refresh token"), { status: 401 });
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });
  if (!stored || stored.expiresAt < new Date() || stored.userId !== payload.userId) {
    throw Object.assign(new Error("Refresh token revoked or expired"), { status: 401 });
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.userId } });
  return issueTokens(user.id, user.email, user.name);
}

export async function logoutSession(refreshToken?: string) {
  if (!refreshToken) return;
  await prisma.refreshToken.deleteMany({
    where: { tokenHash: hashToken(refreshToken) },
  });
}
