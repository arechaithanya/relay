FROM node:20-alpine
WORKDIR /app/backend/producer-service
ENV NODE_PATH=/app/backend/producer-service/node_modules
COPY backend/producer-service/package.json ./
RUN npm install --omit=dev
COPY backend/common /app/backend/common
COPY backend/producer-service ./
CMD ["npm", "run", "start"]
