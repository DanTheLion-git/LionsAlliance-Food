FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 RECIPES_DIR=/recipes
USER node
EXPOSE 3000
CMD ["node", "server.js"]
