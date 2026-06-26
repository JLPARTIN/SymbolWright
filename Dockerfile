FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist/ ./dist/

RUN addgroup -S codemind && adduser -S codemind -G codemind
USER codemind

ENTRYPOINT ["node", "dist/cli.js"]
