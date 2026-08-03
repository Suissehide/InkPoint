import { z } from 'zod'

/**
 * Les variables d'environnement, validées au démarrage plutôt qu'au premier
 * usage : un `DATABASE_URL` absent doit faire échouer le conteneur tout de
 * suite, pas à la première soumission d'un joueur.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  /** Origine autorisée par CORS — le front, et lui seul. */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
})

export const env = schema.parse(process.env)
