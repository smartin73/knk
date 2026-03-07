FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY src ./src
COPY seed.js .
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "src/index.js"]