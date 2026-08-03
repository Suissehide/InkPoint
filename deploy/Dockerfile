ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY front/package.json ./front/
RUN npm ci --workspace front --include-workspace-root
COPY sim ./sim
COPY front ./front
WORKDIR /app/front
RUN npm run build

FROM nginx:alpine AS app
COPY --from=builder /app/front/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
