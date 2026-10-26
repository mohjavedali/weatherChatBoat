FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev --legacy-peer-deps

COPY . .

# Check TypeScript installation
RUN npx tsc --version

# Compile TypeScript
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]