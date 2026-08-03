import { env } from './env'
import { buildServer } from './server'

const app = buildServer()

try {
  // `0.0.0.0` et non `localhost` : dans un conteneur, n'écouter que la boucle
  // locale rend le service injoignable depuis le réseau compose.
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
