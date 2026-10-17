FROM node:20-slim

WORKDIR /app

# Install dependencies needed for some packages (like ffmpeg)
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Build step if necessary (e.g. for React frontend)
RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
