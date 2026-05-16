const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  let plan = await prisma.subscriptionPlan.findFirst({ where: { name: "Enterprise" } });
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: { name: "Enterprise", tokenLimit: 50000000, maxAgents: 100, maxUsers: 50, price: 999 },
    });
  }

  const user = await prisma.user.findUnique({ where: { email: "admin@omniworker.com" } });
  if (!user) return console.log("No user");

  if (!user.tenantId) {
    const tenant = await prisma.tenant.create({
      data: {
        name: "OmniWorker HQ",
        slug: "omniworker-hq",
        planId: plan.id
      }
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id }
    });
    console.log("Tenant created and linked with Enterprise plan!");
  } else {
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: { planId: plan.id },
    });
    console.log("Plan updated to Enterprise!");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
