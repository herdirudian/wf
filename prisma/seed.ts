import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  const email = (process.env.ADMIN_SEED_EMAIL ?? "").trim().toLowerCase();
  const password = (process.env.ADMIN_SEED_PASSWORD ?? "").trim();
  const role = (process.env.ADMIN_SEED_ROLE ?? "administrator").trim() || "administrator";

  if (!email || !password) return;

  const hashed = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, password: hashed, role },
    update: { password: hashed, role },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
