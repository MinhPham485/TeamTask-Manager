FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_API_BASE_URL=http://localhost:5000
ARG VITE_SOCKET_URL=http://localhost:5000

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
## copy the build output to nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html  

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
