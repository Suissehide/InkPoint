ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY front/package.json ./front/
RUN npm ci --workspace front --include-workspace-root
COPY sim ./sim
COPY shared ./shared
COPY front ./front
WORKDIR /app/front
# Vite fige les variables `VITE_*` DANS le bundle au moment du build, pas au
# lancement de nginx : sans cet `ARG`/`ENV`, le paquet livré retombe en
# silence sur `http://localhost:3000` (voir le repli dans
# `front/src/app/leaderboard-client.ts`), que le site HTTPS bloque comme
# contenu mixte. `compose.yaml` et `docker-compose.dokploy.yml` fournissent
# cet `ARG` depuis `TRAEFIK_API_HOST`, qu'ils connaissent déjà pour Traefik —
# aucune variable de plus à tenir à jour dans `deploy/.env`.
#
# Le défaut ci-dessous n'est PAS accessoire : un `ARG` sans valeur, une fois
# passé à `ENV`, vaut une chaîne VIDE — jamais absente. `'' ?? 'http://…'`
# dans `leaderboard-client.ts` ne retombe PAS sur le repli (`??` ne réagit
# qu'à `null`/`undefined`, jamais à `''`), donc sans ce défaut un build lancé
# sans `--build-arg` embarquerait une URL d'API vide plutôt que
# `http://localhost:3000` — un échec silencieux DIFFÉRENT de celui déjà connu
# et documenté, et donc plus difficile à reconnaître en revue. Ce défaut fait
# retomber ce cas sur exactement le même repli qu'avant ce correctif.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:alpine AS app
COPY --from=builder /app/front/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
