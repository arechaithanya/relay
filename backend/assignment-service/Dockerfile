FROM node:20-alpine
WORKDIR /app/backend/assignment-service
ENV NODE_PATH=/app/backend/assignment-service/node_modules
COPY backend/assignment-service/package.json ./
RUN npm install --omit=dev
COPY backend/common /app/backend/common
COPY backend/assignment-service ./
CMD ["npm", "run", "start"]
