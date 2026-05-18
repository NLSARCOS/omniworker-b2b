import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'user@user.com'
  const password = 'user@user.com'
  
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    console.log('User already exists, updating tokens and password...')
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.update({
      where: { email },
      data: { tokenBalance: 10000000, passwordHash }
    })
    console.log('User updated successfully.')
  } else {
    console.log('Creating new user...')
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: 'Test User',
        role: 'USER',
        tokenBalance: 10000000
      }
    })
    console.log('User created successfully.')
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
