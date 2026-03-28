FROM node:20-alpine
WORKDIR /app

# Data is persisted via a runtime volume (/app/data). Don't require it in the build context.
RUN mkdir -p data

COPY package.json .
RUN npm install --production

COPY index.js .
COPY dev-populate.js .
COPY lib ./lib

# Provide a sane default when running without a mounted volume.
RUN node -e "const fs=require('fs');const p='data/stargazers.json';if(!fs.existsSync(p))fs.writeFileSync(p, JSON.stringify({last_synced:null, stargazers:[], systems:null}, null, 2));"

EXPOSE 3001
CMD ["node", "index.js"]
