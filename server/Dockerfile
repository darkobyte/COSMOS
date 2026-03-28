FROM node:20-alpine
WORKDIR /app
RUN mkdir -p data
COPY package.json .
RUN npm install --production
COPY index.js .
COPY dev-populate.js .
COPY lib ./lib
COPY data/stargazers.json ./data/stargazers.json
EXPOSE 3001
CMD ["node", "index.js"]
