FROM node:20-alpine
WORKDIR /app/backend/notification-service
ENV NODE_PATH=/app/backend/notification-service/node_modules
COPY backend/notification-service/package.json ./
RUN npm install --omit=dev
COPY backend/common /app/backend/common
COPY backend/notification-service ./
CMD ["npm", "run", "start"]
