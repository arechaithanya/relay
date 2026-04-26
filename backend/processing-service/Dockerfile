FROM node:20-alpine
WORKDIR /app/backend/processing-service
ENV NODE_PATH=/app/backend/processing-service/node_modules
COPY backend/processing-service/package.json ./
RUN npm install --omit=dev
COPY backend/common /app/backend/common
COPY backend/processing-service ./
CMD ["npm", "run", "start"]
