import 'dotenv/config'
import { prisma } from './db/client'
import { generateAccessToken } from './modules/auth/auth.helpers'

async function main() {
    console.log('🔍 Generating ADMIN Token for Postman...')
    
    // Find an OWNER or ADMIN user
    const user = await prisma.user.findFirst({
        where: { role: 'OWNER', deletedAt: null }
    })

    if (!user) {
        console.error('❌ No OWNER user found in database.')
        process.exit(1)
    }

    const token = generateAccessToken({
        id: user.id,
        teamId: user.teamId,
        role: user.role,
        email: user.email
    })

    console.log('\n✅ User Found:', user.email)
    console.log('\n🔑 Copy this TOKEN into Postman:\n')
    console.log(token)
    console.log('\n')
}

main().catch(console.error).finally(() => process.exit(0))
