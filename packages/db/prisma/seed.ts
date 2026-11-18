import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_PRICING = {
  version: "2026-11-omni",
  videoUsdPerSecond: {
    "360p": 0.023,
    "720p": 0.07,
    "1080p": 0.104,
    "4k": 0.209,
  },
  imageUsdPerImage: 0.039,
  llm: {
    "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
    "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  },
  ttsUsdPer1MChars: 16,
};

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@studio.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: "Studio Admin" },
    create: {
      email,
      passwordHash,
      name: "Studio Admin",
    },
  });

  await prisma.pricingCatalog.upsert({
    where: { version: DEFAULT_PRICING.version },
    update: { catalog: DEFAULT_PRICING, active: true },
    create: {
      version: DEFAULT_PRICING.version,
      catalog: DEFAULT_PRICING,
      active: true,
    },
  });

  await prisma.providerConfig.upsert({
    where: { name: "google-omni" },
    update: {
      enabled: true,
      config: {
        modelId: "gemini-omni-1.2-flash",
        nativeAudio: true,
        maxDurationSec: 15,
      },
    },
    create: {
      name: "google-omni",
      kind: "video",
      enabled: true,
      config: {
        modelId: "gemini-omni-1.2-flash",
        nativeAudio: true,
        maxDurationSec: 15,
      },
    },
  });

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
