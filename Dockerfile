# Use Node.js LTS (Long Term Support) as the base image
FROM node:20-alpine

WORKDIR /app
RUN npm install
COPY . /app
EXPOSE 443
CMD ["node", "broker.js"]
