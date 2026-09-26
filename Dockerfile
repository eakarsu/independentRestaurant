FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
RUN apk add --no-cache openssl
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Prisma ships a native schema engine that links against OpenSSL. Alpine does
# not include it, so migrations fail with "Please manually install OpenSSL"
# and the app never starts.
RUN apk add --no-cache openssl \
    && addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
# npm start runs scripts/validate-runtime.mjs before next start; without this
# the container exits with MODULE_NOT_FOUND.
COPY --from=build --chown=app:app /app/scripts ./scripts
# `npm start` runs the standalone server, which expects its static assets and
# public files inside the standalone directory. Next does not copy them there
# itself, so the image would boot and serve HTML with no CSS or JS.
RUN cp -r .next/static .next/standalone/.next/static \
    && cp -r public .next/standalone/public
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
