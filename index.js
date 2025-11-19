import { httpServer } from "./src/http_server/index.js";

const HTTP_PORT = 8181;

console.log(`Static HTTP server listening on port ${HTTP_PORT}`);
httpServer.listen(HTTP_PORT);