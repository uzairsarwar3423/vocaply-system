import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function main() {
  console.log("Attempting to connect and terminate stale database sessions...")
  
  // Try running the query multiple times to catch a slot
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const result = await prisma.$queryRawUnsafe(`
        SELECT pg_terminate_backend(pid), query, state, age(clock_timestamp(), query_start)
        FROM pg_stat_activity 
        WHERE usename = 'postgres' AND pid <> pg_backend_pid();
      `)
      console.log(`✅ Success on attempt ${attempt}! Session details:`, result)
      break
    } catch (err: any) {
      console.warn(`⚠️ Attempt ${attempt} failed: ${err.message}`)
      if (attempt < 10) {
        console.log("Waiting 1.5 seconds before retrying...")
        await new Promise((resolve) => setTimeout(resolve, 1500))
      } else {
        console.error("❌ All connection attempts exhausted.")
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
