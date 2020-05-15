FROM node:10-alpine
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
USER node
RUN npm install
COPY --chown=node:node . .
EXPOSE 8080
EXPOSE 8090
EXPOSE 3001
EXPOSE 3001/udp
CMD [ "node", "server.js" ]