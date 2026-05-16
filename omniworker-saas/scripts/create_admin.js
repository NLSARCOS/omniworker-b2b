const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  
  const user = await prisma.user.upsert({
    where: { email: "admin@omniworker.com" },
    update: {
      role: "SUPERADMIN",
      passwordHash,
      tokenBalance: 1000000,
    },
    create: {
      email: "admin@omniworker.com",
      name: "Super Admin",
      role: "SUPERADMIN",
      passwordHash,
      tokenBalance: 1000000,
    },
  });

  console.log("Superadmin created:", user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());

