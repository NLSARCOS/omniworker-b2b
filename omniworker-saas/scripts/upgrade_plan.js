const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Create Enterprise Plan if it doesn't exist
  let plan = await prisma.subscriptionPlan.findFirst({ where: { name: "Enterprise" } });
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: { name: "Enterprise", tokenLimit: 50000000, maxAgents: 100, maxUsers: 50, price: 999 },
    });
  }

  // Update the user's tenant
  const user = await prisma.user.findUnique({ where: { email: "admin@omniworker.com" } });
  if (user && user.tenantId) {
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: { planId: plan.id },
    });
    console.log("Plan updated to Enterprise!");
  } else {
    console.log("User or tenant not found.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
