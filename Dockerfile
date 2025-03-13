# Use Node.js LTS (Long Term Support) as the base image
FROM node:20-alpine

WORKDIR /app
COPY . /app

RUN npm install
EXPOSE 443
CMD ["node", "broker.js"]
