# Dockerfile — multi-stage build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/core ./core
EXPOSE 5190
CMD ["node", "server/server.js", "--host", "0.0.0.0"]
