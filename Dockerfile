FROM node:26-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36 AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:26-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36 AS production

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist/ ./dist/

RUN addgroup -S symbolwright   && adduser -S symbolwright -G symbolwright   && mkdir -p /data   && chown symbolwright:symbolwright /data
USER symbolwright
WORKDIR /data
EXPOSE 8787
VOLUME ["/data"]

ENTRYPOINT ["node", "/app/dist/cli.js"]
