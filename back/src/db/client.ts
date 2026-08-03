import { PrismaClient } from '@prisma/client'

/**
 * Une seule instance pour tout le processus. Prisma ouvre un pool de
 * connexions par client : en créer un par requête épuiserait Postgres bien
 * avant que le service ne soit chargé.
 */
export const prisma = new PrismaClient()
